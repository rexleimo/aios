// 一键 demo 脚本的聚焦契约：参数解析 + 安装幂等。
// 不启动 server（runUi 会 spawn 真实 next），只验证脚本自己的决策逻辑。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DEMO_PLUGIN_DIR, DEMO_PLUGIN_ID, ensureDemoPlugin, parseDemoArgv } from '../../../aios-plugin-demo.mjs';

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-plugin-demo-'));
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  return root;
}

test('parseDemoArgv reads --port and rejects unknown options', () => {
  assert.deepEqual(parseDemoArgv(['--port', '3131']), { port: '3131' });
  assert.deepEqual(parseDemoArgv([]), {});
  assert.throws(() => parseDemoArgv(['--port']), /requires a value/);
  assert.throws(() => parseDemoArgv(['--bogus']), /unknown option/);
});

test('ensureDemoPlugin is a no-op when the plugin is already installed and enabled', (t) => {
  const root = tempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, 'config', 'plugins.json'),
    JSON.stringify({
      schemaVersion: 1,
      plugins: [{ id: DEMO_PLUGIN_ID, manifest: DEMO_PLUGIN_DIR, enabled: true }],
    }),
  );
  const result = ensureDemoPlugin({ rootDir: root });
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
});

test('ensureDemoPlugin installs from scratch and enables a disabled plugin', (t) => {
  const root = tempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const installed = ensureDemoPlugin({ rootDir: root });
  assert.equal(installed.ok, true);
  assert.equal(installed.changed, true);
  let doc = JSON.parse(fs.readFileSync(path.join(root, 'config', 'plugins.json'), 'utf8'));
  assert.deepEqual(doc.plugins, [{ id: DEMO_PLUGIN_ID, manifest: DEMO_PLUGIN_DIR, enabled: true }]);

  doc.plugins[0].enabled = false;
  fs.writeFileSync(path.join(root, 'config', 'plugins.json'), JSON.stringify(doc));
  const reenabled = ensureDemoPlugin({ rootDir: root });
  assert.equal(reenabled.ok, true);
  assert.equal(reenabled.changed, true);
  doc = JSON.parse(fs.readFileSync(path.join(root, 'config', 'plugins.json'), 'utf8'));
  assert.equal(doc.plugins[0].enabled, true);
});
