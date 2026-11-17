import test from 'node:test';
import assert from 'node:assert/strict';
import { registry, intake, success, request, appFor, jsonBody } from './fixtures.mjs';

test('catalog variants expose encoded selections, omit unavailable entries, and never fetch upstream', async () => {
  const document = registry();
  document.models['Case/ID %'] = { ...document.models.m1, name: 'Case-sensitive model' };
  document.models.hidden = { ...document.models.m1, enabled: false };
  document.models.unbound = { protocols: ['claude'] };
  document.providers.p2.authMode = 'required';
  document.providers.p2.apiKeyEnv = 'env:SECRET_NAME';
  document.routingGroups['Case/Group %'] = { models: ['Case/ID %'], name: 'Case-sensitive group' };
  document.routingGroups.invalid = { models: ['m1'], routing: 'weighted' };
  document.routingGroups.disabled = { models: ['m1'], enabled: false };
  document.routingGroups.missing = { models: ['m2'] };
  let calls = 0;
  const { app } = appFor(async () => { calls++; throw new Error('catalog must be local'); }, { registry: document, env: {} });
  const ids = ['aios-auto', 'aios/model/m1', 'aios/model/Case%2FID%20%25', 'aios/group/pair', 'aios/group/Case%2FGroup%20%25'];
  for (const path of ['/v1/models', '/models', '/claude/v1/models', '/claude/models', '/clients/claude/v1/models', '/clients/codex/v1/models', '/clients/pi/v1/models']) {
    const response = await app.request(path);
    assert.equal(response.status, 200, path);
    const body = await response.json();
    assert.deepEqual(body.data.map((entry) => entry.id), ids, path);
    assert.doesNotMatch(JSON.stringify(body), /127\.0\.0\.1|SECRET_NAME|apiKey|Real-1|baseUrl/);
  }
  const claude = await (await app.request('/clients/claude/v1/models')).json();
  assert.equal(claude.has_more, false);
  assert.equal(claude.first_id, 'aios-auto');
  assert.equal(claude.data[0].type, 'model');
  const codex = await (await app.request('/clients/codex/v1/models')).json();
  assert.equal(codex.object, 'list');
  assert.equal(calls, 0);
});

test('catalog detail routes accept raw wire selectors and fully URL-encoded IDs', async () => {
  const document = registry();
  document.models['A/B'] = { ...document.models.m1 };
  const { app } = appFor(async () => success(), { registry: document });
  for (const prefix of ['/v1/models', '/models', '/claude/v1/models', '/claude/models', '/clients/claude/v1/models']) {
    for (const id of ['aios/model/A%2FB', encodeURIComponent('aios/model/A%2FB')]) {
      const response = await app.request(`${prefix}/${id}`);
      assert.equal(response.status, 200, `${prefix}/${id}`);
      assert.equal((await response.json()).id, 'aios/model/A%2FB');
    }
    assert.equal((await app.request(`${prefix}/aios-auto`)).status, 200);
    assert.equal((await app.request(`${prefix}/aios/model/missing`)).status, 404);
  }
});

test('catalogs block browser-origin requests and conflicting client identities', async () => {
  const { app } = appFor(async () => success());
  for (const headers of [{ origin: 'https://evil.invalid' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await app.request('/v1/models', { headers })).status, 403);
  }
  for (const [path, headers] of [
    ['/v1/models', { 'x-aios-client': 'unknown' }],
    ['/clients/codex/v1/models', { 'x-gateway-client': 'claude' }],
    ['/v1/models', { 'x-aios-client': 'pi', 'x-gateway-client': 'codex' }],
    ['/clients/unknown/v1/models', {}],
  ]) assert.equal((await app.request(path, { headers })).status, 400, path);
});

test('client prefixes and aliases preserve canonical client, role, and session identity', async () => {
  const document = registry();
  document.activeModel = 'model:m1';
  document.clientDefaults = { claude: 'model:m2', codex: 'model:m2', pi: 'model:m2' };
  document.clientRoleMatrix = { clients: { claude: { reviewer: 'model:m1' } } };
  const calls = [];
  const { app, decisions } = appFor(async (_url, init) => { calls.push(jsonBody(init)); return success(); }, { registry: document });
  for (const client of ['claude', 'codex', 'pi']) {
    assert.equal((await request(app, intake({ model: 'ordinary' }), {}, `/clients/${client}/v1/messages`)).status, 200);
    assert.equal(decisions.at(-1).clientId, client);
    assert.equal(decisions.at(-1).modelId, 'm2');
    assert.equal((await request(app, intake({ model: 'ordinary' }), { 'x-aios-client': client })).status, 200);
    assert.equal(decisions.at(-1).clientId, client);
  }
  assert.equal((await request(app, intake({ model: 'ordinary' }), { 'x-gateway-client': 'claude', 'x-gateway-role': 'reviewer' })).status, 200);
  assert.equal(decisions.at(-1).role, 'reviewer');
  assert.equal(decisions.at(-1).modelId, 'm1');
  assert.equal(calls.length, 7);
});

test('body and target headers select identically and conflicts fail before upstream or classification', async () => {
  let calls = 0;
  let classifications = 0;
  const document = registry();
  document.intentRouting = { enabled: true, classifierModel: 'm1', intents: [{ id: 'review', modelId: 'model:m1' }] };
  const { app } = appFor(async () => { calls++; return success(); }, { registry: document, classifyIntent: async () => { classifications++; return { intentId: 'review', modelId: 'model:m1' }; } });
  for (const headers of [{ 'x-gateway-target': 'aios/model/m2' }, { 'x-aios-target': 'aios/model/m2' }, { 'x-gateway-target': 'aios/model/m2', 'x-aios-target': 'aios/model/m2' }]) {
    assert.equal((await request(app, intake({ model: 'ordinary' }), headers)).status, 200);
  }
  for (const [model, headers] of [
    ['aios/model/m1', { 'x-aios-target': 'aios/model/m2' }],
    ['aios-auto', { 'x-gateway-target': 'aios/model/m1' }],
    ['ordinary', { 'x-aios-target': 'aios/model/missing' }],
    ['ordinary', { 'x-gateway-target': 'ordinary' }],
    ['aios/nonsense/x', {}],
  ]) assert.equal((await request(app, intake({ model }), headers)).status, 400);
  assert.equal(calls, 3);
  assert.equal(classifications, 0);
});

test('Gemini path selectors agree with body and headers under client prefixes', async () => {
  const document = registry(['gemini', 'gemini']);
  const calls = [];
  const { app } = appFor(async (url, init) => { calls.push([url, jsonBody(init)]); return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] }); }, { registry: document });
  const body = { model: 'aios/model/m2', contents: [{ role: 'user', parts: [{ text: 'hello' }] }] };
  assert.equal((await request(app, body, { 'x-aios-target': 'aios/model/m2' }, '/clients/pi/v1beta/models/aios/model/m2:generateContent')).status, 200);
  assert.match(calls[0][0], /19002\/v1beta\/models\/Real-2:generateContent$/);
  assert.equal(calls[0][1].model, undefined);
  assert.equal((await request(app, body, {}, '/v1beta/models/aios/model/m1:generateContent')).status, 400);
  assert.equal((await request(app, { ...body, model: 'placeholder' }, {}, '/v1/models/aios/nonsense/x:generateContent')).status, 400);
  assert.equal(calls.length, 1);
});
