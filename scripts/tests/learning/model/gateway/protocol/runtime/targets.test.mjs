import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTargetRef, serializeTargetRef, parseWireTarget, serializeWireTarget, resolveWireTarget, migrateTargetRefs } from '../../../../../../lib/tooling/model-router/routing/targets.mjs';

test('legacy assignments are literal model IDs, never inferred groups or Auto', () => {
  for (const id of ['auto', 'group:x', 'model:x', 'aios-auto', 'aios/group/x', 'Case/Model %', ' Mixed/ID ']) {
    const target = parseTargetRef(id);
    assert.equal(target.kind, 'model');
    assert.equal(target.id, id);
    assert.equal(serializeTargetRef(target), `model:${encodeURIComponent(id)}`);
  }
});

test('v1 references decode exactly once and round trip without changing case', () => {
  for (const target of [{ kind: 'auto' }, { kind: 'model', id: 'group:x' }, { kind: 'group', id: 'Case/Group %' }, { kind: 'model', id: '%2F' }, { kind: 'model', id: ' Mixed/ID ' }]) {
    const ref = serializeTargetRef(target);
    const parsed = parseTargetRef(ref, { targetRefVersion: 1 });
    assert.equal(parsed.kind, target.kind);
    assert.equal(parsed.id, target.id);
    assert.equal(parsed.ref, ref);
    assert.equal(serializeWireTarget(parsed), target.kind === 'auto' ? 'aios-auto' : `aios/${target.kind}/${encodeURIComponent(target.id)}`);
    assert.deepEqual(parseWireTarget(serializeWireTarget(parsed)), parsed);
  }
  assert.equal(parseTargetRef('Raw/ID', { targetRefVersion: 1 }).id, 'Raw/ID');
  assert.throws(() => parseTargetRef('auto', { targetRefVersion: 2 }), /version/i);
});

test('only reserved wire IDs select targets; ordinary values stay placeholders', () => {
  for (const value of [undefined, null, '', 'only', 'auto', 'group:x', 'model:x', 'gpt-6', 'Case/Model']) assert.equal(parseWireTarget(value), null);
  assert.equal(parseWireTarget('aios-auto').kind, 'auto');
  assert.equal(parseWireTarget('aios/model/Case%2FModel').id, 'Case/Model');
  for (const value of ['aios', 'aios/nope/x', 'aios/model/', 'aios/group/x/y', 'aios/model/%', 'aios/model/%FF', 'aios-auto/x', 'aios-unknown']) {
    assert.throws(() => parseWireTarget(value), { code: 'INVALID_TARGET' }, value);
  }
  assert.throws(() => parseWireTarget(3), { code: 'INVALID_TARGET' });
});

test('body, both target headers, and Gemini selectors must canonically agree', () => {
  assert.equal(resolveWireTarget({ model: 'placeholder', headerTargets: ['aios/model/A%2fB'], pathModel: 'aios/model/A%2FB' }).ref, 'model:A%2FB');
  assert.equal(resolveWireTarget({ model: 'aios-auto', headerTargets: ['aios-auto'] }).ref, 'auto');
  assert.throws(() => resolveWireTarget({ model: 'aios-auto', headerTargets: ['aios/model/a'] }), { code: 'TARGET_SELECTOR_CONFLICT' });
  assert.throws(() => resolveWireTarget({ model: 'aios/group/g', pathModel: 'aios/model/g' }), { code: 'TARGET_SELECTOR_CONFLICT' });
  assert.throws(() => resolveWireTarget({ headerTargets: ['ordinary'] }), { code: 'INVALID_TARGET' });
  assert.throws(() => resolveWireTarget({ model: 'aios/bad', headerTargets: ['aios-auto'] }), { code: 'INVALID_TARGET' });
});

test('migration converts known assignments, preserves metadata/raw IDs, and is pure and idempotent', () => {
  const registry = {
    activeModel: 'auto', clientDefaults: { claude: 'group:x' }, envModels: { AIOS_MODEL_X: 'X/Y' },
    clientRoles: { claude: { planner: 'model:x' } },
    clientRoleMatrix: { default: { implementer: 'auto' }, clients: { codex: { reviewer: 'group:x' } }, metadata: 'preserve' },
    roleDefaults: { reviewer: { taskType: 'review', preferredModel: 'group:x', fallback: [' Missing/Role ', 'X/Y'], description: 'retain' }, extension: ' Mixed/Metadata ' },
    routingRules: [{ taskType: 'review', primary: 'auto', fallback: ['group:x', 'X/Y'], model: 'extension' }],
    intentRouting: { classifierModel: 'group:x', intents: [{ id: 'code', description: 'retain', modelId: 'auto', fallback: [' Missing/Intent ', 'X/Y'] }], rules: [{ modelId: 'X/Y' }] },
    routingGroups: { x: { models: ['group:x', 'auto'] } }, models: { auto: { upstreamModel: 'auto' } },
    unrelated: { modelId: 'auto' },
  };
  const before = structuredClone(registry);
  const next = migrateTargetRefs(registry);
  assert.deepEqual(registry, before);
  assert.equal(next.targetRefVersion, 1);
  assert.equal(next.activeModel, 'model:auto');
  assert.equal(next.clientDefaults.claude, 'model:group%3Ax');
  assert.equal(next.envModels.AIOS_MODEL_X, 'model:X%2FY');
  assert.deepEqual(next.clientRoles, before.clientRoles);
  assert.equal(next.clientRoleMatrix.default.implementer, 'model:auto');
  assert.equal(next.clientRoleMatrix.clients.codex.reviewer, 'model:group%3Ax');
  assert.equal(next.clientRoleMatrix.metadata, 'preserve');
  assert.equal(next.routingRules[0].model, 'extension');
  assert.equal(next.roleDefaults.reviewer.preferredModel, 'model:group%3Ax');
  assert.deepEqual(next.roleDefaults.reviewer.fallback, ['model:%20Missing%2FRole%20', 'model:X%2FY']);
  assert.equal(next.roleDefaults.extension, before.roleDefaults.extension);
  assert.equal(next.roleDefaults.reviewer.taskType, 'review');
  assert.deepEqual(next.routingRules[0].fallback, ['model:group%3Ax', 'model:X%2FY']);
  assert.equal(next.routingRules[0].primary, 'model:auto');
  assert.equal(next.intentRouting.intents[0].modelId, 'model:auto');
  assert.deepEqual(next.intentRouting.intents[0].fallback, ['model:%20Missing%2FIntent%20', 'model:X%2FY']);
  assert.deepEqual(next.intentRouting.rules, before.intentRouting.rules);
  assert.equal(next.intentRouting.classifierModel, 'group:x');
  assert.deepEqual(next.routingGroups, before.routingGroups);
  assert.deepEqual(next.models, before.models);
  assert.deepEqual(next.unrelated, before.unrelated);
  assert.deepEqual(migrateTargetRefs(next), next);
});

for (const targetRefVersion of [undefined, 1]) {
  test(`migration preserves unknown clientRoles and intent rules exactly (version=${targetRefVersion ?? 'legacy'})`, () => {
    const registry = {
      ...(targetRefVersion === undefined ? {} : { targetRefVersion }),
      activeModel: ' Missing/Model ',
      clientRoles: { claude: { planner: 'model:%', note: ' Mixed/ID ' }, extra: ['group:%', 'auto', null] },
      intentRouting: {
        intents: [{ modelId: ' Missing/Intent ' }],
        rules: [{ modelId: 'group:%', fallback: ['model:%', ' Mixed/ID '], metadata: { target: 'auto' } }],
      },
    };
    const before = structuredClone(registry);
    const next = migrateTargetRefs(registry);
    assert.equal(next.activeModel, 'model:%20Missing%2FModel%20');
    assert.equal(next.intentRouting.intents[0].modelId, 'model:%20Missing%2FIntent%20');
    assert.deepEqual(next.clientRoles, before.clientRoles);
    assert.deepEqual(next.intentRouting.rules, before.intentRouting.rules);
    assert.deepEqual(registry, before);
    assert.deepEqual(migrateTargetRefs(next), next);
  });
}

test('migration preserves exact stale local IDs and canonicalizes compatible v1 shorthand', () => {
  for (const id of [' Mixed/ID ', 'Missing/Stale %', 'GROUP:X', 'Model:Foo%2FBar']) {
    const ref = `model:${encodeURIComponent(id)}`;
    for (const document of [{ activeModel: id }, { targetRefVersion: 1, activeModel: id }]) {
      const next = migrateTargetRefs(document);
      assert.equal(next.activeModel, ref);
      assert.equal(parseTargetRef(next.activeModel, next).id, id);
    }
  }
  assert.equal(migrateTargetRefs({ targetRefVersion: 1, activeModel: 'X/Y' }).activeModel, 'model:X%2FY');
  assert.equal(migrateTargetRefs({ targetRefVersion: 1, activeModel: 'group:x' }).activeModel, 'group:x');
  assert.equal(migrateTargetRefs({ activeModel: '' }).activeModel, '');
});
