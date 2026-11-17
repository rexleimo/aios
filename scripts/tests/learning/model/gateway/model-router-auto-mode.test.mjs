import test from 'node:test';
import assert from 'node:assert/strict';

import { createRoutingGatewayApp } from '../../../../lib/tooling/model-router/gateway/compatibility/proxy.mjs';
import {
  getIntentRouting,
  buildIntentClassifierPrompt,
  parseIntentLabel,
  applyConfidenceTier,
} from '../../../../lib/tooling/model-router/routing/intent.mjs';
import {
  orderedGroupMembers,
  selectGroupMember,
  GROUP_ROUTING_MODES,
} from '../../../../lib/tooling/model-router/routing/groups.mjs';

const intents = [
  { id: 'quick', description: 'a quick question', modelId: 'cheap', confidence: undefined },
  { id: 'tests', description: 'writing tests', modelId: 'strong', confidence: undefined },
];

test('getIntentRouting normalizes an optional confidence threshold; invalid values are ignored', () => {
  const base = { enabled: true, classifierModel: 'cheap', intents: [{ id: 'quick', description: 'q', modelId: 'cheap' }] };
  assert.equal(getIntentRouting({ intentRouting: { ...base, confidenceThreshold: 0.7 } }).confidenceThreshold, 0.7);
  assert.equal(getIntentRouting({ intentRouting: { ...base, confidenceThreshold: 0 } }).confidenceThreshold, 0);
  for (const bad of [1.5, -0.1, 'high', NaN, null]) {
    assert.equal(getIntentRouting({ intentRouting: { ...base, confidenceThreshold: bad } }).confidenceThreshold, undefined);
  }
  assert.equal(getIntentRouting({ intentRouting: base }).confidenceThreshold, undefined);
});

test('classifier prompt asks for a typed confidence when gating is enabled', () => {
  const withGate = buildIntentClassifierPrompt(intents, 'hello', { confidenceThreshold: 0.7 });
  assert.match(withGate, /confidence/u);
  assert.match(withGate, /0\.\.1/u);
  const plain = buildIntentClassifierPrompt(intents, 'hello');
  assert.doesNotMatch(plain, /confidence/u);
});

test('parseIntentLabel validates self-reported confidence fail-closed', () => {
  const high = parseIntentLabel('{"intent":"tests","confidence":0.9}', intents);
  assert.equal(high.intentId, 'tests');
  assert.equal(high.confidence, 0.9);
  const legacy = parseIntentLabel('{"intent":"tests"}', intents);
  assert.equal(legacy.intentId, 'tests');
  assert.equal(legacy.confidence, undefined);
  for (const bad of ['{"intent":"tests","confidence":2}', '{"intent":"tests","confidence":"high"}', '{"intent":"tests","confidence":null}']) {
    assert.equal(parseIntentLabel(bad, intents), null);
  }
});

test('applyConfidenceTier gates only when a threshold is configured', () => {
  const classified = { intentId: 'tests', modelId: 'strong', confidence: 0.9 };
  assert.deepEqual(applyConfidenceTier(classified, undefined), classified, 'no threshold preserves legacy behavior');
  assert.deepEqual(applyConfidenceTier(classified, 0.7), classified, 'high confidence acts');
  assert.equal(applyConfidenceTier({ ...classified, confidence: 0.4 }, 0.7), null, 'low confidence falls back');
  assert.equal(applyConfidenceTier({ intentId: 'tests', modelId: 'strong' }, 0.7), null, 'unknown confidence falls back');
  assert.deepEqual(applyConfidenceTier({ ...classified, confidence: 0.7 }, 0.7), { ...classified, confidence: 0.7 }, 'threshold is inclusive');
});

const registry = () => ({
  activeModel: 'cheap',
  models: {
    cheap: { protocols: ['claude'] },
    strong: { protocols: ['claude'] },
  },
  providers: {
    p: { baseUrl: 'https://example.invalid', apiKeyEnv: 'env:K', protocols: ['claude'], models: ['cheap', 'strong'] },
  },
  clientDefaults: { claude: 'cheap' },
  intentRouting: {
    enabled: true,
    classifierModel: 'cheap',
    confidenceThreshold: 0.7,
    intents: [{ id: 'tests', description: 'writing tests', modelId: 'strong' }],
  },
});

const claudeSuccess = () => new Response(JSON.stringify({
  id: '1', type: 'message', role: 'assistant', model: 'strong',
  content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
}), { status: 200, headers: { 'content-type': 'application/json' } });
const userBody = (text) => ({ model: 'cheap', max_tokens: 100, messages: [{ role: 'user', content: text }] });

for (const [label, confidence, expected] of [
  ['high', 0.9, 'strong'],
  ['low', 0.3, 'cheap'],
  ['unknown', undefined, 'cheap'],
]) {
  test(`gateway confidence tier (${label}) routes ${expected} and records confidence`, async () => {
    let captured;
    const fetchImpl = async (_url, init) => { captured = { body: JSON.parse(new TextDecoder().decode(init.body)) }; return claudeSuccess(); };
    const classifyIntent = async () => ({ intentId: 'tests', modelId: 'strong', confidence });
    const { app, decisions } = createRoutingGatewayApp({ registry: registry(), clientId: 'claude', env: { K: 'k' }, clientProtocol: 'claude', fetchImpl, classifyIntent });
    const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(userBody('write tests')) });
    assert.equal(res.status, 200);
    await res.json();
    assert.equal(captured.body.model, expected);
    assert.equal(decisions[0].modelId, expected);
    // Confidence is recorded only when the intent actually routed (high tier).
    if (label === 'high') assert.equal(decisions[0].confidence, confidence);
    else assert.equal(decisions[0].confidence, undefined);
  });
}

test('real classifier self-report with confidence flows through parseIntentLabel', async () => {
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body));
    if (body.messages?.[0]?.content?.includes('routing classifier')) {
      // classifierModel "cheap" speaks claude protocol → response text is in content[].text
      return Response.json({ content: [{ type: 'text', text: '{"intent":"tests","confidence":0.88}' }] });
    }
    return claudeSuccess();
  };
  const { app, decisions } = createRoutingGatewayApp({ registry: registry(), clientId: 'claude', env: { K: 'k' }, clientProtocol: 'claude', fetchImpl });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(userBody('write tests')) });
  assert.equal(res.status, 200);
  await res.json();
  assert.equal(decisions[0].modelId, 'strong');
  assert.equal(decisions[0].confidence, 0.88);
});

test('gateway rotate group round-robins across requests but keeps a session on one member', async () => {
  const groupRegistry = () => ({
    targetRefVersion: 1,
    activeModel: 'group:g',
    models: { a: { protocols: ['claude'] }, b: { protocols: ['claude'] } },
    providers: { p: { baseUrl: 'https://example.invalid', apiKeyEnv: 'env:K', protocols: ['claude'], models: ['a', 'b'] } },
    routingGroups: { g: { id: 'g', models: ['a', 'b'], routing: 'rotate' } },
    clientDefaults: { claude: 'group:g' },
  });
  const models = [];
  const fetchImpl = async (_url, init) => {
    models.push(JSON.parse(new TextDecoder().decode(init.body)).model);
    return claudeSuccess();
  };
  const { app } = createRoutingGatewayApp({ registry: groupRegistry(), clientId: 'claude', env: { K: 'k' }, clientProtocol: 'claude', fetchImpl });
  const send = (session) => app.request('/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(session ? { 'x-gateway-session': session } : {}) },
    body: JSON.stringify(userBody('hi')),
  });
  for (const res of [await send(), await send(), await send()]) { assert.equal(res.status, 200); await res.text(); }
  assert.deepEqual(models, ['a', 'b', 'a'], 'rotate round-robins on fresh requests');

  models.length = 0;
  const { app: app2 } = createRoutingGatewayApp({ registry: groupRegistry(), clientId: 'claude', env: { K: 'k' }, clientProtocol: 'claude', fetchImpl });
  const send2 = () => app2.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-gateway-session': 'sess-rotate' }, body: JSON.stringify(userBody('hi')) });
  for (const res of [await send2(), await send2()]) { assert.equal(res.status, 200); await res.text(); }
  assert.deepEqual(models, ['a', 'a'], 'a pinned session stays on its first member');
});

test('routing groups accept rotate and usage modes with a pure member selector', () => {
  const reg = {
    models: { a: { protocols: ['claude'] }, b: { protocols: ['claude'] } },
    routingGroups: { g: { id: 'g', models: ['a', 'b'], routing: 'rotate' } },
  };
  assert.ok(GROUP_ROUTING_MODES.has('rotate'));
  assert.ok(GROUP_ROUTING_MODES.has('usage'));
  assert.deepEqual(orderedGroupMembers(reg, 'g'), ['a', 'b']);
  assert.deepEqual(selectGroupMember(['a', 'b'], 'rotate', { n: 0 }), { member: 'a', state: { n: 1 } });
  assert.equal(selectGroupMember(['a', 'b'], 'rotate', { n: 1 }).member, 'b');
  assert.equal(selectGroupMember(['a', 'b'], 'rotate', { n: 2 }).member, 'a');
  assert.equal(selectGroupMember(['a', 'b'], 'usage', { usage: {} }).member, 'a', 'least-used first on tie');
  assert.equal(selectGroupMember(['a', 'b'], 'usage', { usage: { a: 2, b: 0 } }).member, 'b');
  assert.equal(selectGroupMember(['a', 'b'], 'ordered', { n: 3 }).member, 'a');
});
