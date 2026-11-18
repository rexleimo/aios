import test from 'node:test';
import assert from 'node:assert/strict';

import { createRoutingGatewayApp } from '../../../../lib/tooling/model-router/gateway/compatibility/proxy.mjs';

// 一个 magpie 式 openai-chat 上游；4 种客户端协议进来都应被翻译成同一个上游请求。
const registry = () => ({
  targetRefVersion: 1,
  activeModel: 'model:antigravity-gemini-3.8-flash',
  models: {
    'antigravity-gemini-3.8-flash': { source: 'custom', provider: 'magpie', upstreamModel: 'antigravity/gemini-3.8-flash', protocols: ['openai-chat'] },
    'opencode-go-hy4-flash-free': { source: 'custom', provider: 'magpie', upstreamModel: 'opencode-go/hy4-flash-free', protocols: ['openai-chat'] },
  },
  providers: {
    magpie: {
      baseUrl: 'http://127.0.0.1:3425/v1', endpointStyle: 'standard', protocols: ['openai-chat'],
      protocolBaseUrls: { 'openai-chat': 'http://127.0.0.1:3425/v1' }, authMode: 'required', apiKey: 'DUMMY', models: [],
    },
  },
});

// mock 上游：openai-chat 响应，记录收到的请求
function upstream(captured, reply = 'pong') {
  return async (url, init) => {
    const body = JSON.parse(typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body));
    captured.push({ url, body, headers: init.headers });
    return Response.json({
      id: 'x', object: 'chat.completion', created: 0, model: body.model,
      choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  };
}

const pinnedModel = 'aios/model/antigravity-gemini-3.8-flash';

function makeApp(captured) {
  return createRoutingGatewayApp({ registry: registry(), env: {}, masking: false, fetchImpl: upstream(captured) });
}

test('openai-chat intake passes through to the openai-chat upstream', async () => {
  const captured = [];
  const { app, decisions } = makeApp(captured);
  const res = await app.request('/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: pinnedModel, messages: [{ role: 'user', content: 'hi' }], stream: false }) });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.choices[0].message.content, 'pong');
  assert.equal(captured[0].body.model, 'antigravity/gemini-3.8-flash');
  assert.match(captured[0].url, /chat\/completions$/u);
  assert.equal(decisions[0].targetProtocol, 'openai-chat');
});

test('claude intake translates to the openai-chat upstream', async () => {
  const captured = [];
  const { app, decisions } = makeApp(captured);
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: pinnedModel, max_tokens: 16, messages: [{ role: 'user', content: 'hi' }] }) });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.content[0].text, 'pong', 'upstream content is translated back to claude text block');
  assert.equal(captured[0].body.model, 'antigravity/gemini-3.8-flash');
  assert.equal(decisions[0].clientProtocol, 'claude');
  assert.equal(decisions[0].targetProtocol, 'openai-chat');
});

test('openai-response intake translates to the openai-chat upstream', async () => {
  const captured = [];
  const { app, decisions } = makeApp(captured);
  const res = await app.request('/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: pinnedModel, input: 'hi' }) });
  assert.equal(res.status, 200);
  const j = await res.json();
  const out = JSON.stringify(j);
  assert.match(out, /pong/u, 'reply is present in the Responses-shaped output');
  assert.equal(captured[0].body.model, 'antigravity/gemini-3.8-flash');
  assert.equal(decisions[0].clientProtocol, 'openai-response');
  assert.equal(decisions[0].targetProtocol, 'openai-chat');
});

test('gemini intake translates to the openai-chat upstream', async () => {
  const captured = [];
  const { app, decisions } = makeApp(captured);
  const res = await app.request('/v1beta/models/antigravity-gemini-3.8-flash:generateContent', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }) });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.match(JSON.stringify(j), /pong/u);
  assert.equal(captured[0].body.model, 'antigravity/gemini-3.8-flash');
  assert.equal(decisions[0].clientProtocol, 'gemini');
  assert.equal(decisions[0].targetProtocol, 'openai-chat');
});

test('opencode-go model is also reachable through the gateway pin', async () => {
  const captured = [];
  const { app, decisions } = makeApp(captured);
  const res = await app.request('/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'aios/model/opencode-go-hy4-flash-free', messages: [{ role: 'user', content: 'hi' }], stream: false }) });
  assert.equal(res.status, 200);
  assert.equal(captured[0].body.model, 'opencode-go/hy4-flash-free');
  assert.equal(decisions[0].modelId, 'opencode-go-hy4-flash-free');
});
