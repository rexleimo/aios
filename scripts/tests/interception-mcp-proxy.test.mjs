/* 中文注释：Interception 回归测试覆盖压缩、召回、指标和客户端配置，防止链路退化成 prompt-only。 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createJsonRpcProxyHandler } from '../lib/interception/mcp/json-rpc-proxy.mjs';
import { readMetricsRecords } from '../lib/interception/metrics/metrics-sink.mjs';
import { readRawRef } from '../lib/interception/refs/raw-ref-store.mjs';

const SENTINEL = 'UNIQUE_MCP_RAW_PAYLOAD_SENTINEL';

test('json-rpc proxy shrinks tools/call result and preserves raw by ref', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-mcp-proxy-'));
  const calls = [];
  try {
    const handler = createJsonRpcProxyHandler({
      workspaceRoot,
      sessionId: 'mcp-session',
      host: 'generic-mcp',
      now: () => new Date('2026-05-23T00:00:00.000Z'),
      thresholds: { minRawBytes: 64 },
      metrics: { enabled: true },
      forward: async message => {
        calls.push(message);
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            content: [
              { type: 'text', text: `HTML <main>${SENTINEL.repeat(20)}</main>` },
            ],
          },
        };
      },
    });

    const response = await handler({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'page.get_html', arguments: {} },
    });

    assert.equal(response.jsonrpc, '2.0');
    assert.equal(response.id, 7);
    assert.equal(calls.length, 1);
    assert.equal(JSON.stringify(response).includes(SENTINEL), false);
    assert.equal(response.result.type, 'aios.compact_packet');
    assert.equal(response.result.refs.length, 1);

    const metrics = await readMetricsRecords({ workspaceRoot, sessionId: 'mcp-session' });
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].source, 'mcp');
    assert.equal(metrics[0].ref_id, response.result.refs[0].ref_id);
    assert.equal(metrics[0].saved_bytes, response.result.metrics.saved_bytes);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('json-rpc proxy shrinks tools/list, stores full catalog ref, and records metrics', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-mcp-proxy-'));
  try {
    const handler = createJsonRpcProxyHandler({
      workspaceRoot,
      sessionId: 'mcp-session',
      host: 'generic-mcp',
      now: () => new Date('2026-05-23T00:00:00.000Z'),
      metrics: { enabled: true },
      forward: async message => ({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: 'page.screenshot',
              description: 'Take a screenshot and return a giant base64 blob.'.repeat(40),
              inputSchema: { type: 'object', properties: { fullPage: { type: 'boolean' } } },
            },
          ],
        },
      }),
    });

    const response = await handler({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    assert.equal(response.id, 3);
    assert.equal(response.result.tools[0].name, 'page.screenshot');
    assert.equal(JSON.stringify(response).includes('giant base64 blob'.repeat(10)), false);
    assert.equal(response.result.refs.length, 1);
    assert.equal(response.result.recall.length > 0, true);

    const recalled = await readRawRef({
      workspaceRoot,
      sessionId: 'mcp-session',
      refId: response.result.refs[0].ref_id,
    });
    assert.match(recalled.raw, /page\.screenshot/);
    assert.match(recalled.raw, /giant base64 blob/);

    const metrics = await readMetricsRecords({ workspaceRoot, sessionId: 'mcp-session' });
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].kind, 'mcp.tools_list');
    assert.equal(metrics[0].ref_id, response.result.refs[0].ref_id);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
