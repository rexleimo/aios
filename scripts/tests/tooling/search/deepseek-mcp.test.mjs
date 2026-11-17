import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema, InitializeResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { createSearchMcpServer } from '../../../lib/tooling/search/mcp-server.mjs';
import { createHarness, deferred, fakeEnv, jsonResponse, searchResult } from './deepseek-fixtures.mjs';

test('installed SDK client completes initialization, discovery and both tool calls offline', async (t) => {
  const server = createSearchMcpServer({ getEnv: fakeEnv, fetchImpl: async (url) =>
    jsonResponse(url.endsWith('/search') ? { results: [searchResult] } : { title: 'Page', content: '# Page' }),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'offline-client', version: '1' });
  t.after(async () => { await client.close(); await server.close(); });
  await client.connect(clientTransport);
  await client.ping();
  const listed = await client.listTools();
  assert.ok(ListToolsResultSchema.safeParse(listed).success);
  assert.equal(listed.tools.length, 2);
  for (const [name, args, expected] of [
    ['deepseek_search', { query: 'q' }, { results: [searchResult] }],
    ['deepseek_fetch', { url: 'https://example.com' }, { title: 'Page', content: '# Page' }],
  ]) {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(CallToolResultSchema.safeParse(result).success);
    assert.deepEqual(result.structuredContent, expected);
    assert.deepEqual(JSON.parse(result.content[0].text), expected);
    assert.notEqual(result.isError, true);
  }
});

test('entry supports protocol negotiation, ping and silent notifications without reading credentials', async (t) => {
  let reads = 0;
  const harness = await createHarness({ getEnv: () => { reads++; return {}; } });
  t.after(() => harness.close());
  const reply = await harness.initialize('2024-11-05');
  assert.ok(InitializeResultSchema.safeParse(reply.result).success);
  assert.equal(reply.result.protocolVersion, '2024-11-05');
  assert.equal(reply.result.serverInfo.name, 'aios-search');
  assert.match(reply.result.instructions, /USD 0\.75 per 1,000/);
  assert.match(reply.result.instructions, /CNY 5 per 1,000/);
  assert.deepEqual((await harness.request('ping')).result, {});
  harness.notify('notifications/unknown');
  await harness.request('tools/list');
  assert.equal(reads, 0);
  assert.equal(harness.messages.length, 4);
  assert.deepEqual(harness.diagnostics, []);
});

test('unsupported protocol version receives the SDK supported version', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const reply = await harness.initialize('not-a-supported-version');
  assert.ok(InitializeResultSchema.safeParse(reply.result).success);
  assert.notEqual(reply.result.protocolVersion, 'not-a-supported-version');
});

test('lifecycle, unknown methods/tools and malformed params produce safe protocol errors', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  assert.equal((await harness.request('tools/list')).error.code, -32002);
  harness.notify('notifications/initialized');
  assert.equal((await harness.request('tools/list')).error.code, -32002);
  assert.deepEqual((await harness.request('ping')).result, {});
  await harness.initialize();
  assert.equal((await harness.request('unknown-secret-method')).error.code, -32601);
  assert.equal((await harness.request('tools/call', { name: 'unknown-secret-tool', arguments: {} })).error.code, -32602);
  const invalid = await harness.request('tools/call', { name: { 'provider-secret': true } });
  assert.equal(invalid.error.code, -32602);
  assert.doesNotMatch(JSON.stringify(harness.messages), /unknown-secret|provider-secret/);
});

test('SDK diagnostics never repeat unsolicited peer response data', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  harness.input.write('{"jsonrpc":"2.0","id":10000,"result":{"key":"fake-secret-peer-data"}}\n');
  await harness.request('ping');
  assert.equal(harness.diagnostics.length, 1);
  assert.deepEqual(harness.diagnostics[0], {
    level: 'error', component: 'aios-search', code: 'protocol_or_transport_error',
  });
  assert.doesNotMatch(JSON.stringify(harness.messages) + JSON.stringify(harness.diagnostics), /fake-secret-peer-data/);
});

test('validation and upstream failures return MCP isError results, never keys or error bodies', async (t) => {
  const harness = await createHarness({ fetchImpl: async () => jsonResponse({ error: { message: 'fake-key-for-offline-tests provider-secret' } }, { status: 402 }) });
  t.after(() => harness.close());
  await harness.initialize();
  for (const args of [{ query: '' }, { query: 'q' }]) {
    const reply = await harness.request('tools/call', { name: 'deepseek_search', arguments: args });
    assert.ok(CallToolResultSchema.safeParse(reply.result).success);
    assert.equal(reply.result.isError, true);
    assert.doesNotMatch(JSON.stringify(reply), /fake-key-for-offline-tests|provider-secret/);
  }
  assert.deepEqual(harness.diagnostics, []);
});

test('unexpected local errors are sanitized, including injected environment failures', async (t) => {
  const harness = await createHarness({ getEnv: () => { throw new Error('fake-secret-from-environment'); } });
  t.after(() => harness.close());
  await harness.initialize();
  const reply = await harness.request('tools/call', { name: 'deepseek_search', arguments: { query: 'q' } });
  assert.equal(reply.result.isError, true);
  assert.doesNotMatch(JSON.stringify(reply), /fake-secret/);
});

test('four concurrent calls are bounded while ping remains responsive', { timeout: 2000 }, async (t) => {
  const started = deferred();
  const release = deferred();
  let requests = 0;
  const harness = await createHarness({ fetchImpl: async () => {
    if (++requests === 4) started.resolve();
    await release.promise;
    return jsonResponse({ results: [] });
  } });
  t.after(() => harness.close());
  await harness.initialize();
  const pending = Array.from({ length: 4 }, () => harness.request('tools/call', { name: 'deepseek_search', arguments: { query: 'q' } }));
  await started.promise;
  assert.deepEqual((await harness.request('ping')).result, {});
  const busy = await harness.request('tools/call', { name: 'deepseek_search', arguments: { query: 'q' } });
  assert.equal(busy.result.isError, true);
  assert.match(busy.result.content[0].text, /concurrency limit/);
  assert.equal(requests, 4);
  release.resolve();
  for (const reply of await Promise.all(pending)) assert.notEqual(reply.result.isError, true);
});

test('cancellation notification and EOF both abort fake HTTP', { timeout: 2000 }, async (t) => {
  for (const mode of ['notification', 'eof']) {
    const started = deferred();
    let signal;
    const harness = await createHarness({ fetchImpl: async (_url, options) => {
      signal = options.signal;
      started.resolve();
      return new Promise(() => {});
    } });
    t.after(() => harness.close());
    await harness.initialize();
    harness.input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1234, method: 'tools/call', params: { name: 'deepseek_search', arguments: { query: 'q' } } })}\n`);
    await started.promise;
    if (mode === 'notification') {
      harness.notify('notifications/cancelled', { requestId: 1234, reason: 'untrusted-secret' });
      await harness.request('ping');
    } else {
      harness.input.end();
      await harness.closed;
    }
    assert.equal(signal.aborted, true);
    assert.ok(!harness.messages.some((message) => message.id === 1234));
    assert.doesNotMatch(JSON.stringify(harness.diagnostics), /untrusted-secret/);
  }
});
