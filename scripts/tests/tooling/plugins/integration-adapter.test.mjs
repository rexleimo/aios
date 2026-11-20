import assert from 'node:assert/strict';
import test from 'node:test';

import { readSources, removePluginIntegrations, validateIntegration, writeIntegrationIntents } from '../../../lib/clients/plugins/adapters/integration.mjs';

function memFs(initial = {}) {
  const store = { ...initial };
  return {
    store,
    readFileImpl: (p) => {
      if (!Object.hasOwn(store, p)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return store[p];
    },
    writeFileImpl: (p, v) => { store[p] = v; },
    renameImpl: (tmp, dest) => { store[dest] = store[tmp]; delete store[tmp]; },
  };
}

const VALID = {
  displayName: 'Vendor', vendor: 'v', homepage: 'https://v.example',
  skill: { repo: 'o/r', commit: 'a'.repeat(40), skillPath: 'skills/v', sha256: 'b'.repeat(64), installName: 'v' },
  mcp: { serverName: 'v-docs', url: 'https://v.example/mcp', transport: 'http' },
};

test('adapter: 真实写盘 + sidecar 记录来源，领域对象无 __origin', () => {
  const fs = memFs({ '/proj/config/integrations.json': JSON.stringify({ schemaVersion: 1, integrations: {} }) });
  const normalized = validateIntegration('vendor', VALID);
  const out = writeIntegrationIntents({
    rootDir: '/proj',
    intents: [{ id: 'vendor', normalized, source: 'plug-1' }],
    ...fs,
  });
  assert.deepEqual(out.written, ['vendor']);
  const doc = JSON.parse(fs.store['/proj/config/integrations.json']);
  assert.ok(doc.integrations.vendor);
  assert.equal(doc.integrations.vendor.__origin, undefined, '领域对象无污染');
  assert.deepEqual(readSources({ rootDir: '/proj', readFileImpl: fs.readFileImpl }), { vendor: 'plug-1' });
});

test('adapter: 卸载只删该插件投影，保留手工条目', () => {
  const fs = memFs({
    '/proj/config/integrations.json': JSON.stringify({
      schemaVersion: 1,
      integrations: { manual: VALID, fromPlug: VALID, fromOther: VALID },
    }),
    '/proj/config/plugin-integration-sources.json': JSON.stringify({ fromPlug: 'plug-1', fromOther: 'plug-2' }),
  });
  const out = removePluginIntegrations({ rootDir: '/proj', pluginId: 'plug-1', ...fs });
  assert.deepEqual(out.removed, ['fromPlug']);
  const doc = JSON.parse(fs.store['/proj/config/integrations.json']);
  assert.ok(doc.integrations.manual, '手工条目保留');
  assert.ok(doc.integrations.fromOther, '其它插件保留');
  assert.equal(doc.integrations.fromPlug, undefined);
});

test('adapter: 硬门缺 sha256 抛错', () => {
  assert.throws(() => validateIntegration('bad', { ...VALID, skill: { ...VALID.skill, sha256: 'short' } }), /sha256/iu);
});
