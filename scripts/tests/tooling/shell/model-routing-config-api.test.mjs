import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const uiUrl = new URL('../../../../apps/shell/ui/', import.meta.url);
const routeUrl = new URL('src/app/api/config/model-routing/route.ts', uiUrl);
const adapterUrl = new URL('src/lib/config/model-routing.mjs', uiUrl);
const storeUrl = new URL('src/lib/config/model-registry-store.mjs', uiUrl);
// Execute the real handler and adapter without Next, generated repo files, or client/model calls.
const source = fs.readFileSync(routeUrl, 'utf8').replace(
  "'../../../../lib/config/model-routing.mjs'", JSON.stringify(adapterUrl.href),
).replace("'../../../../lib/config/model-registry-store.mjs'", JSON.stringify(storeUrl.href))
  .replace("'../../../../lib/config/routing-policy.mjs'", JSON.stringify(new URL('src/lib/config/routing-policy.mjs', uiUrl).href));
const executable = stripTypeScriptTypes(source, { sourceUrl: routeUrl.href });
const { GET, PUT } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`);

const registryRel = 'memory/specs/model-registry.json';
const builtinRel = 'scripts/lib/tooling/specs/registry/model-registry.json';
const digest = (text) => createHash('sha256').update(text).digest('hex');
const serialize = (document) => `${JSON.stringify(document, null, 2)}\n`;
const registry = () => ({
  activeModel: 'curated',
  models: {
    curated: { label: 'Curated', protocols: ['claude'], cost: 'high', strengths: ['code'] },
    discovered: { label: 'Discovered', protocols: ['openai-chat'], provider: 'relay', source: 'discovered', contextWindow: 64000 },
    custom: { label: 'Custom', protocols: ['claude'], provider: 'relay', upstreamModel: 'Vendor/Custom-V1', source: 'custom', cost: 'low', speed: 'fast', contextWindow: 32000, strengths: ['review'] },
    legacy: { label: 'Native launcher metadata', protocols: ['openai-response'], provider: 'codex' },
  },
  providers: {
    relay: {
      baseUrl: 'https://relay.example.invalid', apiKeyEnv: 'env:RELAY_KEY', protocols: ['claude', 'openai-chat'], models: ['curated'],
      headers: { 'x-region': 'west' }, enabled: true, retryPolicy: { attempts: 3 },
      protocolBaseUrls: { claude: 'https://claude.example.invalid', 'openai-chat': 'https://relay.example.invalid/openai/v1' },
      accounts: [
        { id: 'primary', apiKeyEnv: 'env:PRIMARY_KEY', weight: 3, label: 'Primary' },
        { id: 'backup', apiKeyEnv: 'env:BACKUP_KEY', weight: 1, enabled: false },
      ],
    },
  },
  clientRoleMatrix: { default: { implementer: 'curated' }, clients: { codex: { reviewer: 'custom', planner: 'curated' } } },
  routingGroups: { review: { models: ['curated'], routing: 'weight', weights: { curated: 3 }, accountIds: ['primary'], description: 'Review pool' } },
  intentRouting: { enabled: false, classifierModel: '', intents: [] },
  roleDefaults: { planner: { taskType: 'planning' } },
  routingRules: [{ taskType: 'planning', primary: 'curated', fallback: ['custom'] }],
  extensionMetadata: { revision: 1, keep: ['untouched'] },
});
const versionedRegistry = () => ({
  ...registry(),
  targetRefVersion: 1,
  activeModel: 'model:curated',
  clientRoleMatrix: { default: { implementer: 'model:curated' }, clients: { codex: { reviewer: 'model:custom', planner: 'model:curated' } } },
  routingRules: [{ taskType: 'planning', primary: 'model:curated', fallback: ['model:custom'] }],
});

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

// Top-level tests run sequentially: each owns its environment override and temp tree.
function fixture(t, { seeded = false, text = serialize(registry()) } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-model-routing-api-'));
  const previous = process.env.AIOS_PROJECT_ROOT;
  process.env.AIOS_PROJECT_ROOT = root;
  t.after(() => {
    if (previous === undefined) delete process.env.AIOS_PROJECT_ROOT;
    else process.env.AIOS_PROJECT_ROOT = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const file = path.join(root, registryRel);
  const builtin = path.join(root, builtinRel);
  const backupDir = path.join(root, '.aios', 'config-backups');
  write(seeded ? builtin : file, text);
  return { root, file, builtin, text, backupDir };
}

async function result(response) {
  assert.match(response.headers.get('content-type'), /^application\/json/u);
  return { status: response.status, body: await response.json() };
}

const get = async () => result(await GET());
const putBody = async (body) => result(await PUT(new Request('http://localhost/api/config/model-routing', {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})));
const put = async (editable, expectedHash) => putBody({ editable, expectedHash });
const backups = ({ backupDir }) => fs.existsSync(backupDir) ? fs.readdirSync(backupDir) : [];

test('GET reads the saved registry rather than the built-in and returns projections and the raw hash', async (t) => {
  const f = fixture(t);
  write(f.builtin, '{invalid built-in');
  const response = await get();
  assert.equal(response.status, 200);
  assert.equal(response.body.path, registryRel);
  assert.equal(response.body.hash, digest(f.text));
  assert.equal(response.body.editable.providers[0].id, 'relay');
  assert.equal(response.body.editable.providers[0].authMode, 'required');
  assert.equal(response.body.editable.providers[0].endpointStyle, 'relay');
  assert.equal(response.body.editable.providers[0].enabled, true);
  assert.equal(response.body.editable.customModels[0].upstreamModel, 'Vendor/Custom-V1');
  assert.equal(response.body.auto.find((row) => row.role === 'planner').effectiveModelId, 'curated');
  assert.deepEqual(response.body.models.map((model) => model.id), ['curated', 'discovered', 'custom']);
  assert.equal(response.body.editable.matrix.clients.codex.planner, 'curated');
  assert.equal(response.body.models.some((model) => model.id === 'legacy'), false, 'native metadata is not a selectable binding');
});

test('PUT saves, backs up the exact original bytes, returns the new hash, and preserves metadata', async (t) => {
  const f = fixture(t);
  const { body: loaded } = await get();
  loaded.editable.providers[0].baseUrl = 'https://new.example.invalid';
  loaded.editable.providers[0].accounts.reverse();
  loaded.editable.matrix.default.reviewer = 'custom';
  loaded.editable.routingGroups[0].routing = 'order';
  const saved = await put(loaded.editable, loaded.hash);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.ok, true);
  assert.deepEqual(saved.body.changed, ['targetRefVersion', 'activeModel', 'providers', 'clientRoleMatrix', 'routingGroups']);
  assert.match(saved.body.backup, /^\.aios\/config-backups\/model-registry-.+\.json$/u);
  assert.equal(fs.readFileSync(path.join(f.root, saved.body.backup), 'utf8'), f.text);
  assert.equal(backups(f).length, 1);
  const savedText = fs.readFileSync(f.file, 'utf8');
  assert.equal(saved.body.hash, digest(savedText));
  assert.equal((await get()).body.hash, saved.body.hash);
  const document = JSON.parse(savedText);
  const original = versionedRegistry();
  assert.equal(document.targetRefVersion, 1);
  assert.deepEqual(document.providers.relay, {
    ...original.providers.relay, baseUrl: 'https://new.example.invalid',
    accounts: [...original.providers.relay.accounts].reverse(),
  });
  assert.deepEqual(document.routingGroups.review, { ...original.routingGroups.review, routing: 'order' });
  assert.equal(document.clientRoleMatrix.default.reviewer, 'model:custom');
  assert.deepEqual(document.clientRoleMatrix.clients, original.clientRoleMatrix.clients, 'unrelated edits preserve valid explicit selections');
  for (const key of ['models', 'intentRouting', 'roleDefaults', 'routingRules', 'extensionMetadata', 'activeModel']) {
    assert.deepEqual(document[key], original[key], `${key} metadata survives a real save`);
  }
  assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['model-registry.json'], 'temporary write file was renamed');
});

test('PUT materializes a matching seeded registry without claiming a nonexistent backup', async (t) => {
  const f = fixture(t, { seeded: true });
  const { body: loaded } = await get();
  assert.equal(loaded.hash, digest(f.text));
  assert.equal(fs.existsSync(f.file), false);
  loaded.editable.matrix.default.reviewer = 'custom';
  const saved = await put(loaded.editable, loaded.hash);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.changed, ['targetRefVersion', 'activeModel', 'clientRoleMatrix']);
  assert.equal(saved.body.backup, null);
  assert.deepEqual(backups(f), []);
  assert.equal(saved.body.hash, digest(fs.readFileSync(f.file, 'utf8')));
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).clientRoleMatrix.default.reviewer, 'model:custom');
  assert.equal(fs.readFileSync(f.builtin, 'utf8'), f.text);
});

test('PUT rejects a stale saved hash without overwriting external changes or making a backup', async (t) => {
  const f = fixture(t);
  const { body: loaded } = await get();
  const changedText = `${f.text}\n`;
  fs.writeFileSync(f.file, changedText);
  loaded.editable.matrix.default.reviewer = 'custom';
  const response = await put(loaded.editable, loaded.hash);
  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'stale-hash');
  assert.equal(fs.readFileSync(f.file, 'utf8'), changedText);
  assert.deepEqual(backups(f), []);
});

test('PUT rejects an arbitrary expectedHash when only the seeded registry exists', async (t) => {
  const f = fixture(t, { seeded: true });
  const { body: loaded } = await get();
  loaded.editable.matrix.default.reviewer = 'custom';
  const response = await put(loaded.editable, 'not-the-seed-hash');
  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'stale-hash');
  assert.equal(fs.existsSync(f.file), false);
  assert.equal(fs.readFileSync(f.builtin, 'utf8'), f.text);
  assert.deepEqual(backups(f), []);
});

test('PUT rejects drift in the built-in fallback between GET and the first save', async (t) => {
  const f = fixture(t, { seeded: true });
  const { body: loaded } = await get();
  const changedText = `${f.text}\n`;
  fs.writeFileSync(f.builtin, changedText);
  loaded.editable.matrix.default.reviewer = 'custom';
  const response = await put(loaded.editable, loaded.hash);
  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'stale-hash');
  assert.equal(fs.existsSync(f.file), false);
  assert.equal(fs.readFileSync(f.builtin, 'utf8'), changedText);
  assert.deepEqual(backups(f), []);
});

test('PUT rejects a deleted saved registry when the fallback differs from what GET read', async (t) => {
  const f = fixture(t);
  const { body: loaded } = await get();
  write(f.builtin, `${f.text}\n`);
  fs.unlinkSync(f.file);
  loaded.editable.matrix.default.reviewer = 'custom';
  const response = await put(loaded.editable, loaded.hash);
  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'stale-hash');
  assert.equal(fs.existsSync(f.file), false);
  assert.deepEqual(backups(f), []);
});

for (const seeded of [false, true]) {
  test(`PUT migrates unchanged legacy ${seeded ? 'seeded' : 'saved'} assignments once with the original hash and exact backup`, async (t) => {
    const f = fixture(t, { seeded });
    const { body: loaded } = await get();
    const migrated = await put(loaded.editable, loaded.hash);
    assert.equal(migrated.status, 200, JSON.stringify(migrated.body));
    assert.deepEqual(migrated.body.changed, ['targetRefVersion', 'activeModel', 'clientRoleMatrix']);
    const migratedText = fs.readFileSync(f.file, 'utf8');
    assert.deepEqual(JSON.parse(migratedText), versionedRegistry());
    assert.equal(migrated.body.hash, digest(migratedText));
    assert.equal(backups(f).length, seeded ? 0 : 1);
    if (seeded) {
      assert.equal(migrated.body.backup, null);
      assert.equal(fs.readFileSync(f.builtin, 'utf8'), f.text);
    } else assert.equal(fs.readFileSync(path.join(f.root, migrated.body.backup), 'utf8'), f.text);
    const unchanged = await put({}, migrated.body.hash);
    assert.deepEqual(unchanged.body, { ok: true, changed: [], backup: null });
    assert.equal(fs.readFileSync(f.file, 'utf8'), migratedText);
    assert.equal(backups(f).length, seeded ? 0 : 1);
  });

  test(`PUT no-op leaves ${seeded ? 'seeded' : 'saved'} bytes and disk layout untouched`, async (t) => {
    const f = fixture(t, { seeded, text: serialize(versionedRegistry()) });
    const { body: loaded } = await get();
    const response = await put(loaded.editable, loaded.hash);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true, changed: [], backup: null });
    assert.equal(fs.readFileSync(seeded ? f.builtin : f.file, 'utf8'), f.text);
    assert.equal(fs.existsSync(f.file), !seeded);
    assert.equal(fs.existsSync(path.join(f.root, '.aios')), false);
  });

  for (const text of ['{bad', '[]', 'null']) {
    test(`malformed ${seeded ? 'seeded' : 'saved'} config ${text} returns structured GET/PUT errors`, async (t) => {
      const f = fixture(t, { seeded, text });
      for (const response of [await get(), await put({}, digest(text))]) {
        assert.equal(response.status, 422);
        assert.equal(response.body.error, 'config-invalid');
        assert.equal(typeof response.body.detail, 'string');
        assert.ok(response.body.detail.length > 0);
      }
      assert.equal(fs.readFileSync(seeded ? f.builtin : f.file, 'utf8'), text);
      assert.equal(fs.existsSync(f.file), !seeded);
      assert.deepEqual(backups(f), []);
    });
  }
}

test('PUT validates edits before touching the saved registry or creating a backup', async (t) => {
  const document = registry();
  document.providers.unused = { ...document.providers.relay, models: [] };
  const f = fixture(t, { text: serialize(document) });
  const { body: loaded } = await get();
  loaded.editable.providers.find((provider) => provider.id === 'unused').baseUrl = 'ftp://invalid.example';
  const response = await put(loaded.editable, loaded.hash);
  assert.equal(response.status, 422);
  assert.equal(response.body.error, 'invalid-document');
  assert.equal(response.body.path, 'providers.unused.baseUrl');
  assert.equal(fs.readFileSync(f.file, 'utf8'), f.text);
  assert.deepEqual(backups(f), []);
});

test('PUT rejects malformed request bodies with structured responses before disk access', async (t) => {
  const f = fixture(t);
  for (const body of [null, [], {}, { expectedHash: 1, editable: {} }, { expectedHash: digest(f.text), editable: [] }]) {
    const response = await putBody(body);
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'invalid-body');
  }
  const response = await result(await PUT(new Request('http://localhost/api/config/model-routing', { method: 'PUT', body: '{bad' })));
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'invalid-body');
  assert.equal(fs.readFileSync(f.file, 'utf8'), f.text);
  assert.deepEqual(backups(f), []);
});

test('GET and PUT return config-unreadable when neither registry source exists', async (t) => {
  const f = fixture(t);
  fs.unlinkSync(f.file);
  for (const response of [await get(), await put({}, digest(f.text))]) {
    assert.equal(response.status, 423);
    assert.equal(response.body.error, 'config-unreadable');
    assert.equal(typeof response.body.detail, 'string');
  }
  assert.equal(fs.existsSync(f.file), false);
  assert.deepEqual(backups(f), []);
});

for (const seeded of [false, true]) {
  test(`concurrent PUTs serialize their hash checks for a ${seeded ? 'seeded' : 'saved'} registry`, async (t) => {
    const f = fixture(t, { seeded });
    const { body: loaded } = await get();
    const first = structuredClone(loaded.editable);
    const second = structuredClone(loaded.editable);
    first.matrix.default.reviewer = 'custom';
    second.matrix.default.reviewer = 'curated';
    const responses = await Promise.all([put(first, loaded.hash), put(second, loaded.hash)]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    const saved = responses.find((response) => response.status === 200);
    assert.equal(saved.body.hash, digest(fs.readFileSync(f.file, 'utf8')));
    assert.equal(backups(f).length, seeded ? 0 : 1);
    assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['model-registry.json']);
  });
}

test('PUT reports backup failure without replacing bytes, and releases the lock for retry', async (t) => {
  const f = fixture(t);
  const { body: loaded } = await get();
  loaded.editable.matrix.default.reviewer = 'custom';
  write(f.backupDir, 'not a directory');
  const failed = await put(loaded.editable, loaded.hash);
  assert.equal(failed.status, 500);
  assert.equal(failed.body.error, 'config-write-failed');
  assert.equal(fs.readFileSync(f.file, 'utf8'), f.text);
  assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['model-registry.json']);
  fs.unlinkSync(f.backupDir);
  assert.equal((await put(loaded.editable, loaded.hash)).status, 200);
});

test('GET adds only whitelisted policy context and editable scalar defaults', async (t) => {
  const document = registry();
  document.clientDefaults = { codex: 'discovered', 'future-client': 'custom' };
  document.roleDefaults.planner.extra = { apiKey: 'DO_NOT_PROJECT' };
  document.routingRules[0].headers = { authorization: 'DO_NOT_PROJECT' };
  fixture(t, { text: serialize(document) });
  const { body } = await get();
  assert.equal(body.editable.activeModel, 'curated');
  assert.deepEqual(body.editable.clientDefaults, document.clientDefaults);
  assert.deepEqual(body.policyContext, {
    roleDefaults: { planner: { taskType: 'planning' } },
    routingRules: [{ taskType: 'planning', primary: 'curated', fallback: ['custom'] }],
  });
  assert.doesNotMatch(JSON.stringify(body.policyContext), /DO_NOT_PROJECT|authorization|apiKey|env:/u);
});

test('PUT persists scalar-only edits, rejects unbound selections before writing, and preserves omitted valid fields', async (t) => {
  const f = fixture(t);
  let loaded = (await get()).body;
  for (const editable of [{ activeModel: ' CUSTOM ' }, { clientDefaults: { codex: ' DISCOVERED ' } }]) {
    const rejected = await put(editable, loaded.hash);
    assert.equal(rejected.status, 422, 'case and whitespace are significant model ID bytes');
    assert.equal(fs.readFileSync(f.file, 'utf8'), f.text);
    assert.deepEqual(backups(f), []);
  }
  let saved = await put({ targetRefVersion: 1, activeModel: 'model:custom', clientDefaults: { codex: 'model:discovered' } }, loaded.hash);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.changed, ['targetRefVersion', 'activeModel', 'clientDefaults', 'clientRoleMatrix']);
  let document = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  assert.equal(document.activeModel, 'model:custom');
  assert.deepEqual(document.clientDefaults, { codex: 'model:discovered' });
  assert.deepEqual(document.providers, registry().providers);
  loaded = (await get()).body;
  const beforeInvalid = fs.readFileSync(f.file, 'utf8');
  const beforeBackups = backups(f);
  const invalid = await put({ activeModel: 'legacy' }, loaded.hash);
  assert.equal(invalid.status, 422);
  assert.equal(invalid.body.error, 'invalid-document');
  assert.equal(invalid.body.path, 'activeModel');
  assert.equal(fs.readFileSync(f.file, 'utf8'), beforeInvalid);
  assert.deepEqual(backups(f), beforeBackups);
  const beforePartial = JSON.parse(beforeInvalid);
  const providers = structuredClone(loaded.editable.providers);
  providers[0].baseUrl = 'http://changed.invalid';
  saved = await put({ providers }, loaded.hash);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.changed, ['providers']);
  assert.equal(fs.readFileSync(path.join(f.root, saved.body.backup), 'utf8'), beforeInvalid);
  document = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  for (const key of ['activeModel', 'clientDefaults', 'models', 'clientRoleMatrix', 'routingGroups', 'intentRouting', 'roleDefaults', 'routingRules', 'extensionMetadata']) {
    assert.deepEqual(document[key], beforePartial[key], `${key} survives a partial save of valid config`);
  }
});

test('PUT migrates exact schema ID bytes and stale refs while preserving unknown client/intent/non-record role metadata', async (t) => {
  const document = registry();
  const rawId = ' Org/Case:% 模型 ';
  const staleId = ' Missing / Case:% ';
  const rawRef = `model:${encodeURIComponent(rawId)}`;
  const staleRef = `model:${encodeURIComponent(staleId)}`;
  document.models[rawId] = { protocols: ['claude'], extension: { keep: true } };
  document.providers.relay.models.push(rawId);
  document.activeModel = rawId;
  document.clientDefaults = { codex: rawId };
  document.envModels = { planner: staleId };
  document.clientRoleMatrix.default.planner = rawId;
  document.clientRoles = { codex: { planner: 'group:review', invalid: 'model:%GG', fallback: [' Auto '] } };
  document.roleDefaults = {
    planner: { taskType: 'planning', preferredModel: staleId, fallback: [rawId, staleId], extension: { modelId: 'group:review' } },
    legacy: 'group:review', list: ['group:review', { preferredModel: 'model:%GG' }], empty: null, flag: false, count: 7,
  };
  document.routingRules[0].fallback = [staleId, rawId];
  document.intentRouting = {
    enabled: false, classifierModel: rawId,
    intents: [{ id: 'chat', description: 'Chat', modelId: rawId, fallback: [staleId] }],
    rules: [{ modelId: 'group:review', fallback: ['model:%GG'], target: ' Auto ' }],
  };
  const f = fixture(t, { text: `  ${serialize(document)}\n` });
  const loaded = (await get()).body;
  assert.equal(JSON.stringify(loaded.policyContext).includes('clientRoles'), false);
  assert.equal(JSON.stringify(loaded.policyContext).includes('intentRouting.rules'), false);
  const saved = await put(loaded.editable, loaded.hash);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(backups(f).length, 1);
  assert.equal(fs.readFileSync(path.join(f.root, saved.body.backup), 'utf8'), f.text);
  const savedText = fs.readFileSync(f.file, 'utf8');
  assert.equal(saved.body.hash, digest(savedText));
  const next = JSON.parse(savedText);
  assert.equal(next.targetRefVersion, 1);
  assert.equal(next.activeModel, rawRef);
  assert.deepEqual(next.clientDefaults, { codex: rawRef });
  assert.deepEqual(next.envModels, { planner: staleRef });
  assert.equal(next.clientRoleMatrix.default.planner, rawRef);
  assert.equal(next.roleDefaults.planner.preferredModel, staleRef);
  assert.deepEqual(next.roleDefaults.planner.fallback, [rawRef, staleRef]);
  assert.deepEqual(next.routingRules[0].fallback, [staleRef, rawRef]);
  assert.equal(next.intentRouting.intents[0].modelId, rawRef);
  assert.deepEqual(next.intentRouting.intents[0].fallback, [staleRef]);
  assert.equal(next.intentRouting.classifierModel, rawId);
  for (const key of ['clientRoles', 'models', 'providers', 'routingGroups', 'extensionMetadata']) assert.deepEqual(next[key], document[key], key);
  for (const key of ['legacy', 'list', 'empty', 'flag', 'count']) assert.deepEqual(next.roleDefaults[key], document.roleDefaults[key], key);
  assert.deepEqual(next.roleDefaults.planner.extension, document.roleDefaults.planner.extension);
  assert.deepEqual(next.intentRouting.rules, document.intentRouting.rules);
  const unchanged = await put({}, saved.body.hash);
  assert.deepEqual(unchanged.body, { ok: true, changed: [], backup: null });
  assert.equal(fs.readFileSync(f.file, 'utf8'), savedText);
  assert.equal(backups(f).length, 1);
});

test('PUT rejects unchanged ambiguous references until an explicit binding repair, preserving exact original bytes in backup', async (t) => {
  const document = registry();
  document.models.curated.provider = 'native-launcher';
  document.providers.other = { ...document.providers.relay, enabled: false };
  document.clientDefaults = { codex: 'curated' };
  const f = fixture(t, { text: serialize(document) });
  const response = await get();
  assert.equal(response.status, 200, 'GET leaves an invalid existing document available for repair');
  const loaded = response.body;
  assert.equal(loaded.editable.activeModel, 'curated');
  assert.equal(loaded.models.some((model) => model.id === 'curated'), false);
  assert.equal(fs.readFileSync(f.file, 'utf8'), f.text);
  assert.deepEqual(backups(f), []);
  for (const editable of [loaded.editable, {}]) {
    const rejected = await put(editable, loaded.hash);
    assert.equal(rejected.status, 422, JSON.stringify(rejected.body));
    assert.equal(rejected.body.error, 'invalid-document');
    assert.equal(rejected.body.path, 'activeModel');
    assert.equal(fs.readFileSync(f.file, 'utf8'), f.text);
    assert.deepEqual(backups(f), []);
  }
  loaded.editable.providers[0].baseUrl = 'https://changed.example.invalid';
  const rejected = await put({ providers: loaded.editable.providers }, loaded.hash);
  assert.equal(rejected.status, 422);
  assert.equal(rejected.body.path, 'activeModel');
  assert.equal(fs.readFileSync(f.file, 'utf8'), f.text);
  assert.deepEqual(backups(f), []);
  loaded.editable.providers.find((provider) => provider.id === 'other').models = [];
  const saved = await put(loaded.editable, loaded.hash);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.changed, ['targetRefVersion', 'activeModel', 'clientDefaults', 'providers', 'clientRoleMatrix']);
  const next = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  const migrated = { ...versionedRegistry(), models: document.models, clientDefaults: { codex: 'model:curated' } };
  for (const key of ['models', 'activeModel', 'clientDefaults', 'clientRoleMatrix', 'routingGroups', 'intentRouting', 'roleDefaults', 'routingRules', 'extensionMetadata']) assert.deepEqual(next[key], migrated[key], key);
  assert.deepEqual(next.providers.other, { ...document.providers.other, models: [] }, 'repair removes only the explicitly edited duplicate binding');
  assert.equal((await get()).body.models.find((model) => model.id === 'curated').provider, 'relay');
  assert.equal(backups(f).length, 1);
  assert.equal(fs.readFileSync(path.join(f.root, saved.body.backup), 'utf8'), f.text);
  assert.equal((await get()).body.hash, saved.body.hash);
});

for (const binding of ['discovered', 'custom', 'custom-provider-list']) {
  for (const [protocol, normalized] of [['openai', 'openai-chat'], ['messages', 'claude'], ['anthropic', 'claude']]) {
    for (const pause of ['none', 'model', 'provider', 'both']) {
      test(`PUT accepts full and partial singular ${protocol} ${binding} classifier with ${pause} paused and exact backups`, async (t) => {
        const document = versionedRegistry();
        delete document.models.discovered.protocols;
        document.models.discovered.protocol = protocol;
        document.models.discovered.extension = { keep: ['singular binding metadata'] };
        if (binding !== 'discovered') document.models.discovered.source = 'custom';
        if (binding === 'custom-provider-list') {
          delete document.models.discovered.provider;
          document.providers.relay.models.push('discovered');
        }
        if (pause === 'model' || pause === 'both') document.models.discovered.enabled = false;
        if (pause === 'provider' || pause === 'both') document.providers.relay.enabled = false;
        document.intentRouting = {
          enabled: true, classifierModel: 'discovered', extension: { keep: ['intent metadata'] },
          intents: [{ id: 'code', description: 'Coding', modelId: 'model:custom', extension: { weight: 3 } }],
        };
        const f = fixture(t, { text: `  ${serialize(document)}\n` });
        const response = await get();
        assert.equal(response.status, 200);
        const loaded = response.body;
        assert.equal(loaded.hash, digest(f.text));
        if (binding !== 'discovered') assert.deepEqual(loaded.editable.customModels.find((model) => model.id === 'discovered').protocols, [protocol]);
        if (pause === 'none') assert.deepEqual(loaded.models.find((model) => model.id === 'discovered').protocols, [normalized]);
        else assert.equal(loaded.models.some((model) => model.id === 'discovered'), false);
        for (const editable of [loaded.editable, {}]) {
          const unchanged = await put(editable, loaded.hash);
          assert.equal(unchanged.status, 200, JSON.stringify(unchanged.body));
          assert.deepEqual(unchanged.body, { ok: true, changed: [], backup: null });
          assert.equal(fs.readFileSync(f.file, 'utf8'), f.text);
          assert.deepEqual(backups(f), []);
        }
        if (pause !== 'none') {
          const intentRouting = structuredClone(loaded.editable.intentRouting);
          intentRouting.intents.push({ id: 'new', description: 'New assignment', modelId: 'discovered' });
          const rejected = await put({ targetRefVersion: 1, intentRouting }, loaded.hash);
          assert.equal(rejected.status, 422);
          assert.equal(rejected.body.error, 'invalid-document');
          assert.equal(rejected.body.path, 'intentRouting.intents[1].modelId');
          assert.equal(fs.readFileSync(f.file, 'utf8'), f.text);
          assert.deepEqual(backups(f), []);
        }
        let previousText = f.text;
        let expectedHash = loaded.hash;
        for (const [index, mode] of ['partial', 'full'].entries()) {
          const editable = structuredClone(loaded.editable);
          editable.providers[0].baseUrl = `https://${mode}.example.invalid`;
          const saved = await put(mode === 'full' ? editable : { providers: editable.providers }, expectedHash);
          assert.equal(saved.status, 200, JSON.stringify(saved.body));
          assert.deepEqual(saved.body.changed, ['providers']);
          assert.equal(backups(f).length, index + 1);
          assert.equal(fs.readFileSync(path.join(f.root, saved.body.backup), 'utf8'), previousText);
          const savedText = fs.readFileSync(f.file, 'utf8');
          assert.equal(saved.body.hash, digest(savedText));
          assert.deepEqual(JSON.parse(savedText), {
            ...document, providers: { relay: { ...document.providers.relay, baseUrl: editable.providers[0].baseUrl } },
          });
          assert.equal((await get()).body.hash, saved.body.hash);
          previousText = savedText;
          expectedHash = saved.body.hash;
        }
        if (binding !== 'discovered') {
          const editable = (await get()).body.editable;
          editable.customModels.find((model) => model.id === 'discovered').label = 'Renamed singular classifier';
          const saved = await put(editable, expectedHash);
          assert.equal(saved.status, 200, JSON.stringify(saved.body));
          assert.deepEqual(saved.body.changed, ['models']);
          assert.equal(backups(f).length, 3);
          assert.equal(fs.readFileSync(path.join(f.root, saved.body.backup), 'utf8'), previousText);
          const savedText = fs.readFileSync(f.file, 'utf8');
          assert.equal(saved.body.hash, digest(savedText));
          assert.deepEqual(JSON.parse(savedText), {
            ...document,
            providers: { relay: { ...document.providers.relay, baseUrl: 'https://full.example.invalid' } },
            models: { ...document.models, discovered: { ...document.models.discovered, label: 'Renamed singular classifier' } },
          });
        }
      });
    }
  }
}

for (const stale of ['classifier', 'intent']) {
  test(`PUT explicitly clears disabled stale ${stale} references without dropping extension metadata or writing omitted failures`, async (t) => {
    const document = registry();
    document.intentRouting = {
      enabled: false, classifierModel: stale === 'classifier' ? 'missing' : '',
      intents: [{ id: 'old', description: 'Old intent', modelId: 'legacy', extension: { keep: true } }],
      extension: { keep: ['disabled intent metadata'] },
    };
    const f = fixture(t, { text: `  ${serialize(document)}\n` });
    const response = await get();
    assert.equal(response.status, 200, 'invalid saved intent remains readable for explicit repair');
    const loaded = response.body;
    assert.equal(loaded.editable.intentRouting.enabled, false);
    const providers = structuredClone(loaded.editable.providers);
    providers[0].baseUrl = 'https://changed.example.invalid';
    for (const editable of [loaded.editable, {}, { providers }]) {
      const rejected = await put(editable, loaded.hash);
      assert.equal(rejected.status, 422, JSON.stringify(rejected.body));
      assert.equal(rejected.body.error, 'invalid-document');
      assert.equal(rejected.body.path, stale === 'classifier' ? 'intentRouting.classifierModel' : 'intentRouting.intents[0].modelId');
      assert.equal(fs.readFileSync(f.file, 'utf8'), f.text);
      assert.deepEqual(backups(f), []);
    }
    const cleared = { enabled: false, classifierModel: '', intents: [] };
    const saved = await put({ intentRouting: cleared }, loaded.hash);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body.changed, ['targetRefVersion', 'activeModel', 'clientRoleMatrix', 'intentRouting']);
    assert.equal(backups(f).length, 1);
    assert.equal(fs.readFileSync(path.join(f.root, saved.body.backup), 'utf8'), f.text);
    const savedText = fs.readFileSync(f.file, 'utf8');
    assert.equal(saved.body.hash, digest(savedText));
    assert.deepEqual(JSON.parse(savedText), { ...versionedRegistry(), intentRouting: { ...document.intentRouting, ...cleared } });
    const reloaded = await get();
    assert.equal(reloaded.body.hash, saved.body.hash);
    assert.deepEqual(reloaded.body.editable.intentRouting, cleared);
    const unchanged = await put({}, saved.body.hash);
    assert.equal(unchanged.status, 200);
    assert.deepEqual(unchanged.body, { ok: true, changed: [], backup: null });
    assert.equal(fs.readFileSync(f.file, 'utf8'), savedText);
    assert.equal(backups(f).length, 1);
  });
}
