import test from 'node:test';
import assert from 'node:assert/strict';

import { createRoutingGatewayApp } from '../../../../lib/tooling/model-router/gateway/compatibility/proxy.mjs';
import { classifyTurnIntent, extractLatestUserText } from '../../../../lib/tooling/model-router/routing/intent.mjs';

const registry = {
  activeModel: 'claude-sonnet-5',
  models: {
    'claude-opus-5': { protocols: ['claude'], cost: 'highest' },
    'qwen3.8-flash': { protocols: ['openai-chat'], cost: 'lowest' },
    'claude-sonnet-5': { protocols: ['claude'], cost: 'medium' },
  },
  providers: {
    myrelay: { baseUrl: 'https://api.example.com', apiKeyEnv: 'env:MY_KEY', protocols: ['claude', 'openai-chat'], models: ['claude-opus-5', 'qwen3.8-flash', 'claude-sonnet-5'] },
  },
  clientDefaults: { claude: 'claude-sonnet-5' },
  roleDefaults: { implementer: { taskType: 'implementation' } },
  routingRules: [{ taskType: 'implementation', primary: 'qwen3.8-flash', fallback: [] }],
  clientRoleMatrix: { default: { implementer: 'qwen3.8-flash' }, clients: {} },
  intentRouting: {
    enabled: true,
    classifierModel: 'qwen3.8-flash',
    intents: [
      { id: 'quick', description: 'a quick question', modelId: 'qwen3.8-flash' },
      { id: 'tests', description: 'writing or fixing tests', modelId: 'claude-opus-5' },
    ],
  },
};

const claudeSuccess = () => new Response(JSON.stringify({
  id: '1', type: 'message', role: 'assistant', model: 'claude-opus-5',
  content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
}), { status: 200, headers: { 'content-type': 'application/json' } });

const userBody = (text) => ({ model: 'claude-sonnet-5', max_tokens: 100, messages: [{ role: 'user', content: text }] });

test('auto mode (no role): classifier-reported intent routes the request and is recorded in the decision', async () => {
  let captured;
  const fetchImpl = async (url, init) => { captured = { url, body: JSON.parse(new TextDecoder().decode(init.body)) }; return claudeSuccess(); };
  const classifyIntent = async (userText) => { assert.match(userText, /单元测试/); return { intentId: 'tests', modelId: 'claude-opus-5', description: 'writing or fixing tests' }; };
  const { app, decisions } = createRoutingGatewayApp({ registry, clientId: 'claude', env: { MY_KEY: 'k' }, clientProtocol: 'claude', fetchImpl, classifyIntent });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(userBody('帮我写个单元测试')) });
  assert.equal(res.status, 200);
  await res.json();
  assert.equal(captured.body.model, 'claude-opus-5', 'upstream receives the intent model, not the client original');
  assert.equal(decisions[0].modelId, 'claude-opus-5');
  assert.equal(decisions[0].intent, 'tests');
  assert.equal(decisions[0].classifierModel, 'qwen3.8-flash');
  assert.equal(decisions[0].clientId, 'claude', 'decision carries the client identity for the routing graph');
});

test('explicit role bypasses the classifier entirely (orchestrator stages stay deterministic)', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ id: '1', choices: [{ message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }], usage: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
  const classifyIntent = async () => { throw new Error('classifier must not be called when a role is declared'); };
  const { app, decisions } = createRoutingGatewayApp({ registry, clientId: 'claude', env: { MY_KEY: 'k' }, clientProtocol: 'claude', fetchImpl, classifyIntent });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-gateway-role': 'implementer' }, body: JSON.stringify(userBody('写测试')) });
  assert.equal(res.status, 200);
  await res.json();
  assert.equal(decisions[0].modelId, 'qwen3.8-flash', 'explicit role routes via matrix, not intent');
  assert.equal(decisions[0].intent, undefined);
});

test('classifier returning null retains the explicitly configured client default, without guessing', async () => {
  let captured;
  let classifierCalls = 0;
  const fetchImpl = async (url, init) => { captured = { body: JSON.parse(new TextDecoder().decode(init.body)) }; return claudeSuccess(); };
  const classifyIntent = async () => { classifierCalls += 1; return null; };
  const { app, decisions } = createRoutingGatewayApp({ registry, clientId: 'claude', env: { MY_KEY: 'k' }, clientProtocol: 'claude', fetchImpl, classifyIntent });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(userBody('你好')) });
  assert.equal(res.status, 200);
  await res.json();
  assert.equal(captured.body.model, 'claude-sonnet-5', 'falls back to clientDefaults.claude');
  assert.equal(classifierCalls, 1);
  assert.equal(decisions[0].intent, undefined);
});

test('tool-round continuation reuses the turn intent without re-classifying (session stickiness)', async () => {
  const fetchImpl = async () => claudeSuccess();
  let calls = 0;
  const classifyIntent = async () => { calls += 1; return { intentId: 'tests', modelId: 'claude-opus-5', description: 'tests' }; };
  const { app, decisions } = createRoutingGatewayApp({ registry, clientId: 'claude', env: { MY_KEY: 'k' }, clientProtocol: 'claude', fetchImpl, classifyIntent });
  const headers = { 'content-type': 'application/json', 'x-gateway-session': 'sess-1' };
  // 决策在响应体消费完成时落账（flush），首个响应必须读完，模拟真实客户端行为
  const first = await app.request('/v1/messages', { method: 'POST', headers, body: JSON.stringify(userBody('写测试')) });
  assert.equal(first.status, 200);
  await first.text();
  // 续轮：最后一条是 tool_result（无用户文本）→ 不应再分类
  const continuation = { model: 'claude-sonnet-5', max_tokens: 100, messages: [{ role: 'user', content: '写测试' }, { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'x', input: {} }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'done' }] }] };
  const res = await app.request('/v1/messages', { method: 'POST', headers, body: JSON.stringify(continuation) });
  assert.equal(res.status, 200);
  await res.json();
  assert.equal(calls, 1, 'classifier called once for the turn, not again on the tool round');
  assert.equal(decisions[1].modelId, 'claude-opus-5', 'continuation stays on the turn model');
  assert.equal(decisions[1].intent, 'tests');
});

test('default classifier wiring: real classifyTurnIntent via mock fetch routes by the model-reported label', async () => {
  let captured;
  // 真实 fetch 的 body 允许字符串或字节；分类器发字符串、转发层发字节，mock 两者都接
  const bodyText = (body) => (typeof body === 'string' ? body : new TextDecoder().decode(body));
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(bodyText(init.body));
    if (url.endsWith('/openai/v1/chat/completions') && body.messages?.[0]?.content?.includes('routing classifier')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"intent":"tests"}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    captured = { url, body };
    return claudeSuccess();
  };
  const { app, decisions } = createRoutingGatewayApp({ registry, clientId: 'claude', env: { MY_KEY: 'k' }, clientProtocol: 'claude', fetchImpl });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(userBody('帮我写测试')) });
  assert.equal(res.status, 200);
  await res.json();
  assert.equal(captured.body.model, 'claude-opus-5');
  assert.equal(decisions[0].intent, 'tests');
});

for (const masking of [true, false]) {
  test(`classifier and generation share the request masking boundary (masking=${masking})`, async () => {
    const secret = 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const captured = [];
    const { app } = createRoutingGatewayApp({ registry, env: { MY_KEY: 'k' }, masking,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body));
        captured.push(body);
        if (body.messages[0].content.includes('routing classifier')) {
          return Response.json({ choices: [{ message: { content: '{"intent":"tests"}' } }] });
        }
        return Response.json({ content: [{ type: 'text', text: body.messages[0].content }] });
      },
    });
    const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(userBody(`inspect ${secret}`)) });
    assert.equal(res.status, 200);
    assert.equal(captured.length, 2);
    for (const body of captured) assert.equal(JSON.stringify(body).includes(secret), !masking);
    assert.ok(JSON.stringify(await res.json()).includes(secret), 'the response still restores this request\'s placeholders');
  });
}

for (const client of ['', 'claude']) {
  test(`requests without a session header never borrow another conversation's intent (client=${client || 'absent'})`, async () => {
    const models = [];
    let calls = 0;
    const { app } = createRoutingGatewayApp({ registry, env: { MY_KEY: 'k' },
      classifyIntent: async (text) => {
        calls++;
        return text === 'turn A' ? { intentId: 'tests', modelId: 'claude-opus-5' } : { intentId: 'quick', modelId: 'qwen3.8-flash' };
      },
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(new TextDecoder().decode(init.body));
        models.push(body.model);
        return body.model === 'qwen3.8-flash'
          ? Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] })
          : claudeSuccess();
      },
    });
    const headers = { 'content-type': 'application/json', ...(client ? { 'x-gateway-client': client } : {}) };
    const send = async (body) => {
      const res = await app.request('/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
      assert.equal(res.status, 200);
      await res.text();
    };
    await send(userBody('turn A'));
    await send(userBody('turn B'));
    await send({ ...userBody('turn A'), messages: [
      ...userBody('turn A').messages,
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'x', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'done' }] },
    ] });
    assert.deepEqual(models, ['claude-opus-5', 'qwen3.8-flash', 'claude-opus-5']);
    // 内容派生 session key 让 turn A 的续轮复用本轮意图：turn A 与 turn B 各分类一次，
    // turn A 的工具续轮命中同一内容键 → 不再分类（任务级粘滞）。
    assert.equal(calls, 2, 'turn A and turn B classify once each; turn A tool continuation reuses its cached intent');
  });
}

test('classifyTurnIntent fails closed when the classifier upstream errors', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } }); };
  const result = await classifyTurnIntent({ registry, userText: '写测试', env: { MY_KEY: 'k' }, fetchImpl });
  assert.equal(result, null);
  assert.equal(calls, 1, 'the configured classifier was contacted before its failure was handled');
});

test('extractLatestUserText reads a new user turn and returns empty for tool_result continuations', () => {
  assert.equal(extractLatestUserText(userBody('你好'), 'claude'), '你好');
  const cont = { messages: [{ role: 'user', content: '写测试' }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'done' }] }] };
  assert.equal(extractLatestUserText(cont, 'claude'), '', 'tail is a tool_result → no new user turn → continuation signal');
  assert.equal(extractLatestUserText({ input: [{ role: 'user', content: 'hi' }] }, 'openai-response'), 'hi');
  assert.equal(extractLatestUserText(null, 'claude'), '');
});
