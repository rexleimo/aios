import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

import { importProvidersFromClients } from '../../../../lib/tooling/model-router/providers/import.mjs';
import { runModelRouterCommand } from '../../../../lib/tooling/model-router/entry/command.mjs';
import { loadRegistry, registryFilePath } from '../../../../lib/tooling/model-router/entry/registry.mjs';
import { discoverAllModels } from '../../../../lib/tooling/model-router/routing/discovery.mjs';
import {
  getProviderForModel,
  loadProviders,
  readyProviderAccounts,
  resolveProviderEndpoint,
  resolveProviderModelsEndpoint,
} from '../../../../lib/tooling/model-router/routing/providers.mjs';

function fixture(t, { claude, codex, registry = { providers: {}, models: {} } } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-import-providers-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  const clients = [];
  for (const [relative, content] of [
    ['.claude/settings.json', claude === undefined ? undefined : JSON.stringify(claude)],
    ['.codex/config.toml', codex],
  ]) {
    if (content === undefined) continue;
    const file = path.join(home, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    clients.push({ file, content });
  }
  const file = registryFilePath({ rootDir: root });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(registry));
  const logs = [];
  const errors = [];
  const io = { log: (message) => logs.push(message), error: (message) => errors.push(message) };
  const network = t.mock.method(globalThis, 'fetch', () => { throw new Error('real network forbidden'); });
  return { root, home, file, clients, logs, errors, io, network };
}

async function importRegistry(f) {
  assert.deepEqual(await runModelRouterCommand({ subcommand: 'import-providers', home: f.home }, {
    registryRoot: f.root, io: f.io,
  }), { exitCode: 0 });
  assert.deepEqual(f.errors, []);
  for (const { file, content } of f.clients) assert.equal(fs.readFileSync(file, 'utf8'), content);
  assert.equal(f.network.mock.callCount(), 0);
  return loadRegistry({ rootDir: f.root });
}

test('Claude imports mark native roots and versioned bases as standard without copying secrets', (t) => {
  for (const baseUrl of ['https://api.anthropic.com', 'https://api.anthropic.com/v1']) {
    const f = fixture(t, { claude: { env: { ANTHROPIC_BASE_URL: baseUrl, ANTHROPIC_AUTH_TOKEN: 'fixture-secret' } } });
    const candidates = importProvidersFromClients({ home: f.home });
    assert.deepEqual(candidates, [{
      id: 'claude-imported', baseUrl, apiKeyEnv: 'env:ANTHROPIC_AUTH_TOKEN', endpointStyle: 'standard', protocols: ['claude'],
    }]);
    assert.equal(resolveProviderEndpoint(candidates[0], 'claude'), 'https://api.anthropic.com/v1/messages');
    assert.equal(resolveProviderModelsEndpoint(candidates[0], 'claude'), 'https://api.anthropic.com/v1/models');
    assert.equal(JSON.stringify(candidates).includes('fixture-secret'), false);
  }
});

test('Codex imports mark each native API base as standard and preserve ids and protocols', (t) => {
  const f = fixture(t, { codex: `model_provider = "native"
[model_providers.native]
base_url = "https://api.openai.com/v1"
[model_providers.root]
base_url = "https://openai.invalid"
[model_providers.prefixed]
base_url = "https://relay.invalid/openai/v1"
` });
  const candidates = importProvidersFromClients({ home: f.home });
  assert.deepEqual(candidates, [
    { id: 'codex-native', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: '', endpointStyle: 'standard', protocols: ['openai-chat', 'openai-response'] },
    { id: 'codex-root', baseUrl: 'https://openai.invalid', apiKeyEnv: '', endpointStyle: 'standard', protocols: ['openai-chat', 'openai-response'] },
    { id: 'codex-prefixed', baseUrl: 'https://relay.invalid/openai/v1', apiKeyEnv: '', endpointStyle: 'standard', protocols: ['openai-chat', 'openai-response'] },
  ]);
  for (const provider of candidates) {
    const root = provider.baseUrl.endsWith('/v1') ? provider.baseUrl : `${provider.baseUrl}/v1`;
    assert.equal(resolveProviderEndpoint(provider, 'openai-chat'), `${root}/chat/completions`);
    assert.equal(resolveProviderEndpoint(provider, 'openai-response'), `${root}/responses`);
    assert.equal(resolveProviderModelsEndpoint(provider, 'openai-response'), `${root}/models`);
  }
});

test('import persists standard endpoint style and resolves native model routes from the saved registry', async (t) => {
  const registry = {
    providers: {},
    models: {
      claude: { source: 'custom', provider: 'claude-imported', upstreamModel: 'Claude/Native', protocols: ['claude'] },
      chat: { source: 'custom', provider: 'codex-native', protocols: ['openai-chat'] },
      response: { source: 'custom', provider: 'codex-native', protocols: ['openai-response'] },
    },
    clientDefaults: { codex: 'response' },
    extension: { preserve: true },
  };
  const f = fixture(t, {
    claude: { env: { ANTHROPIC_BASE_URL: 'https://api.anthropic.com', ANTHROPIC_AUTH_TOKEN: 'fixture-secret' } },
    codex: '[model_providers.native]\nbase_url = "https://api.openai.com/v1"\n',
    registry,
  });
  const saved = await importRegistry(f);
  assert.deepEqual(saved, {
    ...registry,
    providers: {
      'claude-imported': { baseUrl: 'https://api.anthropic.com', apiKeyEnv: 'env:ANTHROPIC_AUTH_TOKEN', endpointStyle: 'standard', protocols: ['claude'], models: [] },
      'codex-native': { baseUrl: 'https://api.openai.com/v1', apiKeyEnv: '', endpointStyle: 'standard', protocols: ['openai-chat', 'openai-response'], models: [] },
    },
  });
  for (const [modelId, expected] of [
    ['claude', 'https://api.anthropic.com/v1/messages'],
    ['chat', 'https://api.openai.com/v1/chat/completions'],
    ['response', 'https://api.openai.com/v1/responses'],
  ]) {
    const { provider, protocol } = getProviderForModel(modelId, saved);
    assert.equal(provider.endpointStyle, 'standard');
    assert.equal(provider.authMode, 'required');
    assert.equal(resolveProviderEndpoint(provider, protocol), expected);
    assert.equal(resolveProviderModelsEndpoint(provider, protocol), `${provider.baseUrl.replace(/\/v1$/u, '')}/v1/models`);
  }
  const calls = [];
  const discovery = await discoverAllModels(saved, {
    env: { ANTHROPIC_AUTH_TOKEN: 'fixture-secret' },
    fetchImpl: async (url, init) => {
      calls.push({ url, headers: init.headers });
      return { ok: true, json: async () => ({ data: [{ id: 'Claude/Native' }] }) };
    },
  });
  assert.deepEqual(calls.map((call) => call.url), ['https://api.anthropic.com/v1/models']);
  assert.equal(calls[0].headers['x-api-key'], 'fixture-secret');
  assert.equal(discovery.models[0].upstreamModel, 'Claude/Native');
  assert.equal(discovery.providers.find((provider) => provider.provider === 'codex-native').errors[0].code, 'MISSING_CREDENTIALS');
  assert.equal(JSON.stringify({ saved, logs: f.logs, discovery }).includes('fixture-secret'), false);
  assert.equal(f.network.mock.callCount(), 0);
});

test('missing imported credentials remain required and never authorize anonymous discovery', async (t) => {
  const f = fixture(t, {
    claude: { env: { ANTHROPIC_BASE_URL: 'https://anthropic.invalid/v1' } },
    codex: '[model_providers.local]\nbase_url = "http://127.0.0.1:11434/v1"\n',
  });
  const saved = await importRegistry(f);
  const providers = loadProviders(saved);
  for (const provider of Object.values(providers)) {
    assert.equal(provider.apiKeyEnv, '');
    assert.equal(provider.authMode, 'required');
    assert.deepEqual(readyProviderAccounts(provider, {}), []);
  }
  const result = await discoverAllModels(saved, { env: {} });
  assert.deepEqual(result.models, []);
  assert.deepEqual(result.providers.map((provider) => provider.errors[0].code), ['MISSING_CREDENTIALS', 'MISSING_CREDENTIALS']);
  assert.equal(f.network.mock.callCount(), 0);
});

test('import preserves existing explicit and legacy provider configuration and unknown metadata', async (t) => {
  const registry = {
    providers: {
      'claude-imported': { baseUrl: 'https://legacy.invalid', protocols: ['claude'], models: ['legacy'], extension: { keep: true } },
      'codex-native': {
        baseUrl: 'http://127.0.0.1:11434/v1', endpointStyle: 'standard', authMode: 'none', enabled: true,
        apiKeyEnv: '', protocols: ['openai-chat'], models: [], accounts: [{ id: 'local', note: 'keep' }],
      },
    },
    models: { legacy: { provider: 'claude', protocols: ['claude'], label: 'Keep native metadata' } },
    activeModel: 'legacy',
    clientDefaults: { claude: 'legacy' },
    routingRules: [{ taskType: 'general', primary: 'legacy' }],
    extension: { keep: ['all', 'metadata'] },
  };
  const f = fixture(t, {
    claude: { env: { ANTHROPIC_BASE_URL: 'https://replacement.invalid' } },
    codex: '[model_providers.native]\nbase_url = "https://replacement.invalid/v1"\n[model_providers.new]\nbase_url = "https://new.invalid/v1"\n',
    registry,
  });
  const saved = await importRegistry(f);
  const { 'codex-new': added, ...existing } = saved.providers;
  assert.deepEqual({ ...saved, providers: existing }, registry);
  assert.equal(added.endpointStyle, 'standard');
  const providers = loadProviders(saved);
  assert.equal(providers['claude-imported'].endpointStyle, 'relay');
  assert.equal(providers['claude-imported'].authMode, 'required');
  assert.equal(resolveProviderEndpoint(providers['claude-imported'], 'claude'), 'https://legacy.invalid/claude/v1/messages');
  assert.equal(providers['codex-native'].authMode, 'none');
  assert.deepEqual(readyProviderAccounts(providers['codex-native'], {}), ['default']);
  assert.deepEqual(await importRegistry(f), saved, 'repeat imports do not rewrite existing provider definitions');
});

test('import without client providers leaves the registry untouched', async (t) => {
  const f = fixture(t);
  const before = fs.readFileSync(f.file, 'utf8');
  assert.deepEqual(importProvidersFromClients({ home: f.home }), []);
  await importRegistry(f);
  assert.equal(fs.readFileSync(f.file, 'utf8'), before);
});
