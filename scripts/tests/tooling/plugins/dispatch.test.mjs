import assert from 'node:assert/strict';
import test from 'node:test';

import { dispatchContributions } from '../../../lib/clients/plugins/core/dispatch.mjs';
import { normalizePluginManifest } from '../../../lib/clients/plugins/core/manifest.mjs';

test('core: 七类 contributions 一次性分派', () => {
  const manifest = normalizePluginManifest({
    schemaVersion: 1, id: 'p', version: '1.0.0',
    contributes: {
      panels: [{ id: 'x', href: '/x', label: 'X' }],
      integrations: [],
      providers: [{ id: 'pr', entry: 'p/provider.mjs' }],
      actions: [{ id: 'a' }],
      middleware: [{ source: 'function onRequest(b){return b;}' }],
      clients: [{ id: 'claude', mode: 'inplace' }],
      onUsage: [{}],
    },
  });
  const out = dispatchContributions({ manifests: [{ id: 'p', manifest }] });
  assert.ok(out.panelViews['plugin:x']);
  assert.equal(out.providerSources.length, 1);
  assert.equal(out.actions.length, 1);
  assert.equal(out.middlewareHooks.length, 1);
  assert.equal(out.clientKinds.length, 1);
  assert.deepEqual(out.usageCollectors, ['p']);
});

test('core: integration 硬门由外层注入，缺 sha256 记 error 而非抛出', () => {
  const manifest = normalizePluginManifest({
    schemaVersion: 1, id: 'p', version: '1.0.0',
    contributes: { integrations: [{ id: 'v', sha256: 'short' }, { id: 'ok', sha256: 'b'.repeat(64) }] },
  });
  const validateIntegration = (id, raw) => {
    if (!/^[0-9a-f]{64}$/u.test(String(raw.sha256))) throw new Error('bad sha256');
    return { id, ok: true };
  };
  const out = dispatchContributions({ manifests: [{ id: 'p', manifest }], adapters: { validateIntegration } });
  assert.equal(out.integrationIntents.length, 1);
  assert.equal(out.integrationIntents[0].source, 'p', '来源独立记录，不污染条目');
  assert.equal(out.integrationIntents[0].normalized.ok, true);
  assert.equal(out.integrationErrors.length, 1);
});

test('core: 禁用插件被跳过；坏插件记录 failed 不拖垮其他', () => {
  const m1 = normalizePluginManifest({ schemaVersion: 1, id: 'a', version: '1.0.0', contributes: { panels: [{ id: 'x', href: '/x' }] } });
  const out = dispatchContributions({ manifests: [{ id: 'a', manifest: m1 }], enabledIds: new Set() });
  assert.equal(out.panelViews['plugin:x'], undefined);
  assert.deepEqual(out.loaded, []);
});

test('core: manifest 缺字段沿单一事实源校验', () => {
  assert.throws(() => normalizePluginManifest({ schemaVersion: 1, id: '', version: '1.0.0' }), /id/u);
});
