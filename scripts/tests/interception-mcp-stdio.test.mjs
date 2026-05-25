/* 中文注释：Interception 回归测试覆盖压缩、召回、指标和客户端配置，防止链路退化成 prompt-only。 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createJsonRpcProxyHandler } from '../lib/interception/mcp/json-rpc-proxy.mjs';
import { handleJsonRpcProxyLine } from '../lib/interception/mcp/stdio-proxy.mjs';

const SENTINEL = 'UNIQUE_STDIO_MCP_SENTINEL';

test('stdio MCP proxy line handler forwards JSON-RPC and returns compact packet for tools/call', async () => {
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
  assert.equal(response.result.type, 'aios.compact_packet');
  assert.equal(JSON.stringify(response).includes(SENTINEL), false);
  assert.equal(response.result.refs.length, 1);
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
