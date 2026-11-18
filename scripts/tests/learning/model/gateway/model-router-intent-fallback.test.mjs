import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { createRoutingGatewayApp } from '../../../../lib/tooling/model-router/gateway/compatibility/proxy.mjs';

function registryWith(intents, { includeOpenai = false } = {}) {
  const models = {
    'claude-sonnet-5': { protocols: ['claude'], cost: 'medium' },
    'claude-opus-5': { protocols: ['claude'], cost: 'highest' },
    'qwen3.8-flash': { protocols: ['openai-chat'], cost: 'lowest' },
  };
  const providers = {
    myrelay: {
      baseUrl: 'https://api.example.com', apiKeyEnv: 'env:MY_KEY',
      protocols: ['claude', 'openai-chat'], models: ['claude-sonnet-5', 'claude-opus-5', 'qwen3.8-flash'],
    },
  };
  if (includeOpenai) {
    models['gpt-4'] = { protocols: ['openai-chat'], cost: 'medium' };
    providers.openai = { baseUrl: 'https://api.openai.com', apiKeyEnv: 'env:OPENAI_KEY', protocols: ['openai-chat'], models: ['gpt-4'] };
  }
  return {
    activeModel: 'claude-sonnet-5',
    models,
    providers,
    clientDefaults: { claude: 'claude-sonnet-5' },
    intentRouting: { enabled: true, classifierModel: 'qwen3.8-flash', confidenceThreshold: 0.7, intents },
  };
}

const claudeSuccess = () => new Response(JSON.stringify({
  id: '1', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
  content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
}), { status: 200, headers: { 'content-type': 'application/json' } });

async function run(registry, classifyIntent, env = { MY_KEY: 'k' }) {
  const { app, decisions } = createRoutingGatewayApp({
    registry, clientId: 'claude', env, clientProtocol: 'claude',
    fetchImpl: async () => claudeSuccess(), classifyIntent,
  });
  const res = await app.request('/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'aios-auto', max_tokens: 100, messages: [{ role: 'user', content: 'some task' }] }),
  });
  assert.equal(res.status, 200);
  await res.text();
  return decisions[decisions.length - 1];
}

describe('intent routing fallback logging', () => {
  it('records a classify-stage fallback when the classifier throws', async () => {
    const decision = await run(
      registryWith([{ id: 'test', modelId: 'claude-opus-5' }]),
      async () => { throw new Error('Network timeout'); },
    );
    assert.ok(decision.intentFallback);
    assert.equal(decision.intentFallback.stage, 'classify');
    assert.match(decision.intentFallback.reason, /Network timeout/);
    assert.equal(decision.intentFallback.fallbackModelId, 'claude-sonnet-5');
  });

  it('records a classify-stage fallback when confidence is below the threshold', async () => {
    const decision = await run(
      registryWith([{ id: 'test', modelId: 'claude-opus-5' }]),
      async () => ({ intentId: 'test', modelId: 'claude-opus-5', confidence: 0.5 }),
    );
    assert.ok(decision.intentFallback);
    assert.equal(decision.intentFallback.stage, 'classify');
    assert.match(decision.intentFallback.reason, /Low confidence/);
    assert.match(decision.intentFallback.reason, /0\.50 < 0\.7/);
    assert.equal(decision.intentFallback.fallbackModelId, 'claude-sonnet-5');
  });

  it('records a qualify-stage fallback when the classifier itself is unavailable', async () => {
    const registry = registryWith([{ id: 'test', modelId: 'claude-opus-5' }], { includeOpenai: true });
    registry.intentRouting.classifierModel = 'gpt-4'; // gpt-4 无 OPENAI_KEY → 分类器不可达
    const decision = await run(
      registry,
      async () => { throw new Error('classifier must not be called when it is unavailable'); },
      { MY_KEY: 'k' },
    );
    assert.ok(decision.intentFallback);
    assert.equal(decision.intentFallback.stage, 'qualify');
    assert.match(decision.intentFallback.reason, /Intent classifier gpt-4 failed qualification/);
    assert.equal(decision.intentFallback.originalModelId, 'gpt-4');
    assert.equal(decision.intentFallback.fallbackModelId, 'claude-sonnet-5');
  });

  it('keeps other intents working when one intent target fails qualification', async () => {
    const registry = registryWith([
      { id: 'bad', modelId: 'gpt-4' },
      { id: 'good', modelId: 'claude-opus-5' },
    ], { includeOpenai: true });
    const decision = await run(
      registry,
      async () => ({ intentId: 'good', modelId: 'claude-opus-5', confidence: 0.9 }),
      { MY_KEY: 'k' },
    );
    assert.equal(decision.intent, 'good');
    assert.equal(decision.modelId, 'claude-opus-5');
    assert.ok(!decision.intentFallback, 'a healthy intent still routes normally');
  });

  it('warns when every intent target fails qualification', async () => {
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => { warnings.push(args); };
    try {
      await run(
        registryWith([{ id: 'bad', modelId: 'gpt-4' }], { includeOpenai: true }),
        async () => { throw new Error('classifier must not be called when every intent is unroutable'); },
        { MY_KEY: 'k' },
      );
    } finally {
      console.warn = originalWarn;
    }
    assert.ok(warnings.some(([message]) => String(message).includes('All intents skipped')));
  });

  it('records a qualify-stage fallback when the intent model has no credentials', async () => {
    const decision = await run(
      registryWith([{ id: 'test', modelId: 'gpt-4' }], { includeOpenai: true }),
      async () => ({ intentId: 'test', modelId: 'gpt-4', confidence: 0.9 }),
      { MY_KEY: 'k' }, // OPENAI_KEY 故意缺失 → gpt-4 qualify 失败
    );
    assert.ok(decision.intentFallback);
    assert.equal(decision.intentFallback.stage, 'qualify');
    assert.equal(decision.intentFallback.originalIntentId, 'test');
    assert.equal(decision.intentFallback.originalModelId, 'gpt-4');
    assert.equal(decision.intentFallback.fallbackModelId, 'claude-sonnet-5');
    assert.equal(decision.modelId, 'claude-sonnet-5', 'request still completes on the default route');
  });
});
