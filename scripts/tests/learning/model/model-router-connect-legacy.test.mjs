import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runConnect, runDisconnect } from '../../../lib/tooling/model-router/connect/command.mjs';
import { connectInplace, disconnectInplace } from '../../../lib/tooling/model-router/connect/inplace.mjs';
import { readConnectStatus } from '../../../lib/tooling/model-router/connect/readback.mjs';

const GW = 'http://127.0.0.1:8686', json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const hash = (text) => createHash('sha256').update(text).digest('hex');
const BEGIN = '# aios-gateway:begin (managed by `aios model-router connect`; remove via disconnect)', END = '# aios-gateway:end';
// Literal pre-target fixtures, including their original field order and backup shapes.
const provider = (id) => ({ api: 'anthropic-messages', baseUrl: GW, apiKey: 'aios-gateway', models: [{ id, name: 'AIOS Gateway', api: 'anthropic-messages', contextWindow: 200000, maxTokens: 8192, input: ['text'], reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] });
const block = [BEGIN, '[model_providers.aios-gateway]', 'name = "aios-gateway"', `base_url = "${GW}/v1"`, 'wire_api = "responses"', 'experimental_bearer_token = "aios-gateway"', 'requires_openai_auth = false', '', '[model_providers.aios-gateway.http_headers]', 'x-gateway-client = "codex"', END].join('\n');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-legacy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), stateDir = path.join(root, 'state');
  fs.mkdirSync(stateDir);
  return { root, home, stateDir, gatewayUrl: GW };
}
function legacyInplace(t, fingerprints) {
  const f = fixture(t), id = 'group:x';
  const rows = [
    { client: 'claude', role: 'main', rel: '.claude/settings.json', original: { model: 'native-claude', env: { ANTHROPIC_BASE_URL: 'https://native.invalid', ANTHROPIC_AUTH_TOKEN: 'private-original', ANTHROPIC_CUSTOM_HEADERS: 'custom: keep', ANTHROPIC_MODEL: 'native-env', OTHER: 'keep' }, availableModels: ['native-claude'] }, backup: { hadEnv: true, baseUrl: 'https://native.invalid', authToken: 'private-original' } },
    { client: 'codex', role: 'main', rel: '.codex/config.toml', original: '# native\nmodel = "native-codex"\nmodel_provider = "native"\nmodel_catalog_json = "/fixture/catalog.json"\n', backup: { modelProvider: '"native"', priorBlock: null } },
    { client: 'pi', role: 'settings', rel: '.pi/agent/settings.json', original: { defaultProvider: 'native', defaultModel: 'native-pi', theme: 'dark' }, backup: { defaultProvider: 'native', defaultModel: 'native-pi' } },
    { client: 'pi', role: 'models', rel: '.pi/agent/models.json', original: { providers: { native: { apiKey: 'private-native', models: [] } } }, backup: { hadProviders: true, provider: null } },
  ];
  const entries = rows.map((row) => {
    const file = path.join(f.home, row.rel);
    let value, managed;
    if (row.client === 'claude') {
      value = { ...row.original, env: { ...row.original.env, ANTHROPIC_BASE_URL: GW, ANTHROPIC_AUTH_TOKEN: 'aios-gateway' } };
      managed = { baseUrl: GW, authToken: 'aios-gateway' };
    } else if (row.client === 'codex') {
      value = row.original.replace('model_provider = "native"', 'model_provider = "aios-gateway"').trimEnd() + `\n\n${block}\n`;
      managed = { modelProvider: '"aios-gateway"', priorBlock: block };
    } else if (row.role === 'settings') {
      value = { ...row.original, defaultProvider: 'aios-gateway', defaultModel: `aios-gateway/${id}` };
      managed = { defaultProvider: 'aios-gateway', defaultModel: `aios-gateway/${id}` };
    } else {
      value = { providers: { ...row.original.providers, 'aios-gateway': provider(id) } };
      managed = { provider: provider(id) };
    }
    const text = typeof value === 'string' ? value : json(value);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return { client: row.client, role: row.role, file, existed: true, backup: row.backup,
      ...(fingerprints ? { applied: { existed: true, hash: hash(text), managed: hash(JSON.stringify(managed)) } } : {}) };
  });
  fs.writeFileSync(path.join(f.stateDir, 'connect-backup.json'), json({ schemaVersion: fingerprints ? 2 : 1, gatewayUrl: GW, modelId: id, entries }));
  return { ...f, rows };
}

for (const fingerprints of [false, true]) {
  test(`genuine legacy ${fingerprints ? 'fingerprints' : 'reconstruction'}: upgrade validates old shapes before capturing new owned fields`, (t) => {
    const f = legacyInplace(t, fingerprints);
    assert.deepEqual(readConnectStatus(f).clients.map((item) => item.ownership.status), ['owned', 'owned', 'owned']);
    assert.equal(readConnectStatus(f).clients[2].defaultTarget, 'model:group%3Ax');
    connectInplace({ ...f, target: 'group:team%2Fone' });
    const upgraded = JSON.parse(fs.readFileSync(path.join(f.stateDir, 'connect-backup.json'), 'utf8'));
    assert.equal(upgraded.targetRefVersion, 1);
    assert.equal(upgraded.entries[0].backup.model, 'native-claude');
    assert.equal(upgraded.entries[0].backup.modelEnv.ANTHROPIC_MODEL, 'native-env');
    assert.equal(upgraded.entries[1].backup.model, '"native-codex"');
    assert.equal(upgraded.entries[1].backup.priorBlock, null);
    disconnectInplace(f);
    for (const row of f.rows) {
      const actual = fs.readFileSync(path.join(f.home, row.rel), 'utf8');
      if (typeof row.original === 'string') assert.equal(actual, row.original);
      else assert.deepEqual(JSON.parse(actual), row.original);
    }
  });

  test(`genuine legacy ${fingerprints ? 'fingerprints' : 'reconstruction'}: managed edits fail closed and preserve the journal`, (t) => {
    const f = legacyInplace(t, fingerprints), file = path.join(f.home, '.claude/settings.json');
    const edited = JSON.parse(fs.readFileSync(file, 'utf8'));
    edited.env.ANTHROPIC_BASE_URL = 'https://external.invalid';
    fs.writeFileSync(file, json(edited));
    const backupFile = path.join(f.stateDir, 'connect-backup.json'), before = fs.readFileSync(backupFile, 'utf8');
    assert.throws(() => connectInplace(f), { code: 'CLIENT_CONFIG_STALE' });
    assert.throws(() => disconnectInplace(f), { code: 'CLIENT_CONFIG_STALE' });
    assert.equal(fs.readFileSync(backupFile, 'utf8'), before);
  });
}

test('exact legacy isolated artifacts remain owned across partial upgrades; an extra byte is never claimed', async (t) => {
  for (const scenario of ['disconnect', 'tamper', 'partial-upgrade']) {
    const f = fixture(t), id = 'auto';
    const pi = provider(id);
    const artifacts = {
      'claude-settings.json': json({ env: { ANTHROPIC_BASE_URL: GW, ANTHROPIC_AUTH_TOKEN: 'aios-gateway' } }),
      'codex-home/config.toml': `model_provider = "aios-gateway"\nmodel = "group:x"\n\n[model_providers.aios-gateway]\nname = "aios-gateway"\nwire_api = "responses"\nbase_url = "${GW}/v1"\nenv_key = "OPENAI_API_KEY"\nrequires_openai_auth = false\n\n[model_providers.aios-gateway.http_headers]\nx-gateway-client = "codex"\n`,
      'pi-home/.pi/agent/models.json': json({ providers: { 'aios-gateway': { api: pi.api, apiKey: pi.apiKey, baseUrl: GW, models: pi.models } } }),
    };
    for (const [rel, text] of Object.entries(artifacts)) {
      const file = path.join(f.stateDir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    const stateFile = path.join(f.stateDir, 'connect-state.json');
    fs.writeFileSync(stateFile, json({ mode: 'isolated', clients: ['claude', 'codex', 'pi'], gatewayUrl: GW, codexModel: 'group:x', piModel: 'auto', codexDefaultApplied: false }));
    const status = readConnectStatus(f);
    assert.equal(status.clients[1].defaultTarget, 'model:group%3Ax');
    assert.equal(status.clients[2].defaultTarget, 'model:auto');
    assert.deepEqual(status.clients.map((item) => item.ownership.status), ['owned', 'owned', 'owned']);
    if (scenario === 'tamper') {
      fs.appendFileSync(path.join(f.stateDir, 'codex-home/config.toml'), '\n');
      await assert.rejects(runDisconnect({ ...f, io: { log() {} } }), { code: 'CLIENT_CONFIG_STALE' });
      assert.equal(fs.existsSync(path.join(f.stateDir, 'claude-settings.json')), true);
      assert.equal(fs.existsSync(stateFile), true);
    } else {
      if (scenario === 'partial-upgrade') {
        const baseRegistry = { activeModel: 'ready', models: { ready: { source: 'custom', provider: 'p', protocols: ['claude'] } }, providers: { p: { baseUrl: 'https://unused.invalid', authMode: 'none', protocols: ['claude'] } } };
        assert.equal((await runConnect({ ...f, clients: ['claude'], baseRegistry, target: 'auto', io: { log() {}, error() {} }, env: {} })).exitCode, 0);
        const after = readConnectStatus(f);
        assert.deepEqual(after.clients.map((item) => item.ownership.status), ['owned', 'owned', 'owned']);
        assert.equal(after.clients[1].defaultTarget, 'model:group%3Ax');
        assert.equal(after.clients[2].defaultTarget, 'model:auto');
        assert.match(after.clients[2].launch, /--model 'auto'$/u);
        assert.match(fs.readFileSync(path.join(f.stateDir, 'connect.sh'), 'utf8'), /--model.*auto/u);
      }
      assert.equal((await runDisconnect({ ...f, io: { log() {} } })).exitCode, 0);
      for (const rel of Object.keys(artifacts)) assert.equal(fs.existsSync(path.join(f.stateDir, rel)), false);
    }
  }
});

test('partial legacy upgrade preserves the unselected Pi literal target and original gateway context', (t) => {
  const f = legacyInplace(t, false);
  connectInplace({ ...f, gatewayUrl: 'http://127.0.0.1:9999', clients: ['claude'], target: 'auto' });
  const status = readConnectStatus(f);
  assert.equal(status.clients[2].defaultTarget, 'model:group%3Ax');
  assert.equal(status.clients[2].ownership.status, 'owned');
  disconnectInplace(f);
  for (const row of f.rows.filter((row) => row.client === 'pi')) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.home, row.rel), 'utf8')), row.original);
});

test('unversioned entry refs retain literal meaning when a different in-place client upgrades the journal', (t) => {
  const f = legacyInplace(t, false), file = path.join(f.stateDir, 'connect-backup.json');
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  backup.targets = { pi: 'group:x', codex: 'auto' };
  for (const entry of backup.entries) if (backup.targets[entry.client]) entry.target = backup.targets[entry.client];
  fs.writeFileSync(file, json(backup));
  assert.deepEqual(readConnectStatus(f).clients.map((item) => item.ownership.status), ['owned', 'owned', 'owned']);
  connectInplace({ ...f, clients: ['claude'], target: 'auto' });
  const status = readConnectStatus(f);
  assert.deepEqual(status.clients.map((item) => item.ownership.status), ['owned', 'owned', 'owned']);
  assert.equal(status.clients[1].defaultTarget, 'model:auto');
  assert.equal(status.clients[2].defaultTarget, 'model:group%3Ax');
  disconnectInplace(f);
  for (const row of f.rows) {
    const actual = fs.readFileSync(path.join(f.home, row.rel), 'utf8');
    if (typeof row.original === 'string') assert.equal(actual, row.original);
    else assert.deepEqual(JSON.parse(actual), row.original);
  }
});
