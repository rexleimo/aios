import test from 'node:test';
import assert from 'node:assert/strict';

import { createGatewayServer } from '../../../../lib/tooling/model-router/gateway/serve.mjs';

const registry = {
  activeModel: 'claude-sonnet-5',
  models: { 'claude-sonnet-5': { protocols: ['claude'] } },
  roleDefaults: {},
  routingRules: [{ taskType: 'general', primary: 'claude-sonnet-5', fallback: [] }],
  clientRoleMatrix: { default: {}, clients: {} },
};

test('routing-mode server starts on loopback, serves health, and closes cleanly', async () => {
  const server = createGatewayServer({ mode: 'routing', port: 0, registry, env: {} });
  const addr = await server.listen();
  try {
    assert.equal(server.mode, 'routing');
    assert.ok(addr.port > 0);
    const res = await fetch(`http://127.0.0.1:${addr.port}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      ok: true,
      ready: false,
      configuredModels: 0,
      readyModels: 0,
      code: 'NO_ROUTE_CONFIGURED',
    });
  } finally {
    await server.close();
  }
  assert.equal(server.address(), null, 'address cleared after close');
});

test('passthrough-mode server starts and serves health', async () => {
  const server = createGatewayServer({ mode: 'passthrough', port: 0 });
  const addr = await server.listen();
  try {
    assert.equal(server.mode, 'passthrough');
    const res = await fetch(`http://127.0.0.1:${addr.port}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, ready: false });
  } finally {
    await server.close();
  }
});

for (const [name, env, expected] of [
  ['missing credentials', {}, { ready: false, readyModels: 0, code: 'PROVIDER_CREDENTIALS_MISSING' }],
  ['ready credentials', { CLAUDE_KEY: 'fixture-secret' }, { ready: true, readyModels: 1 }],
]) {
  test(`routing health reports configured/ready counts with ${name} without probing upstream`, async () => {
    let calls = 0;
    const explicitRegistry = {
      ...registry,
      providers: { local: { baseUrl: 'https://upstream.invalid', protocols: ['claude'], apiKeyEnv: 'env:CLAUDE_KEY', models: ['claude-sonnet-5'] } },
    };
    const server = createGatewayServer({ registry: explicitRegistry, env, fetchImpl: async () => { calls += 1; throw new Error('health must be local'); } });
    const addr = await server.listen();
    try {
      const res = await fetch(`http://127.0.0.1:${addr.port}/health`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true, configuredModels: 1, ...expected });
      assert.equal(calls, 0);
      assert.equal(server.decisions.length, 0);
    } finally {
      await server.close();
    }
  });
}
