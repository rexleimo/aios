import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { connectInplace, disconnectInplace } from '../../../lib/tooling/model-router/connect/inplace.mjs';
import { readConnectStatus } from '../../../lib/tooling/model-router/connect/readback.mjs';
import { describeConnect, gatewayStatus } from '../../../lib/tooling/model-router/lifecycle/daemon.mjs';

const GW = 'http://127.0.0.1:8686';
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-readback-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), stateDir = path.join(root, 'state');
  const files = { claude: path.join(home, '.claude/settings.json'), codex: path.join(home, '.codex/config.toml'), settings: path.join(home, '.pi/agent/settings.json'), models: path.join(home, '.pi/agent/models.json') };
  const write = (name, text) => { fs.mkdirSync(path.dirname(files[name]), { recursive: true }); fs.writeFileSync(files[name], text); };
  return { home, stateDir, gatewayUrl: GW, files, write, clients: ['claude', 'codex', 'pi'] };
}
const client = (status, name) => status.clients.find((item) => item.client === name);

test('parsed files, not a recovery journal, establish connection; daemon shares the readback contract', async (t) => {
  const f = fixture(t);
  const absent = readConnectStatus(f);
  assert.equal(absent.connected, false);
  assert.deepEqual(absent.clients.map((item) => item.readback.status), ['missing', 'missing', 'missing']);
  connectInplace(f);
  assert.deepEqual(describeConnect(f.stateDir, fs, { home: f.home, clients: f.clients }), readConnectStatus(f));
  const daemon = await gatewayStatus({ ...f, probeImpl: async () => false, killImpl() { throw Object.assign(new Error(), { code: 'ESRCH' }); } });
  assert.deepEqual(daemon.clients, readConnectStatus(f).clients);
  assert.equal(daemon.connected, true);
  for (const item of daemon.clients) assert.equal(item.launch, item.client);
  const backupFile = path.join(f.stateDir, 'connect-backup.json'), backup = fs.readFileSync(backupFile, 'utf8');
  fs.rmSync(backupFile);
  const unowned = readConnectStatus(f);
  assert.equal(unowned.connected, true);
  for (const item of unowned.clients) {
    assert.equal(item.connected, true);
    assert.equal(item.target, 'auto');
    assert.equal(item.defaultTarget, null);
    assert.equal(item.ownership.status, 'unowned');
    assert.equal(item.recovery.status, 'none');
  }
  fs.writeFileSync(backupFile, backup);
  for (const file of Object.values(f.files)) fs.rmSync(file);
  const journalOnly = readConnectStatus(f);
  assert.equal(journalOnly.connected, false);
  for (const item of journalOnly.clients) {
    assert.equal(item.readback.status, 'missing');
    assert.equal(item.recovery.status, 'available');
    assert.equal(item.ownership.status, 'owned', 'a missing originally absent config still matches its journaled pre-write state');
  }
});

test('readback fails independently by client and Pi file, without leaking secrets or backup values', (t) => {
  const f = fixture(t), secret = 'SENTINEL_DO_NOT_EXPOSE';
  f.write('claude', json({ model: `${secret}_model`, env: { ANTHROPIC_AUTH_TOKEN: `${secret}_token`, ANTHROPIC_CUSTOM_HEADERS: `authorization: ${secret}`, OTHER_SECRET: secret } }));
  f.write('codex', `model_catalog_json = ${JSON.stringify(`${secret}_catalog`)}\n`);
  f.write('models', json({ providers: { native: { apiKey: secret } } }));
  connectInplace({ ...f, gatewayUrl: `http://user:${secret}@127.0.0.1:8686` });
  const status = readConnectStatus(f);
  assert.equal(status.connected, true);
  assert.equal(status.gatewayUrl, GW);
  assert.doesNotMatch(JSON.stringify(status), /SENTINEL|authorization|ANTHROPIC_AUTH_TOKEN|priorBlock|apiKey|customHeaders/u);
  f.write('claude', '{ invalid JSON');
  const unreadable = { ...fs, readFileSync(file, ...args) {
    if (file === f.files.settings) throw Object.assign(new Error(secret), { code: 'EACCES' });
    return fs.readFileSync(file, ...args);
  } };
  const result = readConnectStatus({ ...f, fsImpl: unreadable });
  assert.equal(client(result, 'claude').readback.status, 'malformed');
  assert.equal(client(result, 'codex').connected, true);
  assert.equal(client(result, 'pi').readback.status, 'unreadable');
  assert.deepEqual(client(result, 'pi').readback.files, [{ role: 'settings', status: 'unreadable' }, { role: 'models', status: 'ok' }]);
  assert.doesNotMatch(JSON.stringify(result), /SENTINEL|invalid JSON/u);
  fs.rmSync(f.files.settings);
  assert.equal(client(readConnectStatus(f), 'pi').readback.status, 'partial');
});

test('configuration drift remains separate from an observed working connection and blocks mutation', (t) => {
  const f = fixture(t);
  connectInplace(f);
  const doc = JSON.parse(fs.readFileSync(f.files.claude, 'utf8'));
  doc.env.ANTHROPIC_MODEL = 'aios/group/team%2Fone';
  doc.env.ANTHROPIC_BASE_URL += '?secret=redact#redact';
  f.write('claude', json(doc));
  const current = client(readConnectStatus(f), 'claude');
  assert.equal(current.connected, true);
  assert.equal(current.target, 'group:team%2Fone');
  assert.equal(current.defaultTarget, 'auto');
  assert.equal(current.readback.status, 'drift');
  assert.equal(current.readback.baseUrl, `${GW}/clients/claude`);
  assert.equal(current.ownership.status, 'drift');
  assert.equal(current.recovery.status, 'available');
  assert.throws(() => disconnectInplace({ ...f, clients: ['claude'] }), { code: 'CLIENT_CONFIG_STALE' });
});

test('malformed journals do not suppress valid per-client readback', (t) => {
  const f = fixture(t);
  connectInplace(f);
  fs.writeFileSync(path.join(f.stateDir, 'connect-backup.json'), json({ entries: [null], secret: 'NO_BACKUP_LEAK' }));
  fs.writeFileSync(path.join(f.stateDir, 'connect-state.json'), '{ broken');
  const status = readConnectStatus(f);
  assert.equal(status.connected, true);
  for (const item of status.clients) {
    assert.equal(item.connected, true);
    assert.equal(item.ownership.status, 'unknown');
    assert.equal(item.recovery.status, 'unknown');
  }
  assert.doesNotMatch(JSON.stringify(status), /NO_BACKUP_LEAK|broken/u);
  for (const file of Object.values(f.files)) fs.rmSync(file);
  for (const item of readConnectStatus(f).clients) {
    assert.equal(item.readback.status, 'missing', 'journal errors do not replace independently observed config facts');
    assert.equal(item.ownership.status, 'unknown');
    assert.equal(item.recovery.status, 'unknown');
  }
});

test('client identity, path and selection must all agree; raw incoming placeholders remain compatible', (t) => {
  const f = fixture(t);
  connectInplace(f);
  for (const name of ['claude', 'codex', 'pi']) assert.equal(client(readConnectStatus(f), name).readback.identity, 'verified');
  const doc = JSON.parse(fs.readFileSync(f.files.claude, 'utf8'));
  for (const model of ['gateway-default', 'group:raw-placeholder', 'auto']) {
    doc.env.ANTHROPIC_MODEL = model;
    f.write('claude', json(doc));
    assert.equal(client(readConnectStatus(f), 'claude').target, 'auto');
    assert.equal(client(readConnectStatus(f), 'claude').connected, true);
  }
  doc.env.ANTHROPIC_MODEL = 'aios/model/%ZZ';
  f.write('claude', json(doc));
  assert.equal(client(readConnectStatus(f), 'claude').connected, false);
  doc.env.ANTHROPIC_MODEL = 'aios-auto';
  doc.env.ANTHROPIC_CUSTOM_HEADERS = 'x-gateway-client: codex';
  f.write('claude', json(doc));
  assert.equal(client(readConnectStatus(f), 'claude').connected, false);
  doc.env.ANTHROPIC_CUSTOM_HEADERS = 'x-gateway-client: claude';
  doc.env.ANTHROPIC_CUSTOM_HEADERS += '\nx-gateway-client: codex';
  f.write('claude', json(doc));
  assert.equal(client(readConnectStatus(f), 'claude').connected, false, 'conflicting identity headers cannot verify a client');
  doc.env.ANTHROPIC_CUSTOM_HEADERS = 'x-gateway-client: claude';
  doc.env.ANTHROPIC_BASE_URL = GW;
  f.write('claude', json(doc));
  assert.equal(client(readConnectStatus(f), 'claude').connected, false);
  doc.env.ANTHROPIC_BASE_URL = `${GW}/clients/claude`;
  doc.env.ANTHROPIC_CUSTOM_HEADERS = {};
  f.write('claude', json(doc));
  assert.equal(client(readConnectStatus(f), 'claude').readback.status, 'malformed');
  const settings = JSON.parse(fs.readFileSync(f.files.settings, 'utf8'));
  settings.defaultModel = 'aios/model/not-in-catalog';
  f.write('settings', json(settings));
  assert.equal(client(readConnectStatus(f), 'pi').readback.status, 'partial');
});

test('Codex readback rejects malformed TOML and returns unknown for unsupported syntax', (t) => {
  const f = fixture(t);
  connectInplace(f);
  const valid = fs.readFileSync(f.files.codex, 'utf8');
  for (const addition of ['\n[model_providers.aios-gateway]\n', '\nmissing_equals\n', '\nunterminated = "string\n', '\n[model_providers.aios-gateway.http_headers.x-gateway-client]\n', "\ninvalid_literal = 'one' 'two'\n"]) {
    f.write('codex', valid + addition);
    assert.equal(client(readConnectStatus(f), 'codex').readback.status, 'malformed');
    assert.equal(client(readConnectStatus(f), 'pi').connected, true);
  }
  for (const addition of ['\nother = [1, 2]\n', '\n[[array_table]]\nvalue = true\n', '\nvalue = """multiline"""\n', '\n["literal.dot"]\n', '\nvalue = 2026-01-01\n', '\nvalue = 0x10\n', '\nvalue = nan\n', '\nvalue = 01\n']) {
    f.write('codex', valid + addition);
    const result = client(readConnectStatus(f), 'codex');
    assert.equal(result.readback.status, 'unknown');
    assert.equal(result.connected, false);
  }
});
