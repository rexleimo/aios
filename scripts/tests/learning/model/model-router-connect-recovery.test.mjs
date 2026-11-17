import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { runConnect, runConnectInplace, runDisconnect } from '../../../lib/tooling/model-router/connect/command.mjs';
import { readConnectStatus } from '../../../lib/tooling/model-router/connect/readback.mjs';
import { isolatedArtifactPath } from '../../../lib/tooling/model-router/connect/isolated.mjs';

const GW = 'http://127.0.0.1:8686', clients = ['claude', 'codex', 'pi'];
const io = { log() {}, error() {} };
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-recovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), stateDir = path.join(root, "state space's;$not_executed"), registryFile = path.join(root, 'registry.json');
  fs.mkdirSync(home);
  const registry = {
    targetRefVersion: 1, activeModel: 'model:ready',
    models: { ready: { source: 'custom', provider: 'p', protocols: ['claude'] } },
    providers: { p: { baseUrl: 'https://unused.invalid', authMode: 'none', protocols: ['claude'] } },
    clientDefaults: { codex: 'model:native', pi: 'model:ready' }, unrelated: { keep: true },
  };
  fs.writeFileSync(registryFile, json(registry));
  // Give Codex an eligible default while retaining an unrelated prior selection to restore.
  return { root, home, stateDir, registryFile, registry, gatewayUrl: GW, clients, io, env: {} };
}
const stateFile = (f) => path.join(f.stateDir, 'connect-state.json');
const state = (f) => JSON.parse(fs.readFileSync(stateFile(f), 'utf8'));

test('isolated pending hashes cover both written and unwritten artifacts, preserve unselected pending entries and reject drift', async (t) => {
  const f = fixture(t), mkdir = fs.mkdirSync;
  fs.mkdirSync = (directory, ...args) => {
    if (directory === path.join(f.stateDir, 'codex-home')) throw new Error('interrupted artifact creation');
    return mkdir(directory, ...args);
  };
  try { await assert.rejects(runConnect({ ...f, target: 'model:ready' }), /interrupted artifact creation/u); }
  finally { fs.mkdirSync = mkdir; }
  const pending = state(f);
  assert.equal(pending.artifactStatus, 'pending');
  assert.equal(pending.pendingArtifacts.codex.before, null);
  assert.equal(fs.existsSync(isolatedArtifactPath(f.stateDir, 'claude')), true);
  assert.equal(fs.existsSync(isolatedArtifactPath(f.stateDir, 'codex')), false);
  const status = readConnectStatus(f);
  assert.equal(status.clients[0].connected, true);
  assert.equal(status.clients[1].connected, false);
  assert.deepEqual(status.clients.map((item) => item.recovery.status), ['pending', 'pending', 'pending']);
  assert.equal((await runConnect({ ...f, clients: ['pi'], target: 'auto' })).exitCode, 0);
  assert.deepEqual(Object.keys(state(f).pendingArtifacts), ['claude', 'codex']);
  assert.equal((await runConnect({ ...f, target: 'model:ready' })).exitCode, 0);
  assert.deepEqual(state(f).pendingArtifacts, {});
  fs.appendFileSync(isolatedArtifactPath(f.stateDir, 'codex'), '# external change\n');
  const before = fs.readFileSync(stateFile(f), 'utf8');
  await assert.rejects(runConnect({ ...f, target: 'auto' }), { code: 'CLIENT_CONFIG_STALE' });
  await assert.rejects(runDisconnect(f), { code: 'CLIENT_CONFIG_STALE' });
  assert.equal(fs.readFileSync(stateFile(f), 'utf8'), before);
  assert.equal(fs.existsSync(isolatedArtifactPath(f.stateDir, 'claude')), true);
});

test('isolated final-state failure retains artifact hashes and Codex ownership before the registry mutation', async (t) => {
  const f = fixture(t), rename = fs.renameSync;
  let writes = 0;
  fs.renameSync = (source, target) => {
    if (target === stateFile(f) && ++writes === 3) throw new Error('final journal write interrupted');
    return rename(source, target);
  };
  try { await assert.rejects(runConnect({ ...f, codexModel: 'ready' }), /final journal write interrupted/u); }
  finally { fs.renameSync = rename; }
  assert.equal(state(f).codexDefaultApplied, true);
  assert.equal(state(f).codexDefaultStatus, 'applied');
  assert.equal(state(f).artifactStatus, 'pending');
  assert.equal(JSON.parse(fs.readFileSync(f.registryFile, 'utf8')).clientDefaults.codex, 'model:ready');
  assert.equal((await runDisconnect({ ...f, clients: ['codex'] })).exitCode, 0);
  assert.equal(JSON.parse(fs.readFileSync(f.registryFile, 'utf8')).clientDefaults.codex, 'model:native');
  assert.deepEqual(state(f).clients, ['claude', 'pi']);
  assert.equal(state(f).codexDefaultApplied, false);
  assert.equal(fs.existsSync(isolatedArtifactPath(f.stateDir, 'claude')), true);
  assert.equal((await runDisconnect(f)).exitCode, 0);
});

for (const mode of ['isolated', 'inplace']) {
  const connect = mode === 'isolated' ? runConnect : runConnectInplace;
  test(`${mode}: filtered disconnect restores Codex defaults immediately and preserves the other clients`, async (t) => {
    const f = fixture(t);
    assert.equal((await connect({ ...f, codexModel: 'ready' })).exitCode, 0);
    const saved = JSON.parse(fs.readFileSync(f.registryFile, 'utf8'));
    saved.clientDefaults.claude = 'model:other-user-edit';
    saved.unrelated.userEdit = true;
    fs.writeFileSync(f.registryFile, json(saved));
    assert.equal((await runDisconnect({ ...f, clients: ['codex'] })).exitCode, 0);
    const restored = JSON.parse(fs.readFileSync(f.registryFile, 'utf8'));
    assert.equal(restored.clientDefaults.codex, 'model:native');
    assert.equal(restored.clientDefaults.claude, 'model:other-user-edit');
    assert.equal(restored.unrelated.userEdit, true);
    assert.deepEqual(state(f).clients, ['claude', 'pi']);
    const readback = readConnectStatus(f);
    assert.deepEqual(readback.clients.map((item) => item.connected), [true, false, true]);
    assert.equal(fs.existsSync(path.join(f.stateDir, 'registry-backup.json')), false);
    assert.equal((await runDisconnect({ ...f, clients: ['codex'] })).exitCode, 0);
    assert.deepEqual(state(f).clients, ['claude', 'pi']);
    assert.equal((await runDisconnect(f)).exitCode, 0);
    assert.equal(fs.existsSync(stateFile(f)), false);
  });

  test(`${mode}: registry restoration precedes consuming backups and is retryable after state-write failures`, async (t) => {
    const f = fixture(t);
    assert.equal((await connect({ ...f, codexModel: 'ready' })).exitCode, 0);
    const saved = JSON.parse(fs.readFileSync(f.registryFile, 'utf8'));
    saved.clientDefaults.codex = 'model:external-edit';
    fs.writeFileSync(f.registryFile, json(saved));
    const before = fs.readFileSync(stateFile(f), 'utf8');
    await assert.rejects(runDisconnect({ ...f, clients: ['codex'] }), { code: 'REGISTRY_STALE' });
    assert.equal(fs.readFileSync(stateFile(f), 'utf8'), before);
    assert.equal(readConnectStatus(f).clients[1].connected, true);
    saved.clientDefaults.codex = 'model:ready';
    fs.writeFileSync(f.registryFile, json(saved));
    const rename = fs.renameSync;
    fs.renameSync = (source, target) => {
      if (target === stateFile(f)) throw new Error('disconnect state-write interrupted');
      return rename(source, target);
    };
    try { await assert.rejects(runDisconnect({ ...f, clients: ['codex'] }), /disconnect state-write interrupted/u); }
    finally { fs.renameSync = rename; }
    assert.equal(JSON.parse(fs.readFileSync(f.registryFile, 'utf8')).clientDefaults.codex, 'model:native');
    assert.equal((await runDisconnect({ ...f, clients: ['codex'] })).exitCode, 0);
    assert.deepEqual(state(f).clients, ['claude', 'pi']);
    assert.equal(state(f).codexDefaultApplied, false);
    assert.equal((await runDisconnect(f)).exitCode, 0);
  });
}

test('legacy pending Codex journals use codexModel ownership even without appliedCodexModel', async (t) => {
  const f = fixture(t), registry = structuredClone(f.registry);
  delete registry.targetRefVersion;
  registry.clientDefaults = { codex: 'ready' };
  fs.writeFileSync(f.registryFile, json(registry));
  fs.mkdirSync(f.stateDir);
  fs.writeFileSync(stateFile(f), json({ mode: 'isolated', clients: ['codex'], gatewayUrl: GW, registryFile: f.registryFile, codexModel: 'ready', codexDefaultStatus: 'pending', priorClientDefaults: { codex: 'original' } }));
  assert.equal((await runDisconnect(f)).exitCode, 0);
  assert.equal(JSON.parse(fs.readFileSync(f.registryFile, 'utf8')).clientDefaults.codex, 'original');
  assert.equal(fs.existsSync(stateFile(f)), false);
});

test('legacy pending Codex journals can reconnect before restoring their original default', async (t) => {
  const f = fixture(t), registry = structuredClone(f.registry);
  delete registry.targetRefVersion;
  registry.clientDefaults = { codex: 'ready' };
  fs.writeFileSync(f.registryFile, json(registry));
  fs.mkdirSync(f.stateDir);
  fs.writeFileSync(stateFile(f), json({ mode: 'isolated', clients: ['codex'], gatewayUrl: GW, registryFile: f.registryFile,
    codexModel: 'ready', codexDefaultStatus: 'pending', priorClientDefaults: { codex: 'original' } }));
  assert.equal((await runConnect({ ...f, clients: ['codex'], codexModel: 'ready' })).exitCode, 0);
  assert.equal((await runDisconnect(f)).exitCode, 0);
  assert.equal(JSON.parse(fs.readFileSync(f.registryFile, 'utf8')).clientDefaults.codex, 'original');
});

for (const mode of ['isolated', 'inplace']) {
  test(`${mode}: malformed recovery journals fail closed before mutation`, async (t) => {
    const f = fixture(t), connect = mode === 'isolated' ? runConnect : runConnectInplace;
    assert.equal((await connect({ ...f, target: 'model:ready' })).exitCode, 0);
    const file = mode === 'isolated' ? stateFile(f) : path.join(f.stateDir, 'connect-backup.json');
    const before = fs.readFileSync(f.registryFile, 'utf8');
    for (const malformed of ['null', '[]', '{ invalid', mode === 'isolated' ? '{"clients":"codex"}' : '{"entries":[null]}']) {
      fs.writeFileSync(file, malformed);
      await assert.rejects(connect({ ...f, target: 'auto' }), SyntaxError);
      await assert.rejects(runDisconnect(f), SyntaxError);
      assert.equal(fs.readFileSync(file, 'utf8'), malformed);
      assert.equal(fs.readFileSync(f.registryFile, 'utf8'), before);
    }
  });
}

test('isolated source aliases preserve shell quoting and never execute path characters', async (t) => {
  const f = fixture(t);
  assert.equal((await runConnect({ ...f, target: 'model:ready' })).exitCode, 0);
  const script = path.join(f.stateDir, 'connect.sh');
  const result = spawnSync('/bin/sh', ['-c', '. "$1"; alias claude-gw; alias codex-gw; alias pi-gw', 'verify-aliases', script], { encoding: 'utf8', env: { HOME: f.home, PATH: '/usr/bin:/bin' }, cwd: f.root });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /claude.*--settings/u);
  assert.match(result.stdout, /CODEX_HOME=/u);
  assert.match(result.stdout, /aios\/model\/ready/u);
  assert.deepEqual(fs.readdirSync(f.root).sort(), ['home', 'registry.json', path.basename(f.stateDir)].sort());
});
