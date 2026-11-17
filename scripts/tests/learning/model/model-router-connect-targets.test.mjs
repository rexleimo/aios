import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runConnect, runConnectInplace, runDisconnect } from '../../../lib/tooling/model-router/connect/command.mjs';
import { readConnectStatus } from '../../../lib/tooling/model-router/connect/readback.mjs';
import { parseConnectTarget, persistedConnectTarget, requestModelForTarget } from '../../../lib/tooling/model-router/connect/targets.mjs';

const GW = 'http://127.0.0.1:8686';
const clients = ['claude', 'codex', 'pi'];
const io = { log() {}, error() {} };
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (text) => createHash('sha256').update(text).digest('hex');
const localId = 'group:literal/% value', groupId = 'team/primary %';
const modelTarget = `model:${encodeURIComponent(localId)}`, groupTarget = `group:${encodeURIComponent(groupId)}`;
function registry() {
  return {
    targetRefVersion: 1, activeModel: 'model:auto',
    providers: { p: { baseUrl: 'https://unused.invalid', authMode: 'none', protocols: ['claude'] } },
    models: Object.fromEntries(['auto', localId, 'group:x'].map((id) => [id, { source: 'custom', provider: 'p', protocols: ['claude'], upstreamModel: `vendor-${id}` }])),
    routingGroups: { [groupId]: { models: [localId, 'auto'], routing: 'ordered' }, x: { models: ['auto'] } },
    unrelated: { preserve: true },
  };
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-targets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), stateDir = path.join(root, 'state'), registryFile = path.join(root, 'registry.json');
  fs.mkdirSync(home);
  fs.mkdirSync(path.join(home, '.codex'));
  const codex = ['# preserved', `model = ${JSON.stringify('native')}`, `model_provider = ${JSON.stringify('custom')}`, `model_catalog_json = ${JSON.stringify('/fixture/custom-catalog.json')}`, ''].join('\n');
  fs.writeFileSync(path.join(home, '.codex/config.toml'), codex);
  fs.writeFileSync(registryFile, json(registry()));
  return { root, home, stateDir, registryFile, gatewayUrl: GW, clients, io, env: {}, codex };
}

test('canonical refs and reserved wire IDs preserve encoding and literal collisions', () => {
  for (const id of ['auto', 'group:x', 'model:x', 'a/b', 'a%2Fb', 'two words', '\u6a21\u578b']) {
    const ref = `model:${encodeURIComponent(id)}`;
    assert.equal(parseConnectTarget(ref).id, id);
    assert.equal(requestModelForTarget(ref), `aios/model/${encodeURIComponent(id)}`);
    assert.equal(persistedConnectTarget(id), ref);
    assert.equal(persistedConnectTarget(ref, 1), ref);
  }
  assert.equal(persistedConnectTarget('auto'), 'model:auto');
  assert.equal(persistedConnectTarget('group:x'), 'model:group%3Ax');
  assert.equal(requestModelForTarget('group:x'), 'aios/group/x');
  assert.equal(requestModelForTarget('aios-auto'), 'aios-auto');
  assert.equal(requestModelForTarget('native'), null);
  for (const invalid of ['', 'raw-id', 'aios/model/x', 'model:a/b', 'model:%61', 'model:%', 'group:', 'group:%00', null, {}, 'Auto']) {
    assert.throws(() => parseConnectTarget(invalid), { code: 'INVALID_CONNECT_TARGET' }, String(invalid));
  }
});

for (const mode of ['isolated', 'inplace']) {
  const connect = mode === 'isolated' ? runConnect : runConnectInplace;
  for (const target of ['auto', modelTarget, groupTarget]) {
    test(`${mode}: ${target} persists requested refs separately from readiness in all clients`, async (t) => {
      const f = fixture(t), before = fs.readFileSync(f.registryFile, 'utf8');
      const result = await connect({ ...f, target });
      assert.equal(result.exitCode, 0, JSON.stringify(result));
      const expectedModel = target === 'auto' ? 'auto' : localId;
      assert.deepEqual(result.routes, Object.fromEntries(clients.map((client) => [client, expectedModel])));
      const state = JSON.parse(fs.readFileSync(path.join(f.stateDir, 'connect-state.json'), 'utf8'));
      assert.equal(state.targetRefVersion, 1);
      assert.deepEqual(state.targets, Object.fromEntries(clients.map((client) => [client, target])));
      assert.deepEqual(state.resolvedModels, result.routes);
      assert.equal(state.codexModel, undefined);
      assert.equal(state.piModel, undefined);
      assert.equal(fs.readFileSync(f.registryFile, 'utf8'), before);
      const status = readConnectStatus(f);
      assert.equal(status.mode, mode);
      for (const item of status.clients) {
        assert.equal(item.connected, true, JSON.stringify(item));
        assert.equal(item.target, target);
        assert.equal(item.defaultTarget, target);
        assert.equal(item.ownership.status, 'owned');
        assert.equal(item.readback.baseUrl, `${GW}/clients/${item.client}${item.client === 'codex' ? '/v1' : ''}`);
        assert.equal(item.capabilities.native.supported, false);
        assert.ok(item.capabilities.native.reason);
        assert.equal(item.capabilities.catalog.supported, item.client === 'pi');
      }
      const codexFile = mode === 'isolated' ? path.join(f.stateDir, 'codex-home/config.toml') : path.join(f.home, '.codex/config.toml');
      const codex = fs.readFileSync(codexFile, 'utf8');
      assert.ok(codex.includes(`model = ${JSON.stringify(requestModelForTarget(target))}`));
      if (mode === 'inplace') assert.ok(codex.includes(`model_catalog_json = ${JSON.stringify('/fixture/custom-catalog.json')}`));
      assert.doesNotMatch(codex, /model_catalog_json[^\n]*\/models/u);
      const piFile = mode === 'isolated' ? path.join(f.stateDir, 'pi-home/.pi/agent/models.json') : path.join(f.home, '.pi/agent/models.json');
      const catalog = JSON.parse(fs.readFileSync(piFile, 'utf8')).providers['aios-gateway'].models;
      for (const id of ['aios-auto', `aios/model/${encodeURIComponent(localId)}`, `aios/group/${encodeURIComponent(groupId)}`]) assert.ok(catalog.some((item) => item.id === id));
      assert.equal((await runDisconnect(f)).exitCode, 0);
      assert.equal(fs.readFileSync(path.join(f.home, '.codex/config.toml'), 'utf8'), f.codex);
    });
  }

  test(`${mode}: Native and invalid targets fail before config or state writes`, async (t) => {
    const f = fixture(t), before = fs.readFileSync(f.registryFile, 'utf8');
    for (const dryRun of [true, false]) for (const [target, error] of [['native', 'unsupported_native_target'], ['model:missing', 'invalid_target'], ['group:missing', 'invalid_target'], ['model:a/b', 'invalid_target']]) {
      const result = await connect({ ...f, target, dryRun });
      assert.equal(result.ready, false);
      assert.equal(result.error, error);
      assert.equal(fs.existsSync(f.stateDir), false);
      assert.equal(fs.readFileSync(path.join(f.home, '.codex/config.toml'), 'utf8'), f.codex);
      assert.equal(fs.readFileSync(f.registryFile, 'utf8'), before);
    }
  });

  test(`${mode}: exact-byte revisions reject stale and malformed snapshots before client writes`, async (t) => {
    const f = fixture(t), text = fs.readFileSync(f.registryFile, 'utf8'), revision = digest(text);
    assert.equal((await connect({ ...f, expectedRevision: revision, target: modelTarget, dryRun: true })).ready, true);
    fs.writeFileSync(f.registryFile, `${text}\n`);
    await assert.rejects(connect({ ...f, expectedRevision: revision, target: modelTarget }), { code: 'REGISTRY_STALE' });
    await assert.rejects(connect({ ...f, expectedRevision: 'not-a-hash', target: 'auto' }), { code: 'INVALID_EXPECTED_REVISION' });
    assert.equal(fs.existsSync(f.stateDir), false);
    assert.equal(fs.readFileSync(path.join(f.home, '.codex/config.toml'), 'utf8'), f.codex);
    fs.rmSync(f.registryFile);
    assert.equal((await connect({ ...f, baseRegistry: registry(), baseRegistryRevision: revision, expectedRevision: revision, target: 'auto', dryRun: true })).ready, true);
    await assert.rejects(connect({ ...f, baseRegistry: registry(), expectedRevision: revision, target: 'auto', dryRun: true }), { code: 'REGISTRY_STALE' });
    assert.equal(fs.existsSync(f.registryFile), false);
    assert.equal(fs.existsSync(f.stateDir), false);
  });
}
