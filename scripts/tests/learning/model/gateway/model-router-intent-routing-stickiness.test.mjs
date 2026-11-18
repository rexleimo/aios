import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { createRoutingGatewayApp } from '../../../../lib/tooling/model-router/gateway/compatibility/proxy.mjs';

const registry = {
  activeModel: 'claude-sonnet-5',
  models: {
    'claude-opus-5': { protocols: ['claude'], cost: 'highest' },
    'qwen3.8-flash': { protocols: ['openai-chat'], cost: 'lowest' },
    'claude-sonnet-5': { protocols: ['claude'], cost: 'medium' },
  },
  providers: {
    myrelay: {
      baseUrl: 'https://api.example.com', apiKeyEnv: 'env:MY_KEY',
      protocols: ['claude', 'openai-chat'], models: ['claude-opus-5', 'qwen3.8-flash', 'claude-sonnet-5'],
    },
  },
  clientDefaults: { claude: 'claude-sonnet-5' },
  intentRouting: {
    enabled: true,
    classifierModel: 'qwen3.8-flash',
    confidenceThreshold: 0.7,
    intents: [
      { id: 'test', modelId: 'claude-opus-5', description: 'Run tests' },
      { id: 'docs', modelId: 'claude-sonnet-5', description: 'Write docs' },
    ],
  },
};

const claudeSuccess = () => new Response(JSON.stringify({
  id: '1', type: 'message', role: 'assistant', model: 'claude-opus-5',
  content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
}), { status: 200, headers: { 'content-type': 'application/json' } });

const userBody = (text) => ({ model: 'aios-auto', max_tokens: 100, messages: [{ role: 'user', content: text }] });

describe('intent routing task-level stickiness', () => {
  it('classifies once per task and reuses the intent on tool continuations without a session header', async () => {
    let classifyCallCount = 0;
    const mockClassify = async (userText) => {
      classifyCallCount += 1;
      if (userText.includes('run tests')) return { intentId: 'test', modelId: 'claude-opus-5', confidence: 0.95 };
      if (userText.includes('write docs')) return { intentId: 'docs', modelId: 'claude-sonnet-5', confidence: 0.95 };
      return null;
    };

    const { app, decisions } = createRoutingGatewayApp({
      registry, clientId: 'claude', env: { MY_KEY: 'k' }, clientProtocol: 'claude',
      fetchImpl: async () => claudeSuccess(), classifyIntent: mockClassify,
    });
    const headers = { 'content-type': 'application/json' };
    const send = async (body) => {
      const res = await app.request('/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
      assert.equal(res.status, 200);
      await res.text(); // 消费响应以触发决策落账（flush）
    };

    await send(userBody('run tests'));
    assert.equal(classifyCallCount, 1, 'the initial user turn classifies once');

    // 工具续轮：无显式 session header，首条用户消息仍是 'run tests' → 命中内容键缓存。
    await send({
      ...userBody('run tests'),
      messages: [
        { role: 'user', content: 'run tests' },
        { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'x', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'done' }] },
      ],
    });
    assert.equal(classifyCallCount, 1, 'tool continuation must not re-classify');

    await send(userBody('write docs'));
    assert.equal(classifyCallCount, 2, 'a genuinely new task classifies again');

    assert.deepEqual(decisions.map((d) => d.modelId), ['claude-opus-5', 'claude-opus-5', 'claude-sonnet-5']);
    assert.deepEqual(decisions.map((d) => d.intent), ['test', 'test', 'docs']);
    assert.ok(decisions.every((d) => !d.intentFallback), 'normal intent routes carry no fallback badge');
  });
});
