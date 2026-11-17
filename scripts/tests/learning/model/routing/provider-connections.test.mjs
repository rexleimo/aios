import test from 'node:test';
import assert from 'node:assert/strict';
import * as providers from '../../../../lib/tooling/model-router/providers/registry.mjs';
import { discoverProviderModels } from '../../../../lib/tooling/model-router/routing/discovery.mjs';
import { classifyTurnIntent } from '../../../../lib/tooling/model-router/routing/intent.mjs';
import { resolveGatewayRoute } from '../../../../lib/tooling/model-router/gateway/router.mjs';
import { createRoutingGatewayApp } from '../../../../lib/tooling/model-router/gateway/compatibility/proxy.mjs';

const PROTOCOLS = ['openai-chat', 'openai-response', 'claude', 'gemini'];
const BASES = {
  'openai-chat': 'https://chat.invalid/api/coding/paas/v4',
  'openai-response': 'https://responses.invalid/custom/v3',
  claude: 'https://claude.invalid/api/anthropic',
  gemini: 'https://gemini.invalid/google/v1beta',
};
const ENV = { FIXTURE_KEY: 'fake-primary-key', HEADER_TOKEN: 'fake-custom-token', TENANT: 'fake-tenant' };
const connection = (patch = {}) => ({
  id: 'vendor', baseUrl: 'https://metadata.invalid', apiKeyEnv: 'env:FIXTURE_KEY',
  protocols: [...PROTOCOLS], protocolBaseUrls: { ...BASES }, ...patch,
});
function registryFor(provider, protocol = provider.protocols[0], upstreamModel = 'Vendor-Model') {
  return {
    providers: { vendor: provider },
    models: { target: { source: 'custom', provider: 'vendor', protocols: [protocol], upstreamModel } },
    intentRouting: { classifierModel: 'target', intents: [{ id: 'work', modelId: 'target', description: 'Work' }] },
  };
}
const incoming = () => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'ignored', max_tokens: 8, messages: [{ role: 'user', content: 'hello' }] }) });
const headersOf = (headers) => Object.fromEntries(new Headers(headers));

test('per-API SDK bases preserve arbitrary vendor paths and use separate hosts', () => {
  const input = connection({ extension: { retained: true }, headers: { 'X-Tenant': 'env:TENANT' } });
  const snapshot = structuredClone(input);
  const result = providers.validateProvider(input);
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.deepEqual(input, snapshot);
  assert.deepEqual(result.provider.protocolBaseUrls, BASES);
  assert.deepEqual(result.provider.extension, input.extension);
  for (const [protocol, generation, models] of [
    ['openai-chat', '/chat/completions', '/models'],
    ['openai-response', '/responses', '/models'],
    ['claude', '/v1/messages', '/v1/models'],
    ['gemini', '/models', '/models'],
  ]) {
    assert.equal(providers.resolveProviderEndpoint(result.provider, protocol), BASES[protocol] + generation);
    assert.equal(providers.resolveProviderModelsEndpoint(result.provider, protocol), BASES[protocol] + models);
  }
});

test('pasted generation/model-list URLs normalize to bases, idempotently', () => {
  for (const [protocol, pasted, base, endpoint] of [
    ['openai-chat', 'https://vendor.invalid/api/coding/paas/v4/chat/completions/', 'https://vendor.invalid/api/coding/paas/v4', '/chat/completions'],
    ['openai-chat', 'https://vendor.invalid/v1/models', 'https://vendor.invalid/v1', '/chat/completions'],
    ['openai-response', 'https://vendor.invalid/custom/responses', 'https://vendor.invalid/custom', '/responses'],
    ['openai-response', 'https://vendor.invalid/', 'https://vendor.invalid/v1', '/responses'],
    ['claude', 'https://vendor.invalid/api/anthropic/v1/messages/', 'https://vendor.invalid/api/anthropic/v1', '/messages'],
    ['claude', 'https://vendor.invalid/api/anthropic/v1/models', 'https://vendor.invalid/api/anthropic/v1', '/messages'],
    ['claude', 'https://vendor.invalid/api/anthropic/v1', 'https://vendor.invalid/api/anthropic/v1', '/messages'],
    ['claude', 'https://vendor.invalid/api/v1/v1', 'https://vendor.invalid/api/v1/v1', '/messages'],
    ['claude', 'https://vendor.invalid/custom/messages', 'https://vendor.invalid/custom', '/v1/messages'],
    ['gemini', 'https://vendor.invalid/google/v1beta/models/Gemini-X:generateContent', 'https://vendor.invalid/google/v1beta', '/models'],
    ['gemini', 'https://vendor.invalid/google/v1beta/models/Gemini-X:streamGenerateContent/', 'https://vendor.invalid/google/v1beta', '/models'],
    ['gemini', 'https://vendor.invalid/google/v1beta/models/vendor/Gemini-X:generateContent', 'https://vendor.invalid/google/v1beta', '/models'],
    ['gemini', 'https://vendor.invalid/google/v1beta/models', 'https://vendor.invalid/google/v1beta', '/models'],
    ['gemini', 'https://vendor.invalid/', 'https://vendor.invalid/v1beta', '/models'],
    ['gemini', 'https://vendor.invalid/custom/v1', 'https://vendor.invalid/custom/v1', '/models'],
  ]) {
    const result = providers.validateProvider(connection({ protocols: [protocol], protocolBaseUrls: { [protocol]: ` ${pasted} ` } }));
    assert.equal(result.ok, true, `${pasted}: ${result.errors.join('; ')}`);
    assert.equal(result.provider.protocolBaseUrls[protocol], base);
    assert.equal(providers.resolveProviderEndpoint(result.provider, protocol), base + endpoint);
    assert.deepEqual(providers.validateProvider(result.provider).provider, result.provider);
  }
});

test('authoritative URL maps have canonical keys, complete protocols, no fallback', () => {
  for (const protocolBaseUrls of [null, undefined, [], '', {}, { claude: '' }, { claude: null },
    { claude: BASES.claude, anthropic: BASES.claude }, { CLAUDE: BASES.claude }]) {
    const input = connection({ protocols: ['claude'], protocolBaseUrls });
    assert.equal(providers.validateProvider(input).ok, false, JSON.stringify(protocolBaseUrls));
    assert.throws(() => providers.resolveProviderEndpoint(input, 'claude'), providers.ProviderConfigError);
  }
  assert.throws(() => providers.resolveProviderEndpoint(connection({ protocols: ['claude'], protocolBaseUrls: { claude: BASES.claude } }), 'gemini'), providers.ProviderConfigError);
  assert.equal(providers.validateProvider(connection({ baseUrl: '' })).ok, false, 'primary metadata is still required');
});

test('URLs reject credential-bearing and malformed input before suffix normalization', async () => {
  for (const value of ['ftp://vendor.invalid', 'not a URL', 'https://', 'https:///missing-host',
    'https://user:pass@vendor.invalid/v1', 'https://user@vendor.invalid/v1',
    'https://vendor.invalid/v1?key=fake', 'https://vendor.invalid/v1?',
    'https://vendor.invalid/v1#fragment', 'https://vendor.invalid/v1#',
    'https://vendor.invalid/google/v1beta/models/m:generateContent?key=fake',
    'https://vendor.invalid/bad%zz', 'https://vendor.invalid/back\\slash', 'https://vendor.invalid/line\nbreak',
    '\nhttps://vendor.invalid/v1', 'https://vendor.invalid/v1\r', '\thttps://vendor.invalid/v1',
    'https://vendor.invalid/control\u0000value', 'https://vendor.invalid/control\u007fvalue']) {
    for (const patch of [{ baseUrl: value }, { protocolBaseUrls: { claude: value } }]) {
      const input = connection({ protocols: ['claude'], ...patch });
      assert.equal(providers.validateProvider(input).ok, false, value);
      let calls = 0;
      await assert.rejects(discoverProviderModels(input, { env: ENV, fetchImpl: async () => { calls++; return Response.json({}); } }), providers.ProviderConfigError);
      assert.equal(calls, 0);
    }
  }
});

test('legacy relay and standard endpointStyle path rules remain unchanged', () => {
  for (const [endpointStyle, protocol, path] of [
    ['relay', 'openai-chat', '/openai/v1/chat/completions'], ['relay', 'openai-response', '/openai/v1/responses'],
    ['relay', 'claude', '/claude/v1/messages'], ['relay', 'gemini', '/gemini/v1beta/models'],
    ['standard', 'openai-chat', '/v1/chat/completions'], ['standard', 'openai-response', '/v1/responses'],
    ['standard', 'claude', '/v1/messages'], ['standard', 'gemini', '/v1beta/models'],
  ]) assert.equal(providers.resolveProviderEndpoint({ baseUrl: 'https://legacy.invalid/prefix', endpointStyle }, protocol), `https://legacy.invalid/prefix${path}`);
  assert.throws(() => providers.resolveProviderEndpoint({}, 'claude'), { code: 'NO_ROUTE_CONFIGURED' });
});

test('protocol aliases and baseProtocol metadata stay backward compatible without routing fallbacks', () => {
  for (const [alias, canonical] of [
    ['anthropic-messages', 'claude'], ['messages', 'claude'],
    ['openai_completions', 'openai-chat'], ['compatible', 'openai-chat'],
    ['openai_responses', 'openai-response'], ['responses-api', 'openai-response'], ['google', 'gemini'],
  ]) {
    const input = { id: 'legacy', baseUrl: 'https://legacy.invalid', protocols: [alias], baseProtocol: alias, preset: 'custom', presetRegion: 'region' };
    const result = providers.validateProvider(input);
    assert.equal(result.ok, true, result.errors.join('; '));
    assert.deepEqual(result.provider.protocols, [canonical]);
    assert.equal(result.provider.baseProtocol, alias);
    assert.equal(result.provider.preset, 'custom');
    assert.equal(result.provider.presetRegion, 'region');
    assert.equal(providers.resolveProviderEndpoint(result.provider, canonical), providers.resolveProviderEndpoint({ baseUrl: input.baseUrl }, canonical));
    const explicit = providers.validateProvider(connection({ protocols: [alias], baseProtocol: alias, protocolBaseUrls: { [canonical]: BASES[canonical] } }));
    assert.equal(explicit.ok, true, explicit.errors.join('; '));
  }
  for (const baseProtocol of [null, '', 'unknown', 42]) assert.equal(providers.validateProvider(connection({ baseProtocol })).ok, false);
});

test('provider-aware auth only sends credentials for the requested API and supports Claude choices', () => {
  assert.equal(typeof providers.resolveProviderRequestHeaders, 'function');
  const expected = {
    'openai-chat': { authorization: 'Bearer fake-primary-key' },
    'openai-response': { authorization: 'Bearer fake-primary-key' },
    claude: { 'x-api-key': 'fake-primary-key', 'anthropic-version': '2023-06-01' },
    gemini: { 'x-goog-api-key': 'fake-primary-key' },
  };
  for (const protocol of PROTOCOLS) {
    assert.deepEqual(providers.resolveProviderRequestHeaders(connection(), protocol, ENV.FIXTURE_KEY, ENV), expected[protocol]);
  }
  for (const [authHeader, auth] of [
    ['x-api-key', { 'x-api-key': 'fake-primary-key' }],
    ['bearer', { authorization: 'Bearer fake-primary-key' }],
    ['both', { 'x-api-key': 'fake-primary-key', authorization: 'Bearer fake-primary-key' }],
  ]) {
    const provider = connection({ authHeader });
    assert.deepEqual(providers.resolveProviderRequestHeaders(provider, 'claude', ENV.FIXTURE_KEY, ENV), { ...auth, 'anthropic-version': '2023-06-01' });
    assert.deepEqual(providers.resolveProviderRequestHeaders(provider, 'gemini', ENV.FIXTURE_KEY, ENV), expected.gemini);
    assert.deepEqual(providers.resolveProviderRequestHeaders(provider, 'openai-chat', ENV.FIXTURE_KEY, ENV), expected['openai-chat']);
  }
  assert.equal(providers.validateProvider(connection({ authHeader: 'unknown' })).ok, false);
});

test('custom headers accept non-secret strings and explicit env refs, never inherited credential values', () => {
  const provider = connection({ authHeader: 'bearer', headers: { 'X-Tenant': 'env:TENANT', 'X-App': 'fixture', Authorization: 'env:HEADER_TOKEN' } });
  const result = providers.validateProvider(provider);
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(typeof providers.resolveProviderRequestHeaders, 'function');
  const headers = providers.resolveProviderRequestHeaders(result.provider, 'claude', ENV.FIXTURE_KEY, ENV);
  assert.deepEqual(headers, { 'anthropic-version': '2023-06-01', authorization: ENV.HEADER_TOKEN, 'x-app': 'fixture', 'x-tenant': ENV.TENANT });
  assert.throws(() => providers.resolveProviderRequestHeaders(provider, 'claude', ENV.FIXTURE_KEY, { FIXTURE_KEY: ENV.FIXTURE_KEY }), providers.ProviderConfigError);
  assert.throws(() => providers.resolveProviderRequestHeaders(provider, 'claude', ENV.FIXTURE_KEY, Object.create(ENV)), providers.ProviderConfigError);
  assert.deepEqual(providers.resolveProviderRequestHeaders(connection({ authMode: 'none', headers: { 'X-App': 'fixture' } }), 'claude', ENV.FIXTURE_KEY, ENV), { 'x-app': 'fixture' });
  const scoped = connection({ headers: { Authorization: 'env:HEADER_TOKEN', 'X-Api-Key': 'env:HEADER_TOKEN', 'X-Goog-Api-Key': 'env:HEADER_TOKEN' } });
  assert.deepEqual(providers.resolveProviderRequestHeaders(scoped, 'gemini', ENV.FIXTURE_KEY, ENV), { 'x-goog-api-key': ENV.HEADER_TOKEN });
  const prototypeNames = JSON.parse('{"__proto__":"fixture","constructor":"fixture","tostring":"fixture"}');
  assert.deepEqual(providers.resolveProviderRequestHeaders(connection({ authMode: 'none', headers: prototypeNames }), 'claude', '', {}), prototypeNames);
});

test('invalid, unsafe, plaintext-auth, and authMode none custom auth headers fail validation', () => {
  for (const headers of [null, [], 'bad', { Host: 'evil.invalid' }, { Connection: 'close' },
    { 'Keep-Alive': 'x' }, { 'Content-Length': '8' }, { 'Transfer-Encoding': 'chunked' },
    { TE: 'trailers' }, { Trailer: 'X-Secret' }, { Upgrade: 'websocket' }, { Cookie: 'x' },
    { 'Set-Cookie': 'x' }, { 'Proxy-Authorization': 'env:HEADER_TOKEN' },
    { Cookie2: 'x' }, { 'Set-Cookie2': 'x' }, { 'Http2-Settings': 'x' },
    { Forwarded: 'x' }, { Via: 'x' }, { 'X-Real-Ip': 'x' }, { Origin: 'x' }, { Referer: 'x' },
    { 'Proxy-Connection': 'x' }, { 'Proxy-Authenticate': 'x' }, { 'Proxy-Test': 'x' },
    { 'Sec-Test': 'x' }, { 'X-Forwarded-Test': 'x' },
    { 'Content-Type': 'text/plain' }, { Accept: 'text/plain' }, { 'Accept-Encoding': 'gzip' },
    { 'Content-Encoding': 'gzip' }, { Expect: '100-continue' },
    { 'Bad Header': 'x' }, { 'X-Test': 'line\nbreak' }, { 'X-Test': 42 },
    { 'X-Test': 'env:BAD-NAME' }, { 'X-Test': 'a', 'x-test': 'b' },
    { 'X-Test': 'ENV:HEADER_TOKEN' }, { 'X-Test': ' env:HEADER_TOKEN' }, { 'X-Test': 'env:HEADER_TOKEN ' },
    { Authorization: 'Bearer fake-plaintext' }, { 'X-Api-Key': 'fake-plaintext' },
    { 'X-Goog-Api-Key': 'fake-plaintext' }, { 'Api-Key': 'fake-plaintext' }, { 'X-Auth-Token': 'fake-plaintext' }]) {
    assert.equal(providers.validateProvider(connection({ headers })).ok, false, JSON.stringify(headers));
  }
  for (const name of ['Authorization', 'X-Api-Key', 'X-Goog-Api-Key', 'X-Auth-Token']) {
    assert.equal(providers.validateProvider(connection({ authMode: 'none', headers: { [name]: 'env:HEADER_TOKEN' } })).ok, false);
  }
});

test('authMode none rejects every env-backed custom header before any consumer fetch', async () => {
  for (const name of ['X-Tenant', 'X-App', 'Authorization', 'X-Auth-Token']) {
    const provider = connection({ protocols: ['claude'], authMode: 'none', headers: { [name]: 'env:HEADER_TOKEN' } });
    assert.equal(providers.validateProvider(provider).ok, false, name);
    assert.throws(() => providers.resolveProviderRequestHeaders(provider, 'claude', '', ENV), providers.ProviderConfigError);
    const registry = registryFor(provider, 'claude');
    let calls = 0;
    const fetchImpl = async () => { calls++; return Response.json({}); };
    await assert.rejects(discoverProviderModels(provider, { env: ENV, fetchImpl }), providers.ProviderConfigError);
    assert.equal(await classifyTurnIntent({ registry, env: ENV, fetchImpl }), null);
    const { app } = createRoutingGatewayApp({ registry, env: ENV, fetchImpl });
    assert.equal((await app.request('/v1/messages', incoming())).status, 503);
    assert.equal(calls, 0);
  }
});

test('header values and credentials require printable ASCII, including supplementary Unicode rejection', () => {
  for (const value of ['bad\tvalue', '\u007f', '\u0085', '\u00e9', '\u{1f600}', '\ud800']) {
    assert.equal(providers.validateProvider(connection({ headers: { 'X-Tenant': value } })).ok, false);
    assert.throws(() => providers.resolveProviderRequestHeaders(connection({ headers: { 'X-Tenant': 'env:TENANT' } }), 'claude', ENV.FIXTURE_KEY, { ...ENV, TENANT: value }), providers.ProviderConfigError);
    assert.throws(() => providers.resolveProviderRequestHeaders(connection(), 'claude', value, ENV), providers.ProviderConfigError);
  }
});

test('Claude auth choices and explicit anonymous custom headers agree in all three consumers', async () => {
  for (const [patch, auth] of [
    [{}, { 'x-api-key': ENV.FIXTURE_KEY, 'anthropic-version': '2023-06-01' }],
    [{ authHeader: 'x-api-key' }, { 'x-api-key': ENV.FIXTURE_KEY, 'anthropic-version': '2023-06-01' }],
    [{ authHeader: 'bearer' }, { authorization: `Bearer ${ENV.FIXTURE_KEY}`, 'anthropic-version': '2023-06-01' }],
    [{ authHeader: 'both' }, { 'x-api-key': ENV.FIXTURE_KEY, authorization: `Bearer ${ENV.FIXTURE_KEY}`, 'anthropic-version': '2023-06-01' }],
    [{ authMode: 'none' }, {}],
  ]) {
    const provider = connection({ protocols: ['claude'], headers: { 'X-Tenant': patch.authMode === 'none' ? ENV.TENANT : 'env:TENANT' }, ...patch });
    const registry = registryFor(provider, 'claude');
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, headers: headersOf(init.headers) });
      return Response.json({ data: [], content: [{ type: 'text', text: '{"intent":"work"}' }] });
    };
    await discoverProviderModels(provider, { env: ENV, fetchImpl });
    assert.equal((await classifyTurnIntent({ registry, env: ENV, fetchImpl }))?.intentId, 'work');
    const { app } = createRoutingGatewayApp({ registry, env: ENV, fetchImpl });
    assert.equal((await app.request('/v1/messages', incoming())).status, 200);
    assert.deepEqual(calls.map(({ headers }) => {
      const { 'content-type': ignored, ...rest } = headers;
      return rest;
    }), Array.from({ length: 3 }, () => ({ ...auth, 'x-tenant': ENV.TENANT })));
  }
});

test('discovery uses each API base, auth mode, and custom headers with fake fetch only', async () => {
  const calls = [];
  const result = await discoverProviderModels(connection({ authHeader: 'bearer', headers: { 'X-Tenant': 'env:TENANT' } }), {
    env: ENV, fetchImpl: async (url, init) => {
      calls.push({ url, headers: headersOf(init.headers) });
      return Response.json(url.includes('gemini.invalid') ? { models: [{ name: 'models/shared' }] } : { data: [{ id: 'shared' }] });
    },
  });
  assert.deepEqual(calls.map((call) => call.url), [BASES['openai-chat'] + '/models', BASES['openai-response'] + '/models', BASES.claude + '/v1/models', BASES.gemini + '/models']);
  assert.deepEqual(calls.map((call) => call.headers), [
    { authorization: 'Bearer fake-primary-key', 'x-tenant': ENV.TENANT },
    { authorization: 'Bearer fake-primary-key', 'x-tenant': ENV.TENANT },
    { authorization: 'Bearer fake-primary-key', 'anthropic-version': '2023-06-01', 'x-tenant': ENV.TENANT },
    { 'x-goog-api-key': ENV.FIXTURE_KEY, 'x-tenant': ENV.TENANT },
  ]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.models[0].protocols, PROTOCOLS);
  assert.equal(JSON.stringify(result).includes(ENV.FIXTURE_KEY), false);
});

test('classifier and actual gateway forwarding share provider-aware headers and per-API URLs', async () => {
  for (const protocol of ['claude', 'openai-chat']) {
    const provider = connection({ protocols: [protocol], authHeader: 'bearer', headers: { 'X-Tenant': 'env:TENANT', Authorization: 'env:HEADER_TOKEN' } });
    const registry = registryFor(provider, protocol);
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, headers: headersOf(init.headers), body: JSON.parse(typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body)) });
      return Response.json(protocol === 'claude' ? { content: [{ type: 'text', text: '{"intent":"work"}' }] } : { choices: [{ message: { role: 'assistant', content: '{"intent":"work"}' }, finish_reason: 'stop' }] });
    };
    assert.equal((await classifyTurnIntent({ registry, userText: 'hello', env: ENV, fetchImpl }))?.intentId, 'work');
    const { app, decisions } = createRoutingGatewayApp({ registry, env: ENV, fetchImpl, masking: false });
    assert.equal((await app.request('/v1/messages', incoming())).status, 200);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, BASES[protocol] + (protocol === 'claude' ? '/v1/messages' : '/chat/completions'));
    assert.equal(calls[1].url, calls[0].url);
    assert.deepEqual(calls[0].headers, calls[1].headers);
    assert.equal(calls[0].headers.authorization, ENV.HEADER_TOKEN);
    assert.equal(calls[0].headers['x-tenant'], ENV.TENANT);
    assert.equal(calls[0].headers['x-api-key'], undefined);
    assert.equal(calls[1].body.model, 'Vendor-Model');
    assert.equal(JSON.stringify(decisions).includes(ENV.HEADER_TOKEN), false);
  }
});

test('Responses forwarding uses its own host and SDK path', async () => {
  const calls = [];
  const { app } = createRoutingGatewayApp({ registry: registryFor(connection(), 'openai-response'), env: ENV, fetchImpl: async (url, init) => { calls.push({ url, headers: headersOf(init.headers) }); return Response.json({ output: [] }); } });
  const response = await app.request('/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: 'hello' }) });
  assert.equal(response.status, 200);
  assert.equal(calls[0].url, BASES['openai-response'] + '/responses');
  assert.equal(calls[0].headers.authorization, 'Bearer fake-primary-key');
  assert.equal(calls[0].headers['x-api-key'], undefined);
});

test('Gemini bases preserve model namespaces, escape each segment, and remove model from body', async () => {
  for (const provider of [
    connection({ protocols: ['gemini'] }),
    { id: 'vendor', baseUrl: BASES.gemini, endpointStyle: 'standard', protocols: ['gemini'], apiKeyEnv: 'env:FIXTURE_KEY' },
  ]) {
    for (const [model, path] of [
      ['models/example/model-demo', 'example/model-demo'],
      ['example/model-demo', 'example/model-demo'],
      ['models/Vendor/Model ?#', 'Vendor/Model%20%3F%23'],
      ['Vendor/%2e%2e', 'Vendor/%252e%252e'],
    ]) {
      const registry = registryFor(provider, 'gemini', model);
      const route = resolveGatewayRoute({ registry, env: ENV });
      assert.equal(route.endpoint, `${BASES.gemini}/models/${path}:generateContent`);
      assert.equal(new URL(route.endpoint).pathname, `/google/v1beta/models/${path}:generateContent`);
      let captured;
      const { app } = createRoutingGatewayApp({ registry, env: ENV, fetchImpl: async (url, init) => {
        captured = { url, headers: headersOf(init.headers), body: JSON.parse(new TextDecoder().decode(init.body)) };
        return Response.json({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
      } });
      assert.equal((await app.request('/v1/messages', incoming())).status, 200);
      assert.equal(captured.url, route.endpoint);
      assert.equal(captured.body.model, undefined);
      assert.equal(captured.headers['x-goog-api-key'], ENV.FIXTURE_KEY);
      assert.equal(captured.headers.authorization, undefined);
    }
  }
});

test('unsafe Gemini namespace segments are rejected before forwarding', async () => {
  for (const model of ['../other', 'vendor//model', 'vendor/./model', 'vendor/../model', '/absolute', 'vendor/', 'models/..', 'models/', 'vendor/\ud800']) {
    const registry = registryFor(connection({ protocols: ['gemini'] }), 'gemini', model);
    assert.throws(() => resolveGatewayRoute({ registry, env: ENV }), /Invalid Gemini model path/u);
    let calls = 0;
    const { app } = createRoutingGatewayApp({ registry, env: ENV, fetchImpl: async () => { calls++; return Response.json({}); } });
    assert.equal((await app.request('/v1/messages', incoming())).status, 503);
    assert.equal(calls, 0);
  }
});

test('missing or invalid custom env headers fail closed before discovery, classifier, or forwarding fetch', async () => {
  for (const patch of [
    { headers: { Authorization: 'env:MISSING_HEADER' } },
    { headers: { 'X-Tenant': 'env:MISSING_HEADER' } },
    { headers: { 'X-Tenant': 'env:HEADER_TOKEN' } },
    { headers: { Authorization: 'plaintext' } },
    { headers: { Host: 'wrong.invalid' } },
    { protocolBaseUrls: { claude: 'https://user:pass@invalid.test/api' } },
    { protocolBaseUrls: { claude: 'https://invalid.test/api/v1/messages?key=fake' } },
    { protocolBaseUrls: {} },
  ]) {
    const provider = connection({ protocols: ['claude'], ...patch });
    const registry = registryFor(provider, 'claude');
    let calls = 0;
    const env = { FIXTURE_KEY: ENV.FIXTURE_KEY, HEADER_TOKEN: 'bad\nvalue' };
    const fetchImpl = async () => { calls++; return Response.json({}); };
    await assert.rejects(discoverProviderModels(provider, { env, fetchImpl }), providers.ProviderConfigError);
    assert.equal(await classifyTurnIntent({ registry, env, fetchImpl }), null);
    const { app } = createRoutingGatewayApp({ registry, env, fetchImpl });
    const response = await app.request('/v1/messages', incoming());
    assert.equal(response.status, 503);
    assert.equal(calls, 0);
  }
});

test('explicit connections preserve account readiness, credential precedence, and retry order', async () => {
  const provider = connection({ protocols: ['claude'], accounts: [
    { id: 'missing', apiKeyEnv: 'env:ABSENT' },
    { id: 'first', apiKeyEnv: 'env:FIRST' },
    { id: 'second', apiKeyEnv: 'env:SECOND' },
    { id: 'inherited' },
  ] });
  const env = { ...ENV, FIRST: 'fake-first', SECOND: 'fake-second' };
  const calls = [];
  const { app } = createRoutingGatewayApp({ registry: registryFor(provider, 'claude'), env,
    fetchImpl: async (_url, init) => {
      calls.push(headersOf(init.headers)['x-api-key']);
      return Response.json({ content: [] }, { status: [401, 429, 200][calls.length - 1] });
    },
  });
  assert.equal((await app.request('/v1/messages', incoming())).status, 200);
  assert.deepEqual(calls, ['fake-first', 'fake-second', ENV.FIXTURE_KEY]);
});
