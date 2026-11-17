import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedCache, configurationFingerprint, createRoutingAffinity, observeAffinityStream } from '../../../../../../lib/tooling/model-router/gateway/compatibility/affinity.mjs';
import { registry, intake, success, request, appFor, jsonBody, accounts, fakeEnv, sse } from './fixtures.mjs';

const candidate = (modelId = 'm1', accountIds = ['one', 'two']) => ({
  selected: { targetRef: 'group:pair', groupId: 'pair', modelId, providerId: `p${modelId.slice(1)}`, targetProtocol: 'claude' }, accounts: accountIds,
});
const context = (extra = {}) => ({ protocol: 'claude', client: 'claude', role: '', sessionId: 'session', fingerprint: 'config', body: {}, ...extra });
const tool = (id = 'call-1') => ({ content: [{ type: 'tool_use', id }] });
const continuation = (id = 'call-1') => ({ messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] }] });

test('cache is size bounded, LRU, and expires without sliding TTL extension', () => {
  let now = 0;
  const cache = boundedCache({ maxEntries: 2, ttlMs: 10, now: () => now });
  cache.set('a', 1); cache.set('b', 2);
  assert.equal(cache.get('a'), 1);
  cache.set('c', 3);
  assert.equal(cache.get('b'), null);
  now = 9;
  assert.equal(cache.get('a'), 1);
  now = 10;
  assert.equal(cache.get('a'), null);
});

test('configuration fingerprints cover routing, upstream, referenced credentials and overrides without exposing them', () => {
  const document = registry();
  document.providers.p1 = accounts(document.providers.p1);
  const original = configurationFingerprint(document, fakeEnv);
  assert.match(original, /^[a-f0-9]{64}$/);
  assert.equal(configurationFingerprint(Object.fromEntries(Object.entries(document).reverse()), fakeEnv), original);
  assert.equal(configurationFingerprint(document, { ...fakeEnv, UNRELATED: 'ignore' }), original);
  assert.notEqual(configurationFingerprint(document, { ...fakeEnv, ONE: 'rotated' }), original);
  assert.notEqual(configurationFingerprint(document, { ...fakeEnv, AIOS_MODEL_REVIEWER: 'model:m2' }), original);
  document.providers.p1.baseUrl = 'http://127.0.0.1:19100';
  assert.notEqual(configurationFingerprint(document, fakeEnv), original);
});

test('successful session and tool affinity lock the exact target, route and account', () => {
  const affinity = createRoutingAffinity();
  const second = candidate('m2');
  affinity(context()).remember(second.selected, 'two', tool());
  const selected = affinity(context({ body: continuation() })).select([candidate(), second]);
  assert.deepEqual(selected.candidates, [second]);
  assert.equal(selected.pin.account, 'two');
  assert.equal(selected.pin.targetRef, 'group:pair');
  assert.throws(() => affinity(context({ fingerprint: 'changed' })).select([second]), { code: 'AFFINITY_ROUTE_UNAVAILABLE' });
  assert.throws(() => affinity(context({ body: continuation() })).select([candidate('m2', ['one'])]), { code: 'AFFINITY_ROUTE_UNAVAILABLE' });
  const changed = { ...second, selected: { ...second.selected, targetRef: 'group:other', groupId: 'other' } };
  assert.throws(() => affinity(context({ body: continuation() })).select([changed]), { code: 'AFFINITY_TARGET_CONFLICT' });
});

test('affinity is scoped by client, role and protocol, and expires at its TTL', () => {
  let now = 0;
  const affinity = createRoutingAffinity({ ttlMs: 10, now: () => now });
  affinity(context()).remember(candidate('m2').selected, 'two', tool());
  for (const extra of [{ client: 'codex' }, { role: 'reviewer' }, { protocol: 'openai-chat' }]) {
    assert.equal(affinity(context(extra)).select([candidate(), candidate('m2')]).pin, null);
  }
  now = 10;
  assert.equal(affinity(context()).select([candidate(), candidate('m2')]).pin, null);
  assert.throws(() => affinity(context({ body: continuation() })).select([candidate()]), { code: 'TOOL_AFFINITY_UNKNOWN' });
});

test('failed or incomplete response metadata cannot establish session affinity', () => {
  for (const json of [{ error: { message: 'failed' } }, { status: 'failed' }, { status: 'incomplete' }, { status: 'cancelled' }, { status: 'queued' }, { status: 'in_progress' }]) {
    const affinity = createRoutingAffinity();
    affinity(context()).remember(candidate('m2').selected, 'two', json);
    assert.equal(affinity(context()).select([candidate(), candidate('m2')]).pin, null);
  }
});

test('grouped Responses continuations require known response or conversation origin', () => {
  const affinity = createRoutingAffinity();
  const responseContext = (body = {}) => context({ protocol: 'openai-response', body });
  const second = candidate('m2');
  assert.throws(() => affinity(responseContext({ previous_response_id: 'foreign' })).select([candidate(), second]), { code: 'RESPONSE_AFFINITY_UNKNOWN' });
  affinity(responseContext()).remember(second.selected, 'two', { id: 'resp-1', status: 'completed', conversation: { id: 'conv-1' } });
  for (const body of [{ previous_response_id: 'resp-1' }, { conversation: 'conv-1' }, { conversation: { id: 'conv-1' } }]) {
    assert.equal(affinity(responseContext(body)).select([candidate(), second]).pin.account, 'two');
  }
  assert.throws(() => affinity(responseContext({ previous_response_id: 'resp-1', conversation: 'foreign' })).select([candidate(), second]), { code: 'RESPONSE_AFFINITY_UNKNOWN' });
});

test('a known tool ID cannot authorize a second unknown tool result', () => {
  const affinity = createRoutingAffinity();
  affinity(context()).remember(candidate().selected, 'one', tool());
  const body = continuation();
  body.messages[0].content.push({ type: 'tool_result', tool_use_id: 'foreign', content: 'ok' });
  assert.throws(() => affinity(context({ body })).select([candidate()]), { code: 'TOOL_AFFINITY_UNKNOWN' });
});

test('known continuation IDs cannot override an already bound session account', () => {
  const affinity = createRoutingAffinity();
  affinity(context()).remember(candidate().selected, 'one', tool('session-tool'));
  affinity(context({ sessionId: 'other' })).remember(candidate().selected, 'two', tool('other-tool'));
  assert.throws(() => affinity(context({ body: continuation('other-tool') })).select([candidate()]), { code: 'AFFINITY_TARGET_CONFLICT' });
});

test('ID-less Gemini and legacy function continuations require a matching live session', () => {
  for (const [protocol, body] of [
    ['gemini', { contents: [{ role: 'user', parts: [{ functionResponse: { name: 'read', response: { ok: true } } }] }] }],
    ['openai-chat', { messages: [{ role: 'function', name: 'read', content: 'ok' }] }],
  ]) {
    let now = 0;
    const affinity = createRoutingAffinity({ ttlMs: 10, now: () => now });
    const current = (extra = {}) => context({ protocol, body, ...extra });
    assert.throws(() => affinity(current()).select([candidate(), candidate('m2')]), { code: 'TOOL_AFFINITY_UNKNOWN' });
    affinity(current({ body: {} })).remember(candidate('m2').selected, 'two', {});
    assert.equal(affinity(current()).select([candidate(), candidate('m2')]).pin.account, 'two');
    assert.throws(() => affinity(current({ sessionId: 'foreign' })).select([candidate()]), { code: 'TOOL_AFFINITY_UNKNOWN' });
    assert.throws(() => affinity(current({ fingerprint: 'changed' })).select([candidate('m2')]), { code: 'AFFINITY_ROUTE_UNAVAILABLE' });
    now = 10;
    assert.throws(() => affinity(current()).select([candidate()]), { code: 'TOOL_AFFINITY_UNKNOWN' });
  }
});

const frames = {
  gemini: [{ candidates: [{ content: { parts: [{ functionCall: { id: 'call-1', name: 'read', args: {} } }] }, finishReason: 'STOP' }] }],
  claude: [{ type: 'content_block_start', content_block: { type: 'tool_use', id: 'call-1', name: 'read', input: {} } }, { type: 'message_stop' }],
  'openai-chat': [{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: 'read', arguments: '{}' } }] } }] }, '[DONE]'],
  'openai-response': [
    { type: 'response.created', response: { id: 'resp-1', status: 'in_progress' } },
    { type: 'response.output_item.added', item: { type: 'function_call', call_id: 'call-1' } },
    { type: 'response.completed', response: { id: 'resp-1', status: 'completed', output: [{ type: 'function_call', call_id: 'call-1' }] } },
  ],
};
const newline = String.fromCharCode(13, 10);
const wireFor = (events) => events.map((entry) => `data: ${typeof entry === 'string' ? entry : JSON.stringify(entry)}${newline.repeat(2)}`).join('');
const fragmented = (wire) => new ReadableStream({ start(controller) { for (const byte of new TextEncoder().encode(wire)) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });

for (const [protocol, events] of Object.entries(frames)) {
  test(`${protocol} affinity survives byte-fragmented CRLF SSE and preserves every byte`, async () => {
    const wire = wireFor(events);
    const remembered = [];
    const output = await new Response(observeAffinityStream(fragmented(wire), protocol, (json) => remembered.push(json))).text();
    assert.equal(output, wire);
    assert.equal(remembered.length, 1);
    const metadata = remembered[0];
    const ids = protocol === 'claude' ? metadata.content.map((item) => item.id) : protocol === 'openai-chat' ? metadata.choices[0].message.tool_calls.map((item) => item.id) : protocol === 'gemini' ? metadata.candidates[0].content.parts.map((part) => part.functionCall.id) : metadata.output.map((item) => item.call_id);
    assert.deepEqual(ids, ['call-1']);
    if (protocol === 'openai-response') assert.equal(metadata.id, 'resp-1');
  });
}

test('truncated, failed, oversized, or cancelled SSE never publishes affinity', async () => {
  const cases = [wireFor(frames.claude.slice(0, 1)), wireFor([{ type: 'error', error: { message: 'failure' } }, ...frames.claude]), `data: ${'x'.repeat(70_000)}${newline.repeat(2)}${wireFor(frames.claude)}`];
  for (const wire of cases) {
    let remembered = false;
    await new Response(observeAffinityStream(fragmented(wire), 'claude', () => { remembered = true; })).text();
    assert.equal(remembered, false);
  }
  let cancelled = false;
  const source = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(wireFor(frames.claude))); }, cancel() { cancelled = true; } });
  let remembered = false;
  const reader = observeAffinityStream(source, 'claude', () => { remembered = true; }).getReader();
  await reader.read();
  await reader.cancel();
  assert.equal(remembered, false);
  assert.equal(cancelled, true);
});

test('streamed Responses preserve conversation affinity without a session header', async () => {
  const affinity = createRoutingAffinity();
  const current = (body = {}) => context({ protocol: 'openai-response', sessionId: undefined, body });
  const events = [{ type: 'response.created', response: { id: 'resp-stream', conversation: { id: 'conv-stream' }, status: 'in_progress' } },
    { type: 'response.completed', response: { id: 'resp-stream', status: 'completed', output: [] } }];
  await new Response(observeAffinityStream(fragmented(wireFor(events)), 'openai-response', (json) => {
    affinity(current()).remember(candidate('m2').selected, 'two', json);
  })).text();
  for (const body of [{ conversation: 'conv-stream' }, { previous_response_id: 'resp-stream' }]) {
    const selected = affinity(current(body)).select([candidate(), candidate('m2')]);
    assert.equal(selected.pin.account, 'two');
    assert.equal(selected.candidates[0].selected.modelId, 'm2');
  }
});

test('successful grouped sessions stay on their final member and cannot rotate its account', async () => {
  const document = registry();
  document.providers.p2 = accounts(document.providers.p2);
  const models = [];
  const keys = [];
  const { app } = appFor(async (_url, init) => {
    models.push(jsonBody(init).model); keys.push(init.headers['x-api-key']);
    return models.length === 2 ? success() : new Response('', { status: 429 });
  }, { registry: document, env: fakeEnv });
  assert.equal((await request(app, intake(), { 'x-gateway-session': 'canonical', 'x-aios-session': 'ignored' })).status, 200);
  assert.equal((await request(app, intake(), { 'x-gateway-session': 'canonical' })).status, 429);
  assert.deepEqual(models, ['Real-1', 'Real-2', 'Real-2']);
  assert.deepEqual(keys, [undefined, 'fake-first', 'fake-first']);
});

test('unknown grouped previous_response_id fails before classification or upstream', async () => {
  let calls = 0;
  let classifications = 0;
  const { app } = appFor(async () => { calls++; return success(); }, { registry: registry(['openai-response', 'openai-response']), classifyIntent: async () => { classifications++; } });
  const response = await request(app, { model: 'aios/group/pair', previous_response_id: 'foreign', input: 'continue' }, {}, '/v1/responses');
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'RESPONSE_AFFINITY_UNKNOWN');
  assert.equal(calls, 0);
  assert.equal(classifications, 0);
});

test('a known Responses continuation uses its final member, and changing the target is rejected', async () => {
  const models = [];
  const { app } = appFor(async (_url, init) => {
    models.push(jsonBody(init).model);
    if (models.length === 1) return new Response('', { status: 429 });
    return Response.json({ id: `resp-${models.length}`, status: 'completed', output: [] });
  }, { registry: registry(['openai-response', 'openai-response']) });
  const send = (body) => request(app, body, {}, '/v1/responses');
  assert.equal((await send({ model: 'aios/group/pair', input: 'hello' })).status, 200);
  assert.equal((await send({ model: 'aios/group/pair', previous_response_id: 'resp-2', input: 'next' })).status, 200);
  const changed = await send({ model: 'aios/model/m2', previous_response_id: 'resp-2', input: 'next' });
  assert.equal(changed.status, 400);
  assert.equal((await changed.json()).error.code, 'AFFINITY_TARGET_CONFLICT');
  assert.deepEqual(models, ['Real-1', 'Real-2', 'Real-2']);
});

const eventsFor = (wire) => wire.split(/\r?\n\r?\n/u).filter(Boolean).map((frame) => {
  const data = frame.split(/\r?\n/u).find((line) => line.startsWith('data:')).slice(6);
  return data === '[DONE]' ? data : JSON.parse(data);
});
const chatChunk = (tool_calls, finish_reason = null) => ({ choices: [{ index: 0, delta: tool_calls ? { tool_calls } : {}, finish_reason }] });
const chatIds = (metadata) => metadata.choices[0].message.tool_calls.map((call) => call.id);

test('Chat affinity assembles late interleaved IDs by index without publishing fragments', async () => {
  const wire = wireFor([
    chatChunk([{ index: 7, function: { arguments: '{' } }, { index: 0, id: 'call_' }]),
    chatChunk([{ index: 0, id: 'late' }, { index: 7, id: 'parallel_' }]),
    chatChunk([{ index: 7, id: 'late' }]), chatChunk(null, 'tool_calls'), '[DONE]',
  ]);
  const affinity = createRoutingAffinity();
  const current = (body = {}) => context({ protocol: 'openai-chat', sessionId: undefined, body });
  const remembered = [];
  assert.equal(await new Response(observeAffinityStream(fragmented(wire), 'openai-chat', (json) => {
    remembered.push(json);
    affinity(current()).remember(candidate('m2').selected, 'two', json);
  })).text(), wire);
  assert.equal(remembered.length, 1);
  assert.deepEqual(chatIds(remembered[0]), ['parallel_late', 'call_late']);
  for (const id of ['parallel_late', 'call_late']) {
    assert.equal(affinity(current({ messages: [{ role: 'tool', tool_call_id: id }] })).select([candidate(), candidate('m2')]).pin.account, 'two');
  }
  for (const id of ['call_', 'late', 'parallel_']) {
    assert.throws(() => affinity(current({ messages: [{ role: 'tool', tool_call_id: id }] })).select([candidate()]), { code: 'TOOL_AFFINITY_UNKNOWN' });
  }
});

test('Chat affinity budgets assembled IDs and distinct indices rather than fragment count', async () => {
  const wire = wireFor([...Array.from({ length: 512 }, () => chatChunk([{ index: 0, id: 'x' }])), '[DONE]']);
  const remembered = [];
  assert.equal(await new Response(observeAffinityStream(fragmented(wire), 'openai-chat', (json) => remembered.push(json))).text(), wire);
  assert.equal(remembered.length, 1);
  assert.deepEqual(chatIds(remembered[0]), ['x'.repeat(512)]);
  const bounded = [];
  await new Response(observeAffinityStream(fragmented(wireFor([
    chatChunk(Array.from({ length: 256 }, (_, index) => ({ index, id: `call_${index}` }))), '[DONE]',
  ])), 'openai-chat', (json) => bounded.push(json))).text();
  assert.equal(bounded.length, 1);
  assert.equal(chatIds(bounded[0]).length, 256);
});

test('invalid or overflowing Chat ID assembly never publishes partial affinity', async () => {
  const cases = [
    [chatChunk([{ index: 0, id: 'x'.repeat(512) }]), chatChunk([{ index: 0, id: 'suffix' }])],
    [chatChunk(Array.from({ length: 257 }, (_, index) => ({ index, id: `call_${index}` })))],
    ...[undefined, -1, 0.5, '0', Number.MAX_SAFE_INTEGER + 1].map((index) => [chatChunk([{ index, id: 'call_1' }])]),
    ...[null, 1, {}].map((id) => [chatChunk([{ index: 0, id }])]),
  ];
  for (const events of cases) {
    const wire = wireFor([...events, '[DONE]']);
    const remembered = [];
    assert.equal(await new Response(observeAffinityStream(fragmented(wire), 'openai-chat', (json) => remembered.push(json))).text(), wire);
    assert.deepEqual(remembered, []);
  }
});

for (const sessions of ['none', 'different']) {
  const headers = (label) => sessions === 'none' ? {} : { 'x-gateway-session': `session-${label}` };
  test(`Gemini-generated streaming IDs preserve separate JSON tool continuations (${sessions} sessions)`, async () => {
    const ports = [];
    const { app } = appFor(async (url, init) => {
      const port = new URL(url).port;
      ports.push(port);
      const body = jsonBody(init);
      if (body.contents.at(-1).parts.some((part) => part.functionResponse)) {
        return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] });
      }
      if (body.contents[0].parts[0].text === 'b' && port === '19001') return new Response('', { status: 429 });
      return sse(wireFor([{ candidates: [{ content: { role: 'model', parts: [
        { functionCall: { name: 'read', args: {} } }, { functionCall: { name: 'other', args: {} } },
      ] }, finishReason: 'STOP' }] }]));
    }, { registry: registry(['gemini', 'gemini']) });
    const calls = {};
    for (const label of ['a', 'b']) {
      const response = await request(app, intake({ stream: true, messages: [{ role: 'user', content: label }] }), headers(label));
      assert.equal(response.status, 200);
      calls[label] = eventsFor(await response.text()).filter((event) => event.content_block?.type === 'tool_use').map((event) => event.content_block);
      assert.equal(calls[label].length, 2);
    }
    assert.deepEqual(ports, ['19001', '19001', '19002']);
    for (const label of ['a', 'b']) {
      const response = await request(app, intake({ messages: [
        { role: 'user', content: label }, { role: 'assistant', content: calls[label] },
        { role: 'user', content: calls[label].map((call) => ({ type: 'tool_result', tool_use_id: call.id, content: 'ok' })) },
      ] }), headers(label));
      const json = await response.json();
      assert.equal(response.status, 200, JSON.stringify(json));
      assert.equal(json.content[0].text, 'ok');
      assert.equal(ports.at(-1), label === 'a' ? '19001' : '19002');
    }
    assert.equal(new Set([...calls.a, ...calls.b].map((call) => call.id)).size, 4);
    assert.deepEqual(ports, ['19001', '19001', '19002', '19001', '19002']);
  });

  test(`native Chat fragmented streaming IDs preserve separate JSON tool continuations (${sessions} sessions)`, async () => {
    const models = [];
    const toolWire = (label) => wireFor([
      chatChunk([{ index: 3, function: { arguments: '{' } }, { index: 0, id: 'call_', function: { name: 'read_', arguments: '{' } }]),
      chatChunk([{ index: 0, id: label, function: { name: 'file', arguments: '}' } }, { index: 3, id: 'parallel_', function: { name: 'other' } }]),
      chatChunk([{ index: 3, id: label, function: { arguments: '}' } }]), chatChunk(null, 'tool_calls'), '[DONE]',
    ]);
    const { app } = appFor(async (_url, init) => {
      const body = jsonBody(init);
      models.push(body.model);
      if (body.messages.at(-1).role === 'tool') return Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
      const label = body.messages[0].content;
      if (label === 'a' && body.model === 'Real-1') return new Response('', { status: 429 });
      return sse(fragmented(toolWire(label)));
    }, { registry: registry(['openai-chat', 'openai-chat']) });
    const calls = {};
    for (const label of ['a', 'b']) {
      const response = await request(app, intake({ stream: true, messages: [{ role: 'user', content: label }] }), headers(label), '/v1/chat/completions');
      assert.equal(response.status, 200);
      const wire = await response.text();
      assert.equal(wire, toolWire(label));
      const assembled = new Map();
      for (const event of eventsFor(wire)) for (const call of event.choices?.[0]?.delta?.tool_calls || []) {
        if (!assembled.has(call.index)) assembled.set(call.index, { id: '', type: 'function', function: { name: '', arguments: '' } });
        const tool = assembled.get(call.index);
        tool.id += call.id || '';
        tool.function.name += call.function?.name || '';
        tool.function.arguments += call.function?.arguments || '';
      }
      calls[label] = [...assembled.values()];
      assert.deepEqual(calls[label].map((call) => call.id), [`parallel_${label}`, `call_${label}`]);
    }
    for (const label of ['a', 'b']) {
      const response = await request(app, intake({ messages: [
        { role: 'user', content: label }, { role: 'assistant', tool_calls: calls[label] },
        ...calls[label].map((call) => ({ role: 'tool', tool_call_id: call.id, content: 'ok' })),
      ] }), headers(label), '/v1/chat/completions');
      const json = await response.json();
      assert.equal(response.status, 200, JSON.stringify(json));
      assert.equal(json.choices[0].message.content, 'ok');
      assert.equal(models.at(-1), label === 'a' ? 'Real-2' : 'Real-1');
    }
    const unknown = await request(app, intake({ messages: [{ role: 'tool', tool_call_id: 'call_', content: 'ok' }] }), headers('a'), '/v1/chat/completions');
    assert.equal(unknown.status, 400);
    assert.equal((await unknown.json()).error.code, 'TOOL_AFFINITY_UNKNOWN');
    assert.deepEqual(models, ['Real-1', 'Real-2', 'Real-1', 'Real-2', 'Real-1']);
  });
}

const suppliedTools = {
  claude: {
    output: (id) => ({ id: 'msg-supplied', type: 'message', role: 'assistant', content: [{ type: 'tool_use', id, name: 'read', input: {} }], stop_reason: 'tool_use' }),
    input: continuation,
    start: { messages: [{ role: 'user', content: 'hello' }] },
    path: () => '/v1/messages',
  },
  'openai-chat': {
    output: (id) => ({ id: 'chat-supplied', choices: [{ index: 0, message: { role: 'assistant', tool_calls: [{ id, type: 'function', function: { name: 'read', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }),
    input: (id) => ({ messages: [{ role: 'tool', tool_call_id: id, content: 'ok' }] }),
    start: { messages: [{ role: 'user', content: 'hello' }] },
    path: () => '/v1/chat/completions',
  },
  'openai-response': {
    output: (id) => ({ id: 'resp-supplied', status: 'completed', output: [{ type: 'function_call', call_id: id, name: 'read', arguments: '{}' }] }),
    input: (id) => ({ input: [{ type: 'function_call_output', call_id: id, output: 'ok' }] }),
    start: { input: 'hello' },
    path: () => '/v1/responses',
  },
  gemini: {
    output: (id) => ({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { id, name: 'read', args: {} } }] }, finishReason: 'STOP' }] }),
    input: (id) => ({ contents: [{ role: 'user', parts: [{ functionResponse: { id, name: 'read', response: { ok: true } } }] }] }),
    start: { contents: [{ role: 'user', parts: [{ text: 'hello' }] }] },
    path: (stream) => `/v1beta/models/aios/group/pair:${stream ? 'streamGenerateContent' : 'generateContent'}`,
  },
};

for (const [protocol, format] of Object.entries(suppliedTools)) {
  test(`${protocol} supplied tool IDs allow same-pin reuse but incompatible ownership stays conflicted`, () => {
    const first = candidate();
    const changes = [
      { route: { modelId: 'm2' } }, { route: { providerId: 'p2' } }, { route: { targetProtocol: 'gemini' } },
      { route: { targetRef: 'group:other' } }, { account: 'two' }, { fingerprint: 'changed' },
    ];
    for (const change of changes) {
      const affinity = createRoutingAffinity();
      const current = (extra = {}) => context({ protocol, sessionId: undefined, ...extra });
      const output = format.output('call_1');
      affinity(current({ sessionId: 'a' })).remember(first.selected, 'one', output);
      affinity(current({ sessionId: 'b' })).remember({ ...first.selected }, 'one', output);
      assert.equal(affinity(current({ body: format.input('call_1') })).select([first]).pin.account, 'one');
      affinity(current({ sessionId: 'b', fingerprint: change.fingerprint || 'config' })).remember({ ...first.selected, ...change.route }, change.account || 'one', output);
      const check = () => {
        for (const sessionId of [undefined, 'a', 'b', 'unbound']) {
          assert.throws(() => affinity(current({ sessionId, body: format.input('call_1') })).select([first, candidate('m2')]), { code: 'AFFINITY_TARGET_CONFLICT' });
        }
      };
      check();
      affinity(current({ sessionId: 'a' })).remember(first.selected, 'one', output);
      check();
      affinity(current()).remember(first.selected, 'one', format.output('unrelated'));
      assert.equal(affinity(current({ body: format.input('unrelated') })).select([first]).pin.account, 'one');
    }
  });

  for (const mode of ['JSON', 'SSE']) for (const sessions of ['none', 'different']) {
    test(`${protocol} supplied-ID collision fails closed after ${mode} output (${sessions} sessions)`, async () => {
      const ports = [];
      const output = format.output('call_1');
      const wire = wireFor(frames[protocol]).replaceAll('call-1', 'call_1');
      const { app } = appFor(async (url, init) => {
        ports.push(new URL(url).port);
        if (ports.length === 3) return new Response('', { status: 429 });
        const stream = protocol === 'gemini' ? url.includes(':streamGenerateContent') : jsonBody(init).stream;
        return stream ? sse(fragmented(wire)) : Response.json(output);
      }, { registry: registry([protocol, protocol]) });
      const headers = (session) => session ? { 'x-gateway-session': session } : {};
      const session = (label) => sessions === 'none' ? undefined : label;
      const send = (body, sessionId, stream = false) => request(app, { model: 'aios/group/pair', ...body, stream }, headers(sessionId), format.path(stream));
      for (const label of ['a', 'b']) {
        const response = await send(format.start, session(label), mode === 'SSE');
        assert.equal(response.status, 200);
        if (mode === 'SSE') assert.equal(await response.text(), wire);
        else assert.deepEqual(await response.json(), output);
        if (label === 'a') {
          const samePin = await send(format.input('call_1'), session('a'));
          assert.equal(samePin.status, 200);
          assert.deepEqual(await samePin.json(), output);
        }
      }
      assert.deepEqual(ports, ['19001', '19001', '19001', '19002']);
      for (const sessionId of [undefined, session('a'), session('b'), 'unbound']) {
        const response = await send(format.input('call_1'), sessionId);
        assert.equal(response.status, 400);
        const { error } = await response.json();
        assert.equal(protocol === 'gemini' ? error.details[0].reason : error.code, 'AFFINITY_TARGET_CONFLICT');
      }
      assert.deepEqual(ports, ['19001', '19001', '19001', '19002']);
    });
  }
}

test('tool collision tombstones retain bounded LRU eviction and non-sliding TTL', () => {
  let now = 0;
  const affinity = createRoutingAffinity({ maxEntries: 2, ttlMs: 10, now: () => now });
  const current = (body = {}) => context({ sessionId: undefined, body });
  const remember = (id, modelId) => affinity(current()).remember(candidate(modelId).selected, 'one', tool(id));
  const select = (id) => affinity(current(continuation(id))).select([candidate(), candidate('m2')]);
  remember('call_1', 'm1');
  now = 1;
  remember('call_1', 'm2');
  for (now of [5, 10]) assert.throws(() => select('call_1'), { code: 'AFFINITY_TARGET_CONFLICT' });
  now = 11;
  assert.throws(() => select('call_1'), { code: 'TOOL_AFFINITY_UNKNOWN' });
  remember('call_1', 'm2');
  assert.equal(select('call_1').pin.modelId, 'm2');
  remember('call_2', 'm1');
  remember('call_2', 'm2');
  remember('call_3', 'm1');
  assert.throws(() => select('call_1'), { code: 'TOOL_AFFINITY_UNKNOWN' });
  assert.throws(() => select('call_2'), { code: 'AFFINITY_TARGET_CONFLICT' });
  assert.equal(select('call_3').pin.modelId, 'm1');
  remember('call_4', 'm1');
  assert.throws(() => select('call_2'), { code: 'TOOL_AFFINITY_UNKNOWN' });
});
