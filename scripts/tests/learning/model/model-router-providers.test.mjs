import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ProviderConfigError,
  defaultRelayProvider,
  getProviderForModel,
  loadProviders,
  resolveProviderApiKey,
  resolveProviderEndpoint,
  validateProvider,
} from '../../../lib/tooling/model-router/routing/providers.mjs';
import { MODEL_PROTOCOLS, RELAY_BASE_URL } from '../../../lib/tooling/model-router/routing/protocols.mjs';

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

test('validateProvider rejects plaintext keys, bad env refs, and bad baseUrl (fail-closed)', () => {
  assert.equal(validateProvider({ id: 'p', baseUrl: 'https://x.com', apiKey: 'sk-secret' }).ok, false);
  assert.equal(validateProvider({ id: 'p', baseUrl: 'https://x.com', apiKeyEnv: 'MY_KEY' }).ok, false);
  assert.equal(validateProvider({ id: 'p', baseUrl: 'ftp://x.com' }).ok, false);
  assert.equal(validateProvider({ id: '', baseUrl: 'https://x.com' }).ok, false);
  const plaintext = validateProvider({ id: 'p', baseUrl: 'https://x.com', apiKey: 'sk-secret' });
  assert.ok(plaintext.errors.some((e) => /plaintext/i.test(e)));
});

test('loadProviders merges relay with configured providers and throws on invalid config', () => {
  const providers = loadProviders({
    providers: { custom: { baseUrl: 'https://api.example.com', apiKeyEnv: 'env:MY_KEY', protocols: ['claude'] } },
  });
  assert.ok(providers.relay);
  assert.ok(providers.custom);
  assert.throws(
    () => loadProviders({ providers: { bad: { baseUrl: 'https://x.com', apiKey: 'sk-secret' } } }),
    ProviderConfigError,
  );
});

test('resolveProviderEndpoint uses the per-provider base, not a hardcoded relay', () => {
  const provider = { baseUrl: 'https://api.example.com' };
  assert.equal(resolveProviderEndpoint(provider, 'claude'), 'https://api.example.com/claude/v1/messages');
  assert.equal(resolveProviderEndpoint(provider, 'openai-chat'), 'https://api.example.com/openai/v1/chat/completions');
  assert.equal(resolveProviderEndpoint(defaultRelayProvider(), 'claude'), `${RELAY_BASE_URL}/claude/v1/messages`);
});

test('resolveProviderApiKey resolves env:VAR without exposing it elsewhere', () => {
  const provider = { apiKeyEnv: 'env:MY_KEY' };
  assert.equal(resolveProviderApiKey(provider, { MY_KEY: 'secret-value' }), 'secret-value');
  assert.equal(resolveProviderApiKey(provider, {}), '');
  assert.equal(resolveProviderApiKey({ apiKeyEnv: 'plaintext' }, { MY_KEY: 'x' }), '');
});

test('getProviderForModel prefers explicit models, then protocol intersection, then relay', () => {
  const withExplicit = {
    ...registry,
    providers: { custom: { baseUrl: 'https://api.example.com', protocols: ['claude'], models: ['claude-opus-5'] } },
  };
  assert.equal(getProviderForModel('claude-opus-5', withExplicit).provider.id, 'custom');
  // qwen is openai-chat; relay speaks it, custom (claude-only) does not
  assert.equal(getProviderForModel('qwen3.8-flash', withExplicit).provider.id, 'relay');
  assert.equal(getProviderForModel('qwen3.8-flash', withExplicit).protocol, 'openai-chat');
  // unknown model falls back to relay
  assert.equal(getProviderForModel('unknown-model', registry).provider.id, 'relay');
});