import test from 'node:test';
import assert from 'node:assert/strict';

import { parseModelList, discoverProviderModels, discoverAllModels, mergeDiscoveredModels } from '../../../../lib/tooling/model-router/routing/discovery.mjs';

function fakeFetch(responses, capture) {
  return async (url, opts) => {
    if (capture) capture.push({ url, headers: opts?.headers });
    const entry = responses[url];
    if (!entry) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: entry.ok ?? true, status: entry.status ?? 200, json: async () => entry.body };
  };
}

const PROVIDER = { id: 'relay', baseUrl: 'https://relay.test', apiKeyEnv: 'env:TEST_KEY', protocols: ['claude', 'gemini', 'openai-chat'], models: [] };
const RESPONSES = {
  'https://relay.test/claude/v1/models': { body: { data: [{ id: 'claude-x' }, { id: 'shared' }] } },
  'https://relay.test/gemini/v1beta/models': { body: { models: [{ name: 'models/gemini-y' }, { name: 'models/shared' }] } },
  'https://relay.test/openai/v1/models': { ok: false, status: 404 },
};

test('parseModelList：openai/claude 取 data[].id，gemini 取 models[].name 并剥 models/ 前缀', () => {
  assert.deepEqual(parseModelList('claude', { data: [{ id: 'a' }, { id: 'b' }] }), ['a', 'b']);
  assert.deepEqual(parseModelList('openai-chat', { data: [{ id: 'a' }] }), ['a']);
  assert.deepEqual(parseModelList('gemini', { models: [{ name: 'models/gemini-3-pro' }] }), ['gemini-3-pro']);
  assert.deepEqual(parseModelList('claude', {}), []);
  assert.deepEqual(parseModelList('gemini', null), []);
});

test('discoverProviderModels：逐协议拉取、按 id 去重合并协议、404 fail-soft、密钥进头不进结果', async () => {
  const capture = [];
  const env = { TEST_KEY: 'super-secret' };
  const { models, errors } = await discoverProviderModels(PROVIDER, { env, fetchImpl: fakeFetch(RESPONSES, capture) });
  const byId = Object.fromEntries(models.map((m) => [m.id, m]));
  assert.deepEqual(byId['claude-x'].protocols, ['claude']);
  assert.deepEqual(byId['gemini-y'].protocols, ['gemini']);
  assert.deepEqual(byId.shared.protocols.sort(), ['claude', 'gemini'], '跨协议同 id 去重并合并协议');
  assert.ok(models.every((m) => m.source === 'discovered'));
  assert.ok(errors.some((e) => e.protocol === 'openai-chat' && e.status === 404), 'openai 404 记 error 不炸');
  assert.ok(capture.every((c) => c.headers.authorization === 'Bearer super-secret'), '密钥按协议挂头');
  assert.ok(!JSON.stringify({ models, errors }).includes('super-secret'), '密钥绝不进结果/错误');
});

test('discoverProviderModels: authMode=none explicitly permits anonymous discovery', async () => {
  const capture = [];
  const provider = { ...PROVIDER, authMode: 'none', apiKeyEnv: '' };
  await discoverProviderModels(provider, { env: {}, fetchImpl: fakeFetch(RESPONSES, capture) });
  assert.equal(capture.length, PROVIDER.protocols.length, 'anonymous discovery fetches all configured protocol endpoints');
  assert.ok(capture.every((c) => !c.headers || Object.keys(c.headers).length === 0), '无密钥不挂头');
});

test('discoverProviderModels: required auth without credentials makes no upstream requests', async () => {
  let calls = 0;
  const result = await discoverProviderModels(PROVIDER, { env: {}, fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); } });
  assert.equal(calls, 0);
  assert.deepEqual(result.models, []);
  assert.equal(result.errors[0].code, 'MISSING_CREDENTIALS');
});

test('discoverProviderModels：网络异常 fail-soft，记 error 不抛', async () => {
  const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
  const { models, errors } = await discoverProviderModels(PROVIDER, { env: { TEST_KEY: 'k' }, fetchImpl });
  assert.deepEqual(models, []);
  assert.equal(errors.length, PROVIDER.protocols.length);
});

test('discoverAllModels：合并注册表所有 provider 的发现结果', async () => {
  const registry = { providers: { relay: { baseUrl: 'https://relay.test', apiKeyEnv: 'env:TEST_KEY', protocols: ['claude'], models: [] } } };
  const { models, providers } = await discoverAllModels(registry, { env: { TEST_KEY: 'k' }, fetchImpl: fakeFetch(RESPONSES) });
  assert.ok(models.some((m) => m.id === 'claude-x'));
  assert.ok(providers.length >= 1);
});

test('mergeDiscoveredModels enriches only the same explicit channel identity and preserves its metadata', () => {
  const registry = { models: { 'claude-x': { source: 'discovered', provider: 'relay', upstreamModel: 'claude-x', protocols: ['claude'], label: 'Curated X', cost: 'low', strengths: ['code'] } } };
  const discovered = [
    { id: 'claude-x', protocols: ['claude', 'openai-chat'], provider: 'relay', source: 'discovered' },
    { id: 'new-model', protocols: ['gemini'], provider: 'relay', source: 'discovered' },
  ];
  const { registry: merged, added, enriched } = mergeDiscoveredModels(registry, discovered);
  assert.equal(added, 1);
  assert.equal(enriched, 1);
  assert.equal(merged.models['claude-x'].label, 'Curated X', 'curated 画像保留');
  assert.equal(merged.models['claude-x'].cost, 'low');
  assert.deepEqual(merged.models['claude-x'].strengths, ['code']);
  assert.deepEqual([...merged.models['claude-x'].protocols].sort(), ['claude', 'openai-chat'], '已有 id 补协议');
  assert.equal(merged.models['new-model'].source, 'discovered');
  assert.deepEqual(merged.models['new-model'].protocols, ['gemini']);
  assert.equal(merged.models['new-model'].cost, 'unknown');
  assert.equal(merged.models['new-model'].speed, 'unknown');
  assert.equal(merged.models['new-model'].contextWindow, 'unknown');
  assert.equal(merged.models['new-model'].provider, 'relay');
  assert.equal(merged.models['new-model'].upstreamModel, 'new-model');
  assert.equal(registry.models['claude-x'].protocols.length, 1, '纯函数不改原 registry');
});

test('mergeDiscoveredModels preserves native metadata and route choices when an upstream advertises the same id', () => {
  const registry = {
    activeModel: 'claude-x',
    models: { 'claude-x': { source: 'curated', provider: 'claude', protocols: ['claude'], label: 'Native X', cost: 'high', extension: { keep: true } } },
    clientDefaults: { claude: 'claude-x' },
    routingRules: [{ taskType: 'general', primary: 'claude-x', fallback: [] }],
  };
  const original = structuredClone(registry);
  const { registry: merged, added, enriched } = mergeDiscoveredModels(registry, [
    { id: 'claude-x', protocols: ['openai-chat'], provider: 'relay', source: 'discovered' },
  ]);
  assert.equal(added, 1);
  assert.equal(enriched, 0);
  assert.deepEqual(merged.models['claude-x'], original.models['claude-x']);
  assert.deepEqual(merged.clientDefaults, original.clientDefaults);
  assert.deepEqual(merged.routingRules, original.routingRules);
  assert.equal(merged.activeModel, original.activeModel);
  assert.equal(merged.models['relay::claude-x'].provider, 'relay');
  assert.equal(merged.models['relay::claude-x'].upstreamModel, 'claude-x');
  assert.deepEqual(merged.models['relay::claude-x'].protocols, ['openai-chat']);
  assert.deepEqual(registry, original);
});
