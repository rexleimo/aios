import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as adapter from '../../../../../apps/shell/ui/src/lib/config/model-routing.mjs';
import { validateProvider } from '../../../../lib/tooling/model-router/providers/registry.mjs';

const { applyEdits, ConfigError, diffEditable, toEditable, toModelCatalog, validateDocument } = adapter;
const protocols = ['openai-chat', 'openai-response', 'claude', 'gemini'];
const fields = ['protocolBaseUrls', 'baseProtocol', 'preset', 'presetRegion', 'authHeader', 'headers'];
const connections = () => ({
  protocolBaseUrls: {
    'openai-chat': 'https://chat.example.invalid/independent/v1',
    'openai-response': 'https://responses.example.invalid/root',
    claude: 'https://claude.example.invalid/anthropic',
    gemini: 'http://localhost:11434/google/v1beta',
  },
  baseProtocol: 'messages', preset: 'vendor-preset', presetRegion: 'custom-region', authHeader: 'both',
  headers: { 'x-region': 'west', 'Anthropic-Version': '2023-06-01', Authorization: 'env:AUTH_TOKEN', 'x-api-key': 'env:API_KEY' },
});
const registry = (patch = {}) => ({
  providers: { relay: {
    baseUrl: 'https://legacy.example.invalid/original', protocols: [...protocols], models: [],
    extension: { keep: ['provider metadata'] }, ...patch,
  } },
  models: { custom: { source: 'custom', provider: 'relay', protocol: 'messages', upstreamModel: ' Vendor/Case ', extension: { keep: true } } },
  activeModel: 'custom',
  intentRouting: { enabled: true, classifierModel: 'custom', intents: [{ id: 'code', description: 'Code', modelId: 'custom' }] },
  extension: { keep: ['document metadata'] },
});
const canonicalRegistry = (document) => ({
  ...document, targetRefVersion: 1, activeModel: 'model:custom',
  intentRouting: { ...document.intentRouting,
    intents: document.intentRouting.intents.map((item) => ({ ...item, modelId: 'model:custom' })),
  },
});
const save = (document, editable) => {
  const next = applyEdits(document, editable);
  validateDocument(next, { previousDocument: document });
  return next;
};

test('normalizeProtocol is shared as a named export without changing alias semantics', () => {
  assert.equal(typeof adapter.normalizeProtocol, 'function');
  for (const [raw, canonical] of [['openai', 'openai-chat'], ['chat_completions', 'openai-chat'], ['anthropic_messages', 'claude'], ['responses', 'openai-response'], ['google', 'gemini'], ['bogus', '']]) {
    assert.equal(adapter.normalizeProtocol(raw), canonical);
  }
});

test('connection fields project only when present, clone maps, and preserve raw custom/connection metadata', () => {
  const document = registry(connections());
  const original = structuredClone(document);
  const editable = toEditable(document);
  for (const field of fields) assert.deepEqual(editable.providers[0][field], document.providers.relay[field], field);
  const migrated = save(document, editable);
  assert.deepEqual(migrated, canonicalRegistry(original));
  assert.deepEqual(diffEditable(editable, toEditable(migrated)), ['targetRefVersion', 'activeModel', 'intentRouting']);
  assert.deepEqual(save(migrated, toEditable(migrated)), migrated);
  assert.deepEqual(diffEditable(editable, toEditable(original)), []);
  editable.providers[0].protocolBaseUrls.claude = 'https://changed.example.invalid/claude';
  editable.providers[0].headers['x-region'] = 'east';
  assert.deepEqual(document, original, 'projection maps must not alias saved metadata');
  const legacy = toEditable(registry()).providers[0];
  for (const field of fields) assert.equal(Object.hasOwn(legacy, field), false, field);
});

test('new connection edits replace maps, preserve unknown metadata, and retain independent hosts and paths', () => {
  const document = registry({ ...connections(), headers: { 'x-region': 'old', 'x-old': 'remove me' } });
  const editable = toEditable(document);
  Object.assign(editable.providers[0], connections(), { preset: 'another-vendor', presetRegion: 'east', authHeader: 'bearer' });
  editable.providers[0].protocolBaseUrls.claude = 'https://other-host.example.invalid/new/claude';
  const next = save(document, editable);
  assert.deepEqual(next.providers.relay, {
    ...document.providers.relay, ...connections(), preset: 'another-vendor', presetRegion: 'east', authHeader: 'bearer',
    protocolBaseUrls: editable.providers[0].protocolBaseUrls,
  });
});

test('new providers accept all connection fields without silently omitting them', () => {
  const editable = toEditable({});
  editable.providers = [{ id: 'new', baseUrl: 'https://primary.example.invalid', protocols, models: [], ...connections() }];
  const next = save({}, editable);
  for (const field of fields) assert.deepEqual(next.providers.new[field], connections()[field]);
});

test('explicit null clears optional fields; scalar empty strings clear; empty maps are not implicit clears', () => {
  const document = registry(connections());
  for (const clear of ['null', 'empty-scalars']) {
    const editable = toEditable(document);
    for (const field of fields) editable.providers[0][field] = clear === 'empty-scalars' && !['headers', 'protocolBaseUrls'].includes(field) ? '' : null;
    const next = save(document, editable);
    for (const field of fields) assert.equal(Object.hasOwn(next.providers.relay, field), false, `${clear}/${field}`);
    assert.deepEqual(next.models, document.models);
    assert.deepEqual(diffEditable(toEditable(document), toEditable(next)), ['targetRefVersion', 'activeModel', 'providers', 'intentRouting']);
  }
  const editable = toEditable(document);
  editable.providers[0].headers = {};
  assert.deepEqual(save(document, editable).providers.relay.headers, {});
  editable.providers[0].protocolBaseUrls = {};
  assert.throws(() => save(document, editable), ConfigError, 'declared protocols still require complete explicit endpoints');
});

test('old clients omitting new fields preserve them during partial and unrelated saves', () => {
  const document = registry(connections());
  const editable = toEditable(document);
  for (const field of fields) delete editable.providers[0][field];
  editable.providers[0].baseUrl = 'https://edited-primary.example.invalid/new';
  const next = save(document, { providers: editable.providers });
  assert.deepEqual(next, { ...canonicalRegistry(document), providers: { relay: { ...document.providers.relay, baseUrl: editable.providers[0].baseUrl } } });
  assert.deepEqual(save(document, { customModels: [{ ...toEditable(document).customModels[0], label: 'Renamed' }] }).providers, document.providers);
});

test('legacy raw field spelling and absent defaults survive no-op and unrelated full saves', () => {
  const document = registry({ baseUrl: ' HTTPS://Legacy.Example.invalid/root/ ', apiKeyEnv: ' env:LEGACY_KEY ' });
  const migrated = save(document, toEditable(document));
  assert.deepEqual(migrated, canonicalRegistry(document));
  assert.deepEqual(save(migrated, toEditable(migrated)), migrated);
  const editable = toEditable(document);
  editable.providers[0].baseUrl = 'https://new-primary.example.invalid';
  assert.deepEqual(save(document, editable).providers.relay, { ...document.providers.relay, baseUrl: editable.providers[0].baseUrl });
});

test('unchanged provider connections retain established account id/ref normalization and metadata', () => {
  const document = registry({ ...connections(), accounts: [{ id: ' PRIMARY ', apiKeyEnv: ' env:PRIMARY_KEY ', weight: 3, extension: { keep: true } }] });
  const original = structuredClone(document);
  const next = save(document, toEditable(document));
  assert.deepEqual(next.providers.relay.accounts, [{ id: 'primary', apiKeyEnv: 'env:PRIMARY_KEY', weight: 3, extension: { keep: true } }]);
  for (const field of fields) assert.deepEqual(next.providers.relay[field], document.providers.relay[field]);
  assert.deepEqual(document, original);
});

test('explicit maps require canonical keys and complete coverage after normalizing protocol declarations', () => {
  const document = registry({ ...connections(), protocols: ['openai', 'messages', 'google', 'responses'] });
  assert.doesNotThrow(() => validateDocument(document));
  assert.deepEqual(toModelCatalog(document)[0].protocols, ['claude']);
  const one = registry({ protocols: ['messages'], protocolBaseUrls: { claude: 'https://one.example.invalid/a', gemini: 'https://spare.example.invalid/b' } });
  assert.doesNotThrow(() => validateDocument(one), 'extra canonical endpoints are valid metadata');
});

const invalidMaps = [null, [], 'https://wrong.example.invalid', {}, { claude: 'https://only.example.invalid' },
  { ...connections().protocolBaseUrls, messages: 'https://alias.example.invalid' },
  { ...connections().protocolBaseUrls, 'OPENAI-CHAT': 'https://case.example.invalid' },
  { ...connections().protocolBaseUrls, unknown: 'https://unknown.example.invalid' },
  ...['', ' ', null, 7, [], {}].map((claude) => ({ ...connections().protocolBaseUrls, claude }))];
for (const [index, protocolBaseUrls] of invalidMaps.entries()) {
  test(`invalid explicit endpoint map ${index} never falls back to legacy baseUrl`, () => {
    const document = registry({ protocolBaseUrls });
    assert.throws(() => validateDocument(document), ConfigError);
    assert.deepEqual(toModelCatalog(document), []);
    assert.deepEqual(toModelCatalog(document, { includeDisabled: true }), []);
    assert.throws(() => save(document, toEditable(document)), ConfigError, 'unchanged projection cannot repair malformed connections implicitly');
  });
}

const invalidUrls = ['', ' ', null, 7, {}, 'ftp://host.example.invalid/path', 'https://', 'https:host.example.invalid',
  '//host.example.invalid', 'https:///host.example.invalid', 'https:////host.example.invalid',
  'https://host.example.invalid:99999/path', 'https://bad host.example.invalid',
  'https://user:password@host.example.invalid', 'https://@host.example.invalid',
  'https://host.example.invalid/path?key=secret', 'https://host.example.invalid/path?',
  'https://host.example.invalid/path#fragment', 'https://host.example.invalid/path#', 'https://host.example.invalid/a\nb',
  '\nhttps://host.example.invalid', 'https://host.example.invalid\r\n', 'https://host.example.invalid/bad%zz', 'https://host.example.invalid/\u0085bad'];
for (const [index, url] of invalidUrls.entries()) {
  test(`unsafe URL ${index} rejects for primary metadata and protocol endpoints`, () => {
    for (const patch of [{ baseUrl: url }, { ...connections(), protocolBaseUrls: { ...connections().protocolBaseUrls, claude: url } }]) {
      const document = registry(patch);
      assert.throws(() => validateDocument(document), ConfigError);
      assert.deepEqual(toModelCatalog(document), []);
      assert.throws(() => save(document, toEditable(document)), ConfigError);
    }
  });
}

for (const name of ['authorization', 'X-API-Key', 'x-goog-api-key', 'Api-Key', 'x-custom-token', 'x-channel-key', 'x-signature']) {
  test(`sensitive header ${name} accepts only env references and never permits no-auth credentials`, () => {
    for (const value of ['literal-secret', 'Bearer secret', '', 'env:', 'env:BAD-NAME', 'ENV:KEY', ' env:KEY ']) {
      const document = registry({ headers: { [name]: value } });
      assert.throws(() => validateDocument(document), ConfigError);
      assert.deepEqual(toModelCatalog(document), []);
    }
    assert.doesNotThrow(() => validateDocument(registry({ headers: { [name]: 'env:PROVIDER_KEY' } })));
    const noAuth = registry({ authMode: 'none', headers: { [name]: 'env:PROVIDER_KEY' } });
    assert.throws(() => validateDocument(noAuth), ConfigError);
    assert.deepEqual(toModelCatalog(noAuth), []);
  });
}

test('metadata headers allow literals and env refs without resolving secrets, but no-auth forbids every env ref', () => {
  assert.doesNotThrow(() => validateDocument(registry({ authMode: 'none', headers: { 'X-Region': 'west', 'anthropic-version': '2023-06-01' } })));
  assert.doesNotThrow(() => validateDocument(registry({ headers: { 'x-custom': 'env:CUSTOM_METADATA' } })));
  assert.throws(() => validateDocument(registry({ authMode: 'none', headers: { 'x-custom': 'env:CUSTOM_METADATA' } })), ConfigError);
});

for (const name of ['Host', 'CONTENT-LENGTH', 'Cookie', 'Set-Cookie', 'Proxy-Authorization', 'Proxy-Authenticate',
  'Connection', 'Keep-Alive', 'Transfer-Encoding', 'TE', 'Trailer', 'Upgrade', 'Content-Type', 'Accept-Encoding', 'Content-Encoding', 'Expect',
  'Cookie2', 'Set-Cookie2', 'HTTP2-Settings', 'Forwarded', 'Via', 'X-Real-IP', 'Origin', 'Referer', 'Sec-Fetch-Site', 'X-Forwarded-For', 'Proxy-Custom']) {
  test(`transport/framing header ${name} is denied even as an env reference`, () => {
    for (const value of ['literal', 'env:HEADER_VALUE']) {
      const document = registry({ headers: { [name]: value } });
      assert.throws(() => validateDocument(document), ConfigError);
      assert.deepEqual(toModelCatalog(document), []);
    }
  });
}

test('headers reject malformed maps, nonstrings, duplicate names, invalid tokens, controls, and malformed env refs', () => {
  for (const headers of [null, [], 'x-region:west', { 'x-region': 1 }, { 'x-region': null }, { 'x-region': {} },
    { 'X-Region': 'one', 'x-region': 'two' }, { 'bad name': 'x' }, { 'bad:name': 'x' }, { '': 'x' },
    { 'x\r\nInjected': 'x' }, { 'x-region': 'a\r\nb' }, { 'x-region': 'a\0b' },
    { 'x-region': 'env:BAD-NAME' }, { 'x-region': 'env:' }, { 'x-region': 'ENV:KEY' }]) {
    const document = registry({ headers });
    assert.throws(() => validateDocument(document), ConfigError, JSON.stringify(headers));
    assert.deepEqual(toModelCatalog(document), []);
  }
});

test('editable validation and runtime agree on connection and credential safety', () => {
  const patches = [
    {}, connections(), { authMode: 'none', headers: { 'x-region': 'west' } },
    { headers: { 'x-channel-key': 'env:CHANNEL_KEY' } },
    ...invalidMaps.map(protocolBaseUrls => ({ protocolBaseUrls })),
    ...invalidUrls.map(baseUrl => ({ baseUrl })),
    ...['Host', 'Cookie2', 'Forwarded', 'Proxy-Custom', 'Sec-Fetch-Site', 'X-Forwarded-For'].map(name => ({ headers: { [name]: 'env:VALUE' } })),
    ...['Authorization', 'x-channel-key', 'x-custom-token'].map(name => ({ headers: { [name]: 'not-a-reference' } })),
    ...['\u00e9', '\u{1f511}', '\ud800'].map(value => ({ headers: { 'x-region': value } })),
    { headers: { 'x-region': 'env:BAD-NAME' } },
    { authMode: 'none', headers: { 'x-region': 'env:REGION' } },
    { headers: { 'X-Region': 'one', 'x-region': 'two' } },
  ];
  for (const patch of patches) {
    const document = registry(patch);
    let editableOk = true;
    try { validateDocument(document); } catch (error) {
      assert.ok(error instanceof ConfigError);
      editableOk = false;
    }
    const runtime = validateProvider({ id: 'relay', ...document.providers.relay });
    assert.equal(runtime.ok, editableOk, `adapter/runtime mismatch for ${JSON.stringify(patch)}: ${runtime.errors.join('; ')}`);
  }
});

test('authHeader enum and optional connection metadata types validate without inventing preset enums', () => {
  for (const authHeader of ['x-api-key', 'bearer', 'both']) assert.doesNotThrow(() => validateDocument(registry({ authHeader })));
  for (const patch of [{ authHeader: '' }, { authHeader: 'Bearer' }, { authHeader: 'basic' }, { authHeader: null },
    { baseProtocol: 7 }, { baseProtocol: 'bogus' }, { preset: {} }, { presetRegion: 4 }]) {
    const document = registry(patch);
    assert.throws(() => validateDocument(document), ConfigError, JSON.stringify(patch));
    assert.deepEqual(toModelCatalog(document), []);
  }
});

test('catalog filters only malformed bound connections; unrelated valid provider candidates remain', () => {
  const document = registry({ ...connections(), headers: { Authorization: 'plaintext-secret' } });
  document.providers.other = { baseUrl: 'https://good.example.invalid', protocols: ['messages'], models: [] };
  document.models.other = { source: 'custom', provider: 'other', protocol: 'messages' };
  assert.deepEqual(toModelCatalog(document).map((model) => model.id), ['other']);
  for (const enabled of [true, false]) {
    document.intentRouting.enabled = enabled;
    assert.throws(() => applyEdits(document, {}), ConfigError, 'unchanged strict references cannot retain malformed connections');
  }
});

const ui = new URL('../../../../../apps/shell/ui/', import.meta.url);
const routeUrl = new URL('src/app/api/config/model-routing/route.ts', ui);
const source = fs.readFileSync(routeUrl, 'utf8')
  .replace("'../../../../lib/config/model-routing.mjs'", JSON.stringify(new URL('src/lib/config/model-routing.mjs', ui).href))
  .replace("'../../../../lib/config/model-registry-store.mjs'", JSON.stringify(new URL('src/lib/config/model-registry-store.mjs', ui).href))
  .replace("'../../../../lib/config/routing-policy.mjs'", JSON.stringify(new URL('src/lib/config/routing-policy.mjs', ui).href));
const { GET, PUT } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { sourceUrl: routeUrl.href })).toString('base64')}`);
const digest = (text) => createHash('sha256').update(text).digest('hex');
const result = async (response) => ({ status: response.status, body: await response.json() });
const get = async () => result(await GET());
const put = async (editable, expectedHash) => result(await PUT(new Request('http://localhost/api/config/model-routing', {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ editable, expectedHash }),
})));

function fixture(t, document) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-connections-'));
  const previous = process.env.AIOS_PROJECT_ROOT;
  process.env.AIOS_PROJECT_ROOT = root;
  t.after(() => {
    if (previous === undefined) delete process.env.AIOS_PROJECT_ROOT;
    else process.env.AIOS_PROJECT_ROOT = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const file = path.join(root, 'memory/specs/model-registry.json');
  const text = `  ${JSON.stringify(document, null, 2)}\n\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  const backupDir = path.join(root, '.aios/config-backups');
  return { root, file, text, backups: () => fs.existsSync(backupDir) ? fs.readdirSync(backupDir) : [] };
}

test('real GET/PUT round-trips connections, detects edits/clears, and backs up exact bytes without network', async (t) => {
  const document = registry(connections());
  const f = fixture(t, document);
  const loaded = await get();
  assert.equal(loaded.status, 200);
  for (const field of fields) assert.deepEqual(loaded.body.editable.providers[0][field], document.providers.relay[field]);
  assert.equal(fs.readFileSync(f.file, 'utf8'), f.text);
  assert.deepEqual(f.backups(), []);
  const migrated = await put(loaded.body.editable, loaded.body.hash);
  assert.equal(migrated.status, 200, JSON.stringify(migrated.body));
  assert.equal(migrated.body.ok, true);
  assert.deepEqual(migrated.body.changed, ['targetRefVersion', 'activeModel', 'intentRouting']);
  assert.equal(f.backups().length, 1);
  assert.equal(fs.readFileSync(path.join(f.root, migrated.body.backup), 'utf8'), f.text);
  const migratedText = fs.readFileSync(f.file, 'utf8');
  assert.deepEqual(JSON.parse(migratedText), canonicalRegistry(document));
  assert.equal(migrated.body.hash, digest(migratedText));
  const ready = await get();
  assert.equal(ready.status, 200);
  assert.equal(ready.body.hash, migrated.body.hash);
  assert.deepEqual(ready.body.editable, toEditable(canonicalRegistry(document)));
  assert.deepEqual((await put(ready.body.editable, ready.body.hash)).body, { ok: true, changed: [], backup: null });
  assert.equal(fs.readFileSync(f.file, 'utf8'), migratedText);
  assert.equal(f.backups().length, 1);
  const stale = await put(loaded.body.editable, loaded.body.hash);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, 'stale-hash');
  assert.equal(fs.readFileSync(f.file, 'utf8'), migratedText);
  assert.equal(f.backups().length, 1);
  ready.body.editable.providers[0].protocolBaseUrls.claude = 'https://edited.example.invalid/claude';
  ready.body.editable.providers[0].headers = { 'x-region': 'east' };
  const saved = await put(ready.body.editable, ready.body.hash);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.changed, ['providers']);
  assert.equal(f.backups().length, 2);
  assert.equal(fs.readFileSync(path.join(f.root, saved.body.backup), 'utf8'), migratedText);
  const savedText = fs.readFileSync(f.file, 'utf8');
  assert.equal(saved.body.hash, digest(savedText));
  assert.deepEqual(JSON.parse(savedText), { ...canonicalRegistry(document), providers: { relay: { ...document.providers.relay,
    protocolBaseUrls: ready.body.editable.providers[0].protocolBaseUrls, headers: { 'x-region': 'east' },
  } } });
  const current = (await get()).body;
  for (const field of fields) current.editable.providers[0][field] = null;
  const cleared = await put(current.editable, current.hash);
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  assert.deepEqual(cleared.body.changed, ['providers']);
  assert.equal(f.backups().length, 3);
  assert.equal(fs.readFileSync(path.join(f.root, cleared.body.backup), 'utf8'), savedText);
  for (const field of fields) assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(f.file, 'utf8')).providers.relay, field), false);
  const clearedText = fs.readFileSync(f.file, 'utf8');
  const final = (await get()).body;
  assert.equal(final.hash, digest(clearedText));
  assert.deepEqual((await put(final.editable, final.hash)).body, { ok: true, changed: [], backup: null });
  assert.equal(fs.readFileSync(f.file, 'utf8'), clearedText);
  assert.equal(f.backups().length, 3);
});

test('real PUT rejects malformed connections before writing, including no-op invalid documents', async (t) => {
  const document = registry({ ...connections(), headers: { 'x-region': 'west' } });
  const f = fixture(t, document);
  const loaded = (await get()).body;
  for (const patch of [{ protocolBaseUrls: {} }, { headers: { Authorization: 'literal-secret' } },
    { headers: { Host: 'env:HOST' } }, { authMode: 'none', headers: { 'x-extra': 'env:CREDENTIAL' } },
    { baseUrl: 'https://host.example.invalid/?secret=bad' }]) {
    const editable = structuredClone(loaded.editable);
    Object.assign(editable.providers[0], patch);
    const response = await put(editable, loaded.hash);
    assert.equal(response.status, 422, JSON.stringify(patch));
    assert.equal(response.body.error, 'invalid-document');
    assert.equal(fs.readFileSync(f.file, 'utf8'), f.text);
    assert.deepEqual(f.backups(), []);
  }
  document.providers.relay.protocolBaseUrls = {};
  const invalidText = JSON.stringify(document);
  fs.writeFileSync(f.file, invalidText);
  const invalid = (await get()).body;
  for (const editable of [{}, invalid.editable]) {
    const response = await put(editable, invalid.hash);
    assert.equal(response.status, 422);
    assert.equal(fs.readFileSync(f.file, 'utf8'), invalidText);
    assert.deepEqual(f.backups(), []);
  }
});
