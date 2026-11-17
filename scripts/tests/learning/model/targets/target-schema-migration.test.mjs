import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assignmentReferences, migrateTargetRefs, parseTargetRef, serializeTargetRef } from '../../../../lib/tooling/model-router/routing/targets.mjs';
import { assignmentReferences as uiAssignmentReferences } from '../../../../../apps/shell/ui/src/lib/config/model-routing.mjs';

test('CLI and UI enumerate the same real assignment schema, including nested and fallback references', () => {
  const document = {
    targetRefVersion: 1,
    activeModel: 'group:x',
    clientDefaults: { claude: 'group:x' },
    envModels: { A: { nested: ['group:x', null, 7] } },
    clientRoleMatrix: { default: { planner: 'group:x' }, clients: { pi: { reviewer: 'group:x' } }, metadata: 'group:x' },
    roleDefaults: { planner: { preferredModel: 'group:x', fallback: ['group:x'], note: 'group:x' }, scalar: 'group:x', list: [{ preferredModel: 'group:x' }] },
    routingRules: [{ primary: 'group:x', fallback: ['group:x'] }],
    intentRouting: { intents: [{ enabled: false, modelId: 'group:x', fallback: ['group:x'] }], rules: [{ modelId: 'group:x' }], classifierModel: 'group:x' },
    clientRoles: { planner: 'group:x' }, extensionMetadata: { preferredModel: 'group:x' },
  };
  assert.deepEqual(assignmentReferences(document), uiAssignmentReferences(document));
  assert.deepEqual(assignmentReferences(document).map(({ path }) => path), [
    'activeModel', 'clientDefaults.claude', 'clientRoleMatrix.default.planner', 'clientRoleMatrix.clients.pi.reviewer',
    'envModels.A.nested.0', 'roleDefaults.planner.preferredModel', 'roleDefaults.planner.fallback[0]',
    'routingRules[0].primary', 'routingRules[0].fallback[0]', 'intentRouting.intents[0].modelId', 'intentRouting.intents[0].fallback[0]',
  ]);
});
import { loadRegistrySnapshot, registryFilePath, saveRegistryDocument, withRegistryWriteLock } from '../../../../lib/tooling/model-router/entry/registry.mjs';

const literals = ['auto', 'group:x', 'model:foo', 'missing/stale', 'model:foo%2Fbar', ' Mixed/ID ', 'Group:X', ' '];
const canonical = (id) => `model:${encodeURIComponent(id)}`;

function legacyDocument(value) {
  return {
    activeModel: value, models: {},
    clientDefaults: { claude: value, pi: '' }, envModels: { CUSTOM: value },
    clientRoleMatrix: { default: { planner: value }, clients: { claude: { planner: value } }, metadata: 'literal note' },
    roleDefaults: { planner: { preferredModel: value, taskType: 'model:literal-task', description: 'auto' } },
    routingRules: [{ taskType: 'group:literal-task', primary: value, fallback: [value, ''], description: 'model:literal-description', model: 'literal extension' }],
    intentRouting: { classifierModel: value, intents: [{ id: 'model:literal-intent', modelId: value, description: 'group:literal-description', target: 'literal extension' }], rules: [{ modelId: 'literal extension' }] },
    routingGroups: { x: { models: [value], routing: 'ordered' } },
    clientRoles: { arbitrary: 'literal extension' },
    extensionMetadata: { modelId: value },
  };
}

for (const value of literals) {
  test(`legacy assignment is literal, independent of catalog: ${value}`, () => {
    const original = legacyDocument(value);
    const before = structuredClone(original);
    const migrated = migrateTargetRefs(original);
    const ref = canonical(value);
    assert.equal(migrated.targetRefVersion, 1);
    assert.equal(migrated.activeModel, ref);
    assert.deepEqual(migrated.clientDefaults, { claude: ref, pi: '' });
    assert.deepEqual(migrated.envModels, { CUSTOM: ref });
    assert.deepEqual(migrated.clientRoleMatrix, { default: { planner: ref }, clients: { claude: { planner: ref } }, metadata: 'literal note' });
    assert.deepEqual(migrated.roleDefaults.planner, { ...original.roleDefaults.planner, preferredModel: ref });
    assert.deepEqual(migrated.routingRules, [{ ...original.routingRules[0], primary: ref, fallback: [ref, ''] }]);
    assert.deepEqual(migrated.intentRouting, { ...original.intentRouting, intents: [{ ...original.intentRouting.intents[0], modelId: ref }] });
    for (const key of ['models', 'routingGroups', 'clientRoles', 'extensionMetadata']) assert.deepEqual(migrated[key], original[key]);
    assert.deepEqual(original, before, 'migration must be pure');
    assert.deepEqual(migrateTargetRefs(migrated), migrated, 'migration must be idempotent');
    assert.equal(parseTargetRef(ref, { targetRefVersion: 1 }).id, value);
  });
}

test('canonical references preserve exact IDs without catalog guesses or prefix collisions', () => {
  for (const id of [' Mixed/ID ', 'Model:Foo', 'Model:Foo%2FBar', 'GROUP:X', 'AUTO', ' ']) {
    assert.equal(serializeTargetRef({ kind: 'model', id }), canonical(id));
    assert.equal(migrateTargetRefs({ activeModel: id }).activeModel, canonical(id));
    assert.equal(parseTargetRef(canonical(id), { targetRefVersion: 1 }).id, id);
    assert.deepEqual(parseTargetRef(id), { kind: 'model', id, ref: canonical(id) });
    assert.equal(migrateTargetRefs({ targetRefVersion: 1, activeModel: id }).activeModel, canonical(id));
  }
  assert.equal(parseTargetRef('group:x').kind, 'model');
  assert.equal(parseTargetRef('auto').kind, 'model');
  assert.equal(parseTargetRef('group:x', { targetRefVersion: 1 }).kind, 'group');
  assert.equal(parseTargetRef('auto', { targetRefVersion: 1 }).kind, 'auto');
  assert.equal(parseTargetRef('', { targetRefVersion: 1 }), null);
  assert.equal(parseTargetRef('raw-id', { targetRefVersion: 1 }).id, 'raw-id');
  assert.equal(migrateTargetRefs({ targetRefVersion: 1, activeModel: 'raw-id' }).activeModel, 'model:raw-id');
});

test('canonical percent escapes decode once without collapsing distinct exact IDs', () => {
  const ids = ['Foo/Bar', 'Foo%2FBar', 'Foo%2fBar', 'foo/bar', ' Foo/Bar ', 'model:Foo/Bar', 'model:Foo%2FBar', 'group:X', 'auto', ' Auto ', ' '];
  for (const kind of ['model', 'group']) {
    const refs = ids.map((id) => `${kind}:${encodeURIComponent(id)}`);
    assert.equal(new Set(refs).size, ids.length, 'case, whitespace, prefixes, and literal percent escapes must not collide');
    for (const [index, id] of ids.entries()) {
      const ref = refs[index];
      assert.equal(serializeTargetRef({ kind, id }), ref);
      assert.deepEqual(parseTargetRef(ref, { targetRefVersion: 1 }), { kind, id, ref });
      assert.deepEqual(migrateTargetRefs({ targetRefVersion: 1, activeModel: ref }), { targetRefVersion: 1, activeModel: ref });
    }
    assert.deepEqual(parseTargetRef(`${kind}:Mixed%2fID%252F`, { targetRefVersion: 1 }), {
      kind, id: 'Mixed/ID%2F', ref: `${kind}:Mixed%2FID%252F`,
    });
    assert.throws(() => parseTargetRef(`${kind}:Foo/Bar`, { targetRefVersion: 1 }), /encodeURIComponent/u);
    assert.throws(() => parseTargetRef(`${kind}:%46oo`, { targetRefVersion: 1 }), /encodeURIComponent/u);
  }
});

for (const [label, document] of [
  ['matrix metadata', { clientRoleMatrix: { default: {}, clients: {}, metadata: 'group:literal' } }],
  ['unrelated clientRoles', { clientRoles: { arbitrary: 'model:literal' } }],
  ['rule extension model', { routingRules: [{ primary: '', fallback: [], model: 'group:literal' }] }],
  ['intent extension target', { intentRouting: { intents: [{ modelId: '', target: 'group:literal' }] } }],
  ['unrelated intent rules', { intentRouting: { rules: [{ modelId: 'group:literal' }] } }],
  ['raw classifier and members', { intentRouting: { classifierModel: 'model:literal' }, routingGroups: { g: { models: ['auto', 'group:x', 'model:foo%2Fbar'], routing: 'ordered' } } }],
]) {
  test(`migration preserves ${label} exactly`, () => {
    const before = structuredClone(document);
    assert.deepEqual(migrateTargetRefs(document), { ...document, targetRefVersion: 1 });
    assert.deepEqual(document, before);
  });
}

test('v1 assignments retain exact IDs and target kinds, canonicalize shorthand, and preserve inheritance', () => {
  const document = {
    targetRefVersion: 1, activeModel: 'group:team%2Fone',
    clientDefaults: { claude: 'auto', codex: ' Stale/Raw ', pi: '' },
    envModels: { CUSTOM: 'model:model%3Afoo%252fbar' },
    clientRoleMatrix: { default: { planner: 'group:team%2Fone' }, clients: { claude: { planner: '' } } },
    roleDefaults: { planner: { preferredModel: 'auto', taskType: 'planning' } },
    routingRules: [{ primary: 'model:concrete', fallback: ['group:team%2Fone', 'auto', ''] }],
    intentRouting: { classifierModel: 'model:literal', intents: [{ modelId: 'auto' }] },
  };
  const before = structuredClone(document);
  const migrated = migrateTargetRefs(document);
  assert.deepEqual(migrated, { ...document, clientDefaults: { ...document.clientDefaults, codex: 'model:%20Stale%2FRaw%20' } });
  assert.deepEqual(migrateTargetRefs(migrated), migrated);
  assert.deepEqual(document, before);
  assert.equal(serializeTargetRef({ kind: 'auto' }), 'auto');
  assert.equal(serializeTargetRef({ kind: 'group', id: ' Team/One ' }), 'group:%20Team%2FOne%20');
});

async function fixture(t, document) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'schema-save-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const file = registryFilePath({ rootDir });
  await mkdir(path.dirname(file), { recursive: true });
  const text = `${JSON.stringify(document, null, 2)}\n`;
  await writeFile(file, text);
  return { rootDir, file, text, backupDir: path.join(rootDir, 'backups') };
}

test('native save migrates under expectedHash + lock and backs up exact legacy bytes', async (t) => {
  const f = await fixture(t, { activeModel: 'model:stale', models: {}, extensionMetadata: { literal: 'auto' } });
  const snapshot = await loadRegistrySnapshot(f);
  const next = { ...snapshot.document, routingGroups: { g: { models: ['auto'], routing: 'ordered' } } };
  const before = structuredClone(next);
  assert.equal(await saveRegistryDocument(next, { ...f, expectedHash: snapshot.hash }), f.file);
  assert.deepEqual(JSON.parse(await readFile(f.file, 'utf8')), { ...before, targetRefVersion: 1, activeModel: 'model:model%3Astale' });
  assert.deepEqual(next, before);
  const backups = await readdir(f.backupDir);
  assert.equal(backups.length, 1);
  assert.equal(await readFile(path.join(f.backupDir, backups[0]), 'utf8'), f.text);
  assert.deepEqual(await readdir(path.dirname(f.file)), ['model-registry.json']);
});

test('stale writer never migrates or backs up the concurrent document', async (t) => {
  const f = await fixture(t, { activeModel: 'auto', models: {} });
  const snapshot = await loadRegistrySnapshot(f);
  const external = '{"activeModel":"fresh","metadata":"group:x"}\n';
  let saving;
  await withRegistryWriteLock(f.file, async () => {
    saving = saveRegistryDocument({ ...snapshot.document, targetRefVersion: 99 }, { ...f, expectedHash: snapshot.hash });
    await writeFile(f.file, external);
  });
  await assert.rejects(saving, { code: 'REGISTRY_STALE' });
  assert.equal(await readFile(f.file, 'utf8'), external);
  await assert.rejects(readdir(f.backupDir), { code: 'ENOENT' });
});

test('invalid version fails without backup or registry mutation', async (t) => {
  const f = await fixture(t, { activeModel: 'auto', models: {} });
  await assert.rejects(saveRegistryDocument({ targetRefVersion: 99, activeModel: 'auto' }, f), /version/i);
  assert.equal(await readFile(f.file, 'utf8'), f.text);
  await assert.rejects(readdir(f.backupDir), { code: 'ENOENT' });
});
