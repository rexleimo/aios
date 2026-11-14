import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveGatewayRoute } from '../../../../lib/tooling/model-router/gateway/router.mjs';
import { createRoutingGatewayApp } from '../../../../lib/tooling/model-router/gateway/proxy.mjs';

const registry = {
  activeModel: 'claude-opus-5',
  models: {
    'claude-opus-5': { protocols: ['claude'], cost: 'highest' },
    'qwen3.8-flash': { protocols: ['openai-chat'], cost: 'lowest' },
  },
  providers: {
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
  assert.ok(captured.url.endsWith('/openai/v1/chat/completions'));
  assert.equal(captured.headers.authorization, 'Bearer secret-value');
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].modelId, 'qwen3.8-flash');
  assert.ok(!JSON.stringify(decisions[0]).includes('secret-value'), 'decision record must not contain the key');
});

test('same-protocol route streams through without translation', async () => {
  const fetchImpl = async () => new Response('data: chunk\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const { app, decisions } = createRoutingGatewayApp({ registry, clientId: 'claude', role: 'planner', env: {}, clientProtocol: 'claude', fetchImpl });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(claudeBody) });
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
  const fetchImpl = async () => new Response('{}', { status: 200 });
  const { app } = createRoutingGatewayApp({ registry, clientId: 'claude', role: 'implementer', env: {}, fetchImpl });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify(claudeBody) });
  assert.equal(res.status, 403);
});