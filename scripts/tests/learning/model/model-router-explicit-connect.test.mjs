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
import { createRoutingGatewayApp } from '../../../lib/tooling/model-router/gateway/compatibility/proxy.mjs';
import { listGatewayModels } from '../../../lib/tooling/model-router/providers/registry.mjs';

const SEED_REL = 'scripts/lib/tooling/specs/registry/model-registry.json';
const seedText = fs.readFileSync(new URL('../../../lib/tooling/specs/registry/model-registry.json', import.meta.url), 'utf8');
const GW = 'http://127.0.0.1:8686';

function mockUpstreamReply(protocol, stream) {
  const model = 'Vendor-Exact-ID';
  const text = 'fixture-ok';
  const usage = { input_tokens: 1, output_tokens: 1 };
  const body = {
    claude: { id: 'msg_fixture', type: 'message', role: 'assistant', model,
      content: [{ type: 'text', text }], stop_reason: 'end_turn', usage },
    'openai-response': { id: 'resp_fixture', object: 'response', model, status: 'completed',
      output: [{ id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }] }], usage },
    'openai-chat': { id: 'chatcmpl_fixture', object: 'chat.completion', model,
      choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
    gemini: { responseId: 'gemini_fixture', modelVersion: model,
      candidates: [{ index: 0, content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } },
  }[protocol];
  if (!stream) return Response.json(body);
  const event = (data) => `${data.type ? `event: ${data.type}\n` : ''}data: ${JSON.stringify(data)}\n\n`;
  let wire;
  if (protocol === 'claude') {
    wire = [
      { type: 'message_start', message: { ...body, content: [], stop_reason: null, usage: { ...usage, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage },
      { type: 'message_stop' },
    ].map(event).join('');
  } else if (protocol === 'openai-response') {
    const item = body.output[0];
    const location = { item_id: item.id, output_index: 0, content_index: 0 };
    wire = [
      { type: 'response.created', response: { ...body, status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } },
      { type: 'response.content_part.added', ...location, part: { type: 'output_text', text: '', annotations: [] } },
      { type: 'response.output_text.delta', ...location, delta: text },
      { type: 'response.output_text.done', ...location, text },
      { type: 'response.content_part.done', ...location, part: item.content[0] },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: body },
    ].map((data, sequence_number) => event({ ...data, sequence_number })).join('');
  } else if (protocol === 'openai-chat') {
    const chunk = (delta, finish_reason = null) => ({ id: body.id, object: 'chat.completion.chunk', model,
      choices: [{ index: 0, delta, finish_reason }] });
    wire = event(chunk({ role: 'assistant', content: text })) + event(chunk({}, 'stop')) + 'data: [DONE]\n\n';
  } else {
    wire = event(body);
  }
  return new Response(wire, { headers: { 'content-type': 'text/event-stream' } });
}

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
    original.activeModel = '';
    delete original.models['actual-claude'];
    delete original.providers.messages;
    delete original.clientDefaults;
    const f = fixture(t, original);
    const result = await connect(options(f, { clients: ['codex'] }));
    assert.equal(result.exitCode, 0);
    assert.equal(result.routes.codex, 'actual-response');
    const connected = JSON.parse(fs.readFileSync(f.registryFile, 'utf8'));
    assert.deepEqual(connected, original, 'Auto does not persist a resolved model as a default');
    assert.equal(resolveGatewayRoute({ clientId: 'codex', clientProtocol: 'openai-response', registry: connected, env: {} }).modelId, result.routes.codex);
    assert.deepEqual(connected.extensionMetadata, original.extensionMetadata);
    const state = JSON.parse(fs.readFileSync(path.join(f.stateDir, 'connect-state.json'), 'utf8'));
    assert.equal(state.resolvedModels.codex, 'actual-response');
    assert.equal(state.targets.codex, 'auto');
    assert.equal(state.targetRefVersion, 1);
    await connect(options(f, { clients: ['codex'] }));
    await runDisconnect(options(f));
    assert.deepEqual(JSON.parse(fs.readFileSync(f.registryFile, 'utf8')), original, 'repeated connect preserves the originally absent default');
  });

  test(`${mode}: Codex can explicitly select a Claude route over a different configured default`, async (t) => {
    const registry = registeredModels();
    registry.activeModel = 'actual-response';
    registry.clientDefaults = { codex: 'actual-response', pi: 'actual-claude' };
    const f = fixture(t, registry);
    const result = await connect(options(f, { clients: ['codex'], codexModel: 'actual-claude' }));
    assert.equal(result.ready, true);
    assert.equal(result.routes.codex, 'actual-claude');
    const connected = JSON.parse(fs.readFileSync(f.registryFile, 'utf8'));
    assert.deepEqual(connected.clientDefaults, { ...registry.clientDefaults, codex: 'actual-claude' });
    assert.equal(resolveGatewayRoute({ clientId: 'codex', clientProtocol: 'openai-response', registry: connected, env: {} }).targetProtocol, 'claude');
    assert.equal((await runDisconnect(options(f))).exitCode, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.registryFile, 'utf8')), registry);
  });

  test(`${mode}: unbound explicit models fail closed even with eligible alternatives`, async (t) => {
    const registry = registeredModels();
    registry.models['unbound-model'] = { provider: 'responses', protocols: ['openai-response'], cli: { command: 'codex' } };
    const f = fixture(t, registry);
    const before = fs.readFileSync(f.registryFile, 'utf8');
    for (const dryRun of [true, false]) {
      const result = await connect(options(f, { clients: ['codex'], codexModel: 'unbound-model', dryRun }));
      assert.equal(result.ready, false);
      assert.match(result.message, /unbound-model.*not an eligible openai-response/);
    }
    assert.equal(fs.readFileSync(f.registryFile, 'utf8'), before);
    assert.equal(fs.existsSync(f.stateDir), false);
    assert.deepEqual(fs.readdirSync(f.home), []);
  });

  test(`${mode}: missing credentials reject a required-auth route; explicit no-auth is the only exemption`, async (t) => {
    const registry = registeredModels();
    delete registry.providers.responses.authMode;
    registry.providers.responses.apiKeyEnv = 'env:EXPLICIT_CONNECT_TEST_KEY';
    const f = fixture(t, registry);
    const blocked = await connect(options(f, { clients: ['codex'], codexModel: 'actual-response' }));
    assert.equal(blocked.ready, false);
    assert.equal(fs.existsSync(f.stateDir), false);
    const ready = await connect(options(f, { clients: ['codex'], codexModel: 'actual-response', dryRun: true, env: { EXPLICIT_CONNECT_TEST_KEY: 'test-only-secret' } }));
    assert.equal(ready.ready, true);
    assert.equal(ready.dryRun, true);
    assert.equal(fs.existsSync(f.stateDir), false);
    assert.ok(!JSON.stringify(ready).includes('test-only-secret'));
    assert.ok(!f.logs.join('\n').includes('test-only-secret'));
  });

  test(`${mode}: multiple compatible models need an explicit choice, not a hardcoded default`, async (t) => {
    const registry = registeredModels();
    registry.activeModel = '';
    registry.models['another-response'] = { ...registry.models['actual-response'] };
    registry.providers.responses.models.push('another-response');
    const f = fixture(t, registry);
    const before = fs.readFileSync(f.registryFile, 'utf8');
    for (const dryRun of [true, false]) {
      const ambiguous = await connect(options(f, { clients: ['codex'], dryRun }));
      assert.equal(ambiguous.ready, false);
      assert.match(ambiguous.message, /no eligible runtime default route/);
    }
    const explicit = await connect(options(f, { clients: ['codex'], codexModel: 'another-response', dryRun: true }));
    assert.equal(explicit.ready, true);
    assert.equal(explicit.routes.codex, 'another-response');
    assert.equal(fs.readFileSync(f.registryFile, 'utf8'), before);
    assert.equal(fs.existsSync(f.stateDir), false);
    assert.deepEqual(fs.readdirSync(f.home), []);
  });

  test(`${mode}: Claude/Pi cannot infer a runtime default when multiple models are bound`, async (t) => {
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

  test(`${mode}: an unbound active route is not silently replaced for Claude/Pi`, async (t) => {
    const registry = registeredModels();
    registry.activeModel = 'unbound-model';
    registry.models['unbound-model'] = { provider: 'responses', protocols: ['openai-response'], cli: { command: 'codex' } };
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

  test(`${mode}: identified Claude/Pi paths use their own runtime defaults`, async (t) => {
    const registry = registeredModels();
    registry.activeModel = '';
    registry.clientDefaults = { claude: 'actual-claude', pi: 'actual-claude' };
    const f = fixture(t, registry);
    for (const client of ['claude', 'pi']) {
      const result = await connect(options(f, { clients: [client], dryRun: true }));
      assert.equal(result.ready, true);
      assert.equal(result.routes[client], 'actual-claude');
      assert.equal(result.targets[client], 'auto');
    }
    assert.equal(fs.existsSync(f.stateDir), false);
    assert.deepEqual(fs.readdirSync(f.home), []);
  });

  test(`${mode}: a fixed Pi model can differ from the Auto runtime default`, async (t) => {
    const registry = registeredModels();
    registry.models['another-claude'] = { ...registry.models['actual-claude'] };
    registry.providers.messages.models.push('another-claude');
    const f = fixture(t, registry);
    const before = fs.readFileSync(f.registryFile, 'utf8');
    const fixed = await connect(options(f, { clients: ['pi'], piModel: 'another-claude', dryRun: true }));
    assert.equal(fixed.ready, true);
    assert.equal(fixed.routes.pi, 'another-claude');
    assert.equal(fixed.targets.pi, 'model:another-claude');
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

  for (const protocol of ['claude', 'openai-response', 'openai-chat', 'gemini']) {
    test(`${mode}: all clients connect to a bound ${protocol} route with JSON/SSE and reversible defaults`, async (t) => {
      const clients = ['claude', 'codex', 'pi'];
      const registry = {
        ...JSON.parse(seedText),
        providers: { upstream: { baseUrl: 'https://upstream.invalid', endpointStyle: 'standard', authMode: 'none', protocols: [protocol] } },
        models: { 'registered-alias': { source: 'custom', provider: 'upstream', protocols: [protocol], upstreamModel: 'Vendor-Exact-ID' } },
        clientDefaults: { pi: 'preserved-pi-default' },
        extensionMetadata: { preserve: true },
      };
      const f = fixture(t, registry);
      const json = (document) => `${JSON.stringify(document, null, 2)}\n`;
      const originals = new Map([
        ['.claude/settings.json', json({ env: { FIXTURE_SETTING: 'preserve' }, model: 'native-fixture' })],
        ['.codex/config.toml', '# fixture only\nmodel = "native-fixture"\nmodel_provider = "fixture"\n'],
        ['.pi/agent/settings.json', json({ defaultProvider: 'fixture', defaultModel: 'native-fixture', preserve: true })],
        ['.pi/agent/models.json', json({ providers: { fixture: { preserve: true } } })],
      ]);
      for (const [relative, text] of originals) {
        const file = path.join(f.home, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
      }
      const before = fs.readFileSync(f.registryFile, 'utf8');
      const expectedRoutes = { claude: 'registered-alias', codex: 'registered-alias', pi: 'registered-alias' };
      const preview = await connect(options(f, { clients, dryRun: true }));
      assert.equal(preview.ready, true);
      assert.equal(preview.dryRun, true);
      assert.deepEqual(preview.routes, expectedRoutes);
      assert.deepEqual(preview.warnings, []);
      assert.doesNotMatch(f.logs.join('\n'), /non-streaming requests only/);
      assert.equal(fs.existsSync(f.stateDir), false);
      assert.equal(fs.readFileSync(f.registryFile, 'utf8'), before);
      for (const [relative, text] of originals) assert.equal(fs.readFileSync(path.join(f.home, relative), 'utf8'), text);

      const result = await connect(options(f, { clients }));
      assert.equal(result.exitCode, 0);
      assert.deepEqual(result.routes, expectedRoutes);
      assert.deepEqual(result.warnings, []);
      const connected = JSON.parse(fs.readFileSync(f.registryFile, 'utf8'));
      assert.deepEqual(connected, registry, 'Auto leaves the saved registry unchanged');
      const stateFile = path.join(f.stateDir, 'connect-state.json');
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.equal(state.codexDefaultApplied, false);
      assert.equal(state.codexDefaultStatus, undefined);
      assert.equal(state.codexModel, undefined);
      assert.deepEqual(state.resolvedModels, expectedRoutes);
      assert.deepEqual(state.targets, { claude: 'auto', codex: 'auto', pi: 'auto' });
      assert.equal(state.targetRefVersion, 1);
      assert.equal(fs.existsSync(path.join(f.stateDir, 'registry-backup.json')), false);
      const piFile = mode === 'isolated' ? path.join(f.stateDir, 'pi-home/.pi/agent/models.json') : path.join(f.home, '.pi/agent/models.json');
      assert.equal(JSON.parse(fs.readFileSync(piFile, 'utf8')).providers['aios-gateway'].api, 'anthropic-messages');
      const codexFile = mode === 'isolated' ? path.join(f.stateDir, 'codex-home/config.toml') : path.join(f.home, '.codex/config.toml');
      assert.match(fs.readFileSync(codexFile, 'utf8'), /wire_api = "responses"/);
      assert.match(fs.readFileSync(codexFile, 'utf8'), /x-gateway-client = "codex"/);
      const calls = [];
      const { app, decisions } = createRoutingGatewayApp({ registry: connected, env: {}, masking: false, fetchImpl: async (url, init) => {
        const body = await new Response(init.body).json();
        calls.push({ url, body });
        return mockUpstreamReply(protocol, protocol === 'gemini' ? url.includes(':streamGenerateContent') : body.stream === true);
      } });
      for (const client of clients) {
        for (const stream of [false, true]) {
          const codex = client === 'codex';
          const body = codex
            ? { model: 'aios-auto', input: 'hello', max_output_tokens: 16, stream }
            : { model: 'aios-auto', messages: [{ role: 'user', content: 'hello' }], max_tokens: 16, stream };
          const response = await app.request(`/clients/${client}/v1/${codex ? 'responses' : 'messages'}`, {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-gateway-client': client },
            body: JSON.stringify(body),
          });
          assert.equal(response.status, 200, `${client} stream=${stream}`);
          if (stream) {
            assert.match(response.headers.get('content-type'), /text\/event-stream/);
            const wire = await response.text();
            assert.ok(wire.includes('fixture-ok'));
            assert.doesNotMatch(wire, /event: error|"type":"error"/);
            assert.match(wire, codex ? /event: response.completed/ : /event: message_stop/);
          } else {
            const reply = await response.json();
            const content = codex ? reply.output.flatMap((item) => item.content || []) : reply.content;
            assert.equal(content.map((part) => part.text).join(''), 'fixture-ok');
          }
          assert.equal(decisions.at(-1).modelId, result.routes[client]);
          assert.equal(decisions.at(-1).targetProtocol, protocol);
          assert.equal(decisions.at(-1).upstreamModel, 'Vendor-Exact-ID');
          const call = calls.at(-1);
          if (protocol === 'gemini') {
            assert.equal(call.url, `https://upstream.invalid/v1beta/models/Vendor-Exact-ID:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`);
            assert.equal(Object.hasOwn(call.body, 'model'), false);
            assert.equal(Object.hasOwn(call.body, 'stream'), false);
          } else {
            assert.equal(call.body.model, 'Vendor-Exact-ID');
            assert.equal(call.body.stream, stream);
          }
        }
      }
      assert.equal(calls.length, clients.length * 2);
      assert.equal(decisions.length, calls.length);
      assert.equal((await connect(options(f, { clients }))).exitCode, 0);
      assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).codexDefaultApplied, false);
      assert.equal((await runDisconnect(options(f))).exitCode, 0);
      assert.equal(fs.readFileSync(f.registryFile, 'utf8'), before);
      assert.equal(fs.existsSync(stateFile), false);
      assert.equal(fs.existsSync(path.join(f.stateDir, 'registry-backup.json')), false);
      assert.equal(fs.existsSync(path.join(f.stateDir, 'connect-backup.json')), false);
      for (const [relative, text] of originals) assert.equal(fs.readFileSync(path.join(f.home, relative), 'utf8'), text);
      if (mode === 'isolated') {
        assert.equal(fs.existsSync(piFile), false);
        assert.equal(fs.existsSync(codexFile), false);
      }
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
  const original = registeredModels();
  original.activeModel = 'actual-response';
  const f = fixture(t, original);
  assert.equal((await runConnectInplace(options(f, { codexModel: 'actual-response' }))).exitCode, 0);
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
