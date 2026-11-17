import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ProviderConfigError,
  defaultRelayProvider,
  getProviderForModel,
  listGatewayModels,
  loadProviders,
  readyProviderAccounts,
  resolveProviderApiKey,
  resolveProviderEndpoint,
  resolveProviderModelsEndpoint,
  validateProvider,
} from '../../../../lib/tooling/model-router/providers/registry.mjs';
import {
  discoverAllModels,
  discoverProviderModels,
  mergeDiscoveredModels,
} from '../../../../lib/tooling/model-router/routing/discovery.mjs';
import { classifyTurnIntent } from '../../../../lib/tooling/model-router/routing/intent.mjs';

const provider = (patch = {}) => ({
  baseUrl: 'https://upstream.invalid', apiKeyEnv: 'env:TEST_KEY', protocols: ['openai-chat'], ...patch,
});
const boundModel = (patch = {}) => ({ source: 'custom', provider: 'selected', protocols: ['openai-chat'], ...patch });
const document = () => ({ models: { model: boundModel() }, providers: { selected: provider() } });
const isRouteError = (error) => error instanceof ProviderConfigError && error.code === 'NO_ROUTE_CONFIGURED';
const isCatalogError = (error) => error instanceof ProviderConfigError && error.code === 'INVALID_PROVIDER_CONFIG';
const success = (body) => ({ ok: true, status: 200, json: async () => body });
const discovered = (id, channel = 'selected', protocols = ['openai-chat']) => ({
  id, upstreamModel: id, provider: channel, protocols, source: 'discovered',
});
const intentConfig = {
  classifierModel: 'model', intents: [{ id: 'quick', description: 'A quick question', modelId: 'target' }],
};

test('providers are opt-in, including relay; a template alone grants no routes', () => {
  assert.deepEqual(loadProviders({}), {});
  assert.deepEqual(loadProviders({ providers: {} }), {});
  assert.equal(new ProviderConfigError(['test']).code, 'NO_ROUTE_CONFIGURED');
  const registry = { models: { model: { protocols: ['claude'] } }, providers: { relay: defaultRelayProvider() } };
  assert.deepEqual(Object.keys(loadProviders(registry)), ['relay']);
  assert.throws(() => getProviderForModel('model', registry), isRouteError);
  assert.throws(() => getProviderForModel('unknown', registry), isRouteError);
  registry.providers.relay.models = ['model'];
  assert.equal(getProviderForModel('model', registry).provider.id, 'relay');
});

test('provider normalization returns authMode/enabled and preserves unknown metadata', () => {
  const input = provider({ id: ' Selected ', label: 'Display name', extra: { future: true },
    accounts: [{ id: ' First ', apiKeyEnv: ' env:ACCOUNT_KEY ', limit: { rpm: 10 } }],
  });
  const before = structuredClone(input);
  const { ok, provider: normalized } = validateProvider(input);
  assert.equal(ok, true);
  assert.equal(normalized.authMode, 'required');
  assert.equal(normalized.enabled, true);
  assert.equal(normalized.endpointStyle, 'relay');
  assert.equal(defaultRelayProvider().endpointStyle, 'relay');
  assert.equal(normalized.id, 'selected');
  assert.equal(normalized.accounts[0].id, 'first');
  assert.deepEqual(normalized.extra, { future: true });
  assert.deepEqual(normalized.accounts[0].limit, { rpm: 10 });
  assert.deepEqual(input, before);
  const local = validateProvider(provider({ id: 'local', authMode: 'none', enabled: false })).provider;
  assert.equal(local.authMode, 'none');
  assert.equal(local.enabled, false);
});

test('invalid provider catalogs reject rather than being hidden by absent routes', () => {
  for (const patch of [
    { authMode: 'optional' }, { authMode: null }, { enabled: 'false' }, { enabled: null },
    { endpointStyle: 'native' }, { endpointStyle: null },
    { apiKey: 'bad\nkey' }, { apiKeyEnv: 'TEST_KEY' }, { baseUrl: '' },
    { protocols: 'openai-chat' }, { protocols: ['invalid'] }, { accounts: [null] },
    { accounts: [{ id: 'a' }, { id: ' A ' }] },
  ]) {
    assert.equal(validateProvider(provider({ id: 'selected', ...patch })).ok, false);
    const registry = { providers: { selected: provider(patch) } };
    assert.throws(() => loadProviders(registry), isCatalogError);
    assert.throws(() => listGatewayModels(registry, { env: {} }), isCatalogError);
  }
  for (const providers of [null, [], 'invalid', { selected: null }, { selected: [] }, {
    P: provider(), p: provider(),
  }]) assert.throws(() => loadProviders({ providers }), isCatalogError);
});

test('readiness enumerates only credentialed accounts, or explicit unauthenticated default', () => {
  const selected = loadProviders({ providers: { selected: provider({
    accounts: [
      { id: 'empty', apiKeyEnv: 'env:UNSET' },
      { id: 'ready', apiKeyEnv: 'env:ACCOUNT_KEY' },
      { id: 'inherited' },
    ],
  }) } }).selected;
  const env = { TEST_KEY: 'provider-fixture', ACCOUNT_KEY: 'account-fixture' };
  assert.deepEqual(readyProviderAccounts(selected, env), ['ready', 'inherited']);
  assert.deepEqual(readyProviderAccounts(selected, {}), []);
  assert.deepEqual(readyProviderAccounts({ ...selected, enabled: false }, env), []);
  assert.deepEqual(readyProviderAccounts(undefined, env), []);
  assert.deepEqual(readyProviderAccounts(provider(), {}), []);
  assert.deepEqual(readyProviderAccounts(provider(), { TEST_KEY: '  ' }), []);
  assert.deepEqual(readyProviderAccounts(provider(), env), ['default']);
  assert.deepEqual(readyProviderAccounts({ ...selected, authMode: 'none' }, {}), ['default']);
  assert.equal(resolveProviderApiKey({ ...selected, authMode: 'none' }, env), '');
});

test('unknown account ids never inherit the provider or another account credential', () => {
  const selected = loadProviders({ providers: { selected: provider({
    accounts: [{ id: 'first', apiKeyEnv: 'env:ACCOUNT_KEY' }, { id: 'inherited' }],
  }) } }).selected;
  const env = { TEST_KEY: 'provider-fixture', ACCOUNT_KEY: 'account-fixture' };
  assert.equal(resolveProviderApiKey(selected, env), 'account-fixture');
  assert.equal(resolveProviderApiKey(selected, env, 'first'), 'account-fixture');
  assert.equal(resolveProviderApiKey(selected, env, 'inherited'), 'provider-fixture');
  assert.equal(resolveProviderApiKey(selected, { TEST_KEY: 'provider-fixture' }, 'first'), '');
  for (const id of ['unknown', 'default', '']) assert.equal(resolveProviderApiKey(selected, env, id), '');
  assert.equal(resolveProviderApiKey(provider(), env, 'default'), 'provider-fixture');
  assert.equal(resolveProviderApiKey(provider(), env, 'unknown'), '');
});

test('native launcher metadata and protocol overlap are never gateway bindings', () => {
  for (const source of [undefined, 'curated']) {
    for (const launcher of ['codex', 'claude', 'pi', 'selected']) {
      const registry = document();
      registry.models.model = { source, provider: launcher, protocols: ['openai-chat'] };
      registry.providers[launcher] = provider();
      assert.throws(() => getProviderForModel('model', registry), isRouteError);
      assert.deepEqual(listGatewayModels(registry, { env: { TEST_KEY: 'fixture' } }), []);
    }
  }
});

test('custom/discovered bindings take precedence and preserve the exact upstream model id', () => {
  for (const source of ['custom', 'discovered']) {
    const registry = document();
    registry.models.model = boundModel({ source, provider: ' SELECTED ', upstreamModel: 'Vendor/Model-X',
      protocols: ['claude', 'openai_completions'],
    });
    registry.providers.selected.protocols = ['gemini', 'openai-chat'];
    registry.providers.other = provider({ models: ['model'] });
    registry.providers.third = provider({ models: ['model'] });
    const route = getProviderForModel(' MODEL ', registry);
    assert.deepEqual(Object.keys(route).sort(), ['protocol', 'provider', 'upstreamModel']);
    assert.equal(route.provider.id, 'selected');
    assert.equal(route.protocol, 'openai-chat');
    assert.equal(route.upstreamModel, 'Vendor/Model-X');
  }
});

test('unambiguous explicit legacy lists route curated models without treating launchers as providers', () => {
  const registry = {
    models: { model: { provider: 'codex', protocol: 'openai_completions', cli: { command: 'codex' } } },
    providers: { selected: provider({ models: [' MODEL '] }) },
  };
  const route = getProviderForModel(' MODEL ', registry);
  assert.equal(route.provider.id, 'selected');
  assert.equal(route.protocol, 'openai-chat');
  assert.equal(route.upstreamModel, 'model');
  registry.providers.other = provider({ models: ['model'], protocols: ['claude'] });
  assert.throws(() => getProviderForModel('model', registry), isRouteError);
});

test('missing/disabled/ambiguous routes and undeclared or incompatible protocols fail closed', () => {
  const mutations = [
    (r) => { delete r.models.model; },
    (r) => { r.models.model.enabled = false; },
    (r) => { r.models.model.provider = 'missing'; r.providers.other = provider({ models: ['model'] }); },
    (r) => { r.models.model.provider = {}; },
    (r) => { r.providers.selected.enabled = false; r.providers.other = provider({ models: ['model'] }); },
    (r) => { delete r.models.model.protocols; },
    (r) => { r.models.model.protocols = []; },
    (r) => { r.models.model.protocols = 'openai-chat'; },
    (r) => { r.models.model.protocols = ['openai-chat', 'invalid']; },
    (r) => { r.providers.selected.protocols = []; },
    (r) => { r.providers.selected.protocols = ['claude']; },
    (r) => { r.models.model.upstreamModel = {}; },
    (r) => { delete r.models.model.provider; },
    (r) => { delete r.models.model.provider; r.providers.selected.models = ['model'];
      r.providers.other = provider({ models: ['model'] }); },
  ];
  for (const mutate of mutations) {
    const registry = document();
    mutate(registry);
    assert.throws(() => getProviderForModel('model', registry), isRouteError);
    assert.deepEqual(listGatewayModels(registry, { env: { TEST_KEY: 'fixture' } }), []);
  }
  const legacy = { models: { model: {} }, providers: { selected: provider({ models: ['model'] }) } };
  assert.throws(() => getProviderForModel('model', legacy), isRouteError);
  legacy.models.model.protocols = ['openai-chat'];
  legacy.providers.selected.enabled = false;
  assert.throws(() => getProviderForModel('model', legacy), isRouteError);
});

test('endpoint resolution cannot inject a relay when the provider or base is absent', () => {
  for (const selected of [undefined, null, {}, { baseUrl: '' }, { baseUrl: 'ftp://invalid' },
    provider({ enabled: false })]) {
    assert.throws(() => resolveProviderEndpoint(selected, 'openai-chat'), isRouteError);
  }
  assert.throws(() => resolveProviderEndpoint(provider(), 'invalid'), isRouteError);
  assert.equal(resolveProviderEndpoint(provider(), 'openai-chat'), 'https://upstream.invalid/openai/v1/chat/completions');
});

test('standard endpoint style supports native roots and versioned bases without duplicate paths', () => {
  const paths = {
    'openai-chat': '/v1/chat/completions',
    'openai-response': '/v1/responses',
    claude: '/v1/messages',
    gemini: '/v1beta/models',
  };
  for (const [protocol, path] of Object.entries(paths)) {
    const standard = { baseUrl: 'https://native.invalid', endpointStyle: 'standard' };
    const version = protocol === 'gemini' ? '/v1beta' : '/v1';
    assert.equal(resolveProviderEndpoint(standard, protocol), `https://native.invalid${path}`);
    assert.equal(resolveProviderEndpoint({ ...standard, baseUrl: `${standard.baseUrl}${version}/` }, protocol), `https://native.invalid${path}`);
    assert.equal(resolveProviderModelsEndpoint(standard, protocol), `https://native.invalid${version}/models`);
    assert.equal(resolveProviderModelsEndpoint({ ...standard, baseUrl: `${standard.baseUrl}${version}` }, protocol), `https://native.invalid${version}/models`);
  }
  assert.equal(resolveProviderEndpoint({ baseUrl: 'http://127.0.0.1:11434/v1', endpointStyle: 'standard' }, 'openai-chat'),
    'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(resolveProviderEndpoint({ baseUrl: 'https://native.invalid/v1', endpointStyle: 'standard' }, 'gemini'),
    'https://native.invalid/v1beta/models');
  assert.equal(resolveProviderModelsEndpoint({ baseUrl: 'https://native.invalid/v1', endpointStyle: 'standard' }, 'gemini'),
    'https://native.invalid/v1beta/models');
  assert.equal(validateProvider(provider({ id: 'native', endpointStyle: 'standard' })).provider.endpointStyle, 'standard');
  assert.throws(() => resolveProviderModelsEndpoint({}, 'claude'), isRouteError);
});

test('standard discovery uses native model-list endpoints with explicit credentials or auth none', async () => {
  const calls = [];
  const registry = { providers: {
    local: provider({ endpointStyle: 'standard', baseUrl: 'http://127.0.0.1:11434/v1', authMode: 'none' }),
    claude: provider({ endpointStyle: 'standard', baseUrl: 'https://claude.invalid', protocols: ['claude'] }),
    gemini: provider({ endpointStyle: 'standard', baseUrl: 'https://gemini.invalid', protocols: ['gemini'] }),
  } };
  const result = await discoverAllModels(registry, { env: { TEST_KEY: 'fixture' }, fetchImpl: async (url) => {
    calls.push(url);
    return success(url.includes('gemini') ? { models: [{ name: 'models/Gemini-X' }] } : { data: [{ id: 'Native-X' }] });
  } });
  assert.deepEqual(calls, ['http://127.0.0.1:11434/v1/models', 'https://claude.invalid/v1/models', 'https://gemini.invalid/v1beta/models']);
  assert.equal(result.models.length, 3);
});

test('gateway model listing is an array filtered by explicit routes and optional credential readiness', () => {
  const registry = {
    providers: {
      selected: provider(),
      local: provider({ authMode: 'none', apiKeyEnv: '' }),
      legacy: provider({ models: ['legacy'], apiKeyEnv: 'env:MISSING' }),
      off: provider({ enabled: false }),
    },
    models: {
      paid: boundModel(),
      local: boundModel({ provider: 'local' }),
      legacy: { provider: 'codex', protocols: ['openai-chat'] },
      native: { provider: 'codex', protocols: ['openai-chat'] },
      disabled: boundModel({ enabled: false }),
      'disabled-provider': boundModel({ provider: 'off' }),
      'unknown-provider': boundModel({ provider: 'unknown' }),
      'missing-protocol': { source: 'custom', provider: 'selected' },
    },
  };
  assert.deepEqual(listGatewayModels(registry, { env: {} }), ['local']);
  assert.deepEqual(listGatewayModels(registry, { env: { TEST_KEY: 'fixture' } }), ['paid', 'local']);
  assert.deepEqual(listGatewayModels(registry, { env: {}, requireCredentials: false }), ['paid', 'local', 'legacy']);
  assert.deepEqual(listGatewayModels({ models: registry.models }, { env: {} }), []);
});

test('discovery skips missing credentials and disabled providers locally, with error codes', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return success({ data: [] }); };
  const missing = await discoverProviderModels({ id: 'selected', ...provider() }, { env: {}, fetchImpl });
  assert.deepEqual(missing.models, []);
  assert.equal(missing.errors[0].code, 'MISSING_CREDENTIALS');
  const disabled = await discoverProviderModels({ id: 'selected', ...provider({ enabled: false }) }, {
    env: { TEST_KEY: 'fixture' }, fetchImpl,
  });
  assert.equal(disabled.errors[0].code, 'PROVIDER_DISABLED');
  assert.equal(calls, 0);
  await assert.rejects(() => discoverProviderModels({ id: 'bad' }, { env: {}, fetchImpl }), isCatalogError);
  await assert.rejects(() => discoverAllModels({ providers: { selected: provider(), bad: {} } }, {
    env: { TEST_KEY: 'fixture' }, fetchImpl,
  }), isCatalogError);
  assert.deepEqual(await discoverAllModels({}, { env: {}, fetchImpl }), { models: [], providers: [] });
  assert.equal(calls, 0);
});

test('discovery uses the first ready account and merges protocols only within an exact identity', async () => {
  const calls = [];
  const selected = { id: 'selected', ...provider({ protocols: ['openai-chat', 'claude'], accounts: [
    { id: 'unset', apiKeyEnv: 'env:UNSET' }, { id: 'ready', apiKeyEnv: 'env:ACCOUNT_KEY' },
  ] }) };
  const result = await discoverProviderModels(selected, {
    env: { TEST_KEY: 'must-not-be-used', ACCOUNT_KEY: 'account-fixture' },
    fetchImpl: async (url, init) => {
      calls.push({ url, headers: init.headers });
      return success({ data: [{ id: 'Vendor/Model-X' }, { id: 'Vendor/Model-X' }] });
    },
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.headers), [
    { authorization: 'Bearer account-fixture' },
    { 'x-api-key': 'account-fixture', 'anthropic-version': '2023-06-01' },
  ], 'the first ready account uses protocol-specific authentication without inherited provider credentials');
  assert.deepEqual(result.models, [discovered('Vendor/Model-X', 'selected', ['openai-chat', 'claude'])]
    .map((model) => ({ ...model, id: 'vendor/model-x' })));
  assert.equal(JSON.stringify(result).includes('account-fixture'), false);
  assert.deepEqual(result.errors, []);
});

test('only explicit authMode none permits discovery without authentication', async () => {
  const calls = [];
  const result = await discoverProviderModels({ id: 'local', ...provider({ authMode: 'none' }) }, {
    env: { TEST_KEY: 'unused-fixture' },
    fetchImpl: async (url, init) => { calls.push({ url, headers: init.headers }); return success({ data: [{ id: 'Local-X' }] }); },
  });
  assert.equal(result.models[0].upstreamModel, 'Local-X');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].headers, {});
});

test('cross-provider discovery qualifies collisions without blending channel protocols', async () => {
  const registry = { providers: {
    b: provider({ baseUrl: 'https://b.invalid', protocols: ['claude'] }),
    a: provider({ baseUrl: 'https://a.invalid' }),
    unready: provider({ apiKeyEnv: 'env:UNSET' }),
  } };
  const options = { env: { TEST_KEY: 'fixture' }, fetchImpl: async (url) => success({
    data: [{ id: 'Shared-X' }, { id: url.includes('a.invalid') ? 'Only-A' : 'Only-B' }],
  }) };
  const result = await discoverAllModels(registry, options);
  const byId = Object.fromEntries(result.models.map((model) => [model.id, model]));
  assert.deepEqual(Object.keys(byId).sort(), ['a::shared-x', 'b::shared-x', 'only-a', 'only-b']);
  assert.equal(byId['a::shared-x'].upstreamModel, 'Shared-X');
  assert.deepEqual(byId['a::shared-x'].protocols, ['openai-chat']);
  assert.deepEqual(byId['b::shared-x'].protocols, ['claude']);
  assert.equal(result.providers.find((item) => item.provider === 'unready').errors[0].code, 'MISSING_CREDENTIALS');
  assert.equal(result.providers.find((item) => item.provider === 'a').models.find((model) => model.upstreamModel === 'Shared-X').id, 'a::shared-x');
  const reversed = { providers: Object.fromEntries(Object.entries(registry.providers).reverse()) };
  assert.deepEqual((await discoverAllModels(reversed, options)).models, result.models);
});

test('merging discovery preserves curated/native entries and all routing/unknown metadata', () => {
  const registry = {
    ...document(), activeModel: 'model', clientDefaults: { claude: 'model' },
    clientRoleMatrix: { default: { implementer: 'model' } },
    intentRouting: intentConfig, strategy: { enabled: true, future: 'keep' }, future: { extra: true },
  };
  registry.models.model = { provider: 'codex', protocols: ['claude'], cli: { command: 'codex' },
    label: 'Native', strengths: ['code'], unknown: { keep: true },
  };
  registry.providers.selected.unknown = { keep: true };
  const before = structuredClone(registry);
  const { registry: merged, added, enriched } = mergeDiscoveredModels(registry, [discovered('Model'), discovered('New-X')]);
  assert.equal(added, 2);
  assert.equal(enriched, 0);
  assert.deepEqual(merged.models.model, before.models.model);
  assert.equal(merged.models['selected::model'].upstreamModel, 'Model');
  assert.equal(merged.models['new-x'].upstreamModel, 'New-X');
  assert.equal(merged.models['new-x'].source, 'discovered');
  const { models: ignoredModels, ...rest } = merged;
  const { models: ignoredOriginalModels, ...originalRest } = before;
  assert.deepEqual(rest, originalRest);
  assert.deepEqual(registry, before);
  assert.deepEqual(getProviderForModel('selected::model', merged).upstreamModel, 'Model');
});

test('qualification is deterministic, collision-safe and repeat refreshes are idempotent', () => {
  const registry = { models: {
    shared: { label: 'Native', protocols: ['claude'] },
    'a::shared': { label: 'Reserved', future: true },
    'a::shared::2': { label: 'Also reserved' },
  } };
  const catalog = [discovered('Shared', 'b'), discovered('Shared', 'a'), discovered('shared', 'a')];
  const result = mergeDiscoveredModels(registry, catalog);
  assert.equal(result.added, 3);
  assert.deepEqual(result.registry, mergeDiscoveredModels(registry, [...catalog].reverse()).registry);
  assert.deepEqual(result.registry.models.shared, registry.models.shared);
  assert.deepEqual(result.registry.models['a::shared'], registry.models['a::shared']);
  const newEntries = Object.entries(result.registry.models).filter(([, model]) => model.source === 'discovered');
  assert.equal(new Set(newEntries.map(([id]) => id)).size, 3);
  assert.equal(newEntries.find(([id]) => id === 'a::shared::3')[1].upstreamModel, 'Shared');
  assert.equal(newEntries.find(([id]) => id === 'a::shared::4')[1].upstreamModel, 'shared');
  const again = mergeDiscoveredModels(result.registry, catalog);
  assert.equal(again.added, 0);
  assert.equal(again.enriched, 0);
  assert.deepEqual(again.registry, result.registry);
});

test('existing explicit aliases retain metadata and enabled state when enriched', () => {
  const registry = document();
  registry.models.model = boundModel({ upstreamModel: 'Real-X', enabled: false, future: { preserve: true } });
  const result = mergeDiscoveredModels(registry, [discovered('Real-X', 'selected', ['claude']), discovered('Real-X', 'other')]);
  assert.equal(result.added, 1);
  assert.equal(result.enriched, 1);
  assert.equal(result.registry.models.model.enabled, false);
  assert.equal(result.registry.models.model.source, 'custom');
  assert.deepEqual(result.registry.models.model.future, { preserve: true });
  assert.deepEqual(result.registry.models.model.protocols, ['openai-chat', 'claude']);
  assert.equal(result.registry.models['other::real-x'].provider, 'other');
});

test('upstream ids matching object prototype names are ordinary safe registry keys', () => {
  const result = mergeDiscoveredModels({}, [discovered('__proto__'), discovered('constructor')]);
  assert.equal(result.added, 2);
  assert.equal(Object.getPrototypeOf(result.registry.models), Object.prototype);
  assert.equal(Object.hasOwn(result.registry.models, '__proto__'), true);
  assert.equal(Object.hasOwn(result.registry.models, 'constructor'), true);
  assert.equal(result.registry.models.__proto__.upstreamModel, '__proto__');
});

test('classifier rejects invalid/unready explicit configuration before making HTTP requests', async () => {
  const mutations = [
    (r) => { delete r.intentRouting; },
    (r) => { delete r.models.model; },
    (r) => { r.models.model.enabled = false; },
    (r) => { r.models.model.provider = 'missing'; },
    (r) => { r.providers.selected.enabled = false; },
    (r) => { r.providers.selected.baseUrl = ''; },
    (r) => { delete r.models.model.protocols; },
    (r) => { r.providers.selected.protocols = ['claude']; },
    (r) => { r.models.model.protocols = ['gemini']; r.providers.selected.protocols = ['gemini']; },
    (r) => { r.models.model.source = 'curated'; },
    (r) => { delete r.models.model.provider; r.providers.selected.models = ['model'];
      r.providers.other = provider({ models: ['model'] }); },
  ];
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return success({}); };
  for (const mutate of mutations) {
    const registry = { ...document(), intentRouting: structuredClone(intentConfig) };
    mutate(registry);
    assert.equal(await classifyTurnIntent({ registry, env: { TEST_KEY: 'fixture' }, userText: 'Hi', fetchImpl }), null);
  }
  assert.equal(await classifyTurnIntent({ registry: { ...document(), intentRouting: intentConfig }, env: {}, fetchImpl }), null);
  assert.equal(calls, 0);
});

test('classifier uses exact upstream ids and ready accounts for both supported protocols', async () => {
  for (const protocol of ['openai-chat', 'claude']) {
    const registry = { ...document(), intentRouting: intentConfig };
    registry.models.model = boundModel({ protocols: [protocol], upstreamModel: 'Vendor/Classifier-X' });
    registry.providers.selected.protocols = [protocol];
    registry.providers.selected.accounts = [{ id: 'unset', apiKeyEnv: 'env:UNSET' }, { id: 'ready', apiKeyEnv: 'env:READY' }];
    const calls = [];
    const result = await classifyTurnIntent({ registry, env: { READY: 'ready-fixture' }, userText: 'Hi',
      fetchImpl: async (url, init) => {
        calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
        return success(protocol === 'claude'
          ? { content: [{ text: '{"intent":"quick"}' }] }
          : { choices: [{ message: { content: '{"intent":"quick"}' } }] });
      },
    });
    assert.equal(result.intentId, 'quick');
    assert.equal(result.modelId, 'target');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.model, 'Vendor/Classifier-X');
    assert.equal(protocol === 'claude' ? calls[0].headers['x-api-key'] : calls[0].headers.authorization,
      protocol === 'claude' ? 'ready-fixture' : 'Bearer ready-fixture');
  }
});

test('classifier permits explicit auth none and safely returns null on upstream/parse errors', async () => {
  const registry = { ...document(), intentRouting: intentConfig };
  registry.providers.selected.authMode = 'none';
  let calls = 0;
  const result = await classifyTurnIntent({ registry, env: {}, fetchImpl: async (url, init) => {
    calls += 1;
    assert.deepEqual(init.headers, { 'content-type': 'application/json' });
    return success({ choices: [{ message: { content: '{"intent":"quick"}' } }] });
  } });
  assert.equal(calls, 1);
  assert.equal(result.intentId, 'quick');
  for (const fetchImpl of [
    async () => ({ ok: false, status: 503 }),
    async () => { throw new Error('mock offline'); },
    async () => ({ ok: true, json: async () => { throw new Error('invalid mock JSON'); } }),
    async () => success({ choices: [{ message: { content: '{"intent":"unknown"}' } }] }),
  ]) assert.equal(await classifyTurnIntent({ registry, env: {}, fetchImpl }), null);
});
