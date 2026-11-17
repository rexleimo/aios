import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ProviderConfigError,
  defaultRelayProvider,
  getProviderForModel,
  loadProviders,
  readyProviderAccounts,
  resolveProviderApiKey,
  resolveProviderEndpoint,
  validateProvider,
} from '../../../../lib/tooling/model-router/providers/registry.mjs';
import { MODEL_PROTOCOLS, RELAY_BASE_URL } from '../../../../lib/tooling/model-router/providers/protocols.mjs';

const registry = {
  models: {
    'claude-opus-5': { protocols: ['claude'], cost: 'highest' },
    'qwen3.8-flash': { protocols: ['openai-chat'], cost: 'lowest' },
    'gpt-6.1-sol': { protocols: ['openai-response'], cost: 'highest' },
  },
};

test('default relay provider speaks all four protocols with an env key ref', () => {
  const relay = defaultRelayProvider();
  assert.equal(relay.id, 'relay');
  assert.equal(relay.baseUrl, RELAY_BASE_URL);
  assert.equal(relay.apiKeyEnv, 'env:REXAI_API_KEY');
  assert.deepEqual(relay.protocols, [...MODEL_PROTOCOLS]);
});

test('validateProvider accepts a well-formed provider and normalizes it', () => {
  const result = validateProvider({
    id: 'Custom',
    baseUrl: 'https://api.example.com/',
    apiKeyEnv: 'env:MY_KEY',
    protocols: ['anthropic-messages', 'openai_completions'],
    models: ['Claude-Opus-5'],
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider.id, 'custom');
  assert.equal(result.provider.baseUrl, 'https://api.example.com');
  assert.deepEqual(result.provider.protocols, ['claude', 'openai-chat']);
  assert.deepEqual(result.provider.models, ['claude-opus-5']);
});

test('validateProvider accepts inline keys and rejects bad env refs, control chars, and bad baseUrl (fail-closed)', () => {
  assert.equal(validateProvider({ id: 'p', baseUrl: 'https://x.com', apiKeyEnv: 'MY_KEY' }).ok, false);
  assert.equal(validateProvider({ id: 'p', baseUrl: 'https://x.com', apiKey: 'bad\nkey' }).ok, false);
  assert.equal(validateProvider({ id: 'p', baseUrl: 'https://x.com', apiKey: 42 }).ok, false);
  assert.equal(validateProvider({ id: 'p', baseUrl: 'ftp://x.com' }).ok, false);
  assert.equal(validateProvider({ id: '', baseUrl: 'https://x.com' }).ok, false);
  const inline = validateProvider({ id: 'p', baseUrl: 'https://x.com', apiKey: 'sk-secret' });
  assert.equal(inline.ok, true);
  assert.equal(inline.provider.apiKey, 'sk-secret');
  const bad = validateProvider({ id: 'p', baseUrl: 'https://x.com', apiKey: 'bad\nkey' });
  assert.ok(bad.errors.some((e) => /credential/i.test(e)));
});

test('loadProviders uses only configured providers and throws on invalid config', () => {
  const providers = loadProviders({
    providers: { custom: { baseUrl: 'https://api.example.com', apiKeyEnv: 'env:MY_KEY', protocols: ['claude'] } },
  });
  assert.ok(providers.custom);
  assert.equal(providers.relay, undefined, 'an unconfigured relay is never injected');
  assert.deepEqual(loadProviders({}), {});
  assert.throws(
    () => loadProviders({ providers: { bad: { baseUrl: 'https://x.com', apiKeyEnv: 'PLAINTEXT' } } }),
    ProviderConfigError,
  );
});

test('resolveProviderEndpoint uses the per-provider base, not a hardcoded relay', () => {
  const provider = { baseUrl: 'https://api.example.com' };
  assert.equal(resolveProviderEndpoint(provider, 'claude'), 'https://api.example.com/claude/v1/messages');
  assert.equal(resolveProviderEndpoint(provider, 'openai-chat'), 'https://api.example.com/openai/v1/chat/completions');
  assert.equal(resolveProviderEndpoint(defaultRelayProvider(), 'claude'), `${RELAY_BASE_URL}/claude/v1/messages`);
});

test('resolveProviderApiKey resolves inline keys and env:VAR without exposing them elsewhere', () => {
  const provider = { apiKeyEnv: 'env:MY_KEY' };
  assert.equal(resolveProviderApiKey(provider, { MY_KEY: 'secret-value' }), 'secret-value');
  assert.equal(resolveProviderApiKey(provider, {}), '');
  assert.equal(resolveProviderApiKey({ apiKeyEnv: 'plaintext' }, { MY_KEY: 'x' }), '');
  assert.equal(resolveProviderApiKey({ apiKey: ' inline-secret ' }, {}), 'inline-secret');
  assert.equal(resolveProviderApiKey({ apiKey: 'inline-secret' }, { UNUSED: 'x' }), 'inline-secret');
});

test('inline keys follow account/provider precedence and count toward readiness', () => {
  const provider = loadProviders({ providers: { selected: {
    baseUrl: 'https://selected.invalid', apiKey: 'provider-inline', apiKeyEnv: 'env:PROVIDER_KEY', protocols: ['claude'],
    accounts: [
      { id: 'inline', apiKey: 'account-inline' },
      { id: 'inherited' },
      { id: 'env', apiKeyEnv: 'env:ACCOUNT_KEY' },
    ],
  } } }).selected;
  const env = { PROVIDER_KEY: 'provider-env', ACCOUNT_KEY: 'account-env' };
  assert.equal(resolveProviderApiKey(provider, env), 'account-inline');
  assert.equal(resolveProviderApiKey(provider, env, 'inherited'), 'provider-inline');
  assert.equal(resolveProviderApiKey(provider, env, 'env'), 'account-env');
  assert.equal(resolveProviderApiKey(provider, {}, 'env'), '', 'an unset account env ref never falls back to a provider inline key');
  assert.deepEqual(readyProviderAccounts(provider, env), ['inline', 'inherited', 'env']);
  assert.equal(resolveProviderApiKey({ ...provider, authMode: 'none' }, env), '');
});

test('getProviderForModel requires an explicit provider binding and returns the upstream model', () => {
  const withExplicit = {
    ...registry,
    models: {
      ...registry.models,
      'claude-opus-5': { ...registry.models['claude-opus-5'], upstreamModel: 'upstream-claude' },
    },
    providers: {
      custom: { baseUrl: 'https://api.example.com', authMode: 'none', protocols: ['claude'], models: ['claude-opus-5'] },
      relay: { baseUrl: 'https://relay.example.com', apiKeyEnv: 'env:RELAY_KEY', protocols: ['openai-chat'], models: ['qwen3.8-flash'] },
    },
  };
  const claude = getProviderForModel('claude-opus-5', withExplicit);
  assert.equal(claude.provider.id, 'custom');
  assert.equal(claude.upstreamModel, 'upstream-claude');
  assert.equal(claude.protocol, 'claude');
  const openai = getProviderForModel('qwen3.8-flash', withExplicit);
  assert.equal(openai.provider.id, 'relay', 'a provider.models entry is an explicit binding');
  assert.equal(openai.protocol, 'openai-chat');
  assert.equal(openai.upstreamModel, 'qwen3.8-flash');
  const protocolOnly = { ...withExplicit, providers: { relay: { ...withExplicit.providers.relay, models: [] } } };
  assert.throws(() => getProviderForModel('qwen3.8-flash', protocolOnly), /no explicit gateway provider/u, 'protocol intersection alone does not bind a model');
  assert.throws(() => getProviderForModel('qwen3.8-flash', { ...registry, providers: {} }), /no explicit gateway provider/u);
  assert.throws(() => getProviderForModel('unknown-model', withExplicit), /not configured/u);
});

test('custom and discovered model provider bindings override other provider model lists', () => {
  for (const source of ['custom', 'discovered']) {
    const document = {
      models: { model: { source, provider: ' Selected ', protocols: ['openai_completions', 'claude'] } },
      providers: {
        other: { baseUrl: 'https://other.invalid', protocols: ['claude'], models: ['model'] },
        Selected: { id: 'ignored-metadata', baseUrl: 'https://selected.invalid', authMode: 'none', protocols: ['anthropic-messages'] },
      },
    };
    const route = getProviderForModel(' MODEL ', document);
    assert.equal(route.provider.id, 'selected');
    assert.equal(route.protocol, 'claude');
    assert.equal(resolveProviderEndpoint(route.provider, route.protocol), 'https://selected.invalid/claude/v1/messages');
    document.models.model.provider = 'relay';
    document.providers.relay = { baseUrl: 'https://relay.invalid', authMode: 'none', protocols: ['claude'] };
    assert.equal(getProviderForModel('model', document).provider.id, 'relay', 'an explicit configured relay binding wins');
  }
});

test('explicit bindings fail closed on missing providers or incompatible/undeclared provider protocols', () => {
  for (const source of ['custom', 'discovered']) {
    const document = {
      models: { model: { source, provider: 'missing', protocols: ['claude'] } },
      providers: { selected: { baseUrl: 'https://selected.invalid', protocols: ['openai-chat'] } },
    };
    assert.throws(() => getProviderForModel('model', document), { name: 'ProviderConfigError', message: /unknown provider/u });
    document.models.model.provider = 'selected';
    for (const protocols of [['openai-chat'], [], undefined]) {
      document.providers.selected.protocols = protocols;
      assert.throws(() => getProviderForModel('model', document), { name: 'ProviderConfigError', message: /compatible protocol/u });
    }
    document.models.model.provider = {};
    assert.throws(() => getProviderForModel('model', document), ProviderConfigError);
  }
  assert.throws(() => getProviderForModel('model', {
    models: { model: { protocols: ['claude'] } },
    providers: { selected: { baseUrl: 'https://selected.invalid', protocols: ['openai-chat'], models: ['model'] } },
  }), /compatible protocol/u, 'legacy explicit model lists cannot silently choose an incompatible protocol either');
});

test('curated launcher metadata is not interpreted as a gateway upstream binding', () => {
  for (const source of [undefined, 'curated']) {
    assert.throws(() => getProviderForModel('model', {
      models: { model: { source, provider: 'codex', protocols: ['openai-response'] } },
      providers: { codex: { baseUrl: 'https://codex.invalid', authMode: 'none', protocols: ['openai-response'] } },
    }), /no explicit gateway provider/u);
  }
});

test('provider account credentials have explicit precedence, inheritance and stable retry order', () => {
  const provider = loadProviders({ providers: { selected: {
    baseUrl: 'https://selected.invalid', apiKeyEnv: ' env:PROVIDER_KEY ', protocols: ['claude'],
    accounts: [{ id: ' First ', apiKeyEnv: ' env:ACCOUNT_KEY ' }, { id: 'backup', apiKeyEnv: '' }],
  } } }).selected;
  const env = { PROVIDER_KEY: 'provider-fixture', ACCOUNT_KEY: 'account-fixture' };
  assert.deepEqual(provider.accounts.map((account) => account.id), ['first', 'backup']);
  assert.equal(resolveProviderApiKey(provider, env), 'account-fixture');
  assert.equal(resolveProviderApiKey(provider, env, 'backup'), 'provider-fixture');
  assert.equal(resolveProviderApiKey(provider, { PROVIDER_KEY: 'provider-fixture' }), '', 'an unset account variable never falls back to the provider key');
});

test('provider validation rejects ambiguous accounts, protocol shapes and normalized provider collisions', () => {
  const base = { id: 'p', baseUrl: 'https://selected.invalid' };
  for (const patch of [
    { protocols: 'claude' }, { protocols: ['claude', 'bogus'] }, { models: 'model' }, { accounts: {} },
    { accounts: [null] }, { accounts: [{ id: 'a', apiKey: 'bad\nkey' }] },
    { accounts: [{ id: 'a' }, { id: ' A ' }] },
  ]) assert.equal(validateProvider({ ...base, ...patch }).ok, false);
  assert.throws(() => loadProviders({ providers: {
    P: { baseUrl: base.baseUrl }, p: { baseUrl: base.baseUrl },
  } }), /duplicate provider/u);
});
