import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import {
  applyEdits, diffEditable, migrateTargetRefs, toEditable, toModelBindings, toModelCatalog, validateDocument,
} from '../../../../../apps/shell/ui/src/lib/config/model-routing.mjs';
import { resolveGatewayRoute } from '../../../../lib/tooling/model-router/gateway/router.mjs';
import { CLIENT_DEFINITIONS } from '../../../../lib/foundation/clients/selection/core/definitions.mjs';

const ui = new URL('../../../../../apps/shell/ui/', import.meta.url);
const protocols = ['openai-chat', 'openai-response', 'claude', 'gemini'];
const loadPolicy = () => import(new URL('src/lib/config/routing-policy.mjs', ui));
const registry = () => ({
  providers: { local: { baseUrl: 'http://provider.invalid', protocols, models: ['alpha', 'beta', 'gamma', 'delta'], authMode: 'none' } },
  models: Object.fromEntries(['alpha', 'beta', 'gamma', 'delta'].map((id, index) => [id, { protocols: [protocols[index]], label: id }])),
  activeModel: 'alpha',
  clientDefaults: { codex: 'beta', 'future-client': 'gamma' },
  clientRoleMatrix: { default: { implementer: 'gamma', 'future-role': 'beta' }, clients: { codex: { implementer: 'delta' }, 'future-client': { 'future-role': 'beta' } }, extra: { keep: true } },
  roleDefaults: { implementer: { taskType: 'implementation', preferredModel: 'beta' } },
  routingRules: [{ taskType: 'implementation', primary: 'gamma', fallback: ['delta'] }],
  extra: { keep: true },
});

test('scalar defaults migrate, canonicalize, diff, and sparsely remove without losing unknown metadata', () => {
  const document = registry();
  const before = structuredClone(document);
  const editable = toEditable(document);
  assert.equal(editable.activeModel, 'alpha');
  assert.deepEqual(editable.clientDefaults, document.clientDefaults);
  editable.activeModel = 'beta';
  editable.clientDefaults.codex = 'delta';
  editable.matrix.default[' New-Role '] = 'alpha';
  const next = applyEdits(document, editable);
  assert.equal(next.activeModel, 'model:beta');
  assert.deepEqual(next.clientDefaults, { codex: 'model:delta', 'future-client': 'model:gamma' });
  assert.equal(next.clientRoleMatrix.default['new-role'], 'model:alpha');
  assert.deepEqual(next.clientRoleMatrix.extra, document.clientRoleMatrix.extra);
  assert.equal(next.clientRoleMatrix.clients['future-client']['future-role'], 'model:beta');
  assert.deepEqual(next.extra, document.extra);
  assert.deepEqual(diffEditable(toEditable(document), toEditable(next)), ['targetRefVersion', 'activeModel', 'clientDefaults', 'clientRoleMatrix']);
  const cleared = toEditable(next);
  cleared.activeModel = '';
  cleared.clientDefaults = { codex: '', 'future-client': '' };
  const sparse = applyEdits(next, cleared);
  assert.equal(Object.hasOwn(sparse, 'activeModel'), false);
  assert.equal(Object.hasOwn(sparse, 'clientDefaults'), false);
  assert.deepEqual(document, before, 'the source document is never mutated');
});

test('omitted editable fields preserve saved defaults, providers, and matrix sections', () => {
  const document = registry();
  const next = applyEdits(document, { activeModel: 'beta' });
  assert.equal(next.activeModel, 'model:beta');
  const migrated = migrateTargetRefs(document);
  for (const key of ['providers', 'models', 'clientDefaults', 'clientRoleMatrix', 'roleDefaults', 'routingRules', 'extra']) assert.deepEqual(next[key], migrated[key], key);
  const oldClient = toEditable(document);
  delete oldClient.activeModel;
  delete oldClient.clientDefaults;
  assert.deepEqual(applyEdits(document, oldClient).clientDefaults, migrated.clientDefaults);
  assert.equal(applyEdits(document, oldClient).activeModel, 'model:alpha');
});

test('default scalar structure is validated instead of coercing malformed values', () => {
  for (const patch of [{ activeModel: null }, { activeModel: 2 }, { activeModel: {} },
    { clientDefaults: null }, { clientDefaults: [] }, { clientDefaults: { codex: {} } }, { clientDefaults: { ' ': 'alpha' } }]) {
    const document = { ...registry(), ...patch };
    assert.throws(() => validateDocument(document), { name: 'ConfigError' }, JSON.stringify(patch));
    assert.throws(() => applyEdits(registry(), patch), { name: 'ConfigError' }, JSON.stringify(patch));
  }
});

test('missing and unbound defaults are rejected even unchanged, and explicit repair is required', () => {
  for (const id of ['missing', 'unbound']) for (const field of ['activeModel', 'clientDefaults']) {
    const document = registry();
    document.models.unbound = { protocols: ['claude'] };
    if (field === 'activeModel') document.activeModel = id;
    else document.clientDefaults.codex = id;
    const editable = toEditable(document);
    editable.providers[0].baseUrl = 'http://changed.invalid';
    assert.throws(() => applyEdits(document, editable), /enabled explicit provider binding/u);
    for (const options of [{}, { previousDocument: document }]) {
      assert.throws(() => validateDocument(document, options), /enabled explicit provider binding/u);
    }
    if (field === 'activeModel') editable.activeModel = '';
    else delete editable.clientDefaults.codex;
    assert.doesNotThrow(() => validateDocument(applyEdits(document, editable), { previousDocument: document }));
  }
});

test('ambiguous launcher assignments must be repaired, not grandfathered by unrelated saves', () => {
  const document = registry();
  document.models.template = { provider: 'native-launcher', protocols: ['openai-chat'] };
  document.providers.local.models.push('template');
  document.providers.other = { ...document.providers.local, models: ['template'], enabled: false };
  document.activeModel = 'template';
  document.clientDefaults.codex = 'template';
  document.clientRoleMatrix.default.implementer = 'template';
  document.clientRoleMatrix.clients.codex.implementer = 'template';
  for (const change of [() => {}, (draft) => { draft.providers[0].baseUrl = 'http://changed.invalid'; }]) {
    const draft = toEditable(document);
    change(draft);
    assert.throws(() => applyEdits(document, draft), /enabled explicit provider binding/u);
    draft.providers = draft.providers.filter((provider) => provider.id !== 'other');
    const next = applyEdits(document, draft);
    assert.doesNotThrow(() => validateDocument(next, { previousDocument: document }));
    for (const key of ['models', 'activeModel', 'clientDefaults', 'clientRoleMatrix']) assert.deepEqual(next[key], migrateTargetRefs(document)[key], key);
  }
});

test('editing one assignment preserves valid unknown client/role keys and original spelling', () => {
  const document = registry();
  delete document.clientDefaults['future-client'];
  delete document.clientRoleMatrix.default['future-role'];
  delete document.clientRoleMatrix.clients['future-client'];
  document.clientDefaults['Future-Client'] = ' BETA ';
  document.clientRoleMatrix.default['Future-Role'] = ' BETA ';
  document.clientRoleMatrix.clients['Future-Client'] = { 'Future-Role': ' BETA ' };
  document.models[' BETA '] = { source: 'discovered', provider: 'local', protocols: ['openai-chat'] };
  const editable = toEditable(document);
  editable.clientDefaults.codex = 'delta';
  editable.matrix.default.planner = 'alpha';
  editable.matrix.clients.codex.reviewer = 'beta';
  const next = applyEdits(document, editable);
  assert.doesNotThrow(() => validateDocument(next, { previousDocument: document }));
  assert.equal(next.clientDefaults['Future-Client'], 'model:%20BETA%20');
  assert.equal(next.clientRoleMatrix.default['Future-Role'], 'model:%20BETA%20');
  assert.deepEqual(next.clientRoleMatrix.clients['Future-Client'], { 'Future-Role': 'model:%20BETA%20' });
});

test('pausing a real binding preserves assignments without making it selectable for new assignments', () => {
  for (const pause of ['provider', 'model']) {
    const document = registry();
    const draft = toEditable(document);
    if (pause === 'provider') draft.providers[0].enabled = false;
    else {
      document.models.alpha.source = 'custom';
      document.models.alpha.provider = 'local';
      draft.customModels = toEditable(document).customModels.map((model) => ({ ...model, enabled: false }));
    }
    const next = applyEdits(document, draft);
    assert.equal(next.activeModel, 'model:alpha');
    assert.doesNotThrow(() => validateDocument(next, { previousDocument: document }));
    assert.throws(() => applyEdits(next, { clientDefaults: { codex: 'alpha' } }), /enabled explicit provider binding/u);
    const unbound = structuredClone(next);
    unbound.providers.local.models = [];
    if (pause === 'model') delete unbound.models.alpha.provider;
    assert.throws(() => validateDocument(unbound, { previousDocument: next }), /enabled explicit provider binding/u);
  }
});

test('model and provider deletions cannot strand scalar default references', () => {
  for (const field of ['activeModel', 'clientDefaults']) {
    const document = registry();
    document.clientRoleMatrix = {};
    document.activeModel = field === 'activeModel' ? 'alpha' : '';
    document.clientDefaults = field === 'clientDefaults' ? { codex: 'alpha' } : {};
    for (const deletion of ['model', 'provider']) {
      const next = structuredClone(document);
      if (deletion === 'model') delete next.models.alpha;
      else next.providers = {};
      assert.throws(() => validateDocument(next, { previousDocument: document }), /removed|unknown model/u, `${field}: ${deletion}`);
      delete next.activeModel;
      delete next.clientDefaults;
      assert.doesNotThrow(() => validateDocument(next, { previousDocument: document }));
    }
  }
});

const scenarios = [
  ['global default', '', '', (d) => d, 'alpha', '全局指定'],
  ['client default', '', 'codex', (d) => d, 'beta', '客户端例外'],
  ['client role', 'implementer', 'codex', (d) => d, 'delta', '客户端例外'],
  ['global role', 'implementer', '', (d) => d, 'gamma', '全局角色指定'],
  ['role preference', 'implementer', '', (d) => { d.clientRoleMatrix = {}; }, 'beta', '角色默认'],
  ['task rule', 'implementer', '', (d) => { d.clientRoleMatrix = {}; delete d.roleDefaults.implementer.preferredModel; }, 'gamma', '任务规则'],
  ['stale client role skips all lower preferences', 'implementer', 'codex', (d) => { d.clientRoleMatrix.clients.codex.implementer = 'gone'; }, 'delta', '规则回落'],
  ['inactive preferred does not retry primary', 'implementer', '', (d) => { d.clientRoleMatrix = {}; d.models.beta.enabled = false; }, 'delta', '规则回落'],
  ['role rule target keeps runtime spelling', 'implementer', '', (d) => { d.clientRoleMatrix = {}; d.roleDefaults.implementer.preferredModel = ' BETA '; }, 'delta', '规则回落'],
  ['scalar defaults retain literal spelling', '', 'codex', (d) => { d.clientDefaults.codex = ' BETA '; }, 'alpha', '全局指定'],
  ['active is last', 'implementer', 'codex', (d) => { d.clientRoleMatrix.clients.codex.implementer = 'gone'; d.routingRules[0].fallback = ['gone']; }, 'alpha', '全局指定'],
  ['no inferred general task', '', '', (d) => { delete d.activeModel; d.routingRules.push({ taskType: 'general', primary: 'gamma' }); }, '', '未配置默认路由'],
  ['empty role preference precedes active', '', '', (d) => { d.roleDefaults[''] = { preferredModel: 'beta' }; }, 'beta', '角色默认'],
  ['empty role preference precedes client default', '', 'codex', (d) => { d.roleDefaults[''] = { preferredModel: 'gamma' }; }, 'gamma', '角色默认'],
  ['empty task primary precedes client default', '', 'codex', (d) => { d.routingRules.push({ taskType: '', primary: 'gamma', fallback: ['delta'] }); }, 'gamma', '任务规则'],
  ['empty role preference skips primary before client default', '', 'codex', (d) => { d.roleDefaults[''] = { preferredModel: 'gone' }; d.routingRules.push({ taskType: '', primary: 'gamma', fallback: ['delta'] }); }, 'beta', '客户端例外', ['gone', 'beta', 'delta', 'alpha']],
  ['empty task fallback follows unavailable client default', '', 'codex', (d) => { d.models.beta.enabled = false; d.routingRules.push({ taskType: '', primary: 'gone', fallback: ['delta'] }); }, 'delta', '规则回落'],
  ['empty task fallback precedes active', '', '', (d) => { d.routingRules.push({ taskType: '', primary: 'gone', fallback: ['delta'] }); }, 'delta', '规则回落'],
  ['empty role can explicitly name a task', '', '', (d) => { d.roleDefaults[''] = { taskType: 'implementation' }; }, 'gamma', '任务规则'],
  ['empty role target retains raw runtime spelling', '', '', (d) => { d.roleDefaults[''] = { preferredModel: ' BETA ' }; d.routingRules.push({ taskType: '', fallback: ['delta'] }); }, 'delta', '规则回落'],
  ['sole bound model ignores stale preference', 'implementer', 'codex', (d) => { d.models = { alpha: d.models.alpha }; }, 'alpha', '单模型直连'],
  ['no configured models', '', '', (d) => { d.providers = {}; }, '', '未配置默认路由'],
];

for (const [name, role, clientId, edit, expectedId, source, candidateIds] of scenarios) {
  test(`configuration-only policy parity by protocol: ${name}`, async () => {
    const { projectPolicyAssignment } = await loadPolicy();
    const document = registry();
    edit(document);
    const original = structuredClone(document);
    const projected = projectPolicyAssignment(document, { role, clientId });
    assert.deepEqual(Object.keys(projected).sort(), ['byProtocol', 'candidateIds', 'configuredModelId', 'modelId', 'note', 'source', 'unavailableModelId'].sort());
    assert.equal(projected.modelId, expectedId);
    assert.equal(projected.source, source);
    if (candidateIds) assert.deepEqual(projected.candidateIds, candidateIds);
    assert.deepEqual(projected.byProtocol.map((row) => row.protocol), protocols);
    for (const row of projected.byProtocol) {
      let actual = '';
      try { actual = resolveGatewayRoute({ registry: document, role, clientId, clientProtocol: row.protocol, env: {}, context: {} }).modelId; }
      catch (error) { assert.equal(error.code, 'NO_ROUTE_CONFIGURED'); }
      assert.equal(row.modelId, actual, `${name}: ${row.protocol}`);
    }
    assert.match(projected.note, /配置/u);
    assert.deepEqual(document, original);
  });
}

test('client eligibility and runtime aliases stay aligned without importing the runtime into UI code', async () => {
  const { projectPolicyAssignment } = await loadPolicy();
  for (const [id, definition] of [...Object.entries(CLIENT_DEFINITIONS), ['future-client', { modelRouting: 'own' }]]) {
    for (const clientId of new Set([id, definition.commandName, definition.runtimeClientId, ...(definition.commandAliases || [])].filter(Boolean))) {
      for (const role of ['', 'implementer']) {
        const document = registry();
        const preview = projectPolicyAssignment(document, { role, clientId });
        for (const { protocol, modelId } of preview.byProtocol) {
          if (definition.modelRouting === 'relay') {
            assert.equal(modelId, resolveGatewayRoute({ registry: document, role, clientId, clientProtocol: protocol, env: {}, context: {} }).modelId, `${clientId}/${role}`);
          } else {
            assert.throws(() => resolveGatewayRoute({ registry: document, role, clientId, clientProtocol: protocol, env: {}, context: {} }), /native model/u);
            assert.equal(modelId, '', `${clientId} is not assigned a gateway model`);
            assert.equal(preview.modelId, '');
            assert.equal(preview.source, '客户端不参与网关分配');
          }
        }
      }
    }
  }
});

test('stale target and ordered candidate chain remain visible rather than fabricated success', async () => {
  const { projectPolicyAssignment } = await loadPolicy();
  const document = registry();
  document.clientRoleMatrix.clients.codex.implementer = 'gone';
  document.routingRules[0].fallback = ['gone', 'delta', 'delta'];
  const projected = projectPolicyAssignment(document, { role: ' IMPLEMENTER ', clientId: ' CODEX ' });
  assert.equal(projected.configuredModelId, 'gone');
  assert.equal(projected.unavailableModelId, 'gone');
  assert.deepEqual(projected.candidateIds, ['gone', 'delta', 'alpha']);
  assert.equal(projected.modelId, 'delta');
  assert.match(projected.note, /不可用/u);
});

test('policy context is a whitelist, not a spread of arbitrary role/rule metadata', async () => {
  const { toPolicyContext } = await loadPolicy();
  const document = registry();
  document.roleDefaults.implementer.apiKey = 'DO_NOT_PROJECT';
  document.routingRules[0].env = { SECRET: 'DO_NOT_PROJECT' };
  document.routingRules[0].provider = { headers: { authorization: 'DO_NOT_PROJECT' } };
  assert.deepEqual(toPolicyContext(document), {
    roleDefaults: { implementer: { taskType: 'implementation', preferredModel: 'beta' } },
    routingRules: [{ taskType: 'implementation', primary: 'gamma', fallback: ['delta'] }],
  });
  assert.doesNotMatch(JSON.stringify(toPolicyContext(document)), /DO_NOT_PROJECT|apiKey|headers|SECRET/u);
});

test('inheritance removes only the normalized target override and preserves other exceptions', async () => {
  const { inheritPolicyDocument, projectPolicyAssignment } = await loadPolicy();
  const document = registry();
  document.clientRoleMatrix.clients[' CODEX '] = { ' IMPLEMENTER ': 'beta', reviewer: 'delta' };
  delete document.clientRoleMatrix.clients.codex;
  const original = structuredClone(document);
  const inherited = inheritPolicyDocument(document, ' IMPLEMENTER ', ' CODEX ');
  assert.equal(projectPolicyAssignment(inherited, { role: 'implementer', clientId: 'codex' }).modelId, 'gamma');
  assert.equal(inherited.clientRoleMatrix.clients[' CODEX '].reviewer, 'delta');
  assert.equal(inherited.clientRoleMatrix.clients['future-client']['future-role'], 'beta');
  assert.deepEqual(document, original);
});

// Run the real hook with a deterministic in-memory React state driver; fetch never leaves the process.
async function hookHarness(body, document) {
  const state = [];
  let cursor = 0;
  const react = { useState: (initial) => {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], (next) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
  }, useRef: (current) => {
    const index = cursor++;
    if (!(index in state)) state[index] = { current };
    return state[index];
  }, useCallback: (callback) => callback, useEffect: () => {} };
  const key = `__routing_policy_test_${Math.random().toString(36).slice(2)}`;
  globalThis[key] = react;
  const url = new URL('src/components/console/model-routing/use-routing-config.ts', ui);
  const source = fs.readFileSync(url, 'utf8')
    .replace(/import \{([^}]+)\} from 'react';/u, `const {$1} = globalThis[${JSON.stringify(key)}];`)
    .replaceAll("'../../../lib/config/model-routing.mjs'", JSON.stringify(new URL('src/lib/config/model-routing.mjs', ui).href))
    .replaceAll("'../../../lib/config/routing-policy.mjs'", JSON.stringify(new URL('src/lib/config/routing-policy.mjs', ui).href));
  const { useRoutingConfig } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { sourceUrl: url.href })).toString('base64')}`);
  const render = () => { cursor = 0; return useRoutingConfig(); };
  const { toPolicyContext } = await loadPolicy();
  let saved = document && structuredClone(document);
  const writes = [];
  const fetch = async (url, options = {}) => {
    assert.equal(url, '/api/config/model-routing', 'the hook must never access runtime services or other APIs');
    if (options.method === 'PUT') {
      const request = JSON.parse(options.body);
      assert.equal(request.expectedHash, body.hash);
      writes.push(request);
      if (saved) {
        const next = applyEdits(saved, request.editable);
        validateDocument(next, { previousDocument: saved });
        saved = next;
      }
      body = { ...body, hash: `test-hash-${writes.length}`, editable: saved ? toEditable(saved) : request.editable, ...(saved ? { policyContext: toPolicyContext(saved), modelBindings: toModelBindings(saved), models: toModelCatalog(saved) } : {}) };
      return Response.json({ ok: true, hash: body.hash, changed: ['routingGroups'], backup: null });
    }
    assert.equal(options.method, undefined);
    return Response.json(body);
  };
  const withFetch = async (callback) => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = fetch;
    try { return await callback(); } finally { globalThis.fetch = previousFetch; }
  };
  try { await withFetch(() => render().reload()); } finally { delete globalThis[key]; }
  return { render, withFetch, writes, saved: () => structuredClone(saved) };
}

test('hook recomputes full draft policy and targeted inheritance without changing saved auto or draft', async () => {
  const { toPolicyContext } = await loadPolicy();
  const { toModelBindings } = await import(new URL('src/lib/config/model-routing.mjs', ui));
  const document = registry();
  document.models.delta.source = 'discovered';
  const harness = await hookHarness({ editable: toEditable(document), policyContext: toPolicyContext(document), modelBindings: toModelBindings(document), hash: 'test-hash', auto: [{ role: 'sentinel' }] });
  let controller = harness.render();
  assert.equal(typeof controller.policyPreview, 'function');
  assert.deepEqual(controller.changes, []);
  assert.equal(controller.policyPreview('implementer', 'codex').modelId, 'delta');
  assert.equal(controller.policyPreview('implementer', 'codex', true).modelId, 'gamma');
  assert.equal(controller.policyPreview('implementer', '', true).modelId, 'beta');
  assert.equal(controller.policyPreview('', 'codex', true).modelId, 'alpha');
  assert.equal(controller.policyPreview('', '', true).modelId, '');
  const draft = structuredClone(controller.editable);
  draft.activeModel = 'gamma';
  draft.clientDefaults.codex = '';
  draft.matrix.default.implementer = '';
  draft.matrix.clients.codex.implementer = 'gone';
  draft.providers[0].models = ['alpha', 'beta', 'gamma'];
  controller.setEditable(draft);
  controller = harness.render();
  assert.equal(controller.policyPreview().modelId, 'gamma');
  assert.equal(controller.policyPreview('implementer', 'codex').modelId, 'gamma', 'removed binding affects the fallback chain immediately');
  assert.equal(controller.policyPreview('implementer', 'codex', true).modelId, 'beta', 'inheritance uses server role defaults plus current draft');
  assert.ok(controller.changes.length >= 3);
  assert.ok(controller.changes.some((line) => /gamma/u.test(line)));
  assert.deepEqual(controller.auto, [{ role: 'sentinel' }]);
  assert.deepEqual(controller.editable, draft);
});

test('hook preview follows custom-model edits, removals, and provider enablement before saving', async () => {
  const { toPolicyContext } = await loadPolicy();
  const { toModelBindings } = await import(new URL('src/lib/config/model-routing.mjs', ui));
  const document = registry();
  Object.assign(document.models.beta, { source: 'custom', provider: 'local', upstreamModel: 'Org/Exact-Beta', enabled: false });
  const harness = await hookHarness({ editable: toEditable(document), policyContext: toPolicyContext(document), modelBindings: toModelBindings(document), hash: 'test-hash' });
  let controller = harness.render();
  assert.equal(controller.policyPreview('', 'codex').modelId, 'alpha');
  const draft = structuredClone(controller.editable);
  draft.customModels[0].enabled = true;
  draft.customModels[0].protocols = ['gemini'];
  controller.setEditable(draft);
  controller = harness.render();
  assert.equal(controller.policyPreview('', 'codex').modelId, 'beta');
  assert.equal(controller.editable.customModels[0].upstreamModel, 'Org/Exact-Beta');
  controller.setEditable({ ...draft, providers: draft.providers.map((item) => ({ ...item, enabled: false })) });
  assert.equal(harness.render().policyPreview('', 'codex').modelId, '');
  controller.setEditable({ ...draft, customModels: [] });
  assert.equal(harness.render().policyPreview('', 'codex').modelId, 'alpha');
});

test('hook migrates only schema targets, keeps actual deletion blockers exactly once, and isolates unknown metadata', async () => {
  const { toPolicyContext } = await loadPolicy();
  for (const targetRefVersion of [undefined, 1]) {
    const document = registry();
    if (targetRefVersion) document.targetRefVersion = targetRefVersion;
    document.models['group:pool'] = { protocols: ['openai-chat'] };
    document.providers.local.models.push('group:pool');
    document.routingGroups = { pool: { models: ['beta'], routing: 'ordered' } };
    document.activeModel = 'group:pool';
    document.clientDefaults = { codex: 'group:pool' };
    document.clientRoleMatrix = { default: { implementer: 'group:pool' }, clients: { codex: { implementer: 'group:pool' } } };
    document.envModels = { planner: 'group:pool' };
    document.clientRoles = { codex: { planner: 'group:pool' } };
    document.roleDefaults = { implementer: { preferredModel: 'group:pool', fallback: ['group:pool'], model: 'not-a-reference', extension: 'private-metadata' }, legacy: 'group:pool' };
    document.routingRules = [{ taskType: 'implementation', primary: 'group:pool', fallback: ['group:pool'], target: 'private-metadata' }];
    document.intentRouting = { enabled: false, classifierModel: 'alpha', intents: [{ id: 'chat', description: 'Chat', modelId: 'group:pool', fallback: ['group:pool'], extension: 'private-metadata' }], rules: [{ modelId: 'group:pool', fallback: ['group:pool'], target: 'private-metadata' }] };
    const original = structuredClone(document);
    const context = toPolicyContext(document);
    assert.deepEqual(toPolicyContext(context), context, 'projection must be idempotent');
    assert.equal(JSON.stringify(context).includes('private-metadata'), false);
    assert.equal(JSON.stringify(context).includes('clientRoles'), false);
    assert.equal(JSON.stringify(context).includes('intentRouting.rules'), false);
    assert.equal(JSON.stringify(context).includes('roleDefaults.legacy'), false);
    assert.ok(context.targetReferences.every((entry) => Object.keys(entry).sort().join(',') === 'path,value'));
    const harness = await hookHarness({ editable: toEditable(document), policyContext: context, modelBindings: toModelBindings(document), hash: 'test-hash' });
    let controller = harness.render();
    assert.equal(controller.dirty, false, 'loading legacy targets does not dirty the draft');
    assert.equal(controller.editable.targetRefVersion, 1);
    const ref = targetRefVersion === 1 ? 'group:pool' : 'model:group%3Apool';
    assert.equal(controller.editable.activeModel, ref);
    assert.equal(controller.policyPreview().modelId, targetRefVersion === 1 ? 'beta' : 'group:pool');
    const expected = [
      'activeModel', 'clientDefaults.codex', 'clientRoleMatrix.default.implementer', 'clientRoleMatrix.clients.codex.implementer',
      'envModels.planner', 'roleDefaults.implementer.preferredModel', 'roleDefaults.implementer.fallback[0]',
      'routingRules[0].primary', 'routingRules[0].fallback[0]', 'intentRouting.intents[0].modelId', 'intentRouting.intents[0].fallback[0]',
    ];
    assert.deepEqual(controller.targetReferences(ref).sort(), expected.sort());
    assert.deepEqual(controller.targetReferences(targetRefVersion === 1 ? 'model:group%3Apool' : 'group:pool'), []);
    const draft = structuredClone(controller.editable);
    draft.activeModel = '';
    draft.clientDefaults = {};
    draft.matrix = { default: {}, clients: {} };
    draft.intentRouting.intents = [];
    controller.setEditable(draft);
    controller = harness.render();
    assert.deepEqual(controller.targetReferences(ref).sort(), expected.filter((path) => !['activeModel', 'clientDefaults.codex', 'clientRoleMatrix.default.implementer', 'clientRoleMatrix.clients.codex.implementer', 'intentRouting.intents[0].modelId', 'intentRouting.intents[0].fallback[0]'].includes(path)).sort(), 'removing an intent also removes its hidden fallback blockers from the shared draft');
    assert.deepEqual(document, original);
  }
});

test('context reference transport never promotes unknown metadata paths into deletion blockers', async () => {
  const { toPolicyContext } = await loadPolicy();
  const document = registry();
  document.routingGroups = { pool: { models: ['alpha'], routing: 'ordered' } };
  document.targetRefVersion = 1;
  document.targetReferences = [
    { path: 'envModels.planner', value: 'group:pool' },
    { path: 'roleDefaults.planner.fallback[0]', value: 'group:pool' },
    { path: 'clientRoles.codex.planner', value: 'group:pool' },
    { path: 'intentRouting.rules[0].modelId', value: 'group:pool' },
    { path: 'roleDefaults.legacy', value: 'model:%GG' },
    { path: 'roleDefaults.planner.extension.target', value: 'group:pool' },
  ];
  const context = toPolicyContext(document);
  assert.deepEqual(context.targetReferences, document.targetReferences.slice(0, 2));
  assert.deepEqual(toPolicyContext(context), context);
  const harness = await hookHarness({ editable: toEditable(document), policyContext: { ...context, targetReferences: document.targetReferences }, modelBindings: toModelBindings(document), hash: 'test-hash' });
  const controller = harness.render();
  assert.deepEqual(controller.targetReferences('group:pool').sort(), ['envModels.planner', 'roleDefaults.planner.fallback[0]']);
  assert.equal(controller.dirty, false);
});

test('hook shares canonical group and Auto edits across tasks, keeps classifiers concrete and saves once with metadata intact', async () => {
  const { toPolicyContext } = await loadPolicy();
  const document = registry();
  const rawId = ' Org/Case:% 模型 ';
  document.models[rawId] = { protocols: ['openai-chat'], source: 'custom', provider: 'local', extension: 'model-metadata' };
  document.providers.local.models.push(rawId);
  document.routingGroups = { pool: { models: ['beta', rawId], routing: 'smart', weights: { beta: 9 }, extension: { owner: 'fixture' } }, unsupported: { models: ['alpha'], routing: 'weight', weights: { alpha: 3 } } };
  document.roleDefaults.implementer.extension = { target: 'do-not-migrate' };
  document.routingRules[0].fallback = ['missing/stale', 'alpha'];
  document.routingRules[0].target = 'group:pool';
  document.intentRouting = { enabled: false, classifierModel: rawId, intents: [], rules: [{ modelId: 'missing:legacy', target: 'auto' }], extension: { retain: true } };
  const original = structuredClone(document);
  const harness = await hookHarness({ editable: toEditable(document), policyContext: toPolicyContext(document), modelBindings: toModelBindings(document), hash: 'test-hash' }, document);
  let controller = harness.render();
  assert.equal(controller.dirty, false);
  assert.deepEqual(controller.targets.filter((model) => model.source === 'group').map((model) => model.id), ['group:pool']);
  assert.ok(controller.models.some((model) => model.id === rawId));
  assert.equal(controller.models.some((model) => model.source === 'group' || model.id.startsWith('model:')), false);
  const draft = structuredClone(controller.editable);
  draft.routingGroups[0].models = [rawId, 'beta'];
  draft.routingGroups.push({ id: 'new-pool', models: ['gamma'], routing: 'ordered' });
  draft.activeModel = 'group:pool';
  draft.clientDefaults.codex = 'auto';
  draft.matrix.default.implementer = 'group:new-pool';
  draft.matrix.clients.codex.implementer = 'auto';
  draft.intentRouting.enabled = true;
  draft.intentRouting.intents = [{ id: 'chat', description: 'Chat', modelId: 'group:pool' }, { id: 'other', description: 'Other', modelId: 'auto' }];
  controller.setEditable(draft);
  controller = harness.render();
  assert.equal(controller.policyPreview().modelId, rawId);
  assert.equal(controller.policyPreview('implementer').modelId, 'gamma');
  assert.equal(controller.policyPreview('implementer', 'codex').modelId, 'alpha', 'Auto skips the fixed group and uses the rule fallback');
  assert.equal(controller.policyPreview('implementer', 'codex', true).modelId, 'gamma');
  assert.ok(controller.targets.some((target) => target.id === 'group:new-pool'));
  assert.equal(controller.editable.intentRouting.classifierModel, rawId);
  assert.deepEqual(controller.targetReferences('model:' + encodeURIComponent(rawId)).sort(), ['intentRouting.classifierModel', 'routingGroups.pool.models']);
  assert.deepEqual(harness.writes, []);
  assert.equal((await harness.withFetch(() => controller.save())).ok, true);
  controller = harness.render();
  assert.equal(controller.dirty, false);
  assert.equal(harness.writes.length, 1);
  assert.deepEqual(harness.writes[0].editable, draft);
  assert.equal(Object.hasOwn(harness.writes[0].editable, 'targetReferences'), false);
  const saved = harness.saved();
  assert.equal(saved.targetRefVersion, 1);
  assert.equal(saved.activeModel, 'group:pool');
  assert.equal(saved.clientDefaults.codex, 'auto');
  assert.equal(saved.clientRoleMatrix.clients.codex.implementer, 'auto');
  assert.equal(saved.intentRouting.classifierModel, rawId);
  assert.deepEqual(saved.intentRouting.intents.map((entry) => entry.modelId), ['group:pool', 'auto']);
  assert.deepEqual(saved.routingGroups.pool, { ...document.routingGroups.pool, models: [rawId, 'beta'] });
  assert.deepEqual(saved.routingGroups.unsupported, document.routingGroups.unsupported);
  assert.deepEqual(saved.roleDefaults.implementer.extension, document.roleDefaults.implementer.extension);
  assert.equal(saved.routingRules[0].target, 'group:pool', 'non-schema target metadata is not migrated');
  assert.deepEqual(saved.routingRules[0].fallback, ['model:missing%2Fstale', 'model:alpha']);
  assert.deepEqual(saved.intentRouting.rules, document.intentRouting.rules, 'unknown intent rules remain exact metadata');
  assert.deepEqual(saved.intentRouting.extension, { retain: true });
  assert.deepEqual(saved.extra, document.extra);
  assert.deepEqual(saved.models[rawId], document.models[rawId]);
  assert.deepEqual(document, original);
  const paused = structuredClone(controller.editable);
  paused.providers[0].enabled = false;
  controller.setEditable(paused);
  assert.deepEqual(harness.render().targets, []);
  assert.deepEqual(harness.render().models, []);
});
