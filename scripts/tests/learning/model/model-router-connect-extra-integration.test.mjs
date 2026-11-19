import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runConnectInplace, runDisconnect } from '../../../lib/tooling/model-router/connect/command.mjs';
import { describeConnect } from '../../../lib/tooling/model-router/lifecycle/daemon.mjs';

const GW = 'http://127.0.0.1:8686';
const io = { log() {}, error() {} };

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-connect-extra-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), stateDir = path.join(root, 'state'), registryFile = path.join(root, 'registry.json');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(registryFile, JSON.stringify({
    targetRefVersion: 1, activeModel: 'm',
    providers: { p: { baseUrl: 'https://unused.invalid', authMode: 'none', protocols: ['claude'] } },
    models: { m: { source: 'custom', provider: 'p', protocols: ['claude'], upstreamModel: 'm' } },
  }, null, 2));
  return { root, home, stateDir, registryFile, gatewayUrl: GW, io, env: {} };
}

// 每个新客户端：连接 → 配置落盘 → status 显示已接入 → 断开 → 还原。
for (const [client, rel, assertConnected] of [
  ['opencode', '.config/opencode/opencode.json', (doc) => assert.equal(doc.provider.aios.options.baseURL, `${GW}/v1`)],
  ['gemini', '.gemini/settings.json', (doc) => assert.equal(doc.env.GOOGLE_GEMINI_BASE_URL, GW)],
  ['zcode', '.zcode/v2/config.json', (doc) => assert.equal(doc.provider.aios.options.baseURL, GW)],
  ['qoder', '.qoder/settings.json', (doc) => assert.equal(doc.providers.aios.baseUrl, `${GW}/v1`)],
  ['hermes', '.hermes/config.yaml', (text) => assert.match(text, /base_url: "?http:\/\/127\.0\.0\.1:8686\/v1"?/u)],
  ['grok', '.grok/config.toml', (text) => assert.match(text, /base_url = "http:\/\/127\.0\.0\.1:8686\/v1"/u)],
  ['workbuddy', '.workbuddy/models.json', (doc) => assert.ok(doc.some?.((item) => item.vendor === 'aios') || doc.models?.some((item) => item.vendor === 'aios'))],
]) {
  test(`in-place connect/disconnect round-trip: ${client}`, async (t) => {
    const f = fixture(t);
    const before = fs.existsSync(path.join(f.home, rel)) ? fs.readFileSync(path.join(f.home, rel), 'utf8') : null;
    const connected = await runConnectInplace({ ...f, clients: [client] });
    assert.equal(connected.exitCode, 0, JSON.stringify(connected));
    const written = fs.readFileSync(path.join(f.home, rel), 'utf8');
    const parsed = rel.endsWith('.json') ? JSON.parse(written) : written;
    assertConnected(parsed);

    const status = describeConnect(f.stateDir, fs, { home: f.home, clients: [client] });
    assert.equal(status.connected, true, JSON.stringify(status.clients));
    assert.equal(status.clients[0].connected, true);

    const disc = await runDisconnect({ ...f, clients: [client] });
    assert.equal(disc.exitCode, 0, JSON.stringify(disc));
    if (before === null) assert.equal(fs.existsSync(path.join(f.home, rel)), false, 'created config removed on disconnect');
    else assert.equal(fs.readFileSync(path.join(f.home, rel), 'utf8'), before, 'original config restored byte-for-byte');
  });
}
