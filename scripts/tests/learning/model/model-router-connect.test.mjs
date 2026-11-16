import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { claudeSettings, codexConfig, piModels } from '../../../lib/tooling/model-router/connect/artifacts.mjs';
import { runConnect, runConnectInplace, runDisconnect } from '../../../lib/tooling/model-router/connect/command.mjs';
import { disconnectInplace } from '../../../lib/tooling/model-router/connect/inplace.mjs';

const GW = 'http://127.0.0.1:8686';

function readyRegistry(extra = {}) {
  return {
    activeModel: 'test-claude',
    models: {
      'test-claude': { source: 'custom', provider: 'test-provider', protocols: ['claude'] },
      'test-response': { source: 'custom', provider: 'test-provider', protocols: ['openai-response'] },
    },
    providers: { 'test-provider': { baseUrl: 'http://127.0.0.1:9', authMode: 'none', protocols: ['claude', 'openai-response'] } },
    clientRoleMatrix: { default: {}, clients: {} },
    ...extra,
  };
}

test('claude artifact points ANTHROPIC_BASE_URL at the gateway and carries no real secret', () => {
  const artifact = claudeSettings(GW);
  assert.equal(artifact.relPath, 'claude-settings.json');
  const json = JSON.parse(artifact.content);
  assert.equal(json.env.ANTHROPIC_BASE_URL, GW);
  assert.ok(json.env.ANTHROPIC_AUTH_TOKEN, 'a placeholder token is present (gateway injects the real provider key)');
  assert.ok(!artifact.content.includes('REXAI_API_KEY'), 'must not embed the real upstream key reference value');
});

test('codex artifact uses wire_api=responses, gateway /v1 base, and injects x-gateway-client', () => {
  const artifact = codexConfig(GW, 'gpt-6-astra');
  assert.equal(artifact.relPath, path.join('codex-home', 'config.toml'));
  assert.match(artifact.content, /wire_api = "responses"/);
  assert.match(artifact.content, /base_url = "http:\/\/127\.0\.0\.1:8686\/v1"/);
  assert.match(artifact.content, /x-gateway-client = "codex"/);
  assert.match(artifact.content, /model = "gpt-6-astra"/);
  assert.match(artifact.content, /model_provider = "aios-gateway"/);
});

test('pi artifact defines an anthropic-messages provider aimed at the gateway', () => {
  const artifact = piModels(GW, 'gateway-default');
  assert.equal(artifact.relPath, path.join('pi-home', '.pi', 'agent', 'models.json'));
  const json = JSON.parse(artifact.content);
  const provider = json.providers['aios-gateway'];
  assert.equal(provider.api, 'anthropic-messages');
  assert.equal(provider.baseUrl, GW);
  assert.ok(provider.models.some((m) => m.id === 'gateway-default' && m.api === 'anthropic-messages'));
});

test('connect writes artifacts + sets clientDefaults.codex; disconnect removes artifacts and restores the registry', async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-test-'));
  try {
    const stateDir = path.join(sandbox, 'state');
    const registryFile = path.join(sandbox, 'model-registry.json');
    fs.writeFileSync(registryFile, JSON.stringify(readyRegistry(), null, 2));
    const io = { log() {}, error() {} };

    const res = await runConnect({ gatewayUrl: GW, stateDir, registryFile, clients: ['claude', 'codex', 'pi'], io });
    assert.equal(res.exitCode, 0);
    assert.ok(fs.existsSync(path.join(stateDir, 'claude-settings.json')));
    assert.ok(fs.existsSync(path.join(stateDir, 'codex-home', 'config.toml')));
    assert.ok(fs.existsSync(path.join(stateDir, 'pi-home', '.pi', 'agent', 'models.json')));
    const reg = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    assert.equal(reg.clientDefaults.codex, 'test-response', 'codex gets a registered openai-response default so same-protocol routing works');

    const disc = await runDisconnect({ stateDir, registryFile, io });
    assert.equal(disc.exitCode, 0);
    assert.ok(!fs.existsSync(path.join(stateDir, 'claude-settings.json')), 'artifacts removed');
    const reg2 = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    assert.ok(!reg2.clientDefaults?.codex, 'prior clientDefaults restored on disconnect');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('connect is idempotent and preserves a pre-existing clientDefaults.codex across disconnect', async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-test-'));
  try {
    const stateDir = path.join(sandbox, 'state');
    const registryFile = path.join(sandbox, 'model-registry.json');
    fs.writeFileSync(registryFile, JSON.stringify(readyRegistry({ clientDefaults: { codex: 'gpt-5.5' } }), null, 2));
    const io = { log() {}, error() {} };
    assert.equal((await runConnect({ gatewayUrl: GW, stateDir, registryFile, clients: ['codex'], codexModel: 'test-response', io })).exitCode, 0);
    assert.equal((await runConnect({ gatewayUrl: GW, stateDir, registryFile, clients: ['codex'], codexModel: 'test-response', io })).exitCode, 0);
    assert.equal(JSON.parse(fs.readFileSync(registryFile, 'utf8')).clientDefaults.codex, 'test-response');
    await runDisconnect({ stateDir, registryFile, io });
    assert.equal(JSON.parse(fs.readFileSync(registryFile, 'utf8')).clientDefaults.codex, 'gpt-5.5', 'restores the user prior value, not empty');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('isolated disconnect removes only owned artifact files and preserves gateway and unknown state on repetition', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-cleanup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stateDir = path.join(root, 'state');
  const registryFile = path.join(root, 'registry.json');
  fs.writeFileSync(registryFile, JSON.stringify(readyRegistry()));
  const options = { stateDir, registryFile, gatewayUrl: GW, io: { log() {}, error() {} } };
  assert.equal((await runConnect(options)).exitCode, 0);
  const preserved = {
    'gateway.pid.json': '{"pid":123,"port":8686}\n',
    'decisions.jsonl': '{"modelId":"keep"}\n',
    'gateway.log': 'keep log\n',
    'unknown.json': '{"keep":true}\n',
    'codex-home/auth.json': '{"user":"keep"}\n',
    'pi-home/.pi/agent/user.txt': 'keep nested state\n',
  };
  for (const [file, text] of Object.entries(preserved)) fs.writeFileSync(path.join(stateDir, file), text);
  for (let n = 0; n < 2; n += 1) {
    assert.equal((await runDisconnect(options)).exitCode, 0);
    for (const [file, text] of Object.entries(preserved)) assert.equal(fs.readFileSync(path.join(stateDir, file), 'utf8'), text);
    for (const file of ['claude-settings.json', 'codex-home/config.toml', 'pi-home/.pi/agent/models.json', 'connect.sh', 'connect-state.json', 'registry-backup.json']) {
      assert.equal(fs.existsSync(path.join(stateDir, file)), false, `owned ${file} removed`);
    }
  }
});

test('disconnect without connection ownership preserves even files with connect artifact names', async (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-no-state-'));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const files = ['gateway.pid.json', 'decisions.jsonl', 'unknown.txt', 'claude-settings.json', 'connect.sh', 'registry-backup.json'];
  for (const file of files) fs.writeFileSync(path.join(stateDir, file), `user-owned ${file}\n`);
  assert.equal((await runDisconnect({ stateDir, io: { log() {} } })).exitCode, 0);
  for (const file of files) assert.equal(fs.readFileSync(path.join(stateDir, file), 'utf8'), `user-owned ${file}\n`);
});

test('isolated cleanup does not remove an artifact for a client that was never connected', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-client-cleanup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stateDir = path.join(root, 'state');
  const options = { stateDir, baseRegistry: readyRegistry(), clients: ['claude'], gatewayUrl: GW, io: { log() {}, error() {} } };
  assert.equal((await runConnect(options)).exitCode, 0);
  fs.mkdirSync(path.join(stateDir, 'codex-home'));
  const unknown = path.join(stateDir, 'codex-home/config.toml');
  fs.writeFileSync(unknown, '# not created by connect\n');
  await runDisconnect(options);
  assert.equal(fs.readFileSync(unknown, 'utf8'), '# not created by connect\n');
  assert.equal(fs.existsSync(path.join(stateDir, 'claude-settings.json')), false);
});

test('in-place command preflight failure leaves clients, registry, and absent state untouched', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-preflight-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const originals = {
    '.claude/settings.json': '{"env":{"ANTHROPIC_BASE_URL":"https://original.invalid"}}\n',
    '.pi/agent/settings.json': '{malformed',
    'registry.json': JSON.stringify(readyRegistry()),
  };
  for (const [file, text] of Object.entries(originals)) {
    fs.mkdirSync(path.dirname(path.join(home, file)), { recursive: true });
    fs.writeFileSync(path.join(home, file), text);
  }
  const stateDir = path.join(home, 'state');
  await assert.rejects(runConnectInplace({ home, stateDir, registryFile: path.join(home, 'registry.json'), gatewayUrl: GW, io: { log() {}, error() {} } }), SyntaxError);
  assert.equal(fs.existsSync(stateDir), false);
  assert.equal(fs.existsSync(path.join(home, '.codex')), false);
  for (const [file, text] of Object.entries(originals)) assert.equal(fs.readFileSync(path.join(home, file), 'utf8'), text);
});

for (const mode of ['isolated', 'inplace']) {
  for (const recovery of ['disconnect', 'retry']) {
    test(`${mode}: a command-state write failure preserves the original Codex default through ${recovery}`, async (t) => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-command-recovery-'));
      t.after(() => fs.rmSync(home, { recursive: true, force: true }));
      const registryFile = path.join(home, 'registry.json');
      const stateDir = path.join(home, 'state');
      const original = readyRegistry({ clientDefaults: { codex: 'original-codex', pi: 'original-pi' }, metadata: { keep: true } });
      fs.writeFileSync(registryFile, JSON.stringify(original));
      const clientFile = path.join(home, '.codex/config.toml');
      const clientBefore = 'model_provider = "original"\nmodel = "original-codex"\n';
      fs.mkdirSync(path.dirname(clientFile));
      fs.writeFileSync(clientFile, clientBefore);
      const options = { home, registryFile, stateDir, gatewayUrl: GW, clients: ['codex'], codexModel: 'test-response', io: { log() {}, error() {} } };
      const connect = mode === 'inplace' ? runConnectInplace : runConnect;
      const writeFileSync = fs.writeFileSync;
      let failures = 0;
      const write = t.mock.method(fs, 'writeFileSync', function (file, ...args) {
        if (String(file).includes('connect-state.json') && JSON.parse(fs.readFileSync(registryFile, 'utf8')).clientDefaults?.codex === 'test-response') {
          failures++;
          throw Object.assign(new Error('command-state disk full'), { code: 'ENOSPC' });
        }
        return writeFileSync.call(this, file, ...args);
      });
      await assert.rejects(connect(options), { code: 'ENOSPC' });
      write.mock.restore();
      assert.equal(failures, 1);
      assert.equal(JSON.parse(fs.readFileSync(registryFile, 'utf8')).clientDefaults.codex, 'test-response');
      const pending = JSON.parse(fs.readFileSync(path.join(stateDir, 'connect-state.json'), 'utf8'));
      assert.equal(pending.codexDefaultStatus, 'pending');
      assert.deepEqual(pending.priorClientDefaults, original.clientDefaults);
      if (recovery === 'retry') {
        assert.equal((await connect(options)).exitCode, 0);
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(stateDir, 'registry-backup.json'), 'utf8')), original, 'retry preserves the original registry backup');
      }
      assert.equal((await runDisconnect(options)).exitCode, 0);
      assert.deepEqual(JSON.parse(fs.readFileSync(registryFile, 'utf8')), original);
      assert.equal(fs.readFileSync(clientFile, 'utf8'), clientBefore);
      for (const file of ['connect-state.json', 'connect-backup.json', 'registry-backup.json']) {
        assert.equal(fs.existsSync(path.join(stateDir, file)), false);
      }
    });
  }

  for (const prior of [null, { codex: 'original-codex', pi: 'original-pi' }]) {
    for (const recovery of ['disconnect', 'retry', 'other-client']) {
      test(`${mode}: failed Codex retarget preserves ${prior ? 'existing' : 'absent'} original defaults through ${recovery}`, async (t) => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-command-retarget-'));
        t.after(() => fs.rmSync(home, { recursive: true, force: true }));
        const registryFile = path.join(home, 'registry.json');
        const stateDir = path.join(home, 'state');
        const stateFile = path.join(stateDir, 'connect-state.json');
        const original = readyRegistry({ ...(prior ? { clientDefaults: prior } : {}), metadata: { keep: true } });
        original.models['test-response-b'] = { source: 'custom', provider: 'test-provider', protocols: ['openai-response'] };
        fs.writeFileSync(registryFile, JSON.stringify(original));
        const clientFile = path.join(home, '.codex/config.toml');
        const clientBefore = 'model_provider = "original"\nmodel = "original-codex"\n';
        fs.mkdirSync(path.dirname(clientFile));
        fs.writeFileSync(clientFile, clientBefore);
        const options = { home, registryFile, stateDir, gatewayUrl: GW, clients: ['codex'], codexModel: 'test-response', io: { log() {}, error() {} } };
        const connect = mode === 'inplace' ? runConnectInplace : runConnect;
        assert.equal((await connect(options)).exitCode, 0);
        const backupFile = path.join(stateDir, 'registry-backup.json');
        const backupBefore = fs.readFileSync(backupFile, 'utf8');
        const existsSync = fs.existsSync;
        const exists = t.mock.method(fs, 'existsSync', function (file) {
          if (String(file) === registryFile) {
            const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
            if (state.codexDefaultStatus === 'pending' && state.appliedCodexModel === 'test-response-b') {
              throw Object.assign(new Error('retarget registry write failed'), { code: 'ENOSPC' });
            }
          }
          return existsSync.call(this, file);
        });
        await assert.rejects(connect({ ...options, codexModel: 'test-response-b' }), { code: 'ENOSPC' });
        exists.mock.restore();
        assert.equal(JSON.parse(fs.readFileSync(registryFile, 'utf8')).clientDefaults.codex, 'test-response');
        const pending = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        assert.equal(pending.codexDefaultStatus, 'pending');
        assert.equal(pending.codexDefaultBefore, 'test-response');
        assert.equal(pending.appliedCodexModel, 'test-response-b');
        assert.deepEqual(pending.priorClientDefaults, prior);
        assert.equal(fs.readFileSync(backupFile, 'utf8'), backupBefore);
        if (recovery === 'retry') {
          assert.equal((await connect({ ...options, codexModel: 'test-response-b' })).exitCode, 0);
          assert.equal(JSON.parse(fs.readFileSync(registryFile, 'utf8')).clientDefaults.codex, 'test-response-b');
        } else if (recovery === 'other-client') {
          assert.equal((await connect({ ...options, clients: ['claude'] })).exitCode, 0);
          assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).codexDefaultBefore, 'test-response');
        }
        assert.equal(fs.readFileSync(backupFile, 'utf8'), backupBefore);
        assert.equal((await runDisconnect({ ...options, clients: undefined })).exitCode, 0);
        assert.deepEqual(JSON.parse(fs.readFileSync(registryFile, 'utf8')), original);
        assert.equal(fs.readFileSync(clientFile, 'utf8'), clientBefore);
        for (const file of ['connect-state.json', 'connect-backup.json', 'registry-backup.json']) {
          assert.equal(fs.existsSync(path.join(stateDir, file)), false);
        }
      });
    }
  }

  test(`${mode}: a pending Codex retarget still rejects a genuinely external default`, async (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-retarget-conflict-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const registryFile = path.join(home, 'registry.json');
    const stateDir = path.join(home, 'state');
    const options = { home, registryFile, stateDir, gatewayUrl: GW, clients: ['codex'], codexModel: 'test-response', io: { log() {}, error() {} } };
    const original = readyRegistry({ clientDefaults: { codex: 'original-codex' } });
    fs.writeFileSync(registryFile, JSON.stringify(original));
    const connect = mode === 'inplace' ? runConnectInplace : runConnect;
    await connect(options);
    const stateFile = path.join(stateDir, 'connect-state.json');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    fs.writeFileSync(stateFile, JSON.stringify({ ...state, codexDefaultStatus: 'pending', codexDefaultBefore: 'test-response', appliedCodexModel: 'test-response-b' }));
    const external = { ...original, clientDefaults: { codex: 'external-choice' }, userMetadata: { preserve: true } };
    const externalText = `${JSON.stringify(external)}\n`;
    fs.writeFileSync(registryFile, externalText);
    const stateBefore = fs.readFileSync(stateFile, 'utf8');
    const backupBefore = fs.readFileSync(path.join(stateDir, 'registry-backup.json'), 'utf8');
    await assert.rejects(connect(options), { code: 'REGISTRY_STALE' });
    await assert.rejects(runDisconnect(options), { code: 'REGISTRY_STALE' });
    assert.equal(fs.readFileSync(registryFile, 'utf8'), externalText);
    assert.equal(fs.readFileSync(stateFile, 'utf8'), stateBefore);
    assert.equal(fs.readFileSync(path.join(stateDir, 'registry-backup.json'), 'utf8'), backupBefore);
  });

  test(`${mode}: failure to persist command ownership leaves the registry unchanged`, async (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-command-prewrite-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const registryFile = path.join(home, 'registry.json');
    const original = readyRegistry();
    fs.writeFileSync(registryFile, JSON.stringify(original));
    const options = { home, registryFile, stateDir: path.join(home, 'state'), gatewayUrl: GW, clients: ['codex'], io: { log() {}, error() {} } };
    const connect = mode === 'inplace' ? runConnectInplace : runConnect;
    const writeFileSync = fs.writeFileSync;
    const write = t.mock.method(fs, 'writeFileSync', function (file, ...args) {
      if (String(file).includes('connect-state.json')) throw Object.assign(new Error('ownership disk full'), { code: 'ENOSPC' });
      return writeFileSync.call(this, file, ...args);
    });
    await assert.rejects(connect(options), { code: 'ENOSPC' });
    write.mock.restore();
    assert.deepEqual(JSON.parse(fs.readFileSync(registryFile, 'utf8')), original);
    assert.equal(fs.existsSync(path.join(options.stateDir, 'connect-state.json')), false);
    await runDisconnect(options);
    assert.deepEqual(JSON.parse(fs.readFileSync(registryFile, 'utf8')), original);
    assert.equal(fs.existsSync(path.join(home, '.codex/config.toml')), false);
  });

  test(`${mode}: an interrupted repeated state write preserves the prior recovery record`, async (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-command-repeat-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const registryFile = path.join(home, 'registry.json');
    const original = readyRegistry({ clientDefaults: { codex: 'original-codex' } });
    fs.writeFileSync(registryFile, JSON.stringify(original));
    const options = { home, registryFile, stateDir: path.join(home, 'state'), gatewayUrl: GW, clients: ['codex'], codexModel: 'test-response', io: { log() {}, error() {} } };
    const connect = mode === 'inplace' ? runConnectInplace : runConnect;
    await connect(options);
    const stateFile = path.join(options.stateDir, 'connect-state.json');
    const stateBefore = fs.readFileSync(stateFile, 'utf8');
    const writeFileSync = fs.writeFileSync;
    const write = t.mock.method(fs, 'writeFileSync', function (file, ...args) {
      if (String(file).includes('connect-state.json')) {
        writeFileSync.call(this, file, '{partial');
        throw Object.assign(new Error('state write interrupted'), { code: 'ENOSPC' });
      }
      return writeFileSync.call(this, file, ...args);
    });
    await assert.rejects(connect(options), { code: 'ENOSPC' });
    write.mock.restore();
    assert.equal(fs.readFileSync(stateFile, 'utf8'), stateBefore);
    assert.equal(fs.readdirSync(options.stateDir).some((file) => file.endsWith('.tmp')), false);
    await runDisconnect(options);
    assert.deepEqual(JSON.parse(fs.readFileSync(registryFile, 'utf8')), original);
  });

  test(`${mode}: pending registry recovery preserves an external Codex change`, async (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-command-conflict-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const registryFile = path.join(home, 'registry.json');
    const original = readyRegistry({ clientDefaults: { codex: 'original-codex' } });
    fs.writeFileSync(registryFile, JSON.stringify(original));
    const options = { home, registryFile, stateDir: path.join(home, 'state'), gatewayUrl: GW, clients: ['codex'], codexModel: 'test-response', io: { log() {}, error() {} } };
    const connect = mode === 'inplace' ? runConnectInplace : runConnect;
    const copy = t.mock.method(fs, 'copyFileSync', () => { throw Object.assign(new Error('backup disk full'), { code: 'ENOSPC' }); });
    await assert.rejects(connect(options), { code: 'ENOSPC' });
    copy.mock.restore();
    const edited = { ...original, clientDefaults: { codex: 'external-choice', pi: 'external-pi' }, userMetadata: { preserve: true } };
    const externalText = `${JSON.stringify(edited)}\n`;
    fs.writeFileSync(registryFile, externalText);
    await assert.rejects(connect(options), { code: 'REGISTRY_STALE' });
    await assert.rejects(runDisconnect(options), { code: 'REGISTRY_STALE' });
    assert.equal(fs.readFileSync(registryFile, 'utf8'), externalText);
    assert.equal(fs.existsSync(path.join(options.stateDir, 'connect-state.json')), true);
    fs.writeFileSync(registryFile, JSON.stringify({ ...edited, clientDefaults: { ...edited.clientDefaults, codex: 'original-codex' } }));
    await runDisconnect(options);
    assert.deepEqual(JSON.parse(fs.readFileSync(registryFile, 'utf8')), { ...edited, clientDefaults: { ...edited.clientDefaults, codex: 'original-codex' } });
  });

  test(`${mode}: empty connect rejects before editing existing client files or creating state`, async (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-empty-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const originals = {
      '.claude/settings.json': '{ "env": { "USER_SETTING": "keep" } }\n',
      '.codex/config.toml': 'model_provider = "original"\n',
      '.pi/agent/settings.json': '{ "theme": "dark" }\n',
      '.pi/agent/models.json': '{ "providers": {} }\n',
      'model-registry.json': '{ "models": {}, "providers": {} }\n',
    };
    for (const [relative, text] of Object.entries(originals)) {
      const file = path.join(home, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    const stateDir = path.join(home, 'state');
    const connect = mode === 'inplace' ? runConnectInplace : runConnect;
    const result = await connect({ home, gatewayUrl: GW, stateDir, registryFile: path.join(home, 'model-registry.json'), env: {}, io: { log() {}, error() {} } });
    assert.equal(result.exitCode, 1);
    assert.equal(result.error, 'gateway_not_ready');
    assert.equal(fs.existsSync(stateDir), false);
    for (const [relative, text] of Object.entries(originals)) assert.equal(fs.readFileSync(path.join(home, relative), 'utf8'), text);
  });

  test(`${mode}: repeated connect preserves an intentionally absent prior default`, async (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-repeat-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const registryFile = path.join(home, 'model-registry.json');
    const original = readyRegistry({ extensionMetadata: { keep: true } });
    fs.writeFileSync(registryFile, JSON.stringify(original));
    const options = { home, gatewayUrl: GW, stateDir: path.join(home, 'state'), registryFile, clients: ['codex'], io: { log() {}, error() {} } };
    const connect = mode === 'inplace' ? runConnectInplace : runConnect;
    assert.equal((await connect(options)).exitCode, 0);
    assert.equal((await connect(options)).exitCode, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(options.stateDir, 'connect-state.json'), 'utf8')).priorClientDefaults, null);
    await runDisconnect(options);
    assert.deepEqual(JSON.parse(fs.readFileSync(registryFile, 'utf8')), original);
  });

  test(`${mode}: connecting another client retains Codex restoration ownership and the original prior`, async (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-sequence-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const registryFile = path.join(home, 'model-registry.json');
    const original = readyRegistry({ clientDefaults: { codex: 'original-codex', pi: 'original-pi' } });
    fs.writeFileSync(registryFile, JSON.stringify(original));
    const options = { home, gatewayUrl: GW, stateDir: path.join(home, 'state'), registryFile, codexModel: 'test-response', io: { log() {}, error() {} } };
    const connect = mode === 'inplace' ? runConnectInplace : runConnect;
    assert.equal((await connect({ ...options, clients: ['claude'] })).exitCode, 0);
    assert.equal((await connect({ ...options, clients: ['codex'] })).exitCode, 0);
    assert.equal((await connect({ ...options, clients: ['pi'] })).exitCode, 0);
    const state = JSON.parse(fs.readFileSync(path.join(options.stateDir, 'connect-state.json'), 'utf8'));
    assert.equal(state.codexDefaultApplied, true);
    assert.deepEqual(state.priorClientDefaults, original.clientDefaults);
    await runDisconnect(options);
    assert.deepEqual(JSON.parse(fs.readFileSync(registryFile, 'utf8')), original);
    if (mode === 'isolated') {
      for (const file of ['claude-settings.json', 'codex-home/config.toml', 'pi-home/.pi/agent/models.json']) {
        assert.equal(fs.existsSync(path.join(options.stateDir, file)), false, `sequentially created ${file} is still owned`);
      }
    }
  });

  test(`${mode}: disconnect without a Codex connection preserves later Codex defaults`, async (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-other-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const registryFile = path.join(home, 'model-registry.json');
    fs.writeFileSync(registryFile, JSON.stringify(readyRegistry({ clientDefaults: { codex: 'original' } })));
    const options = { home, gatewayUrl: GW, stateDir: path.join(home, 'state'), registryFile, clients: ['claude'], io: { log() {}, error() {} } };
    assert.equal((await (mode === 'inplace' ? runConnectInplace : runConnect)(options)).exitCode, 0);
    const edited = { models: {}, clientDefaults: { codex: 'later-edit' } };
    fs.writeFileSync(registryFile, JSON.stringify(edited));
    await runDisconnect(options);
    assert.deepEqual(JSON.parse(fs.readFileSync(registryFile, 'utf8')), edited);
  });
}

for (const prior of [null, { codex: 'original-codex', pi: 'original-pi' }]) {
  test(`disconnect recovers legacy in-place state after client backup consumption (${prior ? 'existing' : 'absent'} prior default)`, async (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-recover-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const registryFile = path.join(home, 'model-registry.json');
    const original = readyRegistry({ extensionMetadata: { keep: true }, ...(prior ? { clientDefaults: prior } : {}) });
    fs.writeFileSync(registryFile, JSON.stringify(original));
    const options = { home, gatewayUrl: GW, stateDir: path.join(home, 'state'), registryFile, clients: ['codex'], codexModel: 'test-response', io: { log() {}, error() {} } };
    assert.equal((await runConnectInplace(options)).exitCode, 0);
    const stateFile = path.join(options.stateDir, 'connect-state.json');
    const legacyState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    delete legacyState.codexDefaultApplied;
    fs.writeFileSync(stateFile, JSON.stringify(legacyState));

    // Old disconnects consumed the client backup before attempting the registry lock.
    assert.equal(disconnectInplace(options).disconnected, true);
    assert.equal(fs.existsSync(path.join(options.stateDir, 'connect-backup.json')), false);
    assert.equal(JSON.parse(fs.readFileSync(registryFile, 'utf8')).clientDefaults.codex, 'test-response');
    assert.equal((await runDisconnect(options)).exitCode, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(registryFile, 'utf8')), original);
    assert.equal(fs.existsSync(stateFile), false);
    assert.equal(fs.existsSync(path.join(home, '.codex/config.toml')), false);
  });
}
