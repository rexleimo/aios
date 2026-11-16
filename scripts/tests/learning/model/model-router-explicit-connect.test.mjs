import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readRegistrySnapshot } from '../../../../apps/shell/ui/src/lib/config/model-registry-store.mjs';
import { runConnect, runConnectInplace, runDisconnect } from '../../../lib/tooling/model-router/connect/command.mjs';
import { runModelRouterCommand } from '../../../lib/tooling/model-router/entry/command.mjs';
import { buildClientModelArgs } from '../../../lib/tooling/model-router/entry/client-cli.mjs';
import { defaultModelRegistry, loadRegistry, loadRegistrySnapshot, withRegistryWriteLock } from '../../../lib/tooling/model-router/entry/registry.mjs';
import { resolveGatewayRoute } from '../../../lib/tooling/model-router/gateway/router.mjs';
import { createRoutingGatewayApp } from '../../../lib/tooling/model-router/gateway/proxy.mjs';
import { listGatewayModels } from '../../../lib/tooling/model-router/routing/providers.mjs';

const SEED_REL = 'scripts/lib/tooling/specs/registry/model-registry.json';
const seedText = fs.readFileSync(new URL('../../../lib/tooling/specs/registry/model-registry.json', import.meta.url), 'utf8');
const GW = 'http://127.0.0.1:8686';

function registeredModels() {
  return {
    ...JSON.parse(seedText),
    activeModel: 'actual-claude',
    providers: {
      messages: { baseUrl: 'http://127.0.0.1:9', authMode: 'none', protocols: ['claude'], models: ['actual-claude'] },
      responses: { baseUrl: 'http://127.0.0.1:9', authMode: 'none', protocols: ['openai-response'], models: ['actual-response'] },
    },
    models: {
      'actual-claude': { source: 'custom', provider: 'messages', protocols: ['claude'] },
      'actual-response': { source: 'custom', provider: 'responses', protocols: ['openai-response'] },
    },
    extensionMetadata: { preserve: true },
  };
}

function fixture(t, document) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-explicit-connect-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  t.mock.method(globalThis, 'fetch', () => { throw new Error('network forbidden in explicit-connect tests'); });
  const home = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const registryFile = path.join(root, 'memory/specs/model-registry.json');
  const seedFile = path.join(root, SEED_REL);
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(path.dirname(seedFile), { recursive: true });
  fs.writeFileSync(seedFile, seedText);
  if (document) {
    fs.mkdirSync(path.dirname(registryFile), { recursive: true });
    fs.writeFileSync(registryFile, `${JSON.stringify(document, null, 2)}\n`);
  }
  const logs = [], errors = [];
  const io = { log: (text) => logs.push(text), error: (text) => errors.push(text) };
  return { root, home, stateDir, registryFile, seedFile, logs, errors, io };
}

function options(f, extra = {}) {
  return { home: f.home, stateDir: f.stateDir, registryFile: f.registryFile, gatewayUrl: GW, io: f.io, env: {}, ...extra };
}

test('gateway seed is empty, byte-identical to the UI snapshot, and separate from native CLI templates', async (t) => {
  const f = fixture(t);
  const snapshot = await loadRegistrySnapshot({ rootDir: f.root });
  const uiSnapshot = await readRegistrySnapshot(f.registryFile, f.seedFile);
  assert.equal(snapshot.seeded, true);
  assert.equal(snapshot.text, seedText);
  assert.equal(snapshot.hash, createHash('sha256').update(seedText).digest('hex'));
  assert.equal(snapshot.hash, uiSnapshot.hash);
  const registry = await loadRegistry({ rootDir: f.root });
  assert.deepEqual(registry.models, {});
  assert.deepEqual(registry.providers, {});
  assert.deepEqual(registry.routingRules, []);
  assert.deepEqual(registry.roleDefaults, {});
  assert.deepEqual(registry.clientDefaults, {});
  assert.deepEqual(registry.clientRoleMatrix, { default: {}, clients: {} });
  assert.equal(registry.activeModel, '');
  assert.equal(registry.intentRouting.enabled, false);
  assert.equal(fs.existsSync(f.registryFile), false, 'reading a seed must not persist it');
  assert.equal(fs.existsSync(path.join(f.root, 'scripts/lib/tooling/specs/registry/native-model-templates.json')), false);
  const native = defaultModelRegistry();
  assert.ok(native.models['gpt-6-astra'].cli, 'direct native selection keeps reference metadata');
  assert.deepEqual(listGatewayModels(native, { env: {}, requireCredentials: false }), [], 'native templates are not gateway bindings');
  const nativeAlias = native.models['claude-sonnet'].cli.modelValue;
  assert.notEqual(nativeAlias, 'claude-sonnet');
  assert.deepEqual(buildClientModelArgs('claude', { modelId: 'claude-sonnet', explicit: true }), ['--model', nativeAlias]);
  native.models = {};
  assert.ok(Object.keys(defaultModelRegistry().models).length > 0, 'native reference is cloned');
});

test('saved user registry is authoritative: no reset, seed merge, or cache across reads', async (t) => {
  const original = { models: {}, extensionMetadata: { revision: 1 } };
  const f = fixture(t, original);
  const before = fs.readFileSync(f.registryFile, 'utf8');
  assert.deepEqual(await loadRegistry({ rootDir: f.root }), original);
  assert.equal(fs.readFileSync(f.registryFile, 'utf8'), before);
  fs.writeFileSync(f.registryFile, '{ "models": {}, "extensionMetadata": { "revision": 2 } }\n');
  assert.deepEqual(await loadRegistry({ rootDir: f.root }), { models: {}, extensionMetadata: { revision: 2 } });
  fs.writeFileSync(f.registryFile, '{broken');
  await assert.rejects(loadRegistry({ rootDir: f.root }), SyntaxError);
});

test('gateway CLI models lists no native templates on a fresh root', async (t) => {
  const f = fixture(t);
  assert.equal((await runModelRouterCommand({ subcommand: 'models', json: true }, { registryRoot: f.root, io: f.io })).exitCode, 0);
  assert.deepEqual(JSON.parse(f.logs.at(-1)), { models: [] });
  assert.equal(fs.existsSync(f.registryFile), false);
});

test('gateway CLI models lists explicit ready models rather than native-only metadata', async (t) => {
  const registry = registeredModels();
  registry.models['actual-response'].upstreamModel = 'Vendor/Real-Response';
  registry.models['native-reference-only'] = { provider: 'codex', protocols: ['openai-response'], cli: { command: 'codex' } };
  const f = fixture(t, registry);
  assert.equal((await runModelRouterCommand({ subcommand: 'models', json: true }, { registryRoot: f.root, io: f.io })).exitCode, 0);
  const catalog = JSON.parse(f.logs.at(-1)).models;
  assert.deepEqual(catalog.map((model) => model.id).sort(), ['actual-claude', 'actual-response']);
  assert.equal(catalog.find((model) => model.id === 'actual-response').provider, 'responses');
  assert.equal(catalog.find((model) => model.id === 'actual-response').upstreamModel, 'Vendor/Real-Response');
  assert.equal(catalog.find((model) => model.id === 'actual-claude').upstreamModel, 'actual-claude');
  assert.equal((await runModelRouterCommand({ subcommand: 'models' }, { registryRoot: f.root, io: f.io })).exitCode, 0);
  assert.ok(f.logs.some((line) => line.startsWith('actual-response\t') && line.includes('upstream=Vendor/Real-Response')));
});

for (const [mode, connect] of [['isolated', runConnect], ['inplace', runConnectInplace]]) {
  test(`${mode}: empty registry rejects actual connect before client, state, or registry writes`, async (t) => {
    const f = fixture(t, JSON.parse(seedText));
    const before = fs.readFileSync(f.registryFile, 'utf8');
    const result = await connect(options(f, { clients: ['claude', 'codex', 'pi'] }));
    assert.equal(result.exitCode, 1);
    assert.equal(result.error, 'gateway_not_ready');
    assert.equal(result.ready, false);
    assert.match(result.message, /Gateway not ready/);
    assert.equal(fs.existsSync(f.stateDir), false);
    assert.deepEqual(fs.readdirSync(f.home), []);
    assert.equal(fs.readFileSync(f.registryFile, 'utf8'), before);
  });

  test(`${mode}: dry run reports not ready without creating even the registry parent`, async (t) => {
    const f = fixture(t);
    const result = await connect(options(f, { baseRegistry: JSON.parse(seedText), clients: ['codex'], dryRun: true }));
    assert.equal(result.ready, false);
    assert.equal(result.dryRun, true);
    assert.match(f.logs.join('\n'), /not ready/);
    assert.equal(fs.existsSync(path.dirname(f.registryFile)), false);
    assert.equal(fs.existsSync(f.stateDir), false);
    assert.deepEqual(fs.readdirSync(f.home), []);
  });

  test(`${mode}: a single explicit Responses route is selected without inventing a model`, async (t) => {
    const original = registeredModels();
    delete original.clientDefaults;
    const f = fixture(t, original);
    const result = await connect(options(f, { clients: ['codex'] }));
    assert.equal(result.exitCode, 0);
    assert.equal(result.routes.codex, 'actual-response');
    const connected = JSON.parse(fs.readFileSync(f.registryFile, 'utf8'));
    assert.equal(connected.clientDefaults.codex, 'actual-response');
    assert.equal(resolveGatewayRoute({ clientId: 'codex', clientProtocol: 'openai-response', registry: connected, env: {} }).modelId, result.routes.codex);
    assert.deepEqual(connected.extensionMetadata, original.extensionMetadata);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.stateDir, 'connect-state.json'), 'utf8')).codexModel, 'actual-response');
    await connect(options(f, { clients: ['codex'] }));
    await runDisconnect(options(f));
    assert.deepEqual(JSON.parse(fs.readFileSync(f.registryFile, 'utf8')), original, 'repeated connect preserves the originally absent default');
  });

  test(`${mode}: incompatible explicit model fails closed even with a compatible alternative`, async (t) => {
    const f = fixture(t, registeredModels());
    const result = await connect(options(f, { clients: ['codex'], codexModel: 'actual-claude' }));
    assert.equal(result.ready, false);
    assert.match(result.message, /actual-claude.*not an eligible openai-response/);
    assert.equal(fs.existsSync(f.stateDir), false);
    assert.deepEqual(fs.readdirSync(f.home), []);
  });

  test(`${mode}: missing credentials reject a required-auth route; explicit no-auth is the only exemption`, async (t) => {
    const registry = registeredModels();
    delete registry.providers.responses.authMode;
    registry.providers.responses.apiKeyEnv = 'env:EXPLICIT_CONNECT_TEST_KEY';
    const f = fixture(t, registry);
    const blocked = await connect(options(f, { clients: ['codex'] }));
    assert.equal(blocked.ready, false);
    assert.equal(fs.existsSync(f.stateDir), false);
    const ready = await connect(options(f, { clients: ['codex'], dryRun: true, env: { EXPLICIT_CONNECT_TEST_KEY: 'test-only-secret' } }));
    assert.equal(ready.ready, true);
    assert.equal(ready.dryRun, true);
    assert.equal(fs.existsSync(f.stateDir), false);
    assert.ok(!JSON.stringify(ready).includes('test-only-secret'));
    assert.ok(!f.logs.join('\n').includes('test-only-secret'));
  });

  test(`${mode}: multiple compatible models need an explicit choice, not a hardcoded default`, async (t) => {
    const registry = registeredModels();
    registry.models['another-response'] = { ...registry.models['actual-response'] };
    registry.providers.responses.models.push('another-response');
    const f = fixture(t, registry);
    assert.equal((await connect(options(f, { clients: ['codex'], dryRun: true }))).ready, false);
    const explicit = await connect(options(f, { clients: ['codex'], codexModel: 'another-response', dryRun: true }));
    assert.equal(explicit.ready, true);
    assert.equal(explicit.routes.codex, 'another-response');
    assert.equal(fs.existsSync(f.stateDir), false);
    assert.deepEqual(fs.readdirSync(f.home), []);
  });

  test(`${mode}: a unique compatible Claude/Pi model is not a default when multiple models are bound`, async (t) => {
    const registry = registeredModels();
    registry.activeModel = '';
    const f = fixture(t, registry);
    const before = fs.readFileSync(f.registryFile, 'utf8');
    for (const client of ['claude', 'pi']) {
      const result = await connect(options(f, { clients: [client] }));
      assert.equal(result.ready, false);
      assert.match(result.message, /no eligible runtime default route/);
    }
    assert.equal(fs.readFileSync(f.registryFile, 'utf8'), before);
    assert.equal(fs.existsSync(f.stateDir), false);
    assert.deepEqual(fs.readdirSync(f.home), []);
  });

  test(`${mode}: an incompatible active route is not silently replaced for Claude/Pi`, async (t) => {
    const registry = registeredModels();
    registry.activeModel = 'actual-response';
    const f = fixture(t, registry);
    for (const client of ['claude', 'pi']) {
      const result = await connect(options(f, { clients: [client] }));
      assert.equal(result.ready, false);
      assert.match(result.message, /runtime model "actual-response" is not an eligible claude route/);
    }
    assert.equal(fs.existsSync(f.stateDir), false);
    assert.deepEqual(fs.readdirSync(f.home), []);
  });

  test(`${mode}: Claude/Pi client defaults cannot substitute for the anonymous runtime route`, async (t) => {
    const registry = registeredModels();
    registry.activeModel = '';
    registry.clientDefaults = { claude: 'actual-claude', pi: 'actual-claude' };
    const f = fixture(t, registry);
    for (const client of ['claude', 'pi']) {
      const result = await connect(options(f, { clients: [client], dryRun: true }));
      assert.equal(result.ready, false);
      assert.match(result.message, /no eligible runtime default route/);
    }
    assert.equal(fs.existsSync(f.stateDir), false);
    assert.deepEqual(fs.readdirSync(f.home), []);
  });

  test(`${mode}: an explicit Pi model must match the runtime default, not just another eligible model`, async (t) => {
    const registry = registeredModels();
    registry.models['another-claude'] = { ...registry.models['actual-claude'] };
    registry.providers.messages.models.push('another-claude');
    const f = fixture(t, registry);
    const before = fs.readFileSync(f.registryFile, 'utf8');
    const rejected = await connect(options(f, { clients: ['pi'], piModel: 'another-claude' }));
    assert.equal(rejected.ready, false);
    assert.match(rejected.message, /requested model "another-claude" differs from runtime default "actual-claude"/);
    const ready = await connect(options(f, { clients: ['pi'], piModel: 'actual-claude', dryRun: true }));
    assert.equal(ready.ready, true);
    assert.equal(ready.routes.pi, resolveGatewayRoute({ registry, env: {} }).modelId);
    assert.equal(fs.readFileSync(f.registryFile, 'utf8'), before);
    assert.equal(fs.existsSync(f.stateDir), false);
    assert.deepEqual(fs.readdirSync(f.home), []);
  });

  test(`${mode}: a single bound Claude model can serve Claude/Pi without a configured default`, async (t) => {
    const registry = registeredModels();
    registry.activeModel = '';
    delete registry.models['actual-response'];
    delete registry.providers.responses;
    const f = fixture(t, registry);
    const before = fs.readFileSync(f.registryFile, 'utf8');
    const result = await connect(options(f, { clients: ['claude', 'pi'] }));
    assert.equal(result.ready, true);
    assert.deepEqual(result.routes, { claude: 'actual-claude', pi: 'actual-claude' });
    assert.equal(resolveGatewayRoute({ registry, env: {} }).modelId, 'actual-claude');
    assert.equal(fs.readFileSync(f.registryFile, 'utf8'), before);
    await runDisconnect(options(f));
    assert.equal(fs.readFileSync(f.registryFile, 'utf8'), before, 'Claude/Pi connect does not own registry defaults');
  });

  for (const protocol of ['openai-chat', 'gemini']) {
    test(`${mode}: a single ${protocol} model connects Claude/Pi through supported translation, not Codex`, async (t) => {
      const registry = {
        ...JSON.parse(seedText),
        providers: { upstream: { baseUrl: 'https://upstream.invalid', endpointStyle: 'standard', authMode: 'none', protocols: [protocol] } },
        models: { 'registered-alias': { source: 'custom', provider: 'upstream', protocols: [protocol], upstreamModel: 'Vendor-Exact-ID' } },
      };
      const f = fixture(t, registry);
      const before = fs.readFileSync(f.registryFile, 'utf8');
      assert.equal((await connect(options(f, { clients: ['codex'] }))).ready, false);
      const preview = await connect(options(f, { clients: ['claude', 'pi'], dryRun: true }));
      assert.equal(preview.ready, true);
      assert.deepEqual(preview.routes, { claude: 'registered-alias', pi: 'registered-alias' });
      if (protocol === 'gemini') assert.match(preview.warnings.join('\n'), /non-streaming requests only/);
      assert.equal(fs.existsSync(f.stateDir), false);
      assert.deepEqual(fs.readdirSync(f.home), []);

      const result = await connect(options(f, { clients: ['claude', 'pi'] }));
      assert.equal(result.exitCode, 0);
      const piFile = mode === 'isolated' ? path.join(f.stateDir, 'pi-home/.pi/agent/models.json') : path.join(f.home, '.pi/agent/models.json');
      assert.equal(JSON.parse(fs.readFileSync(piFile, 'utf8')).providers['aios-gateway'].api, 'anthropic-messages');
      const calls = [];
      const { app, decisions } = createRoutingGatewayApp({ registry, env: {}, fetchImpl: async (url, init) => {
        calls.push({ url, body: JSON.parse(new TextDecoder().decode(init.body)) });
        return Response.json(protocol === 'gemini'
          ? { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }
          : { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] });
      } });
      const response = await app.request('/v1/messages', { method: 'POST', body: JSON.stringify({ model: 'gateway-default', messages: [{ role: 'user', content: 'hello' }], max_tokens: 16 }) });
      assert.equal(response.status, 200);
      await response.text();
      assert.equal(calls.length, 1);
      assert.equal(decisions[0].modelId, result.routes.claude);
      assert.equal(decisions[0].upstreamModel, 'Vendor-Exact-ID');
      if (protocol === 'gemini') assert.match(calls[0].url, /Vendor-Exact-ID:generateContent$/);
      else assert.equal(calls[0].body.model, 'Vendor-Exact-ID');
      await runDisconnect(options(f));
      assert.equal(fs.readFileSync(f.registryFile, 'utf8'), before);
    });
  }

  test(`${mode}: later client connects retain Codex restoration ownership; disconnect works after models are removed`, async (t) => {
    const original = registeredModels();
    original.clientDefaults = { codex: 'user-original', pi: 'actual-claude' };
    const f = fixture(t, original);
    await connect(options(f, { clients: ['claude'] }));
    await connect(options(f, { clients: ['codex'], codexModel: 'actual-response' }));
    await connect(options(f, { clients: ['pi'] }));
    const state = JSON.parse(fs.readFileSync(path.join(f.stateDir, 'connect-state.json'), 'utf8'));
    assert.equal(state.codexDefaultApplied, true);
    assert.deepEqual(state.priorClientDefaults, original.clientDefaults);
    const edited = JSON.parse(fs.readFileSync(f.registryFile, 'utf8'));
    edited.models = {};
    edited.providers = {};
    edited.clientDefaults.laterClient = 'later-edit';
    fs.writeFileSync(f.registryFile, JSON.stringify(edited));
    assert.equal((await runDisconnect(options(f))).exitCode, 0);
    const restored = JSON.parse(fs.readFileSync(f.registryFile, 'utf8'));
    assert.deepEqual(restored.models, {});
    assert.deepEqual(restored.providers, {});
    assert.deepEqual(restored.extensionMetadata, original.extensionMetadata);
    assert.deepEqual(restored.clientDefaults, { ...original.clientDefaults, laterClient: 'later-edit' });
    assert.deepEqual(fs.readdirSync(f.home).filter((entry) => !entry.startsWith('.')), []);
    assert.equal(fs.existsSync(path.join(f.home, '.codex/config.toml')), false);
  });
}

test('CLI connect dryRun option is read-only and returns a structured readiness explanation', async (t) => {
  const f = fixture(t);
  const result = await runModelRouterCommand({ subcommand: 'connect', client: 'codex', stateDir: f.stateDir, home: f.home, dryRun: true, json: true }, { registryRoot: f.root, io: f.io });
  assert.equal(result.exitCode, 1);
  const output = JSON.parse(f.logs.at(-1));
  assert.equal(output.ready, false);
  assert.equal(output.dryRun, true);
  assert.equal(output.error, 'gateway_not_ready');
  assert.equal(fs.existsSync(f.stateDir), false);
  assert.equal(fs.existsSync(path.dirname(f.registryFile)), false);
});

test('connect rechecks route readiness after acquiring the shared registry lock', async (t) => {
  const original = registeredModels();
  const f = fixture(t, original);
  let connect;
  await withRegistryWriteLock(f.registryFile, async () => {
    connect = runConnectInplace(options(f, { clients: ['codex'], baseRegistry: original }));
    fs.writeFileSync(f.registryFile, seedText);
  });
  const result = await connect;
  assert.equal(result.ready, false, 'a stale pre-lock baseRegistry cannot authorize connecting');
  assert.equal(fs.readFileSync(f.registryFile, 'utf8'), seedText);
  assert.equal(fs.existsSync(f.stateDir), false);
  assert.deepEqual(fs.readdirSync(f.home), []);
});

test('in-place partial disconnect and zero-model cleanup preserve gateway process metadata', async (t) => {
  const f = fixture(t, registeredModels());
  assert.equal((await runConnectInplace(options(f))).exitCode, 0);
  const pidFile = path.join(f.stateDir, 'gateway.pid.json');
  fs.writeFileSync(pidFile, '{"pid":123,"port":8686}\n');
  const registry = JSON.parse(fs.readFileSync(f.registryFile, 'utf8'));
  registry.models = {};
  registry.providers = {};
  fs.writeFileSync(f.registryFile, JSON.stringify(registry));
  const partial = await runDisconnect(options(f, { clients: ['claude'] }));
  assert.deepEqual(partial.remainingClients.sort(), ['codex', 'pi']);
  assert.equal(JSON.parse(fs.readFileSync(f.registryFile, 'utf8')).clientDefaults.codex, 'actual-response');
  assert.equal((await runDisconnect(options(f))).exitCode, 0);
  assert.equal(JSON.parse(fs.readFileSync(f.registryFile, 'utf8')).clientDefaults?.codex, undefined);
  assert.equal(fs.readFileSync(pidFile, 'utf8'), '{"pid":123,"port":8686}\n');
  assert.equal(fs.existsSync(path.join(f.stateDir, 'connect-state.json')), false);
});
