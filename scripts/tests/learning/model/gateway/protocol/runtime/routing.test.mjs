import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGatewayRoutes, resolveGatewayRoute } from '../../../../../../lib/tooling/model-router/gateway/router.mjs';
import { orderedGroupMembers } from '../../../../../../lib/tooling/model-router/routing/groups.mjs';
import { getIntentRouting } from '../../../../../../lib/tooling/model-router/routing/intent.mjs';
import { migrateTargetRefs } from '../../../../../../lib/tooling/model-router/routing/targets.mjs';

const model = () => ({ source: 'custom', provider: 'local', protocols: ['claude'] });
const registry = () => ({
  activeModel: 'first', models: Object.fromEntries(['first', 'second', 'auto', 'group:x', 'aios-auto', 'aios/model/x', 'Case/ID %'].map((id) => [id, model()])),
  providers: { local: { baseUrl: 'http://127.0.0.1:19001', authMode: 'none', protocols: ['claude'] } },
  routingGroups: { x: { models: ['second', 'first'] }, 'Case/Group': { models: ['second'] } },
});
const resolve = (document, extra = {}) => resolveGatewayRoutes({ registry: document, env: {}, ...extra });

test('ordinary incoming IDs remain Auto placeholders even when registered or group-like', () => {
  for (const requestedModel of ['second', 'auto', 'group:x', 'Case/ID %', 'model:second', 'native-placeholder']) {
    const [route] = resolve(registry(), { requestedModel });
    assert.equal(route.modelId, 'first', requestedModel);
    assert.equal(route.explicit, false);
  }
});

test('reserved encoded IDs select the exact raw model or ordered group', () => {
  const document = registry();
  for (const id of Object.keys(document.models)) {
    const [route] = resolve(document, { requestedModel: `aios/model/${encodeURIComponent(id)}` });
    assert.equal(route.modelId, id);
    assert.equal(route.targetRef, `model:${encodeURIComponent(id)}`);
    assert.equal(route.explicit, true);
  }
  assert.deepEqual(resolve(document, { requestedModel: 'aios/group/x' }).map((route) => route.modelId), ['second', 'first']);
  assert.equal(resolve(document, { requestedModel: 'aios/group/Case%2FGroup' })[0].groupId, 'Case/Group');
});

test('explicit models bypass malformed configured assignments and preserve whitespace in raw IDs', () => {
  const document = { ...registry(), targetRefVersion: 1, activeModel: 'model:%' };
  document.models[' Raw ID '] = model();
  assert.equal(resolve(document, { requestedModel: 'aios/model/%20Raw%20ID%20' })[0].modelId, ' Raw ID ');
});

test('provider model lists bind exact registered identities before legacy normalized aliases', () => {
  const document = registry();
  document.activeModel = 'Case';
  document.models = { Case: { protocols: ['claude'] }, case: { protocols: ['claude'] } };
  document.providers.local.models = ['Case'];
  assert.equal(resolve(document, { requestedModel: 'aios/model/Case' })[0].modelId, 'Case');
  assert.throws(() => resolve(document, { requestedModel: 'aios/model/case' }), { code: 'NO_ROUTE_CONFIGURED' });
  document.models[' Raw ID '] = { protocols: ['claude'] };
  document.providers.local.models = [' Raw ID ', ' CASE '];
  assert.equal(resolve(document, { requestedModel: 'aios/model/%20Raw%20ID%20' })[0].modelId, ' Raw ID ');
  assert.equal(resolve(document, { requestedModel: 'aios/model/case' })[0].modelId, 'case');
  assert.throws(() => resolve(document, { requestedModel: 'aios/model/Case' }), { code: 'NO_ROUTE_CONFIGURED' });
});

test('both target headers and Gemini selectors share one canonical agreement rule', () => {
  assert.equal(resolve(registry(), { requestedModel: 'placeholder', headerTargets: ['aios/model/Case%2fID%20%25', 'aios/model/Case%2FID%20%25'], pathModel: 'aios/model/Case%2FID%20%25' })[0].modelId, 'Case/ID %');
  for (const selectors of [
    { requestedModel: 'aios/model/first', headerTargets: ['aios/model/second'] },
    { requestedModel: 'aios-auto', pathModel: 'aios/group/x' },
    { headerTargets: ['aios/model/first', 'aios/group/x'] },
  ]) assert.throws(() => resolve(registry(), selectors), { code: 'TARGET_SELECTOR_CONFLICT' });
});

test('invalid explicit selectors are never rescued by a single-model shortcut', () => {
  const document = registry();
  document.models = { first: model() };
  for (const requestedModel of ['aios/model/missing', 'aios/group/missing', 'aios/nonsense/x', 'aios/model/%', 'aios/model/first/extra']) {
    assert.throws(() => resolve(document, { requestedModel }), (error) => error.status === 400);
  }
});

test('unversioned configured auto/group-prefix values stay literal models, including after migration', () => {
  for (const activeModel of ['auto', 'group:x', 'aios/model/x']) {
    const document = { ...registry(), activeModel };
    assert.equal(resolve(document)[0].modelId, activeModel);
    assert.equal(resolve(migrateTargetRefs(document))[0].modelId, activeModel);
  }
});

test('v1 assignments resolve ordered groups from every gateway candidate source without normalization', () => {
  const base = { ...registry(), targetRefVersion: 1, activeModel: 'model:first' };
  const cases = [
    [{ activeModel: 'group:Case%2FGroup' }, {}],
    [{ clientDefaults: { claude: 'group:Case%2FGroup' } }, { clientId: 'claude' }],
    [{ clientRoleMatrix: { default: { reviewer: 'group:Case%2FGroup' } } }, { role: 'reviewer' }],
    [{ clientRoleMatrix: { clients: { claude: { reviewer: 'group:Case%2FGroup' } } } }, { role: 'reviewer', clientId: 'claude' }],
    [{ roleDefaults: { reviewer: { preferredModel: 'group:Case%2FGroup' } } }, { role: 'reviewer' }],
    [{ routingRules: [{ taskType: 'reviewer', primary: 'group:Case%2FGroup' }] }, { role: 'reviewer' }],
    [{ routingRules: [{ taskType: 'reviewer', primary: 'model:missing', fallback: ['group:Case%2FGroup'] }] }, { role: 'reviewer' }],
    [{}, { intent: { intentId: 'review', modelId: 'group:Case%2FGroup' } }],
    [{}, { role: 'reviewer', env: { AIOS_MODEL_REVIEWER: 'group:Case%2FGroup' } }],
  ];
  for (const [fields, options] of cases) {
    const [route] = resolve({ ...base, ...fields }, options);
    assert.equal(route.modelId, 'second', JSON.stringify([fields, options]));
    assert.equal(route.targetRef, 'group:Case%2FGroup');
  }
});

test('configured groups are strict even with one otherwise eligible model', () => {
  const document = { ...registry(), targetRefVersion: 1, activeModel: 'group:x', models: { first: model() } };
  document.routingGroups.x.models = ['second'];
  assert.throws(() => resolve(document), { code: 'INVALID_ROUTING_GROUP' });
  document.routingGroups.x = { models: ['first'], routing: 'weighted' };
  assert.throws(() => resolve(document), { code: 'UNSUPPORTED_GROUP_ROUTING' });
});

test('groups accept only concrete registered IDs, including reserved-looking literal IDs', () => {
  const document = registry();
  for (const routing of [undefined, 'smart', 'ordered']) {
    document.routingGroups.x = { models: ['group:x', 'auto', 'aios-auto', 'aios/model/x', 'auto'], routing };
    assert.deepEqual(orderedGroupMembers(document, 'x'), ['group:x', 'auto', 'aios-auto', 'aios/model/x']);
  }
  for (const group of [{ models: ['x'] }, { models: ['group:unknown'] }, { models: [] }, { models: ['first'], enabled: false }, { models: ['first'], routing: 'weighted' }]) {
    document.routingGroups.x = group;
    assert.throws(() => orderedGroupMembers(document, 'x'));
  }
});

test('classifier IDs remain concrete while intent assignments use persisted reference semantics', () => {
  const document = { ...registry(), targetRefVersion: 1, intentRouting: { classifierModel: 'group:x', intents: [{ id: 'Review', modelId: 'group:Case%2FGroup' }] } };
  const config = getIntentRouting(document);
  assert.equal(config.classifierModel, 'group:x');
  assert.equal(config.intents[0].modelId, 'group:Case%2FGroup');
  const route = resolveGatewayRoute({ registry: document, env: {}, intent: { intentId: 'review', modelId: config.intents[0].modelId } });
  assert.equal(route.groupId, 'Case/Group');
  assert.equal(route.decision.intent, 'review');
});
