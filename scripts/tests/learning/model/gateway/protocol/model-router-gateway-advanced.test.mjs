import test from 'node:test';
import assert from 'node:assert/strict';

import { claudeToGeminiRequest, geminiToClaudeResponse } from '../../../../../lib/tooling/model-router/gateway/translate.mjs';
import { resolveGatewayRoute } from '../../../../../lib/tooling/model-router/gateway/router.mjs';
import { createRoutingGatewayApp } from '../../../../../lib/tooling/model-router/gateway/compatibility/proxy.mjs';

test('claude → gemini request: systemInstruction, functionCall, functionDeclarations', () => {
  const gemini = claudeToGeminiRequest({
    model: 'claude-sonnet-5', max_tokens: 256, system: 'Be helpful.',
    messages: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'read', input: { p: 'a' } }] },
    ],
    tools: [{ name: 'read', description: 'Read', input_schema: { type: 'object' } }],
  });
  assert.equal(gemini.systemInstruction.parts[0].text, 'Be helpful.');
  assert.equal(gemini.contents[0].role, 'user');
  assert.equal(gemini.contents[1].role, 'model');
  assert.deepEqual(gemini.contents[1].parts[0].functionCall, { name: 'read', args: { p: 'a' } });
  assert.equal(gemini.tools[0].functionDeclarations[0].name, 'read');
  assert.equal(gemini.generationConfig.maxOutputTokens, 256);
});

test('gemini → claude response: parts, functionCall→tool_use, usageMetadata', () => {
  const claude = geminiToClaudeResponse({
    responseId: 'r1', modelVersion: 'gemini-3.8-flash',
    candidates: [{ content: { role: 'model', parts: [{ text: 'done' }, { functionCall: { name: 'read', args: { p: 'a' } } }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 },
  }, 'gemini-3.8-flash');
  assert.equal(claude.content[0].text, 'done');
  assert.equal(claude.content[1].type, 'tool_use');
  assert.deepEqual(claude.content[1].input, { p: 'a' });
  assert.equal(claude.stop_reason, 'tool_use');
  assert.equal(claude.usage.input_tokens, 7);
});

const registry = {
  activeModel: 'modelb',
  models: { modela: { protocols: ['claude'] }, modelb: { protocols: ['claude'] }, 'gemini-3.8-flash': { protocols: ['gemini'] } },
  providers: {
    myclaude: { baseUrl: 'https://claude.example.com', authMode: 'none', protocols: ['claude'], models: ['modela', 'modelb'] },
    mygemini: { baseUrl: 'https://g.example.com', apiKeyEnv: 'env:G_KEY', protocols: ['gemini'], models: ['gemini-3.8-flash'] },
  },
  roleDefaults: { implementer: { taskType: 'implementation' } },
  routingRules: [
    { taskType: 'implementation', primary: 'modela', fallback: ['modelb'] },
    { taskType: 'general', primary: 'modelb', fallback: [] },
  ],
  clientRoleMatrix: { default: { implementer: 'modela' }, clients: {} },
};

test('availability failover: a down primary channel skips to the fallback', () => {
  const now = 1_000_000;
  const availability = { models: { 'modela@claude': { state: 'down', updatedAt: now, consecutiveFailures: 2, reason: 'model_not_found' } } };
  const route = resolveGatewayRoute({ clientId: 'claude', role: 'implementer', registry, env: {}, clientProtocol: 'claude', context: { availability, now } });
  assert.equal(route.modelId, 'modelb', 'down primary skipped, fallback chosen');
  const healthy = resolveGatewayRoute({ clientId: 'claude', role: 'implementer', registry, env: {}, clientProtocol: 'claude', context: { availability: { models: {} }, now } });
  assert.equal(healthy.modelId, 'modela', 'healthy primary kept');
  const bothDown = { models: { ...availability.models, 'modelb@claude': { state: 'down', updatedAt: now } } };
  assert.throws(
    () => resolveGatewayRoute({ clientId: 'claude', role: 'implementer', registry, env: {}, context: { availability: bothDown, now } }),
    { name: 'GatewayRouteError', code: 'NO_ROUTE_CONFIGURED' },
    'exhausted policy candidates must not escape to an unrelated configured provider',
  );
});

test('end-to-end claude client → gemini upstream translates both ways', async () => {
  const geminiRegistry = { ...registry, clientRoleMatrix: { default: { implementer: 'gemini-3.8-flash' }, clients: {} } };
  let captured;
  const upstreamFetch = async (url, init) => {
    captured = { url, body: JSON.parse(new TextDecoder().decode(init.body)), headers: init.headers };
    return new Response(JSON.stringify({
      responseId: 'r1', modelVersion: 'gemini-3.8-flash',
      candidates: [{ content: { role: 'model', parts: [{ text: 'gemini says hi' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const { app, decisions } = createRoutingGatewayApp({ registry: geminiRegistry, clientId: 'claude', role: 'implementer', env: { G_KEY: 'gsecret' }, clientProtocol: 'claude', fetchImpl: upstreamFetch });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 100, messages: [{ role: 'user', content: 'hello' }] }) });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.content[0].text, 'gemini says hi', 'response translated back to claude');
  assert.equal(captured.url, 'https://g.example.com/gemini/v1beta/models', 'omitted endpointStyle retains the legacy relay Gemini endpoint');
  assert.equal(captured.body.model, 'gemini-3.8-flash', 'legacy relay Gemini keeps the routed model in its body');
  assert.ok(Array.isArray(captured.body.contents), 'outgoing request is gemini format');
  assert.equal(captured.headers['x-goog-api-key'], 'gsecret');
  assert.ok(!JSON.stringify(decisions[0]).includes('gsecret'), 'no secret in decision record');
});
