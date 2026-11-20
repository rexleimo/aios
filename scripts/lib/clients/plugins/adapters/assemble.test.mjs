import assert from 'node:assert/strict';
import test from 'node:test';

import { assemblePluginHooks } from './assemble.mjs';

function fsFrom(map) {
  return (filePath) => {
    if (!Object.hasOwn(map, filePath)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
    return map[filePath];
  };
}

test('接线: 无插件时 onRequest 直通，不改变 body', () => {
  const hooks = assemblePluginHooks({ rootDir: '/proj', readFileImpl: fsFrom({}) });
  const body = { model: 'x', messages: [] };
  assert.deepEqual(hooks.onRequest(body, {}), body);
  assert.deepEqual(hooks.loaded, []);
});

test('接线: 声明 middleware 的插件被装配，onRequest 生效', () => {
  const registryPath = '/proj/config/plugins.json';
  const manifestPath = '/proj/plugins/mw/manifest.json';
  const readFileImpl = fsFrom({
    [registryPath]: JSON.stringify({ schemaVersion: 1, plugins: [{ id: 'mw', manifest: 'plugins/mw', enabled: true }] }),
    [manifestPath]: JSON.stringify({
      schemaVersion: 1, id: 'mw', version: '1.0.0',
      contributes: { middleware: [{ source: 'function onRequest(b){ return {...b, injected:true}; }' }] },
    }),
  });
  const hooks = assemblePluginHooks({ rootDir: '/proj', readFileImpl });
  assert.deepEqual(hooks.loaded, ['mw']);
  const out = hooks.onRequest({ model: 'x' }, {});
  assert.equal(out.injected, true);
});
