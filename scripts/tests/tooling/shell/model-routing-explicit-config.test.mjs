import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  applyEdits, migrateTargetRefs, modelBindingId, toAutoPreview, toEditable, toModelBindings, toModelCatalog, validateDocument,
} from '../../../../apps/shell/ui/src/lib/config/model-routing.mjs';

const ui = new URL('../../../../apps/shell/ui/', import.meta.url);
async function handler(relative) {
  const url = new URL(relative, ui);
  const source = fs.readFileSync(url, 'utf8')
    .replace("'../../../../lib/config/model-routing.mjs'", JSON.stringify(new URL('src/lib/config/model-routing.mjs', ui).href))
    .replace("'../../../../lib/config/model-registry-store.mjs'", JSON.stringify(new URL('src/lib/config/model-registry-store.mjs', ui).href))
    .replace("'../../../../lib/config/routing-policy.mjs'", JSON.stringify(new URL('src/lib/config/routing-policy.mjs', ui).href));
  return import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { sourceUrl: url.href })).toString('base64')}`);
}
const config = await handler('src/app/api/config/model-routing/route.ts');
const gateway = await handler('src/app/api/model-routing/gateway/route.ts');
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (text) => createHash('sha256').update(text).digest('hex');
const provider = (patch = {}) => ({ baseUrl: 'http://127.0.0.1:11434/v1', protocols: ['openai-chat'], models: [], authMode: 'none', endpointStyle: 'standard', ...patch });
const model = (patch = {}) => ({ source: 'custom', provider: 'local', protocols: ['openai-chat'], upstreamModel: 'Org/Model-Instruct', ...patch });
const registry = () => ({ providers: { local: provider() }, models: { 'local/model': model() }, extension: { keep: ['metadata'] } });

test('an empty registry and native launcher templates never become implicit gateway candidates', () => {
  for (const document of [{}, { models: {
    template: { provider: 'codex', protocols: ['openai-response'], strengths: ['code'] },
    legacy: { source: 'custom', protocols: ['openai-chat'] },
  } }, { providers: { local: provider() }, models: { template: { protocols: ['openai-chat'] } } }]) {
    assert.deepEqual(toModelCatalog(document), []);
    assert.deepEqual(toModelBindings(document), []);
    assert.ok(toAutoPreview(document).every((role) => role.effectiveModelId === '' && role.available === false));
  }
});

test('custom and discovered candidates require explicit compatible bindings, not credentials or protocol guesses', () => {
  const document = registry();
  document.providers.local = provider({ authMode: 'required', apiKeyEnv: 'env:NOT_RESOLVED_BY_UI', protocols: ['messages', 'openai-chat'] });
  document.models['local/model'].protocols = ['claude', 'openai-response'];
  document.models.found = model({ source: 'discovered', upstreamModel: 'Case/Sensitive', protocols: ['openai-chat'] });
  document.models.unbound = { protocols: ['openai-chat'] };
  const catalog = toModelCatalog(document);
  assert.deepEqual(catalog.map((entry) => entry.id), ['local/model', 'found']);
  assert.deepEqual(catalog[0].protocols, ['claude']);
  assert.equal(catalog[1].upstreamModel, 'Case/Sensitive');
  assert.ok(catalog.every((entry) => entry.provider === 'local' && entry.generationVerified === false));
});

test('provider model lists bind only existing models and must be unambiguous even with a disabled duplicate', () => {
  const document = { providers: { local: provider({ models: ['template', 'ghost'] }) }, models: {
    template: { provider: 'native-launcher', protocols: ['openai-chat'], strengths: ['preserve'] },
  } };
  assert.deepEqual(toModelCatalog(document).map((entry) => [entry.id, entry.provider]), [['template', 'local']]);
  document.providers.other = provider({ models: ['template'], enabled: false });
  assert.deepEqual(toModelCatalog(document), []);
  document.models.template = model({ provider: 'local' });
  assert.equal(toModelCatalog(document)[0].provider, 'local', 'an explicit custom binding takes precedence over lists');
  document.models.template.provider = 'missing';
  assert.deepEqual(toModelCatalog(document), [], 'a missing explicit binding cannot escape to a provider list');
});

test('disabled and malformed bindings cannot enter strategy candidates', () => {
  for (const patch of [{ enabled: false }, { enabled: 'true' }, { provider: 'missing' }, { provider: {} },
    { protocols: [] }, { protocols: 'openai-chat' }, { protocols: ['openai-chat', 'bogus'] },
    { protocols: ['claude'] }, { upstreamModel: '' }, { upstreamModel: 42 }]) {
    const document = registry();
    Object.assign(document.models['local/model'], patch);
    assert.deepEqual(toModelCatalog(document), [], JSON.stringify(patch));
  }
  for (const patch of [{ enabled: false }, { enabled: 'true' }, { protocols: [] }, { protocols: ['claude'] },
    { protocols: ['openai-chat', 'bogus'] }, { authMode: 'optional' }, { endpointStyle: 'unknown' }]) {
    const document = registry();
    Object.assign(document.providers.local, patch);
    assert.deepEqual(toModelCatalog(document), [], JSON.stringify(patch));
  }
});

test('inactive explicit model definitions can be re-enabled in a shared draft without losing declared protocols', () => {
  const document = registry();
  document.models['local/model'].source = 'discovered';
  document.models['local/model'].protocols = ['openai-chat', 'claude'];
  document.providers.local.enabled = false;
  assert.deepEqual(toModelCatalog(document), []);
  const bindings = toModelBindings(document);
  assert.deepEqual(bindings[0].protocols, ['openai-chat', 'claude']);
  const draft = { providers: { local: provider({ protocols: ['claude'] }) }, models: Object.fromEntries(bindings.map((entry) => [entry.id, entry])) };
  assert.deepEqual(toModelCatalog(draft)[0].protocols, ['claude']);
});

test('management bindings retain disabled children and resolve explicit provider lists without adding route candidates', () => {
  const document = {
    providers: { local: provider({ enabled: false, models: ['listed'] }) },
    models: {
      disabled: model({ source: 'discovered', enabled: false }),
      listed: { provider: 'native-launcher', protocols: ['openai-chat'], enabled: false },
      template: { provider: 'native-launcher', protocols: ['openai-chat'] },
    },
  };
  assert.deepEqual(toModelBindings(document).map(({ id, provider, enabled }) => ({ id, provider, enabled })), [
    { id: 'disabled', provider: 'local', enabled: false },
    { id: 'listed', provider: 'local', enabled: false },
  ]);
  assert.deepEqual(toModelCatalog(document), []);
});

test('authMode, endpointStyle, enabled, upstream ids and unknown metadata round-trip', () => {
  const document = registry();
  document.providers.local = provider({ enabled: false, headers: { 'x-region': 'test' }, accounts: [
    { id: 'main', apiKeyEnv: 'env:ONLY_A_REFERENCE', weight: 3 },
  ] });
  document.models['local/model'] = model({ enabled: false, extension: { untouched: true } });
  const next = applyEdits(document, toEditable(document));
  validateDocument(next, { previousDocument: document });
  assert.deepEqual(next.providers.local, document.providers.local);
  assert.equal(next.models['local/model'].upstreamModel, 'Org/Model-Instruct');
  assert.deepEqual(next.models['local/model'].extension, { untouched: true });
  assert.deepEqual(next.extension, document.extension);
  const legacy = registry();
  delete legacy.providers.local.authMode;
  delete legacy.providers.local.endpointStyle;
  const editable = toEditable(legacy);
  assert.equal(editable.providers[0].authMode, 'required');
  assert.equal(editable.providers[0].endpointStyle, 'relay');
  const unchanged = applyEdits(legacy, editable);
  assert.equal(Object.hasOwn(unchanged.providers.local, 'authMode'), false);
  assert.equal(Object.hasOwn(unchanged.providers.local, 'endpointStyle'), false, 'editing a legacy provider cannot silently switch endpoint paths');
});

test('new local keys normalize independently from real upstream ids and support multiple providers', () => {
  const document = { providers: { first: provider(), second: provider() }, models: {} };
  const editable = toEditable(document);
  const upstreamModel = 'Org/Model-Instruct';
  editable.customModels = ['first', 'second'].map((id) => ({ id: ` ${id.toUpperCase()}/MODEL `, provider: id.toUpperCase(), upstreamModel, label: 'Model', protocols: ['openai-chat'] }));
  const next = applyEdits(document, editable);
  validateDocument(next, { previousDocument: document });
  assert.deepEqual(Object.keys(next.models), ['first/model', 'second/model']);
  assert.ok(Object.values(next.models).every((entry) => entry.upstreamModel === upstreamModel));
  assert.equal(modelBindingId(' FIRST ', upstreamModel), 'first/org/model-instruct');
  assert.equal(modelBindingId('first', upstreamModel, ['first/org/model-instruct']), 'first/org/model-instruct-2');
  editable.customModels[0].provider = '';
  assert.throws(() => applyEdits(document, editable), /explicitly configured provider/u);
});

const legacyRegistry = () => ({
  models: { template: { provider: 'native-launcher', protocols: ['openai-chat'], strengths: ['preserve'], extension: { keep: true } } },
  activeModel: 'template',
  clientDefaults: { codex: 'gone' },
  clientRoleMatrix: { default: { implementer: 'gone' }, clients: { codex: { reviewer: 'template' } }, metadata: 'keep' },
  routingGroups: { legacy: { models: ['gone', 'template'], routing: 'opaque', weights: { gone: 2 } } },
  intentRouting: { classifierModel: 'gone', intents: [{ id: 'old', description: 'Legacy task', modelId: 'template', extra: 1 }], extra: { keep: true } },
});

test('unassigned native metadata and valid custom metadata survive unrelated edits without becoming implicit bindings', () => {
  const document = registry();
  document.models.template = legacyRegistry().models.template;
  document.models['local/model'].extension = { keep: ['custom metadata'] };
  const editable = toEditable(document);
  editable.providers[0].baseUrl = 'http://127.0.0.1:11435/v1';
  const next = applyEdits(document, editable);
  validateDocument(next, { previousDocument: document });
  validateDocument(next);
  assert.deepEqual(next.models.template, document.models.template);
  assert.deepEqual(next.models['local/model'].extension, document.models['local/model'].extension);
  assert.deepEqual(toModelCatalog(next).map((entry) => entry.id), ['local/model']);
  assert.deepEqual(next.extension, document.extension);
});

const policySelections = [
  ['activeModel', (id) => ({ activeModel: id })],
  ['clientDefaults.codex', (id) => ({ clientDefaults: { codex: id } })],
  ['clientRoleMatrix.default.implementer', (id) => ({ clientRoleMatrix: { default: { implementer: id } } })],
  ['clientRoleMatrix.clients.codex.reviewer', (id) => ({ clientRoleMatrix: { clients: { codex: { reviewer: id } } } })],
  ['routingGroups.saved.models', (id) => ({ routingGroups: { saved: { models: [id], routing: 'smart' } } })],
  ['intentRouting.classifierModel', (id) => ({ intentRouting: { enabled: false, classifierModel: id, intents: [] } })],
  ['intentRouting.intents[0].modelId', (id) => ({ intentRouting: { enabled: false, classifierModel: '', intents: [{ id: 'code', description: 'Code', modelId: id }] } })],
];

for (const [at, policy] of policySelections) {
  test(`${at} rejects missing, unbound, ambiguous and incompatible selections even when unchanged or omitted`, () => {
    for (const kind of ['missing', 'unbound', 'ambiguous', 'incompatible']) {
      const id = kind === 'missing' ? 'gone' : 'template';
      const document = { ...registry(), ...policy(id) };
      if (kind !== 'missing') document.models.template = { provider: 'native-launcher', protocols: [kind === 'incompatible' ? 'claude' : 'openai-chat'] };
      if (kind === 'ambiguous' || kind === 'incompatible') document.providers.local.models = ['template'];
      if (kind === 'ambiguous') document.providers.other = provider({ enabled: false, models: ['template'] });
      const original = structuredClone(document);
      for (const check of [
        () => applyEdits(document, toEditable(document)),
        () => applyEdits(document, {}),
        () => validateDocument(document),
        () => validateDocument(document, { previousDocument: document }),
      ]) {
        assert.throws(check, (error) => error.name === 'ConfigError'
          && [at, at.replace(/\.modelId$/u, '')].includes(error.path), `${kind} at ${at}`);
        assert.deepEqual(document, original, 'validation does not migrate or delete invalid references');
      }
    }
  });
}

test('new scalar, matrix, routing group, intent and classifier selections reject unavailable templates', () => {
  const document = { models: legacyRegistry().models };
  for (const [, policy] of policySelections) {
    const editable = toEditable({ ...document, ...policy('template') });
    assert.throws(() => applyEdits(document, editable), /enabled explicit provider binding/u);
  }
});

test('unchanged explicitly bound compatible selections survive pausing a model or provider, but cannot be newly assigned', () => {
  for (const binding of ['custom', 'provider-list']) {
    for (const pause of ['model', 'provider', 'both']) {
      const document = { ...registry(), activeModel: 'local/model', clientDefaults: { codex: 'local/model' },
        clientRoleMatrix: { default: { implementer: 'local/model' }, clients: { codex: { reviewer: 'local/model' } } },
        routingGroups: { saved: { models: ['local/model'], routing: 'smart' } },
        intentRouting: { enabled: true, classifierModel: 'local/model', intents: [{ id: 'code', description: 'Code', modelId: 'local/model' }] } };
      if (binding === 'provider-list') {
        document.models['local/model'] = { protocols: ['openai-chat'], provider: 'native-launcher' };
        document.providers.local.models = ['local/model'];
      }
      const editable = toEditable(document);
      if (pause !== 'model') editable.providers[0].enabled = false;
      if (pause !== 'provider') {
        if (binding === 'custom') editable.customModels[0].enabled = false;
        else document.models['local/model'].enabled = false;
      }
      const paused = applyEdits(document, editable);
      validateDocument(paused, { previousDocument: document });
      assert.deepEqual(toModelCatalog(paused), []);
      validateDocument(paused);
      assert.throws(() => validateDocument(paused, { previousDocument: registry() }), /enabled explicit provider binding/u);
      const unrelated = toEditable(paused);
      unrelated.providers[0].baseUrl = 'http://127.0.0.1:11435/v1';
      const retained = applyEdits(paused, unrelated);
      validateDocument(retained, { previousDocument: paused });
      for (const key of ['activeModel', 'clientDefaults', 'clientRoleMatrix', 'routingGroups', 'intentRouting']) assert.deepEqual(retained[key], migrateTargetRefs(paused)[key], `${binding}/${pause}: ${key}`);
      unrelated.matrix.default.planner = 'local/model';
      assert.throws(() => applyEdits(paused, unrelated), /enabled explicit provider binding/u);
    }
  }
});

test('removing a definition cannot create stale policy references, while clearing those policies permits removal', () => {
  for (const policy of [
    { clientRoleMatrix: { default: { implementer: 'local/model' } } },
    { clientRoleMatrix: { clients: { codex: { reviewer: 'local/model' } } } },
    { routingGroups: { saved: { models: ['local/model'], routing: 'smart' } } },
    { intentRouting: { enabled: true, classifierModel: 'local/model', intents: [{ id: 'code', description: 'Code', modelId: 'other' }] } },
    { intentRouting: { enabled: true, classifierModel: 'other', intents: [{ id: 'code', description: 'Code', modelId: 'local/model' }] } },
  ]) {
    const document = { ...registry(), ...policy };
    document.models.other = model({ upstreamModel: 'Other' });
    const editable = toEditable(document);
    editable.customModels = editable.customModels.filter(entry => entry.id !== 'local/model');
    assert.throws(() => applyEdits(document, editable), /unknown model/u);
    const removed = structuredClone(document);
    delete removed.models['local/model'];
    assert.throws(() => validateDocument(removed, { previousDocument: document }), /unknown (?:(?:or empty|concrete) )?model/u);
    editable.matrix = { default: {}, clients: {} };
    editable.routingGroups = [];
    editable.intentRouting = { enabled: false, classifierModel: '', intents: [] };
    assert.doesNotThrow(() => validateDocument(applyEdits(document, editable), { previousDocument: document }));
  }
});

test('legacy custom labels remain editable, but changed bindings and invalid explicit bindings are rejected', () => {
  const document = { models: { legacy: { source: 'custom', label: 'Old', protocols: ['openai-chat'], extension: true } } };
  const editable = toEditable(document);
  editable.customModels[0].label = 'New label';
  assert.equal(applyEdits(document, editable).models.legacy.label, 'New label');
  editable.customModels[0].upstreamModel = 'New/Upstream';
  assert.throws(() => applyEdits(document, editable), /explicitly configured provider/u);
  const invalid = registry();
  invalid.models['local/model'].provider = 'missing';
  assert.throws(() => validateDocument(invalid), /unknown provider/u, 'schema-invalid explicit bindings remain validation errors');
});

test('preview directly resolves a sole bound model but never guesses the first of multiple models', () => {
  const document = registry();
  assert.ok(toAutoPreview(document).every((entry) => entry.effectiveModelId === 'local/model'));
  document.models.second = model({ upstreamModel: 'Other/Model' });
  assert.ok(toAutoPreview(document).every((entry) => entry.effectiveModelId === ''));
  document.models.template = { protocols: ['openai-chat'] };
  document.activeModel = 'template';
  document.roleDefaults = { implementer: { preferredModel: 'template', taskType: 'coding' } };
  document.routingRules = [{ taskType: 'coding', primary: 'template', fallback: ['second'] }];
  const row = toAutoPreview(document).find((entry) => entry.role === 'implementer');
  assert.equal(row.autoModelId, 'second');
  assert.equal(row.effectiveModelId, 'second');
  document.clientRoleMatrix = { default: { implementer: 'template' } };
  const stale = toAutoPreview(document).find((entry) => entry.role === 'implementer');
  assert.equal(stale.effectiveModelId, 'second');
  assert.equal(stale.unavailableModelId, 'template');
});

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function fixture(t, { document = registry(), seeded = false, text = serialize(document) } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-explicit-config-'));
  const previous = process.env.AIOS_PROJECT_ROOT;
  process.env.AIOS_PROJECT_ROOT = root;
  t.after(() => {
    if (previous === undefined) delete process.env.AIOS_PROJECT_ROOT;
    else process.env.AIOS_PROJECT_ROOT = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const file = path.join(root, 'memory/specs/model-registry.json');
  const builtin = path.join(root, 'scripts/lib/tooling/specs/registry/model-registry.json');
  const backupDir = path.join(root, '.aios/config-backups');
  write(seeded ? builtin : file, text);
  return { root, file, builtin, backupDir, text };
}
const readResponse = async (response) => ({ status: response.status, body: await response.json() });
const getConfig = async () => readResponse(await config.GET());
const putConfig = async (editable, expectedHash) => readResponse(await config.PUT(new Request('http://localhost/api/config/model-routing', { method: 'PUT', body: JSON.stringify({ editable, expectedHash }) })));
const postGateway = async (body) => readResponse(await gateway.POST(new Request('http://localhost/api/model-routing/gateway', { method: 'POST', body: JSON.stringify(body) })));
const backups = (f) => fs.existsSync(f.backupDir) ? fs.readdirSync(f.backupDir) : [];

test('config GET stays read-only; an explicit migration-only save versions an empty fallback without a backup', async (t) => {
  const f = fixture(t, { seeded: true, text: ' { "models": {}, "providers": {} }\n\n' });
  const loaded = await getConfig();
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.hash, digest(f.text));
  assert.equal(loaded.body.configuredReady, false);
  assert.equal(loaded.body.configuredModelCount, 0);
  assert.equal(loaded.body.generationVerified, false);
  assert.equal(Object.hasOwn(loaded.body, 'ready'), false, 'saved config does not establish loaded-runtime readiness');
  assert.deepEqual(loaded.body.models, []);
  assert.equal(fs.existsSync(f.file), false);
  const saved = await putConfig(loaded.body.editable, loaded.body.hash);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.changed, ['targetRefVersion']);
  assert.equal(saved.body.backup, null);
  const text = fs.readFileSync(f.file, 'utf8');
  assert.equal(saved.body.hash, digest(text));
  assert.deepEqual(JSON.parse(text), { models: {}, providers: {}, targetRefVersion: 1 });
  assert.equal((await putConfig(loaded.body.editable, loaded.body.hash)).status, 409, 'pre-migration hashes become stale');
  const current = (await getConfig()).body;
  assert.deepEqual((await putConfig(current.editable, current.hash)).body, { ok: true, changed: [], backup: null });
  assert.equal(fs.readFileSync(f.builtin, 'utf8'), f.text);
  assert.deepEqual(backups(f), []);
});

test('first install uses the actual empty repository seed and materializes only an explicit binding without a backup', async (t) => {
  const seedText = fs.readFileSync(new URL('../../../../scripts/lib/tooling/specs/registry/model-registry.json', import.meta.url), 'utf8');
  const seed = JSON.parse(seedText);
  assert.equal(seed.activeModel, '');
  for (const key of ['models', 'providers', 'clientDefaults', 'roleDefaults']) assert.deepEqual(seed[key], {}, key);
  assert.deepEqual(seed.clientRoleMatrix, { default: {}, clients: {} });
  assert.deepEqual(seed.routingRules, []);
  assert.deepEqual(seed.intentRouting, { enabled: false, classifierModel: '', intents: [] });
  const f = fixture(t, { seeded: true, text: seedText });
  const response = await getConfig();
  assert.equal(response.status, 200);
  const loaded = response.body;
  assert.equal(loaded.hash, digest(seedText));
  assert.equal(loaded.configuredReady, false);
  assert.equal(loaded.configuredModelCount, 0);
  assert.deepEqual(loaded.models, []);
  assert.equal(fs.existsSync(f.file), false);
  loaded.editable.providers.push({ id: 'local', apiKeyEnv: '', ...provider() });
  loaded.editable.customModels.push({ id: 'LOCAL/MODEL', label: 'Manual', provider: 'local', protocols: ['openai-chat'], upstreamModel: 'Org/Exact-Case' });
  loaded.editable.matrix.default.implementer = 'local/model';
  const saved = await putConfig(loaded.editable, loaded.hash);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.backup, null);
  const text = fs.readFileSync(f.file, 'utf8');
  assert.equal(saved.body.hash, digest(text));
  const document = JSON.parse(text);
  assert.equal(document.providers.local.authMode, 'none');
  assert.equal(document.providers.local.endpointStyle, 'standard');
  assert.equal(document.models['local/model'].upstreamModel, 'Org/Exact-Case');
  assert.deepEqual(Object.keys(document.models), ['local/model']);
  assert.equal(document.targetRefVersion, 1);
  assert.deepEqual(document.clientRoleMatrix, { default: { implementer: 'model:local%2Fmodel' }, clients: {} });
  for (const key of ['activeModel', 'clientDefaults', 'roleDefaults', 'routingRules', 'intentRouting', 'routingProfiles', 'signalRules']) assert.deepEqual(document[key], seed[key], key);
  assert.equal((await getConfig()).body.configuredModelCount, 1);
  assert.equal(fs.readFileSync(f.builtin, 'utf8'), f.text);
  assert.deepEqual(backups(f), []);
});

test('legacy selections reject no-op and unrelated saves before writing, then an explicit repair backs up exact original bytes', async (t) => {
  const document = legacyRegistry();
  const f = fixture(t, { text: `  ${serialize(document)}\n` });
  const response = await getConfig();
  assert.equal(response.status, 200, 'GET remains read-only and exposes invalid existing policy for repair');
  const loaded = response.body;
  assert.equal(loaded.editable.activeModel, 'template');
  assert.deepEqual(loaded.editable.matrix.default, document.clientRoleMatrix.default);
  assert.equal(fs.readFileSync(f.file, 'utf8'), f.text);
  assert.deepEqual(backups(f), []);
  for (const editable of [loaded.editable, {}]) {
    const rejected = await putConfig(editable, loaded.hash);
    assert.equal(rejected.status, 422, JSON.stringify(rejected.body));
    assert.equal(rejected.body.error, 'invalid-document');
    assert.equal(rejected.body.path, 'activeModel');
    assert.equal(fs.readFileSync(f.file, 'utf8'), f.text);
    assert.deepEqual(backups(f), []);
  }
  loaded.editable.providers.push({ id: 'local', apiKeyEnv: '', ...provider() });
  for (const editable of [loaded.editable, { providers: loaded.editable.providers }]) {
    const rejected = await putConfig(editable, loaded.hash);
    assert.equal(rejected.status, 422);
    assert.equal(rejected.body.path, 'activeModel');
    assert.equal(fs.readFileSync(f.file, 'utf8'), f.text);
    assert.deepEqual(backups(f), []);
  }
  loaded.editable.customModels.push({ id: 'local/model', label: 'Repair', ...model() });
  loaded.editable.activeModel = 'local/model';
  loaded.editable.clientDefaults.codex = 'local/model';
  loaded.editable.matrix.default.implementer = 'local/model';
  loaded.editable.matrix.clients.codex.reviewer = 'local/model';
  loaded.editable.routingGroups[0].models = ['local/model'];
  loaded.editable.intentRouting.classifierModel = 'local/model';
  loaded.editable.intentRouting.intents[0].modelId = 'local/model';
  const saved = await putConfig(loaded.editable, loaded.hash);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.changed, ['targetRefVersion', 'activeModel', 'clientDefaults', 'providers', 'models', 'clientRoleMatrix', 'routingGroups', 'intentRouting']);
  assert.equal(fs.readFileSync(path.join(f.root, saved.body.backup), 'utf8'), f.text);
  assert.equal(backups(f).length, 1);
  const repairedText = fs.readFileSync(f.file, 'utf8');
  assert.equal(saved.body.hash, digest(repairedText));
  const next = JSON.parse(repairedText);
  validateDocument(next);
  assert.deepEqual(next.models.template, document.models.template, 'repair does not silently delete native metadata');
  assert.equal(next.activeModel, 'model:local%2Fmodel');
  assert.deepEqual(next.clientDefaults, { codex: 'model:local%2Fmodel' });
  assert.deepEqual(next.clientRoleMatrix, { ...document.clientRoleMatrix, default: { implementer: 'model:local%2Fmodel' }, clients: { codex: { reviewer: 'model:local%2Fmodel' } } });
  assert.deepEqual(next.routingGroups.legacy, { ...document.routingGroups.legacy, models: ['local/model'] });
  assert.deepEqual(next.intentRouting, { ...document.intentRouting, enabled: true, classifierModel: 'local/model', intents: [{ ...document.intentRouting.intents[0], modelId: 'model:local%2Fmodel' }] });
  const updated = (await getConfig()).body;
  assert.equal(updated.hash, saved.body.hash);
  updated.editable.matrix.default.planner = 'template';
  const rejected = await putConfig(updated.editable, updated.hash);
  assert.equal(rejected.status, 422);
  assert.equal(rejected.body.path, 'clientRoleMatrix.default.planner');
  assert.equal(fs.readFileSync(f.file, 'utf8'), repairedText);
  assert.equal(backups(f).length, 1);
});

test('saved paused explicit bindings retain unchanged policies and exact backups but reject new assignments before writing', async (t) => {
  const document = { ...registry(), activeModel: 'local/model', clientDefaults: { codex: 'local/model' },
    clientRoleMatrix: { default: { implementer: 'local/model' }, clients: {} } };
  document.providers.local.enabled = false;
  document.models['local/model'].enabled = false;
  const f = fixture(t, { text: `  ${serialize(document)}\n` });
  const response = await getConfig();
  assert.equal(response.status, 200);
  let loaded = response.body;
  assert.equal(loaded.configuredModelCount, 0);
  assert.equal(fs.readFileSync(f.file, 'utf8'), f.text);
  const migrated = await putConfig(loaded.editable, loaded.hash);
  assert.equal(migrated.status, 200);
  assert.deepEqual(migrated.body.changed, ['targetRefVersion', 'activeModel', 'clientDefaults', 'clientRoleMatrix']);
  assert.equal(fs.readFileSync(path.join(f.root, migrated.body.backup), 'utf8'), f.text);
  const migratedText = fs.readFileSync(f.file, 'utf8');
  assert.deepEqual(JSON.parse(migratedText), migrateTargetRefs(document));
  assert.equal(migrated.body.hash, digest(migratedText));
  loaded = (await getConfig()).body;
  loaded.editable.matrix.default.planner = 'local/model';
  const rejected = await putConfig(loaded.editable, loaded.hash);
  assert.equal(rejected.status, 422);
  assert.equal(rejected.body.path, 'clientRoleMatrix.default.planner');
  assert.equal(fs.readFileSync(f.file, 'utf8'), migratedText);
  assert.equal(backups(f).length, 1);
  loaded.editable.providers[0].baseUrl = 'http://127.0.0.1:11435/v1';
  const saved = await putConfig({ providers: loaded.editable.providers }, loaded.hash);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.changed, ['providers']);
  assert.equal(fs.readFileSync(path.join(f.root, saved.body.backup), 'utf8'), migratedText);
  const next = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  for (const key of ['activeModel', 'clientDefaults', 'clientRoleMatrix', 'models', 'extension']) assert.deepEqual(next[key], migrateTargetRefs(document)[key], key);
  assert.equal(next.providers.local.enabled, false);
  assert.equal(backups(f).length, 2);
});

test('seed drift and concurrent saves retain hash and locking safeguards', async (t) => {
  const f = fixture(t, { seeded: true });
  const { body: loaded } = await getConfig();
  loaded.editable.providers[0].baseUrl = 'http://127.0.0.1:11435/v1';
  fs.appendFileSync(f.builtin, '\n');
  assert.equal((await putConfig(loaded.editable, loaded.hash)).status, 409);
  assert.equal(fs.existsSync(f.file), false);
  assert.deepEqual(backups(f), []);
  write(f.file, f.text);
  const first = structuredClone(loaded.editable);
  const second = structuredClone(loaded.editable);
  second.providers[0].baseUrl = 'http://127.0.0.1:11436/v1';
  const responses = await Promise.all([putConfig(first, loaded.hash), putConfig(second, loaded.hash)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal(backups(f).length, 1);
  assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['model-registry.json']);
});

function fakeCli(f) {
  write(path.join(f.root, 'scripts/aios.mjs'), `import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n');
console.log(args[1] === 'gateway-status' ? fs.readFileSync('status.json', 'utf8') : JSON.stringify({ ok: true }));
`);
  const setStatus = (patch) => write(path.join(f.root, 'status.json'), serialize({ running: true, managed: true, port: 49171, clients: [], ...patch }));
  const calls = () => fs.existsSync(path.join(f.root, 'calls.jsonl')) ? fs.readFileSync(path.join(f.root, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) : [];
  setStatus({});
  return { setStatus, calls };
}

test('status separates saved registry bindings from loaded health readiness without a generation probe', async (t) => {
  const f = fixture(t);
  const cli = fakeCli(f);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(String(url));
    assert.equal(String(url), 'http://127.0.0.1:49171/health');
    assert.equal(options.redirect, 'error');
    return Response.json({ ok: true, ready: false, configuredModels: 0, readyModels: 0, code: 'NO_ROUTE_CONFIGURED' });
  });
  const response = await readResponse(await gateway.GET());
  assert.equal(response.status, 200);
  assert.equal(response.body.running, true);
  assert.equal(response.body.configuredReady, true);
  assert.equal(response.body.configuredModelCount, 1);
  assert.equal(response.body.configuredRevision, digest(f.text));
  assert.equal(response.body.ready, false);
  assert.equal(response.body.configuredModels, 0);
  assert.equal(response.body.code, 'NO_ROUTE_CONFIGURED');
  assert.equal(response.body.generationVerified, false);
  assert.deepEqual(requests, ['http://127.0.0.1:49171/health']);
  assert.deepEqual(cli.calls().map((args) => args[1]), ['gateway-status']);
});

test('a loaded ready snapshot is not replaced by the saved registry or inferred from the listener', async (t) => {
  const f = fixture(t, { document: {} });
  const cli = fakeCli(f);
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true, ready: true, configuredModels: 1, readyModels: 1 }));
  const loaded = (await readResponse(await gateway.GET())).body;
  assert.equal(loaded.configuredReady, false);
  assert.equal(loaded.ready, true);
  cli.setStatus({ running: false });
  const stopped = (await readResponse(await gateway.GET())).body;
  assert.equal(stopped.ready, false);
  assert.equal(stopped.code, 'gateway-not-running');
  assert.equal(fetch.mock.callCount(), 1, 'stopped status does not probe any port');
  cli.setStatus({ port: 65536 });
  assert.equal((await readResponse(await gateway.GET())).body.ready, false);
  assert.equal(fetch.mock.callCount(), 1, 'unvalidated ports never reach fetch');
});

test('connect requires fresh port and runtime readiness, but empty start and disconnected restore remain allowed', async (t) => {
  const f = fixture(t, { document: {} });
  const cli = fakeCli(f);
  const expectedRevision = digest(f.text);
  let health = { ok: true, ready: false, configuredModels: 0, readyModels: 0, code: 'NO_ROUTE_CONFIGURED' };
  const fetch = t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(String(url), 'http://127.0.0.1:49171/health');
    return Response.json(health);
  });
  assert.equal((await postGateway({ action: 'connect', port: 49171 })).status, 409);
  assert.deepEqual(cli.calls(), [], 'confirmation precedes effects');
  assert.equal((await postGateway({ action: 'connect', port: 49170, confirm: true, expectedRevision })).body.error, 'gateway-changed');
  assert.equal(fetch.mock.callCount(), 0, 'port guard precedes health reads');
  assert.equal((await postGateway({ action: 'connect', port: 49171, confirm: true, expectedRevision })).body.error, 'gateway-not-ready');
  assert.ok(cli.calls().every((args) => args[1] === 'gateway-status'), 'unready listeners never rewrite client configuration');
  health = { ok: true };
  assert.equal((await postGateway({ action: 'connect', port: 49171, confirm: true, expectedRevision })).body.error, 'gateway-not-ready', 'old health payloads fail closed');
  health = { ok: true, ready: true, configuredModels: 1, readyModels: 1 };
  assert.equal((await postGateway({ action: 'connect', client: 'codex', port: 49171, confirm: true, expectedRevision })).status, 200);
  assert.deepEqual(cli.calls().at(-1), ['model-router', 'connect', '--json', '--port', '49171', '--client', 'codex', '--target', 'auto', '--expected-revision', expectedRevision]);
  cli.setStatus({ running: false });
  assert.equal((await postGateway({ action: 'disconnect', client: 'codex', confirm: true })).status, 200);
  assert.deepEqual(cli.calls().at(-1), ['model-router', 'disconnect', '--json', '--client', 'codex']);
  assert.equal((await postGateway({ action: 'start', port: 49171, confirm: true })).status, 200);
  assert.deepEqual(cli.calls().at(-1), ['model-router', 'gateway-start', '--json', '--port', '49171']);
});

test('health failures and missing readiness fail closed; safe runtime reason codes survive projection', async (t) => {
  const f = fixture(t);
  fakeCli(f);
  let health;
  t.mock.method(globalThis, 'fetch', async () => {
    if (health === undefined) throw new Error('offline');
    return Response.json(health);
  });
  const unavailable = (await readResponse(await gateway.GET())).body;
  assert.equal(unavailable.ready, false);
  assert.equal(unavailable.code, 'gateway-readiness-unavailable');
  assert.equal(Object.hasOwn(unavailable, 'configuredModels'), false, 'an unknown runtime count is not reported as empty');
  for (const code of ['PROVIDER_CREDENTIALS_MISSING', 'PROVIDER_CONFIG_INVALID', 'PROTOCOL_TRANSLATION_UNAVAILABLE']) {
    health = { ok: true, ready: false, configuredModels: 1, readyModels: 0, code };
    assert.equal((await readResponse(await gateway.GET())).body.code, code);
  }
  health = { ok: true, code: 'UNTRUSTED_DETAIL' };
  const old = (await readResponse(await gateway.GET())).body;
  assert.equal(old.ready, false);
  assert.equal(Object.hasOwn(old, 'code'), false);
});
