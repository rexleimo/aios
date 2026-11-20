import assert from 'node:assert/strict';
import test from 'node:test';

import { handleProviderRpc, readProviderView } from '../../../lib/clients/plugins/builtin-provider.mjs';

const REG = {
  schemaVersion: 1,
  providers: { magpie: { baseUrl: 'http://x/v1', protocols: ['openai-chat'], models: ['a', 'b'] } },
  models: {
    a: { provider: 'magpie', upstreamModel: 'u-a', enabled: true },
    b: { provider: 'magpie', enabled: false },
  },
};
const fsFrom = (text) => () => text;

test('边界2: readProviderView 从真实 registry 结构读 providers/models', () => {
  const view = readProviderView({ rootDir: '/proj', readFileImpl: fsFrom(JSON.stringify(REG)) });
  assert.equal(view.ok, true);
  assert.equal(view.providers[0].id, 'magpie');
  assert.equal(view.providers[0].modelCount, 2);
  assert.equal(view.models.length, 2);
  assert.equal(view.models[0].upstreamModel, 'u-a');
});

test('边界2: RPC models/providers 返回真实数据', () => {
  const models = handleProviderRpc({ rootDir: '/proj', method: 'models', readFileImpl: fsFrom(JSON.stringify(REG)) });
  assert.equal(models.ok, true);
  assert.equal(models.data.length, 2);
  const providers = handleProviderRpc({ rootDir: '/proj', method: 'providers', readFileImpl: fsFrom(JSON.stringify(REG)) });
  assert.equal(providers.data[0].id, 'magpie');
});

test('边界2: usage 诚实返回未记录，不编造额度', () => {
  const usage = handleProviderRpc({ rootDir: '/proj', method: 'usage', readFileImpl: fsFrom(JSON.stringify(REG)) });
  assert.equal(usage.ok, true);
  assert.equal(usage.data.recorded, false);
});

test('边界2: 未知 method 被拒', () => {
  const r = handleProviderRpc({ rootDir: '/proj', method: 'nope', readFileImpl: fsFrom(JSON.stringify(REG)) });
  assert.equal(r.ok, false);
});
