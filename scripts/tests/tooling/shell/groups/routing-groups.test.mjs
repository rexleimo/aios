import assert from 'node:assert/strict';
import test from 'node:test';
import * as config from '../../../../../apps/shell/ui/src/lib/config/model-routing.mjs';
import { projectPolicyAssignment, toPolicyContext } from '../../../../../apps/shell/ui/src/lib/config/routing-policy.mjs';
import { resolveGatewayRoute } from '../../../../lib/tooling/model-router/gateway/router.mjs';
import * as runtimeTargets from '../../../../lib/tooling/model-router/routing/targets.mjs';
import { orderedGroupMembers as runtimeMembers } from '../../../../lib/tooling/model-router/routing/groups.mjs';

const registry = () => ({
  targetRefVersion: 1,
  providers: { local: { baseUrl: 'https://provider.invalid/v1', authMode: 'none', protocols: ['openai-chat'], models: ['alpha', 'beta', 'paused'] } },
  models: {
    alpha: { protocols: ['openai-chat'] }, beta: { protocols: ['openai-chat'] },
    paused: { protocols: ['openai-chat'], enabled: false }, unbound: { protocols: ['openai-chat'] },
  },
  routingGroups: {
    pool: { models: ['beta', 'alpha'], routing: 'ordered', weights: { beta: 9 }, extension: { keep: true } },
  },
  activeModel: 'model:alpha',
});
const assignments = [
  ['activeModel', (d, id) => { d.activeModel = id; }],
  ['clientDefaults.codex', (d, id) => { d.clientDefaults = { codex: id }; }],
  ['clientRoleMatrix.default.implementer', (d, id) => { d.clientRoleMatrix = { default: { implementer: id } }; }],
  ['clientRoleMatrix.clients.codex.implementer', (d, id) => { d.clientRoleMatrix = { clients: { codex: { implementer: id } } }; }],
  ['intentRouting.intents[0].modelId', (d, id) => { d.intentRouting = { enabled: false, classifierModel: 'alpha', intents: [{ id: 'chat', description: 'Conversation', modelId: id }] }; }],
];

test('group edits normalize new IDs but keep raw member IDs and untouched metadata', () => {
  const document = registry();
  document.routingGroups.legacy = { models: ['alpha'], extension: { untouched: true } };
  const before = structuredClone(document);
  const draft = config.toEditable(document);
  draft.routingGroups[0] = { id: ' POOL ', models: ['alpha', 'beta'], routing: 'ordered' };
  draft.routingGroups.push({ id: ' NEW-POOL ', models: ['beta'] });
  const next = config.applyEdits(document, draft);
  assert.deepEqual(next.routingGroups.pool, { ...document.routingGroups.pool, models: ['alpha', 'beta'] });
  assert.deepEqual(next.routingGroups.legacy, document.routingGroups.legacy);
  assert.deepEqual(next.routingGroups['new-pool'], { models: ['beta'], routing: 'ordered' });
  assert.deepEqual(document, before);
  assert.doesNotThrow(() => config.validateDocument(next, { previousDocument: document }));
  for (const id of [' ALPHA ', 'BETA', ' beta ']) {
    const invalid = config.toEditable(document);
    invalid.routingGroups[0].models = [id];
    assert.throws(() => config.applyEdits(document, invalid), /explicit provider binding|unknown.*model/u, id);
  }
});

for (const source of [undefined, 'custom', 'discovered']) test(`raw ${source || 'curated'} member and classifier IDs preserve case, whitespace, bytes and metadata`, () => {
  const document = registry();
  const ids = ['Alpha', ' ALPHA ', 'Org/Case:% 模型'];
  for (const id of ids) document.models[id] = { protocols: ['openai-chat'], extension: { keep: id }, ...(source ? { source, provider: 'local' } : {}) };
  document.providers.local.models.push(...ids);
  document.routingGroups.pool.models = [...ids, 'alpha'];
  document.activeModel = 'group:pool';
  document.intentRouting = { enabled: true, classifierModel: ids[1], intents: [{ id: 'chat', description: 'Chat', modelId: 'group:pool' }] };
  assert.ok(ids.every((id) => config.toModelCatalog(document).some((model) => model.id === id)));
  assert.ok(ids.every((id) => config.toModelBindings(document).some((model) => model.id === id)));
  const next = config.applyEdits(document, config.toEditable(document));
  assert.deepEqual(next.routingGroups.pool.models, [...ids, 'alpha']);
  assert.equal(next.intentRouting.classifierModel, ids[1]);
  assert.deepEqual(next.models, document.models);
  if (source === 'custom') {
    const draft = config.toEditable(document);
    draft.customModels.find((model) => model.id === ids[0]).label = 'Edited raw custom model';
    const edited = config.applyEdits(document, draft);
    assert.deepEqual(edited.models[ids[0]], { ...document.models[ids[0]], label: 'Edited raw custom model' });
    assert.deepEqual(edited.routingGroups.pool.models, [...ids, 'alpha']);
  }
  assert.equal(projectPolicyAssignment(next).modelId, ids[0]);
  assert.equal(resolveGatewayRoute({ registry: next, env: {} }).modelId, ids[0]);
});

test('group IDs reject normalized duplicates and empty IDs, including raw document duplicates', () => {
  const document = registry();
  for (const rows of [[{ id: 'pool' }, { id: ' POOL ' }], [{ id: ' ' }]]) {
    assert.throws(() => config.applyEdits(document, { routingGroups: rows }), { name: 'ConfigError', path: 'routingGroups' });
  }
  document.routingGroups[' POOL '] = { models: [] };
  assert.throws(() => config.validateDocument(document), /duplicate/u);
});

test('assignment options separate eligible groups from concrete classifier models and never invent strategies', () => {
  const document = registry();
  Object.assign(document.routingGroups, {
    smart: { models: ['alpha'], routing: 'smart' }, empty: { models: [] },
    opaque: { models: ['alpha'], routing: 'weight' }, paused: { models: ['paused'] },
    disabled: { models: ['alpha'], enabled: false }, broken: { models: ['unbound'] },
    nested: { models: ['group:pool'] },
  });
  assert.deepEqual(config.toModelCatalog(document).map(({ id }) => id), ['alpha', 'beta']);
  assert.deepEqual(config.toRoutingTargets(document).map(({ id }) => id), ['model:alpha', 'model:beta', 'group:pool', 'group:smart']);
  assert.deepEqual(config.toRoutingTargets(document).find(({ id }) => id === 'group:pool').models, ['beta', 'alpha']);
  assert.deepEqual(config.toEditable(document).routingGroups.find(({ id }) => id === 'disabled').enabled, false);
});

for (const [at, assign] of assignments) {
  test(`${at} accepts qualified groups and rejects new empty, unsupported, or paused-only assignments`, () => {
    const document = registry();
    const next = structuredClone(document);
    assign(next, 'group:pool');
    assert.doesNotThrow(() => config.validateDocument(next, { previousDocument: document }));
    assert.doesNotThrow(() => config.applyEdits(document, config.toEditable(next)));
    for (const group of [{ models: [] }, { models: ['alpha'], routing: 'rotate' }, { models: ['paused'] }, { models: ['alpha'], enabled: false }]) {
      next.routingGroups.pool = group;
      assert.throws(() => config.validateDocument(next, { previousDocument: document }), { name: 'ConfigError', path: at });
    }
  });
}

test('raw model IDs remain models even when a group shares the name; missing nested targets and group classifiers are rejected', () => {
  const document = registry();
  document.routingGroups.alpha = { models: ['beta'], routing: 'ordered' };
  assert.equal(projectPolicyAssignment(document).modelId, 'alpha');
  for (const classifier of ['group:pool', ' GROUP:POOL ']) {
    const draft = config.toEditable(document);
    draft.intentRouting = { enabled: false, classifierModel: classifier, intents: [] };
    assert.throws(() => config.applyEdits(document, draft), /classifier.*concrete|classifier.*group/iu);
  }
  for (const modelId of ['group:pool', 'aios/group/pool', 'aios/model/alpha', 'aios-auto']) {
    const next = structuredClone(document);
    next.routingGroups.pool.models = [modelId];
    assert.throws(() => config.validateDocument(next), /concrete|nested|unknown/iu);
  }
  document.models['group:pool'] = { protocols: ['openai-chat'] };
  document.providers.local.models.push('group:pool');
  document.routingGroups.pool.models = ['group:pool'];
  assert.deepEqual(config.orderedGroupMembers(document, 'pool'), ['group:pool'], 'a literal concrete model ID is not nesting');
  assert.doesNotThrow(() => config.validateDocument(document));
});

test('unchanged paused explicit group members retain references, but empty or missing bindings never do', () => {
  const document = registry();
  document.activeModel = 'group:pool';
  const draft = config.toEditable(document);
  draft.providers[0].enabled = false;
  const paused = config.applyEdits(document, draft);
  assert.equal(paused.activeModel, 'group:pool');
  assert.doesNotThrow(() => config.validateDocument(paused, { previousDocument: document }));
  assert.deepEqual(config.toRoutingTargets(paused), []);
  assert.throws(() => config.applyEdits(paused, { targetRefVersion: 1, clientDefaults: { codex: 'group:pool' } }), /enabled explicit provider binding/u);
  const broken = structuredClone(paused);
  broken.providers.local.models = [];
  assert.throws(() => config.validateDocument(broken, { previousDocument: paused }), /explicit provider binding/u);
  broken.providers = paused.providers;
  broken.routingGroups.pool.models = [];
  assert.throws(() => config.validateDocument(broken, { previousDocument: paused }), /member|empty/u);
});

test('deleting in-use groups/models requires clearing all references, including legacy rules and disabled intents', () => {
  for (const [, assign] of [...assignments,
    ['roleDefaults', (d, id) => { d.roleDefaults = { implementer: { preferredModel: id } }; }],
    ['routingRules.primary', (d, id) => { d.routingRules = [{ taskType: 'implementation', primary: id }]; }],
    ['routingRules.fallback', (d, id) => { d.routingRules = [{ taskType: 'implementation', fallback: [id] }]; }],
  ]) {
    for (const target of ['group:pool', 'model:beta']) {
      const document = registry();
      if (target === 'model:beta') {
        document.routingGroups = {};
        Object.assign(document.models.beta, { source: 'custom', provider: 'local' });
      }
      assign(document, target);
      const draft = structuredClone(document);
      if (target.startsWith('group:')) delete draft.routingGroups.pool;
      else delete draft.models.beta;
      assert.ok(config.routingTargetReferences(draft, target).length > 0);
      assert.throws(() => config.validateDocument(draft, { previousDocument: document }), /unknown group|unknown model|removed/u);
      assert.throws(() => config.applyEdits(document, config.toEditable(draft)), /unknown group|unknown model|removed/u);
    }
  }
  const document = registry();
  document.activeModel = 'group:pool';
  const draft = config.toEditable(document);
  draft.activeModel = '';
  draft.routingGroups = [];
  assert.doesNotThrow(() => config.validateDocument(config.applyEdits(document, draft), { previousDocument: document }));
});

test('target syntax mirrors runtime collision, escaping and invalid-reference behavior without catalog lookups', () => {
  for (const targetRefVersion of [undefined, 1]) for (const value of [undefined, null, '', 'alpha', 'auto', 'group:pool', 'model:group%3Apool', 'model:auto', 'model:Org%2FCase%25%3Ax%20%E6%A8%A1%E5%9E%8B', 'group:a%2fb', 'model:%2B']) {
    const options = { targetRefVersion };
    const target = config.parseTargetRef(value, options);
    assert.deepEqual(target, runtimeTargets.parseTargetRef(value, options), `${targetRefVersion}: ${value}`);
    if (target) assert.equal(config.serializeTargetRef(target), runtimeTargets.serializeTargetRef(target));
  }
  for (const value of ['group:', 'model:', 'group:%', 'model:%GG', 'model:%00', 'group:a/b', 'model:%61', 'model:a b', 'model:%ED%A0%80', 2, {}]) {
    for (const parse of [config.parseTargetRef, runtimeTargets.parseTargetRef]) assert.throws(() => parse(value, { targetRefVersion: 1 }), /encoding|string/u);
  }
  for (const targetRefVersion of [0, 2, '1', null]) for (const parse of [config.parseTargetRef, runtimeTargets.parseTargetRef]) assert.throws(() => parse(null, { targetRefVersion }), /version/u);
});

test('legacy migration wraps schema assignments including exact stale and prefix-like IDs, never unknown metadata or concrete IDs', () => {
  const document = {
    activeModel: 'group:pool',
    clientDefaults: { codex: 'auto', claude: 'model:alpha' },
    clientRoleMatrix: { default: { implementer: 'stale/id:%' }, clients: { codex: { reviewer: 'aios-auto' } } },
    envModels: { planner: 'auto' }, clientRoles: { codex: { planner: 'group:pool' } },
    roleDefaults: { planner: { taskType: 'plan', preferredModel: 'group:pool', fallback: [' Missing / ID:% '], extension: 'keep' }, old: 'auto' },
    routingRules: [{ taskType: 'plan', primary: 'auto', fallback: ['stale', 'Org/Case:% 模型'], extension: { keep: true } }],
    intentRouting: { classifierModel: 'group:pool', intents: [{ id: 'chat', modelId: 'auto', fallback: [' Stale / Case:% '], extension: 'keep' }], rules: [{ modelId: 'group:pool', target: 'auto' }] },
    routingGroups: { pool: { models: ['group:pool', 'auto'], routing: 'smart', weights: { auto: 4 } } },
    extension: { modelId: 'untouched' },
  };
  const original = structuredClone(document);
  const next = config.migrateTargetRefs(document);
  assert.deepEqual(next, runtimeTargets.migrateTargetRefs(document));
  assert.equal(next.targetRefVersion, 1);
  assert.equal(next.activeModel, 'model:group%3Apool');
  assert.equal(next.clientDefaults.codex, 'model:auto');
  assert.equal(next.clientDefaults.claude, 'model:model%3Aalpha');
  assert.equal(next.clientRoleMatrix.default.implementer, 'model:stale%2Fid%3A%25');
  assert.deepEqual(next.roleDefaults.planner.fallback, ['model:%20Missing%20%2F%20ID%3A%25%20']);
  assert.equal(next.routingRules[0].fallback[1], 'model:Org%2FCase%3A%25%20%E6%A8%A1%E5%9E%8B');
  assert.deepEqual(next.intentRouting.intents[0].fallback, ['model:%20Stale%20%2F%20Case%3A%25%20']);
  assert.deepEqual(next.clientRoles, document.clientRoles);
  assert.deepEqual(next.intentRouting.rules, document.intentRouting.rules);
  assert.equal(next.roleDefaults.old, document.roleDefaults.old);
  assert.deepEqual(next.routingGroups, document.routingGroups);
  assert.equal(next.intentRouting.classifierModel, document.intentRouting.classifierModel);
  assert.deepEqual(config.migrateTargetRefs(next), next, 'migration is idempotent');
  assert.deepEqual(document, original);
});

for (const targetRefVersion of [undefined, 1]) test(`unknown metadata survives ${targetRefVersion || 'legacy'} migration, projection and group deletion without becoming references`, () => {
  const document = registry();
  if (targetRefVersion === undefined) delete document.targetRefVersion;
  document.activeModel = 'alpha';
  document.clientRoles = { codex: { planner: 'group:pool', opaque: 'model:%GG', fallback: [' Group:Pool '] } };
  document.roleDefaults = {
    legacy: 'group:pool', malformed: 'model:%GG', empty: null, flag: true, count: 7,
    list: ['group:pool', { preferredModel: 'group:pool', fallback: ['model:%GG'] }],
    planner: { taskType: 'plan', model: 'group:pool', target: 'model:%GG', extension: { preferredModel: 'group:pool' } },
  };
  document.intentRouting = { enabled: false, classifierModel: 'alpha', intents: [], rules: [{ modelId: 'group:pool', fallback: ['model:%GG'], target: ' Group:Pool ' }] };
  const original = structuredClone(document);
  const next = config.migrateTargetRefs(document);
  assert.deepEqual(next.clientRoles, document.clientRoles);
  assert.deepEqual(next.roleDefaults, document.roleDefaults);
  assert.deepEqual(next.intentRouting, document.intentRouting);
  assert.deepEqual(config.migrateTargetRefs(next), next);
  assert.deepEqual(config.assignmentReferences(next), [{ value: 'model:alpha', path: 'activeModel' }]);
  assert.deepEqual(toPolicyContext(next), { targetRefVersion: 1, roleDefaults: { planner: { taskType: 'plan' } }, routingRules: [] });
  for (const ref of ['group:pool', 'model:group%3Apool']) assert.deepEqual(config.routingTargetReferences(next, ref), []);
  const draft = config.toEditable(next);
  draft.routingGroups = [];
  const deleted = config.applyEdits(next, draft);
  assert.doesNotThrow(() => config.validateDocument(deleted, { previousDocument: next }));
  assert.deepEqual(deleted.clientRoles, document.clientRoles);
  assert.deepEqual(deleted.roleDefaults, document.roleDefaults);
  assert.deepEqual(deleted.intentRouting, document.intentRouting);
  assert.deepEqual(document, original);
  assert.deepEqual(next, runtimeTargets.migrateTargetRefs(document), 'runtime and UI preserve non-schema metadata identically');
});

test('applyEdits migrates the saved registry before applying v1 edits, including unedited stale rule refs and unknown metadata', () => {
  const document = registry();
  delete document.targetRefVersion;
  document.activeModel = 'group:pool';
  for (const id of ['group:pool', 'auto', 'model:alpha']) {
    document.models[id] = { protocols: ['openai-chat'] };
    document.providers.local.models.push(id);
  }
  document.clientDefaults = { codex: 'auto' };
  document.roleDefaults = { planner: { preferredModel: 'stale:group', extension: 'keep' } };
  document.routingRules = [{ taskType: 'plan', primary: 'model:alpha', fallback: ['stale'], extension: 'keep' }];
  document.clientRoleMatrix = { metadata: 'keep', default: { implementer: 'group:pool' } };
  const next = config.applyEdits(document, { targetRefVersion: 1, activeModel: 'group:pool' });
  assert.equal(next.activeModel, 'group:pool');
  assert.equal(next.clientDefaults.codex, 'model:auto');
  assert.equal(next.clientRoleMatrix.default.implementer, 'model:group%3Apool');
  assert.equal(next.clientRoleMatrix.metadata, 'keep');
  assert.equal(next.roleDefaults.planner.preferredModel, 'model:stale%3Agroup');
  assert.equal(next.routingRules[0].primary, 'model:model%3Aalpha');
  assert.deepEqual(next.routingRules[0].fallback, ['model:stale']);
  assert.equal(config.applyEdits(document, { activeModel: 'group:pool' }).activeModel, 'model:group%3Apool', 'old clients do not accidentally assign a group');
  assert.doesNotThrow(() => config.validateDocument(next, { previousDocument: document }));
  assert.ok(config.diffEditable(config.toEditable(document), config.toEditable(next)).includes('targetRefVersion'));
  assert.deepEqual(config.routingTargetReferences(next, 'model:auto'), ['clientDefaults.codex']);
});

test('Auto is a real override, not inheritance, and versioned IDs preserve literal bytes in policy parity', () => {
  for (const role of ['', 'implementer']) {
    const document = registry();
    document.clientRoleMatrix = { default: { implementer: 'model:beta' }, clients: { codex: { implementer: 'auto' } } };
    document.roleDefaults = { implementer: { preferredModel: 'model:beta' } };
    document.routingRules = [{ taskType: 'implementer', primary: 'model:beta', fallback: ['model:alpha'] }];
    document.clientDefaults = { codex: 'auto' };
    const preview = projectPolicyAssignment(document, { role, clientId: 'codex' });
    assert.equal(preview.modelId, 'alpha');
    assert.equal(preview.unavailableModelId, '');
    assert.equal(preview.configuredModelId, 'auto');
    assert.equal(resolveGatewayRoute({ registry: document, role, clientId: 'codex', env: {} }).modelId, preview.modelId);
    if (role) {
      delete document.clientRoleMatrix.clients.codex.implementer;
      assert.equal(projectPolicyAssignment(document, { role, clientId: 'codex' }).modelId, 'beta');
    }
  }
  const document = registry();
  const id = 'Org/Case:% 模型';
  document.models[id] = { protocols: ['openai-chat'], source: 'discovered', provider: 'local' };
  document.providers.local.models.push(id);
  document.activeModel = config.serializeTargetRef({ kind: 'model', id });
  assert.equal(projectPolicyAssignment(document).modelId, id);
  assert.equal(resolveGatewayRoute({ registry: document, env: {} }).modelId, id);
  for (const ref of ['group:pool', 'group:pool%2Fmissing', 'model:group%3Apool', 'model:auto']) {
    document.activeModel = ref;
    let expected = '';
    try { expected = resolveGatewayRoute({ registry: document, env: {} }).modelId; } catch {}
    assert.equal(projectPolicyAssignment(document).modelId, expected);
  }
});

test('ordered group validation mirrors runtime, including concrete prefix-named models and member order', () => {
  const document = registry();
  for (const group of [{ models: ['beta', 'alpha', 'beta'] }, { models: [] }, { models: ['alpha'], routing: 'rotate' }, { models: ['alpha'], enabled: false }, { models: ['group:pool'] }]) {
    document.routingGroups.pool = group;
    try { assert.deepEqual(config.orderedGroupMembers(document, 'pool'), runtimeMembers(document, 'pool')); }
    catch (error) {
      assert.throws(() => config.orderedGroupMembers(document, 'pool'));
      assert.throws(() => runtimeMembers(document, 'pool'));
    }
  }
});

test('policy expands ordered/smart group members, honors precedence and matches the runtime by protocol', () => {
  for (const mode of ['ordered', 'smart', undefined]) for (const [role, clientId, configure, expected] of [
    ['', '', (d) => { d.activeModel = 'group:pool'; }, 'beta'],
    ['', 'codex', (d) => { d.clientDefaults = { codex: 'group:pool' }; }, 'beta'],
    ['implementer', '', (d) => { d.clientRoleMatrix = { default: { implementer: 'group:pool' } }; }, 'beta'],
    ['implementer', 'codex', (d) => { d.clientRoleMatrix = { default: { implementer: 'alpha' }, clients: { codex: { implementer: 'group:pool' } } }; }, 'beta'],
    ['implementer', '', (d) => { d.roleDefaults = { implementer: { preferredModel: 'group:pool' } }; }, 'beta'],
    ['implementer', '', (d) => { d.routingRules = [{ taskType: 'implementer', primary: 'missing', fallback: ['group:pool'] }]; }, 'beta'],
    ['implementer', '', (d) => { d.clientRoleMatrix = { default: { implementer: 'missing' } }; d.roleDefaults = { implementer: { preferredModel: 'alpha' } }; d.routingRules = [{ taskType: 'implementer', primary: 'alpha', fallback: ['group:pool'] }]; }, 'beta'],
  ]) {
    const document = registry();
    document.routingGroups.pool.routing = mode;
    configure(document);
    const projected = projectPolicyAssignment(document, { role, clientId });
    assert.equal(projected.modelId, expected);
    assert.equal(projected.unavailableModelId, projected.configuredModelId === 'missing' ? 'missing' : '');
    assert.ok(projected.candidateIds.includes('beta'));
    for (const clientProtocol of ['openai-chat', 'openai-response', 'claude', 'gemini']) {
      assert.equal(resolveGatewayRoute({ registry: document, env: {}, role, clientId, clientProtocol }).modelId, projected.modelId);
    }
  }
});

test('legacy auto preview mirrors group expansion, Auto overrides, fail-closed groups and singleton suppression', () => {
  for (const [name, configure] of [
    ['role default group', (d) => { d.roleDefaults.implementer.preferredModel = 'group:pool'; }],
    ['matrix group', (d) => { d.clientRoleMatrix.default.implementer = 'group:pool'; }],
    ['legacy smart', (d) => { d.routingGroups.pool.routing = 'smart'; d.clientRoleMatrix.default.implementer = 'group:pool'; }],
    ['Auto skips fixed preference', (d) => { d.clientRoleMatrix.default.implementer = 'auto'; }],
    ['Auto uses global when no fallback', (d) => { d.clientRoleMatrix.default.implementer = 'auto'; d.routingRules[0].fallback = []; }],
    ['unusable model proceeds to group fallback', (d) => { d.clientRoleMatrix.default.implementer = 'model:missing'; d.routingRules[0].fallback = ['group:pool']; }],
    ['empty group fails closed', (d) => { d.clientRoleMatrix.default.implementer = 'group:pool'; d.routingGroups.pool.models = []; }],
    ['unsupported group fails closed', (d) => { d.clientRoleMatrix.default.implementer = 'group:pool'; d.routingGroups.pool.routing = 'weight'; }],
    ['paused-only group fails closed', (d) => { d.clientRoleMatrix.default.implementer = 'group:pool'; d.routingGroups.pool.models = ['paused']; }],
    ['explicit group suppresses singleton shortcut', (d) => { d.clientRoleMatrix.default.implementer = 'group:missing'; d.models.beta.enabled = false; }],
    ['unusable global group suppresses singleton shortcut', (d) => { d.activeModel = 'group:missing'; d.roleDefaults = {}; d.routingRules = []; d.models.beta.enabled = false; }],
  ]) {
    const document = registry();
    document.roleDefaults = { implementer: { preferredModel: 'model:beta' } };
    document.routingRules = [{ taskType: 'implementer', primary: 'model:beta', fallback: ['model:alpha'] }];
    document.clientRoleMatrix = { default: {} };
    configure(document);
    const preview = config.toAutoPreview(document).find((entry) => entry.role === 'implementer');
    const selected = (registry) => {
      try { return resolveGatewayRoute({ registry, role: 'implementer', env: {} }).modelId; } catch { return ''; }
    };
    assert.equal(preview.effectiveModelId, selected(document), name);
    assert.equal(preview.effectiveModelId, projectPolicyAssignment(document, { role: 'implementer' }).modelId, name);
    const inherited = structuredClone(document);
    inherited.clientRoleMatrix = { default: {} };
    assert.equal(preview.autoModelId, selected(inherited), `${name}: inherited`);
    assert.equal(preview.available, Boolean(preview.effectiveModelId), name);
  }
});

test('explicit groups are never replaced by the single-model shortcut, including unusable groups', () => {
  for (const group of [{ models: ['alpha'], routing: 'ordered' }, { models: [] }, { models: ['alpha'], routing: 'weight' }, { models: ['paused'] }, { models: ['alpha'], enabled: false }, null]) {
    const document = registry();
    document.providers.local.models = ['alpha', 'paused'];
    document.activeModel = 'group:pool';
    if (group) document.routingGroups.pool = group;
    else delete document.routingGroups.pool;
    const projected = projectPolicyAssignment(document);
    assert.notEqual(projected.source, '单模型直连');
    if (group?.models[0] === 'alpha' && group.routing === 'ordered') {
      assert.equal(projected.modelId, 'alpha');
      assert.equal(resolveGatewayRoute({ registry: document, env: {} }).modelId, 'alpha');
    } else {
      assert.equal(projected.modelId, '');
      assert.equal(projected.unavailableModelId, 'group:pool');
      assert.throws(() => resolveGatewayRoute({ registry: document, env: {} }));
    }
  }
});

test('an invalid selected group fails closed rather than claiming a later scalar default; ordinary fallback still works', () => {
  const document = registry();
  document.clientRoleMatrix = { default: { implementer: 'group:empty' } };
  document.routingGroups.empty = { models: [] };
  document.routingRules = [{ taskType: 'implementer', fallback: ['alpha'] }];
  assert.equal(projectPolicyAssignment(document, { role: 'implementer' }).modelId, '');
  assert.throws(() => resolveGatewayRoute({ registry: document, env: {}, role: 'implementer' }));
});
