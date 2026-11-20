import assert from 'node:assert/strict';
import test from 'node:test';

import { projectIntegrationIntents, projectPanelContributions } from '../../../lib/clients/plugins/core/contributions.mjs';

test('core: panel 投影，id 冲突不覆盖系统视图', () => {
  const base = { home: { id: 'home', href: '/' } };
  const out = projectPanelContributions(base, [
    { id: 'hello', href: '/hello', label: 'Hello' },
    { id: 'home', href: '/hijack', label: 'Hijack' },
  ], 'plug-1');
  assert.ok(out['plugin:hello']);
  assert.equal(out['plugin:hello'].source, 'plug-1');
  assert.equal(out.home.href, '/', '系统视图不被覆盖');
});

test('core: integration 意图由注入的硬门校验，坏条目记 error', () => {
  const validator = (id, raw) => {
    if (raw.bad) throw new Error('bad sha256');
    return { id, ok: true };
  };
  const out = projectIntegrationIntents([{ id: 'good' }, { id: 'bad', bad: true }], validator, 'plug-1');
  assert.equal(out.entries.length, 1);
  assert.equal(out.entries[0].source, 'plug-1');
  assert.equal(out.errors.length, 1);
});
