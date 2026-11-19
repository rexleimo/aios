import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveGatewayRoute } from '../../../../lib/tooling/model-router/gateway/router.mjs';
import { createRoutingGatewayApp } from '../../../../lib/tooling/model-router/gateway/compatibility/proxy.mjs';

const registry = {
  activeModel: 'claude-opus-5',
  models: {
    'claude-opus-5': { protocols: ['claude'], cost: 'highest' },
    'qwen3.8-flash': { protocols: ['openai-chat'], cost: 'lowest' },
  },
  providers: {
    myclaude: { baseUrl: 'https://claude.example.com', authMode: 'none', protocols: ['claude'], models: ['claude-opus-5'] },
    myopenai: { baseUrl: 'https://api.example.com', apiKeyEnv: 'env:MY_KEY', protocols: ['openai-chat'], models: ['qwen3.8-flash'] },
  },
  roleDefaults: { implementer: { taskType: 'implementation' }, planner: { taskType: 'planning' } },
  routingRules: [
    { taskType: 'implementation', primary: 'qwen3.8-flash', fallback: [] },
    { taskType: 'planning', primary: 'claude-opus-5', fallback: [] },
    { taskType: 'general', primary: 'claude-opus-5', fallback: [] },
  ],
  clientRoleMatrix: { default: { implementer: 'qwen3.8-flash', planner: 'claude-opus-5' }, clients: {} },
};

const claudeBody = { model: 'claude-sonnet-5', max_tokens: 100, messages: [{ role: 'user', content: 'hello' }] };

test('router resolves model via matrix, picks provider endpoint, detects translation need', () => {
  const cross = resolveGatewayRoute({ clientId: 'claude', role: 'implementer', registry, env: {}, clientProtocol: 'claude' });
  assert.equal(cross.modelId, 'qwen3.8-flash');
  assert.equal(cross.providerId, 'myopenai');
  assert.equal(cross.upstreamModel, 'qwen3.8-flash');
  assert.equal(cross.targetProtocol, 'openai-chat');
  assert.equal(cross.needsTranslation, true);
  assert.equal(cross.endpoint, 'https://api.example.com/openai/v1/chat/completions');
  const same = resolveGatewayRoute({ clientId: 'claude', role: 'planner', registry, env: {}, clientProtocol: 'claude' });
  assert.equal(same.modelId, 'claude-opus-5');
  assert.equal(same.needsTranslation, false);
});

test('routing gateway translates claude→openai request and back, uses provider key, keeps secret out of decision', async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, headers: init.headers, body: JSON.parse(new TextDecoder().decode(init.body)) };
    return new Response(JSON.stringify({
      id: '1', model: 'qwen3.8-flash',
      choices: [{ message: { role: 'assistant', content: 'hi there' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const { app, decisions } = createRoutingGatewayApp({ registry, clientId: 'claude', role: 'implementer', env: { MY_KEY: 'secret-value' }, clientProtocol: 'claude', fetchImpl });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(claudeBody) });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.role, 'assistant', 'response translated back to claude format');
  assert.equal(json.content[0].text, 'hi there');
  assert.equal(captured.body.messages[0].role, 'user', 'outgoing request is openai-chat format');
  assert.equal(captured.body.model, 'qwen3.8-flash', 'upstream must receive the ROUTED model, not the client original claude-sonnet-5');
  assert.ok(captured.url.endsWith('/openai/v1/chat/completions'));
  assert.equal(captured.headers.authorization, 'Bearer secret-value');
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].modelId, 'qwen3.8-flash');
  assert.ok(!JSON.stringify(decisions[0]).includes('secret-value'), 'decision record must not contain the key');
});

test('same-protocol route streams through without translation', async () => {
  const fetchImpl = async () => new Response('data: chunk\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const { app, decisions } = createRoutingGatewayApp({ registry, clientId: 'claude', role: 'planner', env: {}, clientProtocol: 'claude', fetchImpl });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...claudeBody, stream: true }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  assert.equal(await res.text(), 'data: chunk\n\n');
  assert.equal(decisions[0].needsTranslation, false);
});

test('per-request timeout returns 504 instead of hanging', async () => {
  const fetchImpl = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const { app, decisions } = createRoutingGatewayApp({ registry, clientId: 'claude', role: 'implementer', env: { MY_KEY: 'k' }, clientProtocol: 'claude', requestTimeoutMs: 20, fetchImpl });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(claudeBody) });
  assert.equal(res.status, 504);
  assert.equal((await res.json()).error.code, 'GATEWAY_TIMEOUT');
  assert.equal(decisions[0].status, 504);
});

test('routing gateway rejects browser cross-origin requests', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return new Response('{}', { status: 200 }); };
  const { app } = createRoutingGatewayApp({ registry, clientId: 'claude', role: 'implementer', env: {}, fetchImpl });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify(claudeBody) });
  assert.equal(res.status, 403);
  assert.equal(calls, 0);
});

test('routing gateway serves connectable own-mode clients (gemini) once they point at the gateway', async () => {
  let calls = 0;
  const { app } = createRoutingGatewayApp({
    registry, clientId: 'gemini', env: { MY_KEY: 'fixture-key' },
    fetchImpl: async () => { calls += 1; return new Response('{"content":[{"type":"text","text":"ok"}]}', { status: 200, headers: { 'content-type': 'application/json' } }); },
  });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(claudeBody) });
  assert.equal(res.status, 200);
  assert.ok(calls > 0, 'the gateway routes the connected gemini client to an upstream');
});

for (const clientId of ['unknown-client']) {
  test(`routing gateway rejects ${clientId} before classifier or upstream access`, async () => {
    let calls = 0;
    const { app, decisions } = createRoutingGatewayApp({
      registry, clientId, env: { MY_KEY: 'fixture-key' },
      classifyIntent: async () => { calls += 1; return null; },
      fetchImpl: async () => { calls += 1; return new Response('{}'); },
    });
    const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(claudeBody) });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error.code, 'NO_ROUTE_CONFIGURED');
    assert.equal(calls, 0);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].status, 503);
  });
}

test('same-protocol route rewrites the upstream model to the routed model, not the client original', async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, body: JSON.parse(new TextDecoder().decode(init.body)) };
    return new Response(JSON.stringify({ id: '1', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const { app, decisions } = createRoutingGatewayApp({ registry, clientId: 'claude', role: 'planner', env: {}, clientProtocol: 'claude', fetchImpl });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(claudeBody) });
  assert.equal(res.status, 200);
  await res.json();
  assert.equal(decisions[0].modelId, 'claude-opus-5');
  assert.equal(decisions[0].needsTranslation, false);
  assert.ok(captured.url.endsWith('/claude/v1/messages'));
  assert.equal(captured.body.model, 'claude-opus-5', 'same-protocol upstream must receive the routed model, not the client original claude-sonnet-5');
});

// Responses intake preserves same-protocol requests and translates cross-protocol routes.
const responsesRegistry = {
  activeModel: 'claude-sonnet',
  models: {
    'gpt-6-astra': { source: 'custom', provider: 'myrelay', protocols: ['openai-response'], cost: 'highest' },
    'claude-sonnet': { source: 'discovered', provider: 'myrelay', protocols: ['claude'], cost: 'medium' },
  },
  providers: {
    myrelay: { baseUrl: 'https://api.example.com', apiKeyEnv: 'env:MY_KEY', protocols: ['openai-response', 'claude', 'openai-chat'], models: [] },
  },
  clientDefaults: { codex: 'gpt-6-astra' },
  roleDefaults: {},
  routingRules: [],
  clientRoleMatrix: { default: {}, clients: {} },
};

const responsesBody = { model: 'gpt-5.5', input: [{ role: 'user', content: 'hi' }], stream: false };

test('openai-response incoming routes no-role codex to its client default, same-protocol passthrough + model rewrite', async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, body: JSON.parse(new TextDecoder().decode(init.body)) };
    return new Response(JSON.stringify({ id: 'resp_1', object: 'response', model: 'gpt-6-astra', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] }], status: 'completed', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const { app, decisions } = createRoutingGatewayApp({ registry: responsesRegistry, clientId: 'codex', env: { MY_KEY: 'k' }, fetchImpl });
  const res = await app.request('/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(responsesBody) });
  assert.equal(res.status, 200);
  await res.json();
  assert.equal(decisions[0].modelId, 'gpt-6-astra', 'no-role codex uses explicit clientDefaults.codex, not the claude activeModel');
  assert.equal(decisions[0].clientProtocol, 'openai-response');
  assert.equal(decisions[0].targetProtocol, 'openai-response');
  assert.equal(decisions[0].needsTranslation, false);
  assert.ok(captured.url.endsWith('/openai/v1/responses'));
  assert.equal(captured.body.model, 'gpt-6-astra', 'upstream receives the routed model, not the client original gpt-5.5');
  assert.deepEqual(captured.body.input, responsesBody.input, 'same-protocol request body is preserved');
});

test('openai-response incoming translates a Claude upstream back into a Responses envelope', async () => {
  const registry = { ...responsesRegistry, clientDefaults: { codex: 'claude-sonnet' } };
  let captured;
  const fetchImpl = async (_url, init) => {
    captured = JSON.parse(new TextDecoder().decode(init.body));
    return Response.json({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet', content: [{ type: 'text', text: 'hello' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 2 } });
  };
  const { app, decisions } = createRoutingGatewayApp({ registry, clientId: 'codex', env: { MY_KEY: 'k' }, fetchImpl });
  const res = await app.request('/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(responsesBody) });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.object, 'response');
  assert.equal(json.status, 'completed');
  assert.equal(json.output[0].content[0].text, 'hello');
  assert.deepEqual(captured.messages, [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]);
  assert.equal(captured.input, undefined);
  assert.equal(captured.model, 'claude-sonnet');
  assert.equal(decisions[0].status, 200);
});

test('claude incoming translates a Responses upstream back into a Claude envelope', async () => {
  const registry = { ...responsesRegistry, activeModel: 'gpt-6-astra', clientDefaults: {} };
  let captured;
  const fetchImpl = async (_url, init) => {
    captured = JSON.parse(new TextDecoder().decode(init.body));
    return Response.json({ id: 'resp_1', object: 'response', model: 'gpt-6-astra', status: 'completed', output: [{ id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hello', annotations: [] }] }], usage: { input_tokens: 1, output_tokens: 2 } });
  };
  const { app } = createRoutingGatewayApp({ registry, clientId: 'claude', clientProtocol: 'claude', env: { MY_KEY: 'k' }, fetchImpl });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(claudeBody) });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.type, 'message');
  assert.equal(json.content[0].text, 'hello');
  assert.equal(json.stop_reason, 'end_turn');
  assert.equal(captured.input[0].role, 'user');
  assert.equal(captured.messages, undefined);
  assert.equal(captured.model, 'gpt-6-astra');
});

// 真实数据验收暴露的 bug：上游 503/402 时跨协议翻译把错误吞成「空 claude 成功信封」。
// 上游非 2xx 必须把真实错误原因透传给客户端（claude 错误信封），保留上游状态码。
test('upstream error (503) propagates as a claude error envelope with the real message, not an empty success', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: { message: 'Service temporarily unavailable', type: 'server_error', code: 'internal_error' } }), { status: 503, headers: { 'content-type': 'application/json' } });
  const { app, decisions } = createRoutingGatewayApp({ registry, clientId: 'claude', role: 'implementer', env: { MY_KEY: 'k' }, clientProtocol: 'claude', fetchImpl });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(claudeBody) });
  assert.equal(res.status, 503, 'upstream status is preserved');
  const json = await res.json();
  assert.equal(json.type, 'error', 'claude client receives an error envelope, not a success-shaped message');
  assert.match(json.error.message, /Service temporarily unavailable/, 'the real upstream cause is not swallowed');
  assert.equal(decisions[0].status, 503);
});

test('same-protocol upstream error (402 quota) passes the raw error body through', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: { type: 'insufficient_quota', message: 'weekly coding quota exhausted' } }), { status: 402, headers: { 'content-type': 'application/json' } });
  const { app, decisions } = createRoutingGatewayApp({ registry, clientId: 'claude', role: 'planner', env: {}, clientProtocol: 'claude', fetchImpl });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(claudeBody) });
  assert.equal(res.status, 402);
  const json = await res.json();
  assert.match(json.error.message, /quota exhausted/, 'raw upstream error preserved on same-protocol path');
  assert.equal(decisions[0].status, 402);
});
