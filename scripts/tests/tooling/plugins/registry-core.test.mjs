import assert from 'node:assert/strict';
import test from 'node:test';

import { changePluginsRegistry, readPluginsRegistry, writePluginsRegistry } from '../../../lib/clients/plugins/core/registry.mjs';

function memFs() {
  const store = {};
  return { store, readFileImpl: (p) => { if (!Object.hasOwn(store, p)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } return store[p]; }, writeFileImpl: (p, v) => { store[p] = v; }, renameImpl: (t, d) => { store[d] = store[t]; delete store[t]; }, mkdirImpl: () => {} };
}

test('core: 文件缺失 = 空数组；disabled 过滤；顺序保留', () => {
  const fs = memFs();
  assert.deepEqual(readPluginsRegistry({ rootDir: '/p', readFileImpl: fs.readFileImpl }).value, []);
  fs.store['/p/config/plugins.json'] = JSON.stringify({ schemaVersion: 1, plugins: [
    { id: 'a', manifest: 'a', enabled: true },
    { id: 'b', manifest: 'b', enabled: false },
    { id: 'c', manifest: 'c', enabled: true },
  ] });
  assert.deepEqual(readPluginsRegistry({ rootDir: '/p', readFileImpl: fs.readFileImpl }).value.map((p) => p.id), ['a', 'c']);
});

test('core: 变更注册表 add/remove/enable 并可原子写回', () => {
  const fs = memFs();
  const add = changePluginsRegistry({ rootDir: '/p', action: 'add', id: 'x', manifest: 'plugins/x', readFileImpl: fs.readFileImpl });
  assert.equal(add.ok, true);
  const written = writePluginsRegistry({ rootDir: '/p', plugins: add.value.plugins, ...fs });
  assert.equal(written.ok, true);
  assert.equal(readPluginsRegistry({ rootDir: '/p', readFileImpl: fs.readFileImpl }).value[0].id, 'x');
  const disable = changePluginsRegistry({ rootDir: '/p', action: 'disable', id: 'x', readFileImpl: fs.readFileImpl });
  assert.equal(disable.value.plugins[0].enabled, false);
  const dup = changePluginsRegistry({ rootDir: '/p', action: 'add', id: 'x', readFileImpl: fs.readFileImpl });
  assert.equal(dup.ok, false);
});
