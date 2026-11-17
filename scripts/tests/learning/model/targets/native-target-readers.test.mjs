import test from 'node:test';
import assert from 'node:assert/strict';

import { getActiveModel, getNativeModelId } from '../../../../lib/tooling/model-router/entry/registry.mjs';
import { migrateTargetRefs } from '../../../../lib/tooling/model-router/routing/targets.mjs';
import { applyClientContract, getFallbackChain, getModelConfig, resolveModelForRole, resolveModelForTask } from '../../../../lib/tooling/model-router/routing/selection.mjs';
import { getClientRoleMatrix, resolveClientRoleModel, resolveModelForClientRole } from '../../../../lib/tooling/model-router/routing/client-role-matrix.mjs';
import { resolveModelRoutingForRole, resolveModelRoutingForTask } from '../../../../lib/tooling/model-router/routing/routing.mjs';
import { buildRoutingTableMarkdown } from '../../../../lib/tooling/model-router/session/reporting.mjs';

const rawIds = ['model:foo', 'group:x', 'auto', 'cheap', 'model:foo%2fbar'];
const models = Object.fromEntries(rawIds.map((id) => [id, { label: `Literal ${id}`, provider: 'claude', protocols: ['claude'], cliModel: id, cost: id === 'cheap' ? 'lowest' : 'high' }]));
const legacy = {
  activeModel: 'auto', models,
  roleDefaults: { planner: { taskType: 'planning', preferredModel: 'group:x' } },
  routingRules: [{ taskType: 'planning', primary: 'model:foo', fallback: ['auto', 'cheap'] }, { taskType: 'general', primary: 'auto', fallback: ['cheap'] }],
  clientRoleMatrix: { default: { planner: 'group:x' }, clients: { claude: { planner: 'model:foo' } } },
};

for (const versioned of [false, true]) {
  const registry = versioned ? migrateTargetRefs(legacy) : legacy;
  test(`native concrete assignments resolve exactly once (${versioned ? 'v1' : 'legacy'})`, () => {
    assert.equal(getActiveModel(registry), 'auto');
    assert.equal(resolveModelForRole('planner', registry, {}).modelId, 'group:x');
    assert.equal(resolveModelForTask('planning', registry, {}).modelId, 'model:foo');
    assert.deepEqual(getFallbackChain('planning', registry).map((model) => model.id), ['cheap', 'auto']);
    assert.equal(resolveModelForClientRole('claude', 'planner', registry, {}).modelId, 'model:foo');
    assert.equal(resolveModelForClientRole('codex', 'planner', registry, {}).modelId, 'group:x');
    assert.equal(resolveModelRoutingForTask({ taskType: 'planning', registry, env: {} }).modelId, 'model:foo');
    assert.equal(resolveModelRoutingForRole({ role: 'planner', registry, env: {} }).modelId, 'group:x');
    assert.equal(getModelConfig('model:foo', registry).id, 'model:foo', 'concrete model lookup never parses assignments');
    assert.match(buildRoutingTableMarkdown(registry), /Literal model:foo/);
    assert.match(buildRoutingTableMarkdown(registry), /Literal auto.*Literal cheap/);
  });
}

test('matrix projection preserves versioned reference syntax for gateway consumers', () => {
  const registry = migrateTargetRefs(legacy);
  registry.clientRoleMatrix.clients.pi = { planner: 'group:x' };
  assert.equal(getClientRoleMatrix(registry).default.planner, 'model:group%3Ax');
  assert.deepEqual(resolveClientRoleModel('pi', 'planner', registry, {}), { modelId: 'group:x', source: 'client' });
  assert.equal(resolveClientRoleModel('claude', 'planner', registry, {}).modelId, 'model:model%3Afoo');
  assert.equal(resolveModelForClientRole('claude', 'planner', registry, { AIOS_MODEL_PLANNER: 'model:foo' }).modelId, 'model:foo', 'environment model override remains a raw concrete ID');
});

for (const target of ['group:x', 'auto']) {
  test(`native unsupported ${target} fails explicitly rather than choosing a colliding model`, () => {
    const base = { ...legacy, targetRefVersion: 1, routingRules: [] };
    const unsupported = { code: 'UNSUPPORTED_NATIVE_TARGET' };
    assert.throws(() => getActiveModel({ ...base, activeModel: target }), unsupported);
    assert.throws(() => resolveModelForTask('planning', { ...base, routingRules: [{ taskType: 'planning', primary: target, fallback: [] }] }, {}), unsupported);
    assert.throws(() => resolveModelForRole('planner', { ...base, roleDefaults: { planner: { preferredModel: target } } }, {}), unsupported);
    assert.throws(() => resolveModelForClientRole('claude', 'planner', { ...base, clientRoleMatrix: { default: { planner: target } } }, {}), unsupported);
  });
}

test('v1 raw shorthand and empty inheritance remain usable', () => {
  const registry = { ...legacy, targetRefVersion: 1, activeModel: 'cheap', roleDefaults: { planner: { preferredModel: '', taskType: 'planning' } }, routingRules: [{ taskType: 'planning', primary: '', fallback: ['cheap'] }] };
  assert.equal(getActiveModel(registry), 'cheap');
  assert.equal(resolveModelForRole('planner', registry, {}).modelId, 'cheap');
});

test('native decoder preserves literal prefixes and percent sequences exactly once', () => {
  for (const id of rawIds) {
    assert.equal(getNativeModelId(id, legacy), id);
    const ref = `model:${encodeURIComponent(id)}`;
    const registry = { ...legacy, targetRefVersion: 1, activeModel: ref, routingRules: [], roleDefaults: {}, clientRoleMatrix: { default: { planner: ref } } };
    assert.equal(getNativeModelId(ref, registry), id);
    assert.equal(getActiveModel(registry), id);
    assert.equal(resolveModelForTask('unknown', registry, {}).modelId, id);
    assert.equal(resolveModelForRole('unknown', registry, {}).modelId, id);
    assert.equal(resolveModelForClientRole('claude', 'planner', registry, {}).modelId, id);
    assert.equal(getModelConfig(id, registry).id, id);
  }
  for (const value of ['', null, undefined]) assert.equal(getNativeModelId(value, { targetRefVersion: 1 }), '');
  assert.throws(() => getNativeModelId('model:cheap', { targetRefVersion: 99 }), /version/i);
});

test('native client fallback decodes persisted refs but never reparses concrete route fallbacks', () => {
  const registry = migrateTargetRefs({ ...legacy, models: { ...models, cheap: { ...models.cheap, protocols: ['openai-response'] } } });
  const task = resolveModelForTask('planning', registry, {}, { clientId: 'codex-cli' });
  assert.equal(task.modelId, 'cheap');
  assert.equal(task.requestedModelId, 'model:foo');
  assert.equal(task.skipped[0].modelId, 'model:foo');
  assert.equal(resolveModelForRole('unknown', registry, {}, { clientId: 'codex-cli' }).modelId, 'cheap');
  const concrete = applyClientContract({ modelId: 'cheap', fallback: ['model:foo'], reason: 'normalized route' }, registry, { clientId: 'claude' });
  assert.equal(concrete.modelId, 'model:foo');
  assert.equal(concrete.model.id, 'model:foo');
});

test('native env model overrides remain raw concrete IDs after v1 migration', () => {
  const registry = migrateTargetRefs(legacy);
  for (const id of rawIds) {
    assert.equal(resolveModelForTask('planning', registry, { AIOS_MODEL_PLANNING: id }).modelId, id);
    assert.equal(resolveModelForRole('planner', registry, { AIOS_MODEL_PLANNER: id }).modelId, id);
    assert.equal(resolveModelForClientRole('claude', 'planner', registry, { AIOS_MODEL_PLANNER: id }).modelId, id);
  }
});

test('native wrappers and fallback readers explicitly reject group and Auto assignments', () => {
  for (const target of ['group:x', 'auto']) {
    const registry = { ...legacy, targetRefVersion: 1, activeModel: 'model:cheap', routingRules: [{ taskType: 'planning', primary: 'model:missing', fallback: [target] }], roleDefaults: { planner: { taskType: 'planning' } } };
    for (const resolve of [
      () => getFallbackChain('planning', registry),
      () => resolveModelForTask('planning', registry, {}),
      () => resolveModelRoutingForTask({ taskType: 'planning', registry, env: {} }),
      () => resolveModelRoutingForRole({ role: 'planner', registry, env: {} }),
    ]) assert.throws(resolve, { code: 'UNSUPPORTED_NATIVE_TARGET' });
  }
});

test('reporting distinguishes groups, literal prefix IDs, Auto, and stale references', () => {
  const report = buildRoutingTableMarkdown({
    targetRefVersion: 1, models, routingGroups: { x: { name: 'Ordered team', models: ['cheap'], routing: 'ordered' } },
    routingRules: [{ taskType: 'general', primary: 'group:x', fallback: ['model:group%3Ax', 'auto', 'model:stale%2Fid'] }],
  });
  assert.match(report, /Ordered team/);
  assert.match(report, /Literal group:x/);
  assert.match(report, /AIOS Auto/);
  assert.match(report, /stale\/id/);
});
