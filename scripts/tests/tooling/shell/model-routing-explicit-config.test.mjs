import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  applyEdits, modelBindingId, toAutoPreview, toEditable, toModelBindings, toModelCatalog, validateDocument,
} from '../../../../apps/shell/ui/src/lib/config/model-routing.mjs';

const ui = new URL('../../../../apps/shell/ui/', import.meta.url);
async function handler(relative) {
  const url = new URL(relative, ui);
  const source = fs.readFileSync(url, 'utf8')
    .replace("'../../../../lib/config/model-routing.mjs'", JSON.stringify(new URL('src/lib/config/model-routing.mjs', ui).href))
    .replace("'../../../../lib/config/model-registry-store.mjs'", JSON.stringify(new URL('src/lib/config/model-registry-store.mjs', ui).href));
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
  clientRoleMatrix: { default: { implementer: 'gone' }, clients: { codex: { reviewer: 'template' } }, metadata: 'keep' },
  routingGroups: { legacy: { models: ['gone', 'template'], routing: 'opaque', weights: { gone: 2 } } },
  intentRouting: { classifierModel: 'gone', intents: [{ id: 'old', description: 'Legacy task', modelId: 'template', extra: 1 }], extra: { keep: true } },
});

test('unrelated edits preserve inactive curated metadata and unchanged stale strategy references', () => {
  const document = legacyRegistry();
  const editable = toEditable(document);
  editable.providers.push({ id: 'local', apiKeyEnv: '', ...provider() });
  const next = applyEdits(document, editable);
  validateDocument(next, { previousDocument: document });
  for (const key of ['models', 'clientRoleMatrix', 'routingGroups', 'intentRouting']) assert.deepEqual(next[key], document[key], key);
  assert.deepEqual(toModelCatalog(next), []);
  assert.equal(toAutoPreview(next).find((entry) => entry.role === 'implementer').unavailableModelId, 'gone');
  editable.intentRouting.intents[0].description = 'Updated description';
  const described = applyEdits(document, editable);
  validateDocument(described, { previousDocument: document });
  assert.equal(described.intentRouting.classifierModel, 'gone', 'an unchanged stale model reference is not a new selection');
  assert.equal(described.intentRouting.intents[0].extra, 1);
});

test('new matrix, routing group, intent and classifier selections reject unavailable templates', () => {
  const document = legacyRegistry();
  for (const change of [
    (editable) => { editable.matrix.default.planner = 'template'; },
    (editable) => { editable.matrix.clients.pi = { implementer: 'template' }; },
    (editable) => { editable.routingGroups.push({ id: 'new', models: ['template'], routing: 'smart' }); },
    (editable) => { editable.intentRouting.classifierModel = 'template'; },
    (editable) => { editable.intentRouting.intents.push({ id: 'new', description: 'New task', modelId: 'template' }); },
  ]) {
    const editable = toEditable(document);
    change(editable);
    assert.throws(() => applyEdits(document, editable), /enabled explicit provider binding/u);
  }
  const disabled = { ...registry(), clientRoleMatrix: { default: { implementer: 'local/model' } } };
  const editable = toEditable(disabled);
  editable.providers[0].enabled = false;
  const next = applyEdits(disabled, editable);
  validateDocument(next, { previousDocument: disabled });
  assert.equal(next.clientRoleMatrix.default.implementer, 'local/model');
  assert.deepEqual(toModelCatalog(next), []);
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
    assert.throws(() => validateDocument(removed, { previousDocument: document }), /unknown model/u);
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

test('config GET reports saved binding counts only, hashes exact fallback bytes and leaves an empty seed untouched', async (t) => {
  const f = fixture(t, { seeded: true, text: ' { "models": {}, "providers": {} }\n\n' });
  const loaded = await getConfig();
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.hash, digest(f.text));
  assert.equal(loaded.body.configuredReady, false);
  assert.equal(loaded.body.configuredModelCount, 0);
  assert.equal(loaded.body.generationVerified, false);
  assert.equal(Object.hasOwn(loaded.body, 'ready'), false, 'saved config does not establish loaded-runtime readiness');
  assert.deepEqual(loaded.body.models, []);
  assert.equal((await putConfig(loaded.body.editable, loaded.body.hash)).status, 200);
  assert.equal(fs.existsSync(f.file), false);
  assert.equal(fs.readFileSync(f.builtin, 'utf8'), f.text);
  assert.deepEqual(backups(f), []);
});

test('first save materializes explicit standard/auth-none binding with exact upstream id and no nonexistent backup', async (t) => {
  const f = fixture(t, { document: {}, seeded: true });
  const { body: loaded } = await getConfig();
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
  assert.equal((await getConfig()).body.configuredModelCount, 1);
  assert.equal(fs.readFileSync(f.builtin, 'utf8'), f.text);
  assert.deepEqual(backups(f), []);
});

test('saved edits preserve legacy metadata, back up exact bytes and reject newly chosen unbound models', async (t) => {
  const document = legacyRegistry();
  const f = fixture(t, { text: `  ${serialize(document)}\n` });
  const { body: loaded } = await getConfig();
  loaded.editable.providers.push({ id: 'local', apiKeyEnv: '', ...provider() });
  const saved = await putConfig(loaded.editable, loaded.hash);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(fs.readFileSync(path.join(f.root, saved.body.backup), 'utf8'), f.text);
  const next = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  for (const key of ['models', 'clientRoleMatrix', 'routingGroups', 'intentRouting']) assert.deepEqual(next[key], document[key]);
  const updated = (await getConfig()).body;
  updated.editable.matrix.default.planner = 'template';
  const rejected = await putConfig(updated.editable, updated.hash);
  assert.equal(rejected.status, 422);
  assert.equal(rejected.body.path, 'clientRoleMatrix.default.planner');
  assert.equal(backups(f).length, 1);
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
  let health = { ok: true, ready: false, configuredModels: 0, readyModels: 0, code: 'NO_ROUTE_CONFIGURED' };
  const fetch = t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(String(url), 'http://127.0.0.1:49171/health');
    return Response.json(health);
  });
  assert.equal((await postGateway({ action: 'connect', port: 49171 })).status, 409);
  assert.deepEqual(cli.calls(), [], 'confirmation precedes effects');
  assert.equal((await postGateway({ action: 'connect', port: 49170, confirm: true })).body.error, 'gateway-changed');
  assert.equal(fetch.mock.callCount(), 0, 'port guard precedes health reads');
  assert.equal((await postGateway({ action: 'connect', port: 49171, confirm: true })).body.error, 'gateway-not-ready');
  assert.ok(cli.calls().every((args) => args[1] === 'gateway-status'), 'unready listeners never rewrite client configuration');
  health = { ok: true };
  assert.equal((await postGateway({ action: 'connect', port: 49171, confirm: true })).body.error, 'gateway-not-ready', 'old health payloads fail closed');
  health = { ok: true, ready: true, configuredModels: 1, readyModels: 1 };
  assert.equal((await postGateway({ action: 'connect', client: 'codex', port: 49171, confirm: true })).status, 200);
  assert.deepEqual(cli.calls().at(-1), ['model-router', 'connect', '--json', '--port', '49171', '--client', 'codex']);
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
