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
).replace("'../../../../lib/config/model-registry-store.mjs'", JSON.stringify(storeUrl.href));
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
      protocolBaseUrls: { claude: 'https://claude.example.invalid' },
      accounts: [
        { id: 'primary', apiKeyEnv: 'env:PRIMARY_KEY', weight: 3, label: 'Primary' },
        { id: 'backup', apiKeyEnv: 'env:BACKUP_KEY', weight: 1, enabled: false },
      ],
    },
  },
  clientRoleMatrix: { default: { implementer: 'curated' }, clients: { codex: { reviewer: 'custom', planner: 'legacy' } } },
  routingGroups: { review: { models: ['curated'], routing: 'weight', weights: { curated: 3 }, accountIds: ['primary'], description: 'Review pool' } },
  intentRouting: { enabled: false, classifierModel: '', intents: [] },
  roleDefaults: { planner: { taskType: 'planning' } },
  routingRules: [{ taskType: 'planning', primary: 'curated', fallback: ['custom'] }],
  extensionMetadata: { revision: 1, keep: ['untouched'] },
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
  assert.equal(response.body.editable.matrix.clients.codex.planner, 'legacy', 'unbound references remain editable metadata, not selectable models');
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
  assert.deepEqual(saved.body.changed, ['providers', 'clientRoleMatrix', 'routingGroups']);
  assert.match(saved.body.backup, /^\.aios\/config-backups\/model-registry-.+\.json$/u);
  assert.equal(fs.readFileSync(path.join(f.root, saved.body.backup), 'utf8'), f.text);
  assert.equal(backups(f).length, 1);
  const savedText = fs.readFileSync(f.file, 'utf8');
  assert.equal(saved.body.hash, digest(savedText));
  assert.equal((await get()).body.hash, saved.body.hash);
  const document = JSON.parse(savedText);
  const original = registry();
  assert.deepEqual(document.providers.relay, {
    ...original.providers.relay, baseUrl: 'https://new.example.invalid',
    accounts: [...original.providers.relay.accounts].reverse(),
  });
  assert.deepEqual(document.routingGroups.review, { ...original.routingGroups.review, routing: 'order' });
  assert.equal(document.clientRoleMatrix.default.reviewer, 'custom');
  assert.deepEqual(document.clientRoleMatrix.clients, original.clientRoleMatrix.clients, 'unrelated edits preserve legacy references');
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
  assert.deepEqual(saved.body.changed, ['clientRoleMatrix']);
  assert.equal(saved.body.backup, null);
  assert.deepEqual(backups(f), []);
  assert.equal(saved.body.hash, digest(fs.readFileSync(f.file, 'utf8')));
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).clientRoleMatrix.default.reviewer, 'custom');
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
  test(`PUT no-op leaves ${seeded ? 'seeded' : 'saved'} bytes and disk layout untouched`, async (t) => {
    const f = fixture(t, { seeded });
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
  const f = fixture(t);
  const { body: loaded } = await get();
  loaded.editable.providers[0].baseUrl = 'ftp://invalid.example';
  const response = await put(loaded.editable, loaded.hash);
  assert.equal(response.status, 422);
  assert.equal(response.body.error, 'invalid-document');
  assert.equal(response.body.path, 'providers.relay.baseUrl');
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
