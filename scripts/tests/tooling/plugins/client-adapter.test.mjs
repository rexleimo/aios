import assert from 'node:assert/strict';
import test from 'node:test';

import { ClientContributionError, normalizeClientContributions } from '../../../lib/clients/plugins/adapters/client.mjs';
import { normalizePluginManifest } from '../../../lib/clients/plugins/core/manifest.mjs';

test('client: 校验与归一化，缺省 mode=inplace', () => {
  const out = normalizeClientContributions([{ id: 'claude', baseUrlKey: 'env.X' }, { id: 'codex', mode: 'isolated' }]);
  assert.equal(out[0].mode, 'inplace');
  assert.equal(out[1].mode, 'isolated');
});

test('client: 非法 mode 被拒', () => {
  assert.throws(() => normalizeClientContributions([{ id: 'claude', mode: 'evil' }]), ClientContributionError);
});

test('manifest 接受 clients contribution（单一事实源）', () => {
  const m = normalizePluginManifest({ schemaVersion: 1, id: 'x', version: '1.0.0', contributes: { clients: [{ id: 'claude' }] } });
  assert.equal(m.contributes.clients[0].id, 'claude');
});
