// P0 RED 测试：插件 manifest 校验契约（A1）。
// 测试先于实现；当前 manifest.mjs 不存在 → 导入失败 → 真实 RED。
import assert from 'node:assert/strict';
import test from 'node:test';

import { PluginManifestError, normalizePluginManifest } from '../../../lib/clients/plugins/core/manifest.mjs';

const MINIMAL = {
  schemaVersion: 1,
  id: 'demo-plugin',
  version: '1.0.0',
  contributes: { panels: [{ id: 'demo', href: '/demo', label: 'Demo', title: 'Demo' }] },
};

test('A1: 合法最小 manifest 被接受并归一化', () => {
  const result = normalizePluginManifest(MINIMAL);
  assert.equal(result.id, 'demo-plugin');
  assert.equal(result.schemaVersion, 1);
  assert.deepEqual(result.contributes.panels[0], MINIMAL.contributes.panels[0]);
});

test('A1: 缺 id 被拒绝，错误含字段名', () => {
  assert.throws(() => normalizePluginManifest({ ...MINIMAL, id: '' }), (error) => {
    assert.ok(error instanceof PluginManifestError);
    assert.match(error.message, /id/u);
    return true;
  });
});

test('A1: 非法 schemaVersion 被拒绝', () => {
  assert.throws(() => normalizePluginManifest({ ...MINIMAL, schemaVersion: 99 }), PluginManifestError);
});

test('A1: contributes 非对象被拒绝', () => {
  assert.throws(() => normalizePluginManifest({ ...MINIMAL, contributes: 'nope' }), PluginManifestError);
});
