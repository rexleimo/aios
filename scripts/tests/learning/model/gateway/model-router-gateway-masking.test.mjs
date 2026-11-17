import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutingGatewayApp } from '../../../../lib/tooling/model-router/gateway/compatibility/proxy.mjs';
import { createProtocolUnmaskTransform, unmaskProtocolResponse } from '../../../../lib/tooling/model-router/gateway/compatibility/protocol-mask.mjs';
import { translateProtocolStream } from '../../../../lib/tooling/model-router/gateway/compatibility/protocol-stream.mjs';
import { createUnmaskTransform, detectSecrets, maskText, unmaskObject } from '../../../../lib/tooling/model-router/masking/masker.mjs';

const registry = {
  activeModel: 'm',
  models: { m: { protocols: ['openai-chat'] } },
  providers: { p: { baseUrl: 'https://api.example.com', apiKeyEnv: 'env:K', protocols: ['openai-chat'], models: ['m'] } },
  roleDefaults: { implementer: { taskType: 'implementation' } },
  routingRules: [{ taskType: 'implementation', primary: 'm', fallback: [] }, { taskType: 'general', primary: 'm', fallback: [] }],
  clientRoleMatrix: { default: { implementer: 'm' }, clients: {} },
};

test('masking: secret in request is masked upstream and restored in response', async () => {
  let upstreamContent;
  const upstreamFetch = async (url, init) => {
    const body = JSON.parse(new TextDecoder().decode(init.body));
    upstreamContent = body.messages[0].content;
    // echo back the (masked) placeholder
    const placeholder = (upstreamContent.match(/\{\{API_KEY_[a-f0-9]{8}\}\}/) || [])[0];
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'echo ' + placeholder }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const { app } = createRoutingGatewayApp({ registry, clientId: 'claude', role: 'implementer', env: { K: 'k' }, clientProtocol: 'claude', fetchImpl: upstreamFetch, masking: true });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude', max_tokens: 10, messages: [{ role: 'user', content: 'my key sk-abcdefghijklmnopqrstuvwxyz123456' }] }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(!String(upstreamContent).includes('sk-abcdefghijklmnopqrstuvwxyz123456'), 'upstream saw masked');
  assert.ok(String(JSON.stringify(body)).includes('sk-abcdefghijklmnopqrstuvwxyz123456'), 'response restored');
});

test('masking also covers sensitive object keys serialized by the request translator', async () => {
  const email = 'person@example.invalid';
  const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456';
  let captured;
  const { app } = createRoutingGatewayApp({ registry, clientId: 'claude', role: 'implementer', env: { K: 'k' }, masking: true,
    fetchImpl: async (_url, init) => {
      captured = new TextDecoder().decode(init.body);
      const body = JSON.parse(captured);
      return Response.json({ choices: [{ message: { role: 'assistant', content: body.messages[0].tool_calls[0].function.arguments }, finish_reason: 'stop' }] });
    },
  });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude', messages: [{ role: 'assistant', content: [
      { type: 'tool_use', id: 't1', name: 'inspect', input: { [email]: 'owner', credential: secret } },
    ] }] }),
  });
  assert.equal(res.status, 200);
  assert.equal(captured.includes(email), false, 'serialization must not expose a sensitive object key');
  assert.equal(captured.includes(secret), false);
  const response = JSON.stringify(await res.json());
  assert.ok(response.includes(email) && response.includes(secret), 'both masking passes share the response restoration mapping');
});

const protocols = ['claude', 'openai-chat', 'openai-response', 'gemini'];
const encoder = new TextEncoder();
// Synthetic detector fixtures, not real credentials or a usable private key.
const privateKey = '-----BEGIN PRIVATE KEY-----\nfixture\\path"quoted\nNOT-A-REAL-KEY\n-----END PRIVATE KEY-----';
const envAssignment = 'FIXTURE_TOKEN=C:\\fake\\fixture\\payload';

function masks() {
  const store = new Map();
  const key = maskText(privateKey, store).text;
  const env = maskText(envAssignment, store).text;
  return { store, key, env };
}

function frame(body, event = '') {
  return `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(body)}\n\n`;
}

function named(type, fields = {}) { return frame({ type, ...fields }, type); }

function bytes(wire, oneByte = false) {
  const data = encoder.encode(wire);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset === data.length) return controller.close();
      const end = oneByte ? offset + 1 : data.length;
      controller.enqueue(data.subarray(offset, end));
      offset = end;
    },
  });
}

function events(wire) {
  return wire.replace(/\r\n|\r/g, '\n').split('\n\n').flatMap((raw) => {
    const lines = raw.split('\n').filter((line) => line === 'data' || line.startsWith('data:'));
    if (!lines.length) return [];
    const data = lines.map((line) => line.slice(5).replace(/^ /, '')).join('\n');
    return [data.trim() === '[DONE]' ? '[DONE]' : JSON.parse(data)];
  });
}

function fixtureArgs(key, env) {
  return { credential: key, nested: [{ environment: env }], literal: JSON.stringify({ value: key }), [key]: 'sensitive object key' };
}

function restoredArgs() {
  return fixtureArgs(privateKey, envAssignment);
}

function bodyFixture(protocol, key, env) {
  const text = `Literal {"value":"${key}"}\n${key} ${env}`;
  const args = fixtureArgs(key, env);
  if (protocol === 'claude') return { role: 'assistant', content: [{ type: 'text', text }, { type: 'tool_use', id: 'call_1', name: 'inspect', input: args }], stop_reason: 'tool_use' };
  if (protocol === 'openai-chat') return { choices: [{ message: { role: 'assistant', content: text, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'inspect', arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] };
  if (protocol === 'openai-response') return { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }, { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'inspect', arguments: JSON.stringify(args) }] };
  return { candidates: [{ index: 0, content: { role: 'model', parts: [{ text }, { functionCall: { id: 'call_1', name: 'inspect', args } }] }, finishReason: 'STOP' }] };
}

function bodyValues(body, protocol) {
  if (protocol === 'claude') return { text: body.content[0].text, args: body.content[1].input };
  if (protocol === 'openai-chat') return { text: body.choices[0].message.content, args: JSON.parse(body.choices[0].message.tool_calls[0].function.arguments) };
  if (protocol === 'openai-response') return { text: body.output[0].content[0].text, args: JSON.parse(body.output[1].arguments) };
  return { text: body.candidates[0].content.parts[0].text, args: body.candidates[0].content.parts[1].functionCall.args };
}

test('synthetic detected multiline private key reproduces raw SSE and stringified-argument corruption', async () => {
  assert.ok(detectSecrets(privateKey).some((secret) => secret.kind === 'PRIVATE_KEY' && secret.value === privateKey));
  assert.ok(detectSecrets(envAssignment).some((secret) => secret.kind === 'ENV_ASSIGN' && secret.value === envAssignment));
  const { store, key, env } = masks();
  const wire = frame({ choices: [{ index: 0, delta: { content: key }, finish_reason: 'stop' }] });
  const unsafe = await new Response(bytes(wire).pipeThrough(createUnmaskTransform(store))).text();
  assert.throws(() => events(unsafe), SyntaxError, 'raw replacement introduces literal newlines and quotes in outer SSE JSON');
  const unsafeBody = unmaskObject(bodyFixture('openai-chat', key, env), store);
  assert.throws(() => bodyValues(unsafeBody, 'openai-chat'), SyntaxError, 'plain object replacement breaks the inner JSON-string arguments');
  const safe = await new Response(bytes(wire, true).pipeThrough(createProtocolUnmaskTransform('openai-chat', store))).text();
  assert.equal(events(safe)[0].choices[0].delta.content, privateKey);
});

for (const protocol of protocols) {
  test(`${protocol}: full response restores JSON values and argument keys without interpreting ordinary text as JSON`, () => {
    const { store, key, env } = masks();
    const original = bodyFixture(protocol, key, env);
    const before = JSON.stringify(original);
    const result = unmaskProtocolResponse(original, protocol, store);
    const actual = bodyValues(JSON.parse(JSON.stringify(result)), protocol);
    assert.equal(actual.text, `Literal {"value":"${privateKey}"}\n${privateKey} ${envAssignment}`);
    const expected = restoredArgs();
    // A string *inside* tool args is still ordinary text, not another JSON layer.
    expected.literal = `{"value":"${privateKey}"}`;
    assert.deepEqual(actual.args, expected);
    assert.equal(JSON.stringify(original), before, 'restoration must not mutate the source body');
  });

  test(`${protocol}: empty store preserves opaque wire byte-for-byte, including fragmented UTF-8 and non-JSON extensions`, async () => {
    const wire = ': heartbeat\r\nid: fixture\r\nevent: vendor.extension\r\ndata: opaque \u4e16\u754c\ud83d\ude42\r\n\r\ndata: [DONE]';
    let observed = false;
    const output = await new Response(bytes(wire, true).pipeThrough(createProtocolUnmaskTransform(protocol, new Map(), { onError() { observed = true; } }))).text();
    assert.equal(output, wire);
    assert.equal(observed, false);
  });
}

function streamFixture(protocol, key, env, textParts = [...`prefix \u4e16\u754c ${key} ${env} suffix`]) {
  const args = fixtureArgs(key, env);
  const argumentParts = [...JSON.stringify(args)];
  if (protocol === 'openai-chat') {
    const chunk = (delta, finish_reason = null) => frame({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixture_model', choices: [{ index: 0, delta, finish_reason }] });
    return chunk({ role: 'assistant', content: '' })
      + textParts.map((content) => chunk({ content })).join('')
      + chunk({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'inspect', arguments: '' } }] })
      + argumentParts.map((arguments_) => chunk({ tool_calls: [{ index: 0, function: { arguments: arguments_ } }] })).join('')
      + chunk({}, 'tool_calls') + 'data: [DONE]\n\n';
  }
  if (protocol === 'claude') {
    return named('message_start', { message: { id: 'fixture', model: 'fixture_model', role: 'assistant', content: [], usage: { input_tokens: 0, output_tokens: 0 } } })
      + named('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
      + textParts.map((text) => named('content_block_delta', { index: 0, delta: { type: 'text_delta', text } })).join('')
      + named('content_block_stop', { index: 0 })
      + named('content_block_start', { index: 1, content_block: { type: 'tool_use', id: 'call_1', name: 'inspect', input: {} } })
      + argumentParts.map((partial_json) => named('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json } })).join('')
      + named('content_block_stop', { index: 1 })
      + named('message_delta', { delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 0 } })
      + named('message_stop');
  }
  if (protocol === 'gemini') {
    const chunk = (parts, finishReason) => frame({ responseId: 'fixture', modelVersion: 'fixture_model', candidates: [{ index: 0, content: { role: 'model', parts }, ...(finishReason ? { finishReason } : {}) }] });
    return textParts.map((text) => chunk([{ text }])).join('')
      + chunk([{ functionCall: { id: 'call_1', name: 'inspect', args } }]) + chunk([], 'STOP');
  }
  const textItem = { id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: textParts.join(''), annotations: [], logprobs: [] }] };
  const toolItem = { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'inspect', arguments: JSON.stringify(args), status: 'completed' };
  const textBase = { output_index: 0, item_id: textItem.id, content_index: 0 };
  const toolBase = { output_index: 1, item_id: toolItem.id };
  return named('response.created', { response: { id: 'fixture', model: 'fixture_model', status: 'in_progress', output: [] } })
    + named('response.output_item.added', { output_index: 0, item: { ...textItem, status: 'in_progress', content: [] } })
    + named('response.content_part.added', { ...textBase, part: { ...textItem.content[0], text: '' } })
    + textParts.map((delta) => named('response.output_text.delta', { ...textBase, delta })).join('')
    + named('response.output_text.done', { ...textBase, text: textItem.content[0].text })
    + named('response.content_part.done', { ...textBase, part: textItem.content[0] })
    + named('response.output_item.done', { output_index: 0, item: textItem })
    + named('response.output_item.added', { output_index: 1, item: { ...toolItem, status: 'in_progress', arguments: '' } })
    + argumentParts.map((delta) => named('response.function_call_arguments.delta', { ...toolBase, delta })).join('')
    + named('response.function_call_arguments.done', { ...toolBase, arguments: toolItem.arguments })
    + named('response.output_item.done', { output_index: 1, item: toolItem })
    + named('response.completed', { response: { id: 'fixture', model: 'fixture_model', status: 'completed', output: [textItem, toolItem], usage: { input_tokens: 0, output_tokens: 0 } } });
}

function streamValues(data, protocol) {
  let text = '';
  let argumentText = '';
  let args;
  for (const event of data) {
    if (event === '[DONE]') continue;
    if (protocol === 'openai-chat') {
      text += event.choices?.[0]?.delta?.content || '';
      argumentText += event.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments || '';
    } else if (protocol === 'claude') {
      if (event.type === 'content_block_start' && event.content_block.type === 'text') text += event.content_block.text;
      if (event.delta?.type === 'text_delta') text += event.delta.text;
      if (event.delta?.type === 'input_json_delta') argumentText += event.delta.partial_json;
    } else if (protocol === 'openai-response') {
      if (event.type === 'response.output_text.delta') text += event.delta;
      if (event.type === 'response.function_call_arguments.delta') argumentText += event.delta;
      if (event.type === 'response.completed') {
        const snapshot = event.response.output.find((item) => item.type === 'function_call');
        assert.equal(snapshot.arguments, argumentText, 'full terminal arguments agree with emitted argument deltas');
        assert.equal(event.response.output.find((item) => item.type === 'message').content[0].text, text);
      }
    } else {
      for (const part of event.candidates?.[0]?.content?.parts || []) {
        text += part.text || '';
        if (part.functionCall) args = part.functionCall.args;
      }
    }
  }
  return { text, args: args || JSON.parse(argumentText) };
}

for (const from of protocols) for (const to of protocols) {
  test(`masking ${from} -> ${to}: native/converted SSE restores byte- and delta-split placeholders with correct JSON layers`, async () => {
    const { store, key, env } = masks();
    const source = bytes(streamFixture(from, key, env).replaceAll('\n', '\r\n'), true);
    const translated = from === to ? source : translateProtocolStream(source, from, to, 'fixture_model');
    const wire = await new Response(translated.pipeThrough(createProtocolUnmaskTransform(to, store))).text();
    const actual = streamValues(events(wire), to);
    assert.equal(actual.text, `prefix \u4e16\u754c ${privateKey} ${envAssignment} suffix`);
    const expected = restoredArgs();
    expected.literal = `{"value":"${privateKey}"}`;
    assert.deepEqual(actual.args, expected);
  });
}

test('nonempty store preserves SSE comments, id, event, retry, unknown fields, multiline data and EOF framing', async () => {
  const { store, key } = masks();
  const wire = ': heartbeat\r\nid: fixture\r\nevent: vendor.extension\r\nretry: 15\r\nx-opaque: leave-me\r\n'
    + `data: {"vendor":{"text":${JSON.stringify(key)}},\r\ndata: "arbitrary":[true,3,{"deep":"kept"}]}\r\n\r\n`
    + ': second heartbeat\r\n\r\ndata: [DONE]';
  const result = await new Response(bytes(wire, true).pipeThrough(createProtocolUnmaskTransform('openai-chat', store))).text();
  assert.ok(result.startsWith(': heartbeat\r\nid: fixture\r\nevent: vendor.extension\r\nretry: 15\r\nx-opaque: leave-me\r\n'));
  assert.ok(result.endsWith(': second heartbeat\r\n\r\ndata: [DONE]'));
  assert.equal((result.match(/^data:/gm) || []).length, 3);
  assert.deepEqual(events(result), [{ vendor: { text: privateKey }, arbitrary: [true, 3, { deep: 'kept' }] }, '[DONE]']);
});

test('interleaved chat choices and tools never share placeholder prefixes', async () => {
  const { store, key, env } = masks();
  const split = Math.floor(key.length / 2);
  const choice = (index, delta, finish_reason = null) => frame({ choices: [{ index, delta, finish_reason }] });
  const tool = (index, arguments_) => ({ tool_calls: [{ index, function: { arguments: arguments_ } }] });
  const wire = choice(0, { content: key.slice(0, split) })
    + choice(1, { content: `other:${env}` })
    + choice(0, tool(0, `{"v":"${key.slice(0, split)}`))
    + choice(0, tool(1, `{"v":"${env}"}`))
    + choice(0, { content: key.slice(split) })
    + choice(0, tool(0, `${key.slice(split)}"}`))
    + choice(0, {}, 'tool_calls') + choice(1, {}, 'stop') + 'data: [DONE]\n\n';
  const data = events(await new Response(bytes(wire, true).pipeThrough(createProtocolUnmaskTransform('openai-chat', store))).text());
  const texts = ['', ''];
  const args = ['', ''];
  for (const event of data.filter((item) => item !== '[DONE]')) for (const item of event.choices) {
    texts[item.index] += item.delta.content || '';
    for (const call of item.delta.tool_calls || []) args[call.index] += call.function.arguments;
  }
  assert.deepEqual(texts, [privateKey, `other:${envAssignment}`]);
  assert.deepEqual(args.map((value) => JSON.parse(value)), [{ v: privateKey }, { v: envAssignment }]);
});

test('inner argument escapes and Unicode-escaped placeholder braces may cross every delta boundary', async () => {
  const { store, key } = masks();
  const source = JSON.stringify({ path: 'a\\b"c\n', secret: key, jsonLooking: `{"v":"${key}"}` }).replaceAll('{{', '\\u007b\\u007b');
  const wire = [...source].map((delta) => named('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: delta } })).join('')
    + named('content_block_stop', { index: 1 });
  const data = events(await new Response(bytes(wire, true).pipeThrough(createProtocolUnmaskTransform('claude', store))).text());
  const args = data.filter((event) => event.delta).map((event) => event.delta.partial_json).join('');
  assert.deepEqual(JSON.parse(args), { path: 'a\\b"c\n', secret: privateKey, jsonLooking: `{"v":"${privateKey}"}` });
});

test('text is incremental while only a possible known placeholder suffix waits, and cancellation reaches source', async () => {
  const { store, key } = masks();
  let source;
  let cancelled;
  const input = new ReadableStream({ start(controller) { source = controller; }, cancel(reason) { cancelled = reason; } });
  const reader = input.pipeThrough(createProtocolUnmaskTransform('openai-chat', store)).getReader();
  source.enqueue(encoder.encode(frame({ choices: [{ index: 0, delta: { content: `real text ${key.slice(0, 7)}` }, finish_reason: null }] })));
  const early = events(new TextDecoder().decode((await reader.read()).value));
  assert.equal(early[0].choices[0].delta.content, 'real text ');
  source.enqueue(encoder.encode(frame({ choices: [{ index: 0, delta: { content: key.slice(7) }, finish_reason: null }] })));
  const restored = events(new TextDecoder().decode((await reader.read()).value));
  assert.equal(restored[0].choices[0].delta.content, privateKey);
  await reader.cancel('fixture cancellation');
  // pipeThrough propagates cancellation in a microtask, without awaiting timers.
  await Promise.resolve();
  assert.equal(cancelled, 'fixture cancellation');
});

for (const protocol of protocols) {
  test(`${protocol}: unmatched known prefixes and unknown placeholders remain literal at channel end`, async () => {
    const { store, key, env } = masks();
    const text = `literal {{UNKNOWN_deadbeef}} ${key.slice(0, 10)}`;
    const source = streamFixture(protocol, key, env, [text]);
    const result = events(await new Response(bytes(source, true).pipeThrough(createProtocolUnmaskTransform(protocol, store))).text());
    assert.equal(streamValues(result, protocol).text, text);
  });
}

test('an unterminated EOF text delta flushes a partial placeholder without adding a terminal or changing framing', async () => {
  const { store, key } = masks();
  const content = `real text ${key.slice(0, 8)}`;
  const wire = frame({ choices: [{ index: 0, delta: { content }, finish_reason: null }] }).slice(0, -2);
  const result = await new Response(bytes(wire, true).pipeThrough(createProtocolUnmaskTransform('openai-chat', store))).text();
  assert.ok(!result.endsWith('\n'));
  assert.equal(events(result)[0].choices[0].delta.content, content);
  assert.ok(!result.includes('[DONE]'));
});

test('malformed SSE JSON and malformed/incomplete inner argument JSON fail without synthetic terminal; observer sees local errors', async () => {
  const { store, key } = masks();
  for (const wire of [
    `data: {"choices":${key}}\n\n`,
    frame({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"bad":01}' } }] }, finish_reason: null }] }),
    named('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '{"v":"' + key } }),
  ]) {
    const errors = [];
    const protocol = wire.includes('partial_json') ? 'claude' : 'openai-chat';
    const body = bytes(wire, true).pipeThrough(createProtocolUnmaskTransform(protocol, store, { onError(error) { errors.push(error); throw new Error('ignored observer'); } }));
    await assert.rejects(new Response(body).text(), (error) => error.code === 'MALFORMED_PROTOCOL_STREAM');
    assert.equal(errors.length, 1);
    assert.ok(!errors[0].message.includes(key) && !errors[0].message.includes(privateKey), 'error diagnostics contain no payload or secrets');
  }
});

test('an oversized SSE frame fails with a bounded parser error rather than buffering the response', async () => {
  const { store } = masks();
  const errors = [];
  const input = bytes('data: ' + 'x'.repeat(1024 * 1024 + 1));
  await assert.rejects(new Response(input.pipeThrough(createProtocolUnmaskTransform('openai-chat', store, { onError(error) { errors.push(error.code); } }))).text(), { code: 'STREAM_LIMIT_EXCEEDED' });
  assert.deepEqual(errors, ['STREAM_LIMIT_EXCEEDED']);
});

test('upstream reader errors propagate unchanged, do not notify local-error observer, and do not synthesize a terminal', async () => {
  const { store, key } = masks();
  const failure = new Error('synthetic reader failure');
  let source;
  const input = new ReadableStream({ start(controller) { source = controller; } });
  const observed = [];
  const reader = input.pipeThrough(createProtocolUnmaskTransform('openai-chat', store, { onError(error) { observed.push(error); } })).getReader();
  source.enqueue(encoder.encode(frame({ choices: [{ index: 0, delta: { content: `early ${key.slice(0, 5)}` }, finish_reason: null }] })));
  const early = new TextDecoder().decode((await reader.read()).value);
  assert.equal(events(early)[0].choices[0].delta.content, 'early ');
  assert.ok(!early.includes('[DONE]') && !early.includes('finish_reason":"stop'));
  source.error(failure);
  await assert.rejects(reader.read(), (error) => error === failure);
  assert.deepEqual(observed, []);
});

test('full stringified arguments preserve formatting, escaped literals, JSON token types and prototype-like keys', async () => {
  const { store, key } = masks();
  const source = ` { "__proto__" : "${key}", "values" : [true,false,null,-1.25e+3,0,2E-2,{},[]], "escaped" : "\\\\u007bnot-a-placeholder" } `;
  const body = { choices: [{ message: { function_call: { name: 'fixture', arguments: source } } }] };
  const actual = unmaskProtocolResponse(body, 'openai-chat', store).choices[0].message.function_call.arguments;
  const expected = source.replace(key, JSON.stringify(privateKey).slice(1, -1));
  assert.equal(actual, expected);
  assert.equal(Object.hasOwn(JSON.parse(actual), '__proto__'), true);
  assert.equal(JSON.parse(actual).__proto__, privateKey);
  const wire = [...source].map((arguments_) => frame({ choices: [{ index: 0, delta: { function_call: { arguments: arguments_ } }, finish_reason: null }] })).join('');
  const data = events(await new Response(bytes(wire, true).pipeThrough(createProtocolUnmaskTransform('openai-chat', store))).text());
  assert.equal(data.map((event) => event.choices[0].delta.function_call.arguments).join(''), expected);
});

test('native Responses initial argument/text fragments share their following delta channels and retain JSON formatting', async () => {
  const { store, key } = masks();
  const split = Math.floor(key.length / 2);
  const argumentText = ` { "value" : "${key}" } `;
  const wire = named('response.content_part.added', { output_index: 0, item_id: 'm', content_index: 0, part: { type: 'output_text', text: key.slice(0, split) } })
    + named('response.output_text.delta', { output_index: 0, item_id: 'm', content_index: 0, delta: key.slice(split) })
    + named('response.output_text.done', { output_index: 0, item_id: 'm', content_index: 0, text: key })
    + named('response.output_item.added', { output_index: 1, item: { type: 'function_call', id: 'f', arguments: ` { "value" : "${key.slice(0, split)}` } })
    + named('response.function_call_arguments.delta', { output_index: 1, item_id: 'f', delta: `${key.slice(split)}" } ` })
    + named('response.function_call_arguments.done', { output_index: 1, item_id: 'f', arguments: argumentText });
  const data = events(await new Response(bytes(wire, true).pipeThrough(createProtocolUnmaskTransform('openai-response', store))).text());
  assert.equal(data[0].part.text + data[1].delta, privateKey);
  assert.equal(data[3].item.arguments + data[4].delta, data[5].arguments);
  assert.equal(data[5].arguments, argumentText.replace(key, JSON.stringify(privateKey).slice(1, -1)));
});

test('native Responses unmatched prefix flush precedes part stop and preserves monotonically ordered sequence numbers', async () => {
  const { store, key } = masks();
  const text = 'literal ' + key.slice(0, 8);
  const base = { output_index: 0, item_id: 'm', content_index: 0 };
  const wire = named('response.output_text.delta', { ...base, delta: text, sequence_number: 0 })
    + 'id: part-stop\r\n' + named('response.content_part.done', { ...base, part: { type: 'output_text', text }, sequence_number: 1 }).replaceAll('\n', '\r\n')
    + named('response.output_item.done', { output_index: 0, item: { id: 'm', type: 'message', content: [{ type: 'output_text', text }] }, sequence_number: 2 });
  const result = await new Response(bytes(wire, true).pipeThrough(createProtocolUnmaskTransform('openai-response', store))).text();
  const data = events(result);
  assert.deepEqual(data.map((event) => event.sequence_number), [0, 1, 2, 3]);
  assert.deepEqual(data.map((event) => event.type), ['response.output_text.delta', 'response.output_text.delta', 'response.content_part.done', 'response.output_item.done']);
  assert.equal(data[0].delta + data[1].delta, text);
  assert.ok(result.includes('id: part-stop\r\nevent: response.content_part.done\r\n'));
});

test('final text carried on a finish event completes a pending placeholder before closing its channel', async () => {
  const { store, key } = masks();
  const split = 10;
  for (const protocol of ['openai-chat', 'gemini']) {
    const chunk = protocol === 'openai-chat'
      ? (content, end) => frame({ choices: [{ index: 0, delta: { content }, finish_reason: end ? 'stop' : null }] })
      : (text, end) => frame({ candidates: [{ index: 0, content: { parts: [{ text }] }, ...(end ? { finishReason: 'STOP' } : {}) }] });
    const wire = chunk('start ' + key.slice(0, split), false) + chunk(key.slice(split) + ' end', true);
    const data = events(await new Response(bytes(wire, true).pipeThrough(createProtocolUnmaskTransform(protocol, store))).text());
    const actual = data.map((event) => protocol === 'openai-chat' ? event.choices[0].delta.content : event.candidates[0].content.parts[0].text).join('');
    assert.equal(actual, `start ${privateKey} end`);
    assert.equal(data.length, 2);
  }
});

test('EOF after an unterminated comment flushes pending literal text before the comment without manufacturing a terminal', async () => {
  const { store, key } = masks();
  const text = 'literal ' + key.slice(0, 8);
  const wire = named('content_block_delta', { index: 0, delta: { type: 'text_delta', text } }) + ': final comment';
  const result = await new Response(bytes(wire, true).pipeThrough(createProtocolUnmaskTransform('claude', store))).text();
  assert.equal(events(result).map((event) => event.delta.text).join(''), text);
  assert.ok(result.endsWith('\n\n: final comment'));
  assert.ok(!result.includes('message_stop') && !result.includes('content_block_stop'));
});

test('invalid JSON argument grammar is rejected across delta boundaries without exposing source text', async () => {
  const { store } = masks();
  for (const source of ['{"x":}', '{"x":1,}', '[1,]', '{x:1}', '[truefalse]', '[nul]', '[1e+]', '[--1]', '[.5]', '[1.]', '[+1]', '{"x":"\\q"}', '{"x":"\\u00q0"}', '{"x":"raw\nline"}', '{}{}']) {
    const wire = [...source].map((partial_json) => named('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json } })).join('');
    await assert.rejects(new Response(bytes(wire).pipeThrough(createProtocolUnmaskTransform('claude', store))).text(), { code: 'MALFORMED_PROTOCOL_STREAM' });
  }
});

test('live channel and nesting limits bound retained state even when individual SSE events are small', async () => {
  const { store } = masks();
  const channels = Array.from({ length: 4097 }, (_, index) => frame({ choices: [{ index, delta: { content: 'real incremental text' }, finish_reason: null }] })).join('');
  await assert.rejects(new Response(bytes(channels).pipeThrough(createProtocolUnmaskTransform('openai-chat', store))).text(), { code: 'STREAM_LIMIT_EXCEEDED' });
  const partial_json = '['.repeat(101) + '0' + ']'.repeat(101);
  await assert.rejects(new Response(bytes(named('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json } })).pipeThrough(createProtocolUnmaskTransform('claude', store))).text(), { code: 'STREAM_LIMIT_EXCEEDED' });
});

function productionRequest(app, protocol, stream = false) {
  const prompt = `${privateKey}\n${envAssignment}`;
  const path = protocol === 'claude' ? '/v1/messages' : protocol === 'openai-chat' ? '/v1/chat/completions'
    : protocol === 'openai-response' ? '/v1/responses' : `/v1/models/alias:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
  const body = protocol === 'claude' ? { messages: [{ role: 'user', content: prompt }], max_tokens: 100, stream }
    : protocol === 'openai-chat' ? { messages: [{ role: 'user', content: prompt }], stream }
      : protocol === 'openai-response' ? { input: prompt, store: false, stream }
        : { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
  return app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

function productionGateway(protocol, fetchImpl) {
  return createRoutingGatewayApp({ registry: {
    models: { fixture_model: { provider: 'fixture', source: 'custom', protocols: [protocol] } },
    providers: { fixture: { baseUrl: 'https://upstream.invalid', endpointStyle: 'standard', protocols: [protocol], authMode: 'none' } },
  }, env: {}, masking: true, fetchImpl });
}

for (const upstream of protocols) for (const client of protocols) for (const stream of [false, true]) {
  test(`production masking ${client} -> ${upstream}: ${stream ? 'SSE' : 'JSON'} restores using client wire escaping`, async () => {
    const { key, env } = masks();
    let calls = 0;
    const { app, decisions } = productionGateway(upstream, async (_url, init) => {
      calls++;
      const outgoing = new TextDecoder().decode(init.body);
      assert.ok(outgoing.includes(key) && outgoing.includes(env));
      assert.ok(!outgoing.includes('BEGIN PRIVATE KEY') && !outgoing.includes('FIXTURE_TOKEN='));
      return stream ? new Response(bytes(streamFixture(upstream, key, env)), { headers: { 'content-type': 'text/event-stream' } })
        : Response.json(bodyFixture(upstream, key, env));
    });
    const response = await productionRequest(app, client, stream);
    assert.equal(response.status, 200);
    const actual = stream ? streamValues(events(await response.text()), client) : bodyValues(await response.json(), client);
    assert.equal(actual.text, stream ? `prefix \u4e16\u754c ${privateKey} ${envAssignment} suffix`
      : `Literal {"value":"${privateKey}"}\n${privateKey} ${envAssignment}`);
    const expected = restoredArgs();
    expected.literal = `{"value":"${privateKey}"}`;
    assert.deepEqual(actual.args, expected);
    assert.equal(calls, 1);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].status, 200);
  });
}

test('native JSON unmask failures are not swallowed as opaque success', async () => {
  const { key } = masks();
  const { app, decisions } = productionGateway('openai-chat', async () => Response.json({ choices: [{
    message: { role: 'assistant', tool_calls: [{ type: 'function', function: { name: 'fixture', arguments: `{"v":"${key}` } }] },
    finish_reason: 'tool_calls',
  }] }));
  const response = await productionRequest(app, 'openai-chat');
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'INVALID_UPSTREAM_RESPONSE');
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].status, 502);
});

test('native SSE unmask errors record a single 502 before pipeline cancellation rather than client 499', async () => {
  let cancelled = false;
  const { app, decisions } = productionGateway('openai-chat', async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode('data: {invalid-json}\n\n')); },
    cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'text/event-stream' } }));
  const response = await productionRequest(app, 'openai-chat', true);
  assert.equal(response.status, 200, 'headers precede the midstream failure');
  await assert.rejects(response.text(), { code: 'MALFORMED_PROTOCOL_STREAM' });
  await Promise.resolve();
  assert.equal(cancelled, true);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].status, 502);
  assert.equal(decisions[0].error, 'MALFORMED_PROTOCOL_STREAM');
});

const argumentProtocols = ['openai-chat', 'claude', 'openai-response'];
const truncatedTails = ['ordinary', 'placeholder', 'backslash', 'unicode'];

function truncatedArguments(key, tail) {
  const prefix = `{"x":"${key} unfinished`;
  if (tail === 'ordinary') return prefix;
  return `${prefix} ${key.slice(0, 11)}${tail === 'backslash' ? '\\' : tail === 'unicode' ? '\\u00' : ''}`;
}

function truncatedBody(protocol, arguments_, length = true) {
  const call = { id: 'fc_partial', type: 'function_call', call_id: 'call_partial', name: 'fixture', arguments: arguments_, status: length ? 'incomplete' : 'completed' };
  if (protocol === 'openai-response') return {
    id: 'resp_partial', status: length ? 'incomplete' : 'completed',
    incomplete_details: length ? { reason: 'max_output_tokens' } : null, output: [call],
  };
  return { choices: [{ index: 0, message: { role: 'assistant', tool_calls: [{ id: call.call_id, type: 'function', function: { name: call.name, arguments: arguments_ } }] }, finish_reason: length ? 'length' : 'tool_calls' }] };
}

function truncatedStream(protocol, arguments_, reason = 'length') {
  if (protocol === 'openai-chat') {
    const chunk = (delta, finish_reason = null) => frame({ id: 'partial', model: 'fixture_model', choices: [{ index: 0, delta, finish_reason }] });
    return chunk({ role: 'assistant' })
      + chunk({ tool_calls: [{ index: 0, id: 'call_partial', type: 'function', function: { name: 'fixture', arguments: '' } }] })
      + [...arguments_].map((part) => chunk({ tool_calls: [{ index: 0, function: { arguments: part } }] })).join('')
      + (reason === null ? '' : chunk({}, reason === 'length' ? 'length' : 'tool_calls') + 'data: [DONE]\n\n');
  }
  if (protocol === 'claude') {
    return named('message_start', { message: { id: 'partial', model: 'fixture_model', role: 'assistant', content: [], usage: { input_tokens: 0, output_tokens: 0 } } })
      + named('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'call_partial', name: 'fixture', input: {} } })
      + [...arguments_].map((partial_json) => named('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json } })).join('')
      + named('content_block_stop', { index: 0 })
      + (reason === null ? '' : named('message_delta', { delta: { stop_reason: reason === 'length' ? 'max_tokens' : 'tool_use' }, usage: { output_tokens: 0 } }) + named('message_stop'));
  }
  const item = truncatedBody('openai-response', arguments_, reason === 'length').output[0];
  const base = { output_index: 0, item_id: item.id };
  return named('response.created', { response: { id: 'partial', model: 'fixture_model', status: 'in_progress', output: [] } })
    + named('response.output_item.added', { output_index: 0, item: { ...item, arguments: '', status: 'in_progress' } })
    + [...arguments_].map((delta) => named('response.function_call_arguments.delta', { ...base, delta })).join('')
    + named('response.function_call_arguments.done', { ...base, arguments: arguments_ })
    + named('response.output_item.done', { output_index: 0, item })
    + (reason === null ? '' : named(reason === 'length' ? 'response.incomplete' : 'response.completed', { response: { ...truncatedBody('openai-response', arguments_, reason === 'length'), usage: { input_tokens: 0, output_tokens: 0 } } }));
}

function argumentText(data, protocol) {
  return data.map((event) => {
    if (event === '[DONE]') return '';
    if (protocol === 'openai-chat') return event.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments || '';
    if (protocol === 'claude') return event.delta?.partial_json || '';
    return event.type === 'response.function_call_arguments.delta' ? event.delta : '';
  }).join('');
}

for (const tail of truncatedTails) for (const protocol of argumentProtocols) {
  test(`length truncation helper ${protocol}/${tail}: native and converted args preserve raw prefix/escape carry`, async () => {
    const { store, key } = masks();
    const args = truncatedArguments(key, tail);
    const expected = args.replace(key, JSON.stringify(privateKey).slice(1, -1));
    for (const from of new Set(['openai-chat', protocol])) {
      const input = bytes(truncatedStream(from, args), true);
      const source = from === protocol ? input : translateProtocolStream(input, from, protocol);
      const wire = await new Response(source.pipeThrough(createProtocolUnmaskTransform(protocol, store))).text();
      const data = events(wire);
      assert.equal(argumentText(data, protocol), expected);
      assert.throws(() => JSON.parse(expected), SyntaxError, 'no invented JSON closers');
      if (protocol === 'openai-chat') assert.ok(data.some((event) => event.choices?.[0]?.finish_reason === 'length'));
      if (protocol === 'claude') assert.ok(data.some((event) => event.delta?.stop_reason === 'max_tokens'));
      if (protocol === 'openai-response') {
        assert.equal(data.at(-1).type, 'response.incomplete');
        assert.equal(data.at(-1).response.incomplete_details.reason, 'max_output_tokens');
        assert.equal(data.at(-1).response.output[0].arguments, expected);
        assert.equal(data.find((event) => event.type === 'response.function_call_arguments.done').arguments, expected);
      }
    }
  });
}

for (const protocol of ['openai-chat', 'openai-response']) {
  test(`length truncation JSON helper ${protocol}: only token-limit envelopes permit incomplete arguments`, () => {
    const { store, key } = masks();
    for (const tail of truncatedTails) {
      const args = truncatedArguments(key, tail);
      const result = unmaskProtocolResponse(truncatedBody(protocol, args), protocol, store);
      const actual = protocol === 'openai-chat' ? result.choices[0].message.tool_calls[0].function.arguments : result.output[0].arguments;
      assert.equal(actual, args.replace(key, JSON.stringify(privateKey).slice(1, -1)));
      assert.throws(() => unmaskProtocolResponse(truncatedBody(protocol, args, false), protocol, store), { code: 'MALFORMED_PROTOCOL_STREAM' });
    }
    if (protocol === 'openai-response') {
      const body = truncatedBody(protocol, truncatedArguments(key, 'ordinary'));
      body.incomplete_details.reason = 'content_filter';
      assert.throws(() => unmaskProtocolResponse(body, protocol, store), { code: 'MALFORMED_PROTOCOL_STREAM' });
    }
    assert.throws(() => unmaskProtocolResponse(truncatedBody(protocol, '{"x":01'), protocol, store), { code: 'MALFORMED_PROTOCOL_STREAM' });
  });
}

for (const protocol of argumentProtocols) {
  test(`length truncation negatives ${protocol}: impossible syntax, ordinary tool finish and unexplained EOF remain errors`, async () => {
    const { store, key } = masks();
    for (const [args, reason] of [[truncatedArguments(key, 'unicode'), 'tool'], [truncatedArguments(key, 'backslash'), null], ['{"x":01', 'length'], ['{"x":1e+}', 'length']]) {
      await assert.rejects(new Response(bytes(truncatedStream(protocol, args, reason)).pipeThrough(createProtocolUnmaskTransform(protocol, store))).text(), (error) => {
        assert.equal(error.code, 'MALFORMED_PROTOCOL_STREAM');
        assert.ok(!error.message.includes(key) && !error.message.includes(privateKey));
        return true;
      });
    }
  });
}

for (const upstream of argumentProtocols) for (const client of argumentProtocols) {
  test(`production length truncation SSE ${client} -> ${upstream}: incomplete args retain raw carry and one success decision`, async () => {
    const { key } = masks();
    for (const tail of truncatedTails) {
      const args = truncatedArguments(key, tail);
      let calls = 0;
      const { app, decisions } = productionGateway(upstream, async (_url, init) => {
        calls++;
        const outgoing = new TextDecoder().decode(init.body);
        assert.ok(outgoing.includes(key) && !outgoing.includes('BEGIN PRIVATE KEY'));
        return new Response(bytes(truncatedStream(upstream, args)), { headers: { 'content-type': 'text/event-stream' } });
      });
      const response = await productionRequest(app, client, true);
      assert.equal(response.status, 200);
      const data = events(await response.text());
      assert.equal(argumentText(data, client), args.replace(key, JSON.stringify(privateKey).slice(1, -1)));
      assert.equal(calls, 1);
      assert.equal(decisions.length, 1);
      assert.equal(decisions[0].status, 200);
    }
  });
}

for (const protocol of ['openai-chat', 'openai-response']) {
  test(`production length truncation JSON ${protocol}: masked native incomplete args remain a token-limit response`, async () => {
    const { key } = masks();
    for (const tail of truncatedTails) {
      const args = truncatedArguments(key, tail);
      const { app, decisions } = productionGateway(protocol, async () => Response.json(truncatedBody(protocol, args)));
      const response = await productionRequest(app, protocol);
      assert.equal(response.status, 200);
      const body = await response.json();
      const actual = protocol === 'openai-chat' ? body.choices[0].message.tool_calls[0].function.arguments : body.output[0].arguments;
      assert.equal(actual, args.replace(key, JSON.stringify(privateKey).slice(1, -1)));
      assert.equal(decisions.length, 1);
      assert.equal(decisions[0].status, 200);
    }
  });
}

for (const [upstream, client] of [['openai-chat', 'openai-response'], ['openai-response', 'openai-chat']]) {
  test(`production length JSON ${client} -> ${upstream}: complete tool JSON survives cross-protocol token-limit translation`, async () => {
    const { key, env } = masks();
    const body = bodyFixture(upstream, key, env);
    if (upstream === 'openai-chat') body.choices[0].finish_reason = 'length';
    else { body.status = 'incomplete'; body.incomplete_details = { reason: 'max_output_tokens' }; }
    const { app, decisions } = productionGateway(upstream, async () => Response.json(body));
    const response = await productionRequest(app, client);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(client === 'openai-chat' ? result.choices[0].finish_reason : result.incomplete_details.reason, client === 'openai-chat' ? 'length' : 'max_output_tokens');
    assert.equal(bodyValues(result, client).args.credential, privateKey);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].status, 200);
  });
}

for (const upstream of argumentProtocols) {
  test(`production length truncation SSE ${upstream} to Gemini cannot invent a complete args object or a successful terminal`, async () => {
    const { key } = masks();
    for (const tail of truncatedTails) {
      const { app, decisions } = productionGateway(upstream, async () => new Response(bytes(truncatedStream(upstream, truncatedArguments(key, tail))), { headers: { 'content-type': 'text/event-stream' } }));
      const response = await productionRequest(app, 'gemini', true);
      const data = events(await response.text());
      assert.ok(data.some((event) => event.error));
      assert.ok(!data.some((event) => event.candidates?.some((candidate) => candidate.finishReason || candidate.content?.parts?.some((part) => part.functionCall))));
      assert.equal(decisions.length, 1);
      assert.equal(decisions[0].status, 502);
    }
  });
}

test('length truncation Responses strict terminal snapshots cannot borrow a contradictory max-output-tokens status', async () => {
  const { store, key } = masks();
  const args = truncatedArguments(key, 'unicode');
  for (const type of ['response.completed', 'response.incomplete']) {
    const response = truncatedBody('openai-response', args);
    if (type === 'response.incomplete') response.incomplete_details.reason = 'content_filter';
    await assert.rejects(new Response(bytes(named(type, { response })).pipeThrough(createProtocolUnmaskTransform('openai-response', store))).text(), { code: 'MALFORMED_PROTOCOL_STREAM' });
  }
});

test('length truncation full JSON permission is scoped to each Chat choice, not the entire response', () => {
  const { store, key } = masks();
  const length = truncatedBody('openai-chat', truncatedArguments(key, 'ordinary'));
  const ordinary = truncatedBody('openai-chat', truncatedArguments(key, 'unicode'), false);
  length.choices.push({ ...ordinary.choices[0], index: 1 });
  assert.throws(() => unmaskProtocolResponse(length, 'openai-chat', store), { code: 'MALFORMED_PROTOCOL_STREAM' });
});

test('unterminated Responses final frame inserts earlier-channel carry before its current sequence number', async () => {
  const { store, key } = masks();
  const base = { content_index: 0 };
  for (const terminator of ['', '\n', '\r\n']) {
    const first = named('response.output_text.delta', { ...base, output_index: 0, item_id: 'a', sequence_number: 0, delta: key.slice(0, 11) });
    const last = named('response.output_text.delta', { ...base, output_index: 1, item_id: 'b', sequence_number: 1, delta: 'ordinary text' }).slice(0, -2) + terminator;
    const result = await new Response(bytes(first + last, true).pipeThrough(createProtocolUnmaskTransform('openai-response', store))).text();
    const data = events(result);
    assert.deepEqual(data.map((event) => event.sequence_number), [0, 1, 2]);
    assert.deepEqual(data.map((event) => [event.output_index, event.delta]), [[0, ''], [0, key.slice(0, 11)], [1, 'ordinary text']]);
    assert.ok(!result.includes('response.completed') && !result.includes('response.incomplete'));
    assert.ok(result.endsWith(terminator || '}'));
    if (!terminator) assert.ok(!result.endsWith('\n'));
  }
});

test('unterminated Responses final frame numbers multiple earlier carries before itself while standalone EOF appends next sequence', async () => {
  const { store, key } = masks();
  const chunk = (index, sequence_number, delta) => named('response.output_text.delta', { output_index: index, content_index: 0, item_id: `item_${index}`, sequence_number, delta });
  const prefix = key.slice(0, 11);
  const first = chunk(0, 0, prefix) + chunk(1, 1, prefix);
  const unterminated = first + chunk(2, 2, 'real text').slice(0, -2);
  const finalData = events(await new Response(bytes(unterminated, true).pipeThrough(createProtocolUnmaskTransform('openai-response', store))).text());
  assert.deepEqual(finalData.map((event) => event.sequence_number), [0, 1, 2, 3, 4]);
  assert.deepEqual(finalData.map((event) => event.output_index), [0, 1, 0, 1, 2]);
  const standaloneData = events(await new Response(bytes(first, true).pipeThrough(createProtocolUnmaskTransform('openai-response', store))).text());
  assert.deepEqual(standaloneData.map((event) => event.sequence_number), [0, 1, 2, 3]);
  assert.deepEqual(standaloneData.map((event) => event.delta), ['', '', prefix, prefix]);
});

function partialFailureStream(protocol, args, deferred = false) {
  const source = truncatedStream(protocol, args, null);
  if (deferred || protocol === 'openai-chat') return source;
  const data = events(source);
  return data.filter((event) => !['content_block_stop', 'response.function_call_arguments.done', 'response.output_item.done'].includes(event.type))
    .map((event) => frame(event, event.type || '')).join('');
}

function explicitFailureFrame(protocol, args, form = 'native') {
  const error = { code: 'fixture_failure', message: 'synthetic upstream failure' };
  if (protocol === 'openai-chat') return frame({ error });
  if (form === 'event-only') return frame({ error }, 'error');
  if (protocol === 'claude' || form === 'error') return named('error', { error });
  const response = { ...truncatedBody('openai-response', args), status: 'failed', incomplete_details: null, error };
  response.output[0].status = 'incomplete';
  return named('response.failed', { response });
}

function assertNoSuccessfulTerminal(data) {
  assert.ok(!data.includes('[DONE]'));
  assert.ok(!data.some((event) => event.type === 'response.completed' || event.type === 'response.incomplete'
    || event.type === 'message_stop' || event.delta?.stop_reason || event.choices?.some((choice) => choice.finish_reason != null)));
}

for (const protocol of argumentProtocols) for (const tail of truncatedTails) {
  test(`announced failure ${protocol}/${tail}: preserves partial argument bytes and upstream failure without local parser errors`, async () => {
    const { store, key } = masks();
    const args = truncatedArguments(key, tail);
    const expected = args.replace(key, JSON.stringify(privateKey).slice(1, -1));
    for (const deferred of [false, true]) for (const terminated of [false, true]) {
      const errors = [];
      const failure = explicitFailureFrame(protocol, args);
      const wire = partialFailureStream(protocol, args, deferred) + (terminated ? failure : failure.slice(0, -2));
      const result = await new Response(bytes(wire, true).pipeThrough(createProtocolUnmaskTransform(protocol, store, { onError(error) { errors.push(error); } }))).text();
      const data = events(result);
      assert.equal(argumentText(data, protocol), expected);
      assert.deepEqual(errors, [], 'announced upstream failure is not a new local parser failure');
      assertNoSuccessfulTerminal(data);
      if (protocol === 'openai-response') {
        assert.equal(data.at(-1).type, 'response.failed');
        assert.equal(data.at(-1).response.status, 'failed');
        assert.equal(data.at(-1).response.error.code, 'fixture_failure');
        assert.equal(data.at(-1).response.output[0].arguments, expected);
      } else assert.equal(data.at(-1).error.code, 'fixture_failure');
      if (!terminated) assert.ok(!result.endsWith('\n'), 'preserve unterminated final failure framing');
    }
  });
}

test('announced failure error event boundaries preserve pending args for Claude and Responses without requiring failed snapshots', async () => {
  const { store, key } = masks();
  const args = truncatedArguments(key, 'unicode');
  for (const protocol of ['claude', 'openai-response']) for (const form of ['event-only', 'error']) {
    const errors = [];
    const source = partialFailureStream(protocol, args, true) + explicitFailureFrame(protocol, args, form);
    const data = events(await new Response(bytes(source, true).pipeThrough(createProtocolUnmaskTransform(protocol, store, { onError(error) { errors.push(error); } }))).text());
    assert.equal(argumentText(data, protocol), args.replace(key, JSON.stringify(privateKey).slice(1, -1)));
    assert.equal(data.at(-1).error.code, 'fixture_failure');
    assert.deepEqual(errors, []);
    assertNoSuccessfulTerminal(data);
  }
});

test('announced Responses failure snapshot without prior channels may contain incomplete but not impossible argument JSON', async () => {
  const { store, key } = masks();
  for (const tail of truncatedTails) {
    const args = truncatedArguments(key, tail);
    const observed = [];
    const result = events(await new Response(bytes(explicitFailureFrame('openai-response', args), true).pipeThrough(createProtocolUnmaskTransform('openai-response', store, { onError(error) { observed.push(error); } }))).text());
    assert.equal(result[0].response.output[0].arguments, args.replace(key, JSON.stringify(privateKey).slice(1, -1)));
    assert.deepEqual(observed, []);
    assertNoSuccessfulTerminal(result);
  }
  const observed = [];
  const malformed = '{"x":01';
  await assert.rejects(new Response(bytes(explicitFailureFrame('openai-response', malformed)).pipeThrough(createProtocolUnmaskTransform('openai-response', store, { onError(error) { observed.push(error); } }))).text(), (error) => {
    assert.equal(error.code, 'MALFORMED_PROTOCOL_STREAM');
    assert.ok(!error.message.includes(malformed) && !error.message.includes(privateKey));
    return true;
  });
  assert.equal(observed.length, 1);
});

test('announced failures do not grant later incomplete deltas permission to end silently', async () => {
  const { store, key } = masks();
  const args = truncatedArguments(key, 'backslash');
  for (const protocol of argumentProtocols) {
    const source = explicitFailureFrame(protocol, '{}') + partialFailureStream(protocol, args, false);
    await assert.rejects(new Response(bytes(source).pipeThrough(createProtocolUnmaskTransform(protocol, store))).text(), { code: 'MALFORMED_PROTOCOL_STREAM' });
  }
});
