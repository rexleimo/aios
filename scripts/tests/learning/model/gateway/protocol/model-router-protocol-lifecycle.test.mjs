import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutingGatewayApp } from '../../../../../lib/tooling/model-router/gateway/compatibility/proxy.mjs';
import { resolveGatewayRoute } from '../../../../../lib/tooling/model-router/gateway/router.mjs';
import { createGatewayServer } from '../../../../../lib/tooling/model-router/gateway/serve.mjs';
import { createServer } from 'node:http';

const registry = (protocol = 'openai-chat', accounts = null) => ({
  models: { only: { source: 'custom', provider: 'local', upstreamModel: 'real', protocols: [protocol] } },
  providers: { local: {
    baseUrl: 'https://upstream.invalid', endpointStyle: 'standard', protocols: [protocol],
    authMode: accounts ? 'required' : 'none', ...(accounts ? { accounts } : {}),
  } },
});
const request = (app, stream = true, signal) => app.request('/v1/messages', {
  method: 'POST', headers: { 'content-type': 'application/json' }, signal,
  body: JSON.stringify({ model: 'alias', max_tokens: 64, stream, messages: [{ role: 'user', content: 'hello' }] }),
});
const streamResponse = (body) => new Response(body, { headers: { 'content-type': 'text/event-stream' } });

test('cross-protocol response body deadlines stay active after upstream headers', async () => {
  let cancelled = false;
  const { app, decisions } = createRoutingGatewayApp({ registry: registry(), env: {}, masking: false, requestTimeoutMs: 30,
    fetchImpl: async () => streamResponse(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('data: {"id":"x","choices":[{"delta":{"content":"hello"}}]}\n\n')); },
      cancel() { cancelled = true; },
    })),
  });
  const res = await request(app);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /hello/);
  assert.match(text, /event: error/);
  assert.doesNotMatch(text, /event: message_stop/);
  assert.equal(cancelled, true);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].status, 504);
  assert.equal(decisions[0].error, 'GATEWAY_TIMEOUT');
});

test('a non-streaming upstream body that stalls returns a gateway timeout', async () => {
  let cancelled = false;
  const { app, decisions } = createRoutingGatewayApp({ registry: registry(), env: {}, requestTimeoutMs: 20,
    fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json' } }),
  });
  const res = await request(app, false);
  assert.equal(res.status, 504);
  assert.equal((await res.json()).error.code, 'GATEWAY_TIMEOUT');
  assert.equal(cancelled, true);
  assert.equal(decisions.length, 1);
});

test('cancelling a client stream cancels its upstream reader', async () => {
  let cancelled = false;
  let upstreamSignal;
  const { app, decisions } = createRoutingGatewayApp({ registry: registry(), env: {}, masking: false,
    fetchImpl: async (_url, init) => {
      upstreamSignal = init.signal;
      return streamResponse(new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode('data: {"id":"x","choices":[{"delta":{"content":"hello"}}]}\n\n')); },
        cancel() { cancelled = true; },
      }));
    },
  });
  const res = await request(app);
  const reader = res.body.getReader();
  await reader.read();
  await reader.cancel('client finished');
  // Cancellation traverses stream pipes asynchronously, without requiring a new request.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
  assert.equal(upstreamSignal.aborted, true);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].status, 499);
  assert.equal(decisions[0].error, 'CLIENT_CANCELLED');
});

test('an upstream JSON response to a requested stream is rejected, not returned as a foreign completion', async () => {
  const { app } = createRoutingGatewayApp({ registry: registry(), env: {},
    fetchImpl: async () => Response.json({ choices: [{ message: { content: 'wrong mode' }, finish_reason: 'stop' }] }),
  });
  const res = await request(app);
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error.code, 'INVALID_UPSTREAM_RESPONSE');
});

test('an upstream SSE response to a cross-protocol non-stream request is rejected', async () => {
  const { app } = createRoutingGatewayApp({ registry: registry(), env: {}, fetchImpl: async () => streamResponse('data: [DONE]\n\n') });
  const res = await request(app, false);
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error.code, 'INVALID_UPSTREAM_RESPONSE');
});

test('a native non-stream request rejects SSE before committing success headers and cancels upstream', async () => {
  let cancelled = false;
  const { app, decisions } = createRoutingGatewayApp({ registry: registry('claude'), env: {},
    fetchImpl: async () => streamResponse(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('event: message_start\ndata: {"type":"message_start"}\n\n')); },
      cancel() { cancelled = true; },
    })),
  });
  const response = await request(app, false);
  if (response.status !== 502) await response.body.cancel('unexpected stream');
  assert.equal(response.status, 502);
  assert.match(response.headers.get('content-type'), /application\/json/);
  const body = await response.json();
  assert.equal(body.type, 'error');
  assert.equal(body.error.code, 'INVALID_UPSTREAM_RESPONSE');
  assert.equal(cancelled, true);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].status, 502);
});

test('retrying a configured account cancels the rejected response before forwarding the next account', async () => {
  const order = [];
  const accounts = [{ id: 'one', apiKeyEnv: 'env:ONE' }, { id: 'two', apiKeyEnv: 'env:TWO' }];
  const { app } = createRoutingGatewayApp({ registry: registry('openai-chat', accounts), env: { ONE: 'first-key', TWO: 'second-key' },
    fetchImpl: async (_url, init) => {
      order.push(init.headers.authorization);
      if (order.length === 1) return new Response(new ReadableStream({ cancel() { order.push('cancelled'); } }), { status: 429 });
      return Response.json({ id: 'x', choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
    },
  });
  const res = await request(app, false);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).content[0].text, 'ok');
  assert.deepEqual(order, ['Bearer first-key', 'cancelled', 'Bearer second-key']);
});

test('same-protocol masked streams preserve UTF-8 split across individual bytes', async () => {
  const wire = 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"\u4f60\u597d"}}\n\n';
  const bytes = new TextEncoder().encode(wire);
  const { app } = createRoutingGatewayApp({ registry: registry('claude'), env: {}, masking: true,
    fetchImpl: async () => streamResponse(new ReadableStream({ start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    } })),
  });
  assert.equal(await (await request(app)).text(), wire);
});

test('a bound model with multiple APIs prefers native wire compatibility over unnecessary translation', () => {
  const configured = registry();
  configured.models.only.protocols = ['openai-chat', 'openai-response'];
  configured.providers.local.protocols = ['openai-chat', 'openai-response'];
  const route = resolveGatewayRoute({ registry: configured, env: {}, clientProtocol: 'openai-response' });
  assert.equal(route.needsTranslation, false);
  assert.equal(route.targetProtocol, 'openai-response');
  assert.equal(route.endpoint, 'https://upstream.invalid/v1/responses');
});

test('Gemini user text participates in intent routing and tool continuations retain only their explicit session intent', async () => {
  const configured = registry();
  configured.models.other = { ...configured.models.only, upstreamModel: 'other-real' };
  configured.activeModel = 'only';
  configured.intentRouting = { enabled: true, classifierModel: 'only', intents: [{ id: 'other', description: 'Other tasks', modelId: 'other' }] };
  let classified = 0;
  const models = [];
  const { app } = createRoutingGatewayApp({ registry: configured, env: {}, masking: false,
    classifyIntent: async (text) => { classified++; assert.equal(text, 'hello'); return { intentId: 'other', modelId: 'other' }; },
    fetchImpl: async (_url, init) => {
      models.push(JSON.parse(new TextDecoder().decode(init.body)).model);
      return Response.json({ id: 'x', choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
    },
  });
  const send = (body, session = '') => app.request('/v1/models/alias:generateContent', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(session ? { 'x-gateway-session': session } : {}) }, body: JSON.stringify(body),
  });
  const prompt = { role: 'user', parts: [{ text: 'hello' }] };
  assert.equal((await send({ contents: [prompt] }, 'session-a')).status, 200);
  const continuation = { contents: [
    prompt,
    { role: 'model', parts: [{ functionCall: { id: 'call-1', name: 'read_file', args: {} } }] },
    { role: 'user', parts: [{ functionResponse: { id: 'call-1', name: 'read_file', response: { result: 'done' } } }] },
  ] };
  assert.equal((await send(continuation, 'session-a')).status, 200);
  assert.equal((await send(continuation, 'session-b')).status, 200);
  assert.equal(classified, 1);
  assert.deepEqual(models, ['other-real', 'other-real', 'real']);
});

test('unsupported input is refused before even an enabled intent classifier can run', async () => {
  const configured = registry('claude');
  configured.models.other = { ...configured.models.only, upstreamModel: 'other-real' };
  configured.activeModel = 'only';
  configured.intentRouting = { enabled: true, classifierModel: 'only', intents: [{ id: 'other', description: 'Other tasks', modelId: 'other' }] };
  let calls = 0;
  const { app } = createRoutingGatewayApp({ registry: configured, env: {},
    classifyIntent: async () => { calls++; return null; }, fetchImpl: async () => { calls++; return Response.json({}); },
  });
  const res = await app.request('/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    input: 'hello', previous_response_id: 'resp-previous',
  }) });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'UNSUPPORTED_PROTOCOL_FEATURE');
  assert.equal(calls, 0);
});

test('the production Node server exposes all four protocol intakes without special app options', async () => {
  let calls = 0;
  const server = createGatewayServer({ registry: registry(), env: {}, masking: false,
    fetchImpl: async () => {
      calls++;
      return Response.json({ id: 'x', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
    },
  });
  try {
    const address = await server.listen();
    const url = `http://127.0.0.1:${address.port}`;
    const requests = [
      ['/v1/messages', { messages: [{ role: 'user', content: 'hello' }], max_tokens: 32 }],
      ['/v1/responses', { input: 'hello' }],
      ['/v1/chat/completions', { messages: [{ role: 'user', content: 'hello' }] }],
      ['/v1/models/alias:generateContent', { contents: [{ role: 'user', parts: [{ text: 'hello' }] }] }],
    ];
    for (const [pathname, body] of requests) {
      const res = await fetch(`${url}${pathname}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(res.status, 200, pathname);
      const json = await res.json();
      if (pathname === '/v1/messages') assert.equal(json.content[0].text, 'ok');
      else if (pathname === '/v1/responses') assert.equal(json.output[0].content[0].text, 'ok');
      else if (pathname === '/v1/chat/completions') assert.equal(json.choices[0].message.content, 'ok');
      else assert.equal(json.candidates[0].content.parts[0].text, 'ok');
    }
    assert.equal(calls, 4);
  } finally {
    await server.close();
  }
});

test('provider redirects are rejected before synthetic credentials can reach a second origin', async () => {
  let destinationCalls = 0;
  const destination = createServer((_req, res) => { destinationCalls++; res.end('{}'); });
  const origin = createServer((_req, res) => {
    res.writeHead(307, { location: `http://127.0.0.1:${destination.address().port}/capture` });
    res.end();
  });
  const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const close = (server) => new Promise((resolve) => server.close(resolve));
  await listen(destination);
  await listen(origin);
  try {
    const configured = registry('claude', [{ id: 'one', apiKeyEnv: 'env:KEY' }]);
    configured.providers.local.baseUrl = `http://127.0.0.1:${origin.address().port}`;
    const { app } = createRoutingGatewayApp({ registry: configured, env: { KEY: 'synthetic-key-not-real' }, masking: false });
    const response = await request(app, false);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error.code, 'UPSTREAM_REDIRECT_REJECTED');
    assert.equal(destinationCalls, 0);
  } finally {
    await Promise.all([close(origin), close(destination)]);
  }
});

test('account retries share a single request deadline', async () => {
  const accounts = ['one', 'two', 'three'].map(id => ({ id, apiKeyEnv: `env:${id.toUpperCase()}` }));
  let calls = 0;
  const { app, decisions } = createRoutingGatewayApp({ registry: registry('openai-chat', accounts), env: { ONE: 'a', TWO: 'b', THREE: 'c' }, requestTimeoutMs: 50,
    fetchImpl: async () => {
      calls++;
      await new Promise(resolve => setTimeout(resolve, 30));
      return Response.json({ error: { message: 'quota' } }, { status: 429 });
    },
  });
  const response = await request(app, false);
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, 'GATEWAY_TIMEOUT');
  assert.equal(calls, 2);
  assert.equal(decisions.length, 1);
});

test('retry cancellation promises cannot hold the gateway response hostage', async () => {
  const accounts = [{ id: 'one', apiKeyEnv: 'env:ONE' }, { id: 'two', apiKeyEnv: 'env:TWO' }];
  let calls = 0;
  const { app } = createRoutingGatewayApp({ registry: registry('openai-chat', accounts), env: { ONE: 'a', TWO: 'b' }, requestTimeoutMs: 50,
    fetchImpl: async () => {
      calls++;
      if (calls === 1) return new Response(new ReadableStream({ cancel() { return new Promise(() => {}); } }), { status: 429 });
      return Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
    },
  });
  const response = await request(app, false);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).content[0].text, 'ok');
  assert.equal(calls, 2);
});

test('native JSON restoration safely escapes synthetic multiline values', async () => {
  const secret = '-----BEGIN PRIVATE KEY-----\nsynthetic-not-a-real-key\n-----END PRIVATE KEY-----';
  const { app } = createRoutingGatewayApp({ registry: registry('claude'), env: {},
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(new TextDecoder().decode(init.body));
      return Response.json({ content: [{ type: 'text', text: body.messages[0].content }] });
    },
  });
  const response = await app.request('/v1/messages', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: secret }] }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).content[0].text, secret);
});

test('nondefault factory protocol options cannot replace reserved standard intakes', async () => {
  const { app } = createRoutingGatewayApp({ registry: registry('claude'), env: {}, clientProtocol: 'openai-response',
    fetchImpl: async () => Response.json({ type: 'message', role: 'assistant', content: [{ type: 'text', text: 'ok' }] }),
  });
  const response = await request(app, false);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).type, 'message');
});

for (const [path, protocol] of [['/v1/messages', 'claude'], ['/v1/responses', 'openai-response'], ['/v1/chat/completions', 'openai-chat'], ['/v1/models/alias:generateContent', 'gemini']]) {
  test(`intake body read failures use a ${protocol} error envelope`, async () => {
    const { app, decisions } = createRoutingGatewayApp({ registry: registry(), env: {}, fetchImpl: async () => { throw new Error('must not fetch'); } });
    const body = new ReadableStream({ start(controller) { controller.error(new Error('broken request body')); } });
    const response = await app.request(new Request(`http://local.invalid${path}`, { method: 'POST', body, duplex: 'half' }));
    assert.equal(response.status, 400);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const json = await response.json();
    assert.ok(json.error);
    if (protocol === 'claude') assert.equal(json.type, 'error');
    if (protocol === 'gemini') assert.equal(json.error.code, 400);
    assert.equal(decisions.length, 1);
  });
}

test('client cancellation during intent classification aborts its shared signal before generation', async () => {
  const configured = registry('claude');
  configured.models.other = { ...configured.models.only, upstreamModel: 'other-real' };
  configured.activeModel = 'only';
  configured.intentRouting = { enabled: true, classifierModel: 'only', intents: [{ id: 'other', description: 'Other tasks', modelId: 'other' }] };
  let ready;
  const classifying = new Promise(resolve => { ready = resolve; });
  let classifierSignal;
  let generation = 0;
  const controller = new AbortController();
  const { app, decisions } = createRoutingGatewayApp({ registry: configured, env: {}, requestTimeoutMs: 1000,
    classifyIntent: async (_text, { signal }) => { classifierSignal = signal; ready(); return new Promise(() => {}); },
    fetchImpl: async () => { generation++; return Response.json({}); },
  });
  const pending = request(app, false, controller.signal);
  await classifying;
  controller.abort();
  const response = await pending;
  assert.equal(response.status, 499);
  assert.equal((await response.json()).error.code, 'CLIENT_CANCELLED');
  assert.equal(classifierSignal.aborted, true);
  assert.equal(generation, 0);
  assert.equal(decisions[0].status, 499);
});

for (const abort of [false, true]) {
  test(`an unfinished intake is cancelled on ${abort ? 'client cancellation' : 'deadline'}`, async () => {
    let cancelled = false;
    let source;
    const controller = new AbortController();
    const { app, decisions } = createRoutingGatewayApp({ registry: registry(), env: {}, requestTimeoutMs: 20,
      fetchImpl: async () => { throw new Error('must not generate'); },
    });
    const body = new ReadableStream({ start(c) { source = c; c.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; } });
    const pending = app.request(new Request('http://local.invalid/v1/messages', { method: 'POST', body, duplex: 'half', signal: controller.signal }));
    if (abort) controller.abort();
    const response = await pending;
    assert.equal(response.status, abort ? 499 : 504);
    assert.equal(cancelled, true);
    assert.throws(() => source.enqueue(new Uint8Array(1)), TypeError);
    assert.equal(decisions.length, 1);
  });
}

for (const status of [429, 307]) {
  test(`a classifier ${status} response cancels its body before fallback generation`, async () => {
    const configured = registry('claude');
    configured.models.other = { ...configured.models.only, upstreamModel: 'other-real' };
    configured.activeModel = 'only';
    configured.intentRouting = { enabled: true, classifierModel: 'only', intents: [{ id: 'other', description: 'Other tasks', modelId: 'other' }] };
    let calls = 0;
    let cancelled = false;
    let classifierSignal;
    const { app } = createRoutingGatewayApp({ registry: configured, env: {},
      fetchImpl: async (_url, init) => {
        if (++calls === 1) {
          classifierSignal = init.signal;
          assert.equal(init.redirect, 'manual');
          return new Response(new ReadableStream({ cancel() { cancelled = true; return new Promise(() => {}); } }), { status });
        }
        return Response.json({ type: 'message', role: 'assistant', content: [{ type: 'text', text: 'fallback' }] });
      },
    });
    const response = await request(app, false);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).content[0].text, 'fallback');
    assert.equal(calls, 2);
    assert.equal(cancelled, true);
    assert.equal(classifierSignal.aborted, true);
  });
}

test('deep input is rejected before recursive masking with a client protocol error and a decision', async () => {
  let calls = 0;
  const { app, decisions } = createRoutingGatewayApp({ registry: registry(), env: {}, fetchImpl: async () => { calls++; return Response.json({}); } });
  const body = '{"messages":[{"role":"user","content":"hello"}],"extension":' + '['.repeat(6000) + '0' + ']'.repeat(6000) + '}';
  const response = await app.request('/v1/messages', { method: 'POST', body });
  assert.equal(response.status, 400);
  const json = await response.json();
  assert.equal(json.type, 'error');
  assert.equal(json.error.code, 'INVALID_PROTOCOL_REQUEST');
  assert.equal(calls, 0);
  assert.equal(decisions.length, 1);
});

test('unexpected forwarding setup errors still dispose the lifetime and use the client error protocol', async () => {
  const { app, decisions } = createRoutingGatewayApp({ registry: registry(), env: {}, masking: false,
    fetchImpl: async () => { throw new Error('fixture failure'); },
  });
  const response = await request(app, false);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).type, 'error');
  assert.equal(decisions.length, 1);
});
