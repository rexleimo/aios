/* 中文注释：Interception 回归测试覆盖压缩、召回、指标和客户端配置，防止链路退化成 prompt-only。 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createJsonRpcProxyHandler } from '../lib/interception/mcp/json-rpc-proxy.mjs';
import { handleJsonRpcProxyLine } from '../lib/interception/mcp/stdio-proxy.mjs';

const SENTINEL = 'UNIQUE_STDIO_MCP_SENTINEL';

test('stdio MCP proxy line handler keeps tools/call MCP shape and returns AIOS metadata', async () => {
  const handler = createJsonRpcProxyHandler({
    workspaceRoot: process.cwd(),
    sessionId: 'stdio-mcp-test',
    thresholds: { minRawBytes: 64 },
    forward: async message => ({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: [{ type: 'text', text: SENTINEL.repeat(20) }],
      },
    }),
  });

  const response = await handleJsonRpcProxyLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: { name: 'page.get_html' },
  }), handler);

  assert.equal(response.id, 11);
  assert.equal(JSON.stringify(response).includes(SENTINEL), false);
  assert.equal(response.result.content.length, 1);
  assert.equal(response.result.content[0].type, 'text');
  assert.match(response.result.content[0].text, /aios\.compact_packet/);
  assert.equal(response.result._meta.aios.type, 'aios.compact_packet');
  assert.equal(response.result._meta.aios.refs.length, 1);
});

test('stdio MCP proxy line handler returns parse error for invalid JSON', async () => {
  const response = await handleJsonRpcProxyLine('{bad', async () => null);
  assert.equal(response.error.code, -32700);
});

test('stdio MCP proxy forwards notifications without waiting for a response', async () => {
  const forwarded = [];
  const handler = createJsonRpcProxyHandler({
    workspaceRoot: process.cwd(),
    sessionId: 'stdio-mcp-test',
    forward: async (message, options) => {
      forwarded.push({ message, options });
      return new Promise(() => {});
    },
  });

  const response = await Promise.race([
    handleJsonRpcProxyLine(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    }), handler),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 25)),
  ]);

  assert.equal(response, undefined);
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].options.expectResponse, false);
});

test('stdio proxy main loop does not block on slow upstream tools/call (concurrent forwarding)', async () => {
  // 治本验证：上游 tools/call 慢时（模拟长命令），后续 ping 必须即时转发并收到响应。
  // 修复前主循环 `await handler(line)` 串行，ping 会排在长命令后面直到超时。
  const { spawn } = await import('node:child_process');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');

  // 慢上游：tools/call 等 1500ms 才返回；ping 立即返回
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aios-stdio-proxy-'));
  const upstreamPath = path.join(dir, 'slow-upstream.mjs');
  writeFileSync(upstreamPath, `
import { createInterface } from 'node:readline';
const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  if (!line.trim()) continue;
  const msg = JSON.parse(line);
  if (msg.method === 'ping') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }) + '\\n');
    continue;
  }
  if (msg.method === 'tools/call') {
    setTimeout(() => {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'done' }] } }) + '\\n');
    }, 1500);
    continue;
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [] } }) + '\\n');
}
`.trim());

  const child = spawn(process.execPath, [
    'scripts/aios-mcp-proxy.mjs',
    '--workspace', process.cwd(),
    '--host', 'test-host',
    '--', process.execPath, upstreamPath,
  ], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });

  const responses = []; // {id, at}
  child.stdout.on('data', (chunk) => {
    for (const l of chunk.toString().split('\n')) {
      if (l.trim()) {
        try { responses.push({ id: JSON.parse(l).id, at: Date.now() }); } catch {}
      }
    }
  });
  child.stderr.on('data', () => {});

  // 长 tools/call（上游 1500ms）后紧跟 ping
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 60, method: 'tools/call', params: { name: 'aios_shell', arguments: { command: 'sleep 1' } } }) + '\n');
  await new Promise((r) => setTimeout(r, 100));
  const pingSentAt = Date.now();
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 61, method: 'ping' }) + '\n');

  // 等长命令完成
  await new Promise((r) => setTimeout(r, 2500));
  child.kill();

  const ping = responses.find((r) => r.id === 61);
  const call = responses.find((r) => r.id === 60);
  assert.ok(ping, 'ping response received through proxy');
  assert.ok(call, 'tools/call response received through proxy');
  assert.ok(ping.at < call.at, `ping (${ping.at}) answered before slow call (${call.at})`);
  assert.ok(ping.at - pingSentAt < 1200, `ping answered within ${ping.at - pingSentAt}ms while slow call in flight`);
});
