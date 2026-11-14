import test from 'node:test';
import assert from 'node:assert/strict';

import { openAIChatStreamToClaudeStream } from '../../../../lib/tooling/model-router/gateway/stream-translate.mjs';
import { createRoutingGatewayApp } from '../../../../lib/tooling/model-router/gateway/proxy.mjs';

function streamFrom(text) {
  return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } });
}

const openaiSSE = [
  'data: {"id":"chatcmpl-1","choices":[{"delta":{"role":"assistant","content":"Hel"}}]}',
  '',
  'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"lo"}}]}',
  '',
  'data: {"id":"chatcmpl-1","choices":[{"delta":{},"finish_reason":"stop"}]}',
  '',
  'data: [DONE]',
  '', '',
].join('\n');

test('openAIChatStreamToClaudeStream emits claude SSE events with translated text deltas', async () => {
  const claudeStream = openAIChatStreamToClaudeStream(streamFrom(openaiSSE), 'qwen3.8-flash');
  const text = await new Response(claudeStream).text();
  assert.ok(text.includes('event: message_start'), 'message_start emitted');
  assert.ok(text.includes('event: content_block_start'));
  assert.ok(text.includes('"text":"Hel"'), 'first delta translated');
  assert.ok(text.includes('"text":"lo"'), 'second delta translated');
  assert.ok(text.includes('event: content_block_stop'));
  assert.ok(text.includes('event: message_stop'));
  assert.ok(text.indexOf('message_start') < text.indexOf('content_block_delta'), 'order preserved');
});

const registry = {
  activeModel: 'qwen3.8-flash',
  models: { 'qwen3.8-flash': { protocols: ['openai-chat'] } },
  providers: { myopenai: { baseUrl: 'https://api.example.com', apiKeyEnv: 'env:MY_KEY', protocols: ['openai-chat'], models: ['qwen3.8-flash'] } },
  roleDefaults: { implementer: { taskType: 'implementation' } },
  routingRules: [{ taskType: 'implementation', primary: 'qwen3.8-flash', fallback: [] }, { taskType: 'general', primary: 'qwen3.8-flash', fallback: [] }],
  clientRoleMatrix: { default: { implementer: 'qwen3.8-flash' }, clients: {} },
};

test('end-to-end cross-protocol streaming: claude client gets claude SSE from openai-chat upstream', async () => {
  const upstreamFetch = async () => new Response(streamFrom(openaiSSE), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const { app, decisions } = createRoutingGatewayApp({ registry, clientId: 'claude', role: 'implementer', env: { MY_KEY: 'k' }, clientProtocol: 'claude', fetchImpl: upstreamFetch });
  const res = await app.request('/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'hi' }] }) });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('event: message_start'), 'response is claude SSE, not raw openai chunks');
  assert.ok(text.includes('"text":"Hel"'));
  assert.ok(text.includes('"text":"lo"'));
  assert.ok(text.includes('event: message_stop'));
  assert.equal(decisions[0].needsTranslation, true);
  assert.equal(decisions[0].status, 200);
});

test('streaming tool calls: openai tool_calls fragments become claude tool_use + input_json_delta', async () => {
  const toolSSE = [
    'data: {"id":"1","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file","arguments":""}}]}}]}',
    '',
    'data: {"id":"1","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\":"}}]}}]}',
    '',
    'data: {"id":"1","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"a.txt\\"}"}}]}}]}',
    '',
    'data: {"id":"1","choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    '',
    'data: [DONE]',
    '', '',
  ].join('\n');
  const text = await new Response(openAIChatStreamToClaudeStream(streamFrom(toolSSE), 'qwen3.8-flash')).text();
  assert.ok(text.includes('"type":"tool_use"'), 'tool_use content block emitted');
  assert.ok(text.includes('"name":"read_file"'));
  assert.ok(text.includes('"type":"input_json_delta"'), 'argument fragments streamed');
  assert.ok(text.includes('"stop_reason":"tool_use"'), 'finish_reason tool_calls mapped');
  assert.ok(text.includes('event: message_stop'));
});