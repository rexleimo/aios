import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutingGatewayApp } from '../../../../lib/tooling/model-router/gateway/compatibility/proxy.mjs';
import { createGatewayApp } from '../../../../lib/tooling/model-router/gateway/app.mjs';

const model = (provider = 'local', upstreamModel = 'Real-Model') => ({ source: 'custom', provider, upstreamModel, protocols: ['claude'] });
const provider = (extra = {}) => ({ baseUrl: 'http://127.0.0.1:19001', protocols: ['claude'], authMode: 'none', ...extra });
const intentRouting = { enabled: true, classifierModel: 'classifier', intents: [{ id: 'general', description: 'General tasks', modelId: 'only' }] };
const request = (app, body = {}) => app.request('/v1/messages', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'client-alias', messages: [{ role: 'user', content: 'hello' }], ...body }),
});

for (const [name, registry] of Object.entries({
  empty: {},
  templates: { activeModel: 'only', models: { only: { protocols: ['claude'], provider: 'claude' } }, intentRouting },
  'protocol-only provider': { activeModel: 'only', models: { only: { protocols: ['claude'] } }, providers: { local: provider() }, intentRouting },
  'missing credentials': { activeModel: 'only', models: { only: model() }, providers: { local: provider({ authMode: 'required', apiKeyEnv: 'env:MISSING' }) }, intentRouting },
  'unknown model': { activeModel: 'missing', models: {}, providers: { local: provider({ models: ['missing'] }) }, intentRouting },
  'disabled model': { activeModel: 'only', models: { only: { ...model(), enabled: false } }, providers: { local: provider() }, intentRouting },
  'disabled provider': { activeModel: 'only', models: { only: model() }, providers: { local: provider({ enabled: false }) }, intentRouting },
})) {
  test(`${name} rejects locally before classifier or upstream`, async () => {
    let calls = 0;
    const { app, decisions } = createRoutingGatewayApp({ registry, env: {},
      classifyIntent: async () => { calls++; return null; },
      fetchImpl: async () => { calls++; return new Response('{}'); },
    });
    const res = await request(app);
    assert.equal(res.status, 503);
    assert.match((await res.json()).error.code, /NO_ROUTE_CONFIGURED|CREDENTIALS|PROVIDER/);
    assert.equal(calls, 0);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].status, 503);
  });
}

test('one explicit model routes directly without defaults or classification and preserves real ID', async () => {
  const calls = [];
  const { app, decisions } = createRoutingGatewayApp({
    registry: { models: { only: model() }, providers: { local: provider() }, intentRouting }, env: {},
    classifyIntent: async () => { throw new Error('single model must not classify'); },
    fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(new TextDecoder().decode(init.body)), headers: init.headers }); return new Response('{}'); },
  });
  const res = await request(app);
  assert.equal(res.status, 200);
  await res.text();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, 'Real-Model');
  assert.equal(calls[0].headers.authorization, undefined);
  assert.equal(decisions[0].modelId, 'only');
  assert.equal(decisions[0].upstreamModel, 'Real-Model');
});

test('missing account credentials are skipped; only a ready account sends authentication', async () => {
  const headers = [];
  const { app } = createRoutingGatewayApp({ registry: { models: { only: model() }, providers: { local: provider({ authMode: 'required', accounts: [{ id: 'missing', apiKeyEnv: 'env:ABSENT' }, { id: 'ready', apiKeyEnv: 'env:READY' }] }) } }, env: { READY: 'test-secret' },
    fetchImpl: async (_url, init) => { headers.push(init.headers); return new Response('{}'); },
  });
  const res = await request(app);
  assert.equal(res.status, 200);
  await res.text();
  assert.equal(headers.length, 1);
  assert.equal(headers[0]['x-api-key'], 'test-secret');
});

test('multiple models without a configured route do not guess or classify', async () => {
  let calls = 0;
  const { app } = createRoutingGatewayApp({ registry: { models: { first: model(), second: model() }, providers: { local: provider() } }, env: {},
    fetchImpl: async () => { calls++; return new Response('{}'); },
    classifyIntent: async () => { calls++; return null; },
  });
  assert.equal((await request(app)).status, 503);
  assert.equal(calls, 0);
});

test('invalid JSON is rejected rather than forwarding the original unvalidated body', async () => {
  let calls = 0;
  const { app } = createRoutingGatewayApp({ registry: { models: { only: model() }, providers: { local: provider() } }, env: {}, fetchImpl: async () => { calls++; return new Response('{}'); } });
  const res = await app.request('/v1/messages', { method: 'POST', body: 'not-json' });
  assert.equal(res.status, 400);
  assert.equal(calls, 0);
});

test('health distinguishes a running process from route readiness without network probes', async () => {
  const { app } = createRoutingGatewayApp({ registry: {}, env: {}, fetchImpl: async () => { throw new Error('health must be local'); } });
  const health = await (await app.request('/health')).json();
  assert.equal(health.ok, true);
  assert.equal(health.ready, false);
  assert.equal(health.code, 'NO_ROUTE_CONFIGURED');
});

test('passthrough mode also has no hidden default upstream', async () => {
  let calls = 0;
  const { app } = createGatewayApp({ fetchImpl: async () => { calls++; return new Response('{}'); } });
  assert.equal((await request(app)).status, 503);
  assert.equal(calls, 0);
});

test('an explicit intent-only policy qualifies all targets before classifying', async () => {
  const calls = [];
  const registry = { models: { only: model(), classifier: model() }, providers: { local: provider() }, intentRouting };
  const { app } = createRoutingGatewayApp({ registry, env: {},
    classifyIntent: async () => { calls.push('classifier'); return { intentId: 'general', modelId: 'only' }; },
    fetchImpl: async () => { calls.push('upstream'); return new Response('{}'); },
  });
  assert.equal((await (await app.request('/health')).json()).ready, true);
  assert.deepEqual(calls, []);
  assert.equal((await request(app)).status, 200);
  assert.deepEqual(calls, ['classifier', 'upstream']);
});

for (const target of ['missing', 'disabled']) {
  test(`an invalid ${target} intent target cannot become a paid fallback classification`, async () => {
    let classified = 0;
    let upstream = 0;
    const registry = { activeModel: 'only', models: { only: model(), classifier: model(), disabled: { ...model(), enabled: false } }, providers: { local: provider() },
      intentRouting: { ...intentRouting, intents: [{ id: 'general', description: 'General', modelId: target }] } };
    const { app } = createRoutingGatewayApp({ registry, env: {},
      classifyIntent: async () => { classified++; return null; },
      fetchImpl: async () => { upstream++; return new Response('{}'); },
    });
    assert.equal((await request(app)).status, 200);
    assert.equal(classified, 0);
    assert.equal(upstream, 1);
  });
}

test('a selected route missing credentials is rejected before a ready classifier', async () => {
  let calls = 0;
  const registry = { activeModel: 'only', models: { only: model('private'), classifier: model() },
    providers: { local: provider(), private: provider({ authMode: 'required', apiKeyEnv: 'env:ABSENT' }) },
    intentRouting: { ...intentRouting, intents: [{ id: 'general', modelId: 'classifier', description: 'General' }] } };
  const { app } = createRoutingGatewayApp({ registry, env: {}, classifyIntent: async () => { calls++; return null; }, fetchImpl: async () => { calls++; return new Response('{}'); } });
  assert.equal((await request(app)).status, 503);
  assert.equal(calls, 0);
});

test('health requires policy for multiple models but recognizes a single Responses intake', async () => {
  const multiple = createRoutingGatewayApp({ registry: { models: { a: model(), b: model() }, providers: { local: provider() } }, env: {} });
  assert.equal((await (await multiple.app.request('/health')).json()).ready, false);
  const responses = createRoutingGatewayApp({ registry: { models: { only: { ...model(), protocols: ['openai-response'] } }, providers: { local: provider({ protocols: ['openai-response'] }) } }, env: {} });
  assert.equal((await (await responses.app.request('/health')).json()).ready, true);
});

test('standard Gemini uses the exact real model in its URL, not an invalid model body field', async () => {
  const calls = [];
  const { app } = createRoutingGatewayApp({ registry: { models: { only: { ...model('local', 'Gemini-Real'), protocols: ['gemini'] } },
    providers: { local: provider({ baseUrl: 'https://example.invalid/v1beta', endpointStyle: 'standard', protocols: ['gemini'] }) } }, env: {},
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(new TextDecoder().decode(init.body)) });
      const json = { candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] };
      return url.includes(':streamGenerateContent')
        ? new Response(`data: ${JSON.stringify(json)}\n\n`, { headers: { 'content-type': 'text/event-stream' } })
        : Response.json(json);
    },
  });
  assert.equal((await request(app)).status, 200);
  assert.equal(calls[0].url, 'https://example.invalid/v1beta/models/Gemini-Real:generateContent');
  assert.equal(calls[0].body.model, undefined);
  assert.equal(calls[0].body.contents[0].parts[0].text, 'hello');
  const streamed = await request(app, { stream: true });
  assert.equal(streamed.status, 200);
  assert.match(await streamed.text(), /event: message_stop/);
  assert.equal(calls[1].url, 'https://example.invalid/v1beta/models/Gemini-Real:streamGenerateContent?alt=sse');
  assert.equal(calls[1].body.stream, undefined);
  assert.equal(calls[1].body.model, undefined);
  assert.equal(calls.length, 2);
});
