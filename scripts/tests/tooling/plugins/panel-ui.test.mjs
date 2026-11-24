import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { normalizePluginManifest } from '../../../lib/clients/plugins/core/manifest.mjs';
import { computePluginViews, writePluginViewsFile } from '../../../lib/clients/plugins/adapters/panel.mjs';
import { runPluginCommand } from '../../../lib/clients/plugins/cli.mjs';

const UI_HTML = '<!doctype html><html><body><button id="count">0</button><script>document.querySelector("#count").onclick = () => document.querySelector("#count").textContent = "1";</script></body></html>';

async function fixture(t, { ui, enabled = true, html = UI_HTML, registered = true } = {}) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-plugin-ui-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const pluginDir = path.join(rootDir, 'plugins', 'demo');
  await mkdir(pluginDir, { recursive: true });
  await mkdir(path.join(rootDir, 'config'), { recursive: true });
  const panel = { id: 'demo', href: '/demo', label: 'Demo', title: 'Demo' };
  if (ui !== undefined) panel.ui = ui;
  await writeFile(path.join(pluginDir, 'manifest.json'), JSON.stringify({
    schemaVersion: 1,
    id: 'demo-plugin',
    version: '1.0.0',
    contributes: { panels: [panel] },
  }));
  await writeFile(path.join(rootDir, 'config', 'plugins.json'), JSON.stringify({
    schemaVersion: 1,
    plugins: registered ? [{ id: 'demo-plugin', manifest: 'plugins/demo', enabled }] : [],
  }));
  if (html !== null) await writeFile(path.join(pluginDir, 'panel.html'), html);
  return { rootDir, pluginDir };
}

test('manifest accepts an optional HTML UI entry without changing legacy panels', () => {
  const withUi = normalizePluginManifest({
    schemaVersion: 1,
    id: 'demo-plugin',
    version: '1.0.0',
    contributes: { panels: [{ id: 'demo', href: '/demo', ui: { entry: 'panel.html' } }] },
  });
  assert.deepEqual(withUi.contributes.panels[0].ui, { entry: 'panel.html' });

  const legacy = normalizePluginManifest({
    schemaVersion: 1,
    id: 'demo-plugin',
    version: '1.0.0',
    contributes: { panels: [{ id: 'demo', href: '/demo' }] },
  });
  assert.equal(Object.hasOwn(legacy.contributes.panels[0], 'ui'), false);
});

test('computePluginViews projects the real HTML UI into the console view contract', async t => {
  const { rootDir } = await fixture(t, { ui: { entry: 'panel.html' } });
  const result = computePluginViews({ rootDir });
  assert.equal(result.views.length, 1);
  assert.deepEqual(result.views[0].ui, { kind: 'html', html: UI_HTML });
  assert.deepEqual(result.failed, []);
});

test('writePluginViewsFile persists UI HTML for the UI single source of truth', async t => {
  const { rootDir } = await fixture(t, { ui: { entry: 'panel.html' } });
  const written = writePluginViewsFile({ rootDir });
  assert.equal(written.count, 1);
  const doc = JSON.parse(await readFile(written.filePath, 'utf8'));
  assert.equal(doc.views[0].ui.html, UI_HTML);
});

test('a missing UI file becomes a visible panel error instead of disappearing', async t => {
  const { rootDir } = await fixture(t, { ui: { entry: 'panel.html' }, html: null });
  const result = computePluginViews({ rootDir });
  assert.equal(result.views.length, 1);
  assert.equal(result.views[0].ui.kind, 'html');
  assert.match(result.views[0].ui.error, /panel\.html/u);
  assert.equal(Object.hasOwn(result.views[0].ui, 'html'), false);
});

test('a non-HTML UI entry becomes a visible panel error', async t => {
  const { rootDir, pluginDir } = await fixture(t, { ui: { entry: 'panel.txt' } });
  await writeFile(path.join(pluginDir, 'panel.txt'), '<h1>not html</h1>');
  const result = computePluginViews({ rootDir });
  assert.match(result.views[0].ui.error, /\.html/u);
  assert.equal(Object.hasOwn(result.views[0].ui, 'html'), false);
});

test('an oversized UI file is rejected before it is projected as HTML', async t => {
  const { rootDir } = await fixture(t, { ui: { entry: 'panel.html' }, html: 'x'.repeat(256 * 1024 + 1) });
  const result = computePluginViews({ rootDir });
  assert.match(result.views[0].ui.error, /256 KiB/u);
  assert.equal(Object.hasOwn(result.views[0].ui, 'html'), false);
});

test('a UI entry cannot escape the plugin directory', async t => {
  const { rootDir } = await fixture(t, { ui: { entry: '../outside.html' } });
  await writeFile(path.join(rootDir, 'plugins', 'outside.html'), '<h1>outside</h1>');
  const result = computePluginViews({ rootDir });
  assert.equal(result.views.length, 1);
  assert.match(result.views[0].ui.error, /outside|escape|path/u);
  assert.equal(Object.hasOwn(result.views[0].ui, 'html'), false);
});

test('a UI entry cannot escape through a symlink or Windows junction', async t => {
  const { rootDir, pluginDir } = await fixture(t, { ui: { entry: 'linked/panel.html' } });
  const outsideDir = path.join(rootDir, 'outside');
  await mkdir(outsideDir, { recursive: true });
  await writeFile(path.join(outsideDir, 'panel.html'), '<h1>outside</h1>');
  await symlink(outsideDir, path.join(pluginDir, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = computePluginViews({ rootDir });
  assert.equal(result.views.length, 1);
  assert.match(result.views[0].ui.error, /outside|escape|path/u);
  assert.equal(Object.hasOwn(result.views[0].ui, 'html'), false);
});

test('legacy panels keep the existing fallback contract and disabled plugins stay absent', async t => {
  const { rootDir } = await fixture(t, {});
  const legacy = computePluginViews({ rootDir });
  assert.equal(Object.hasOwn(legacy.views[0], 'ui'), false);

  const disabled = await fixture(t, { ui: { entry: 'panel.html' }, enabled: false });
  assert.deepEqual(computePluginViews({ rootDir: disabled.rootDir }).views, []);
});

test('CLI install, disable, enable and remove drive the real plugin UI projection', async t => {
  const { rootDir } = await fixture(t, { ui: { entry: 'panel.html' }, registered: false });
  const context = { projectRoot: rootDir, stdout: { write() {} } };
  const run = options => runPluginCommand(options, context);

  assert.equal((await run({ action: 'install', id: 'demo-plugin', dir: 'plugins/demo', json: true })).exitCode, 0);
  assert.equal(computePluginViews({ rootDir }).views[0].ui.html, UI_HTML);

  assert.equal((await run({ action: 'disable', id: 'demo-plugin', json: true })).exitCode, 0);
  assert.deepEqual(computePluginViews({ rootDir }).views, []);

  assert.equal((await run({ action: 'enable', id: 'demo-plugin', json: true })).exitCode, 0);
  assert.equal(computePluginViews({ rootDir }).views.length, 1);

  assert.equal((await run({ action: 'remove', id: 'demo-plugin', json: true })).exitCode, 0);
  assert.deepEqual(computePluginViews({ rootDir }).views, []);
});
