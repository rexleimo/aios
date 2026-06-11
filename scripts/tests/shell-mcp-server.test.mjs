import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { handleMessage, executeCommand, SHELL_TOOL } from '../shell-mcp-server.mjs';

test('handleMessage returns valid initialize response', async () => {
  const response = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(response.id, 1);
  assert.equal(response.result.protocolVersion, '2024-11-05');
  assert.equal(response.result.serverInfo.name, 'aios-shell');
  assert.ok(response.result.capabilities.tools);
});

test('handleMessage returns tools/list with aios_shell tool', async () => {
  const response = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(response.id, 2);
  assert.equal(response.result.tools.length, 1);
  assert.equal(response.result.tools[0].name, 'aios_shell');
  assert.ok(response.result.tools[0].inputSchema);
  assert.deepEqual(response.result.tools[0].inputSchema.required, ['command']);
});

test('handleMessage executes tools/call aios_shell and returns output', async () => {
  const response = await handleMessage({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'aios_shell',
      arguments: { command: 'echo hello-world' },
    },
  });
  assert.equal(response.id, 3);
  assert.ok(response.result);
  assert.ok(response.result.content);
  assert.ok(response.result.content.some((c) => c.text.includes('hello-world')));
});

test('handleMessage returns error for missing command', async () => {
  const response = await handleMessage({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'aios_shell',
      arguments: {},
    },
  });
  assert.equal(response.id, 4);
  assert.ok(response.error);
  assert.equal(response.error.code, -32602);
});

test('handleMessage returns error for unknown tool', async () => {
  const response = await handleMessage({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'nonexistent',
      arguments: {},
    },
  });
  assert.equal(response.id, 5);
  assert.ok(response.error);
  assert.equal(response.error.code, -32601);
});

test('handleMessage returns undefined for notifications', async () => {
  const response = await handleMessage({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });
  assert.equal(response, undefined);
});

test('handleMessage responds to ping', async () => {
  const response = await handleMessage({ jsonrpc: '2.0', id: 6, method: 'ping' });
  assert.equal(response.id, 6);
  assert.deepEqual(response.result, {});
});

test('executeCommand captures stdout and exit code', async () => {
  const result = await executeCommand('echo test-output', undefined, 10000);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.includes('test-output'));
});

test('executeCommand captures non-zero exit code', async () => {
  const result = await executeCommand('exit 42', undefined, 10000);
  assert.equal(result.exitCode, 42);
});

test('executeCommand captures stderr', async () => {
  const result = await executeCommand('echo err >&2 && echo out', undefined, 10000);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stderr.includes('err'));
  assert.ok(result.stdout.includes('out'));
});

test('executeCommand respects timeout', async () => {
  const result = await executeCommand('sleep 60', undefined, 500);
  assert.equal(result.exitCode, -1);
  assert.equal(result.timedOut, true);
});

test('SHELL_TOOL has correct schema', () => {
  assert.equal(SHELL_TOOL.name, 'aios_shell');
  assert.ok(SHELL_TOOL.description.length > 20);
  assert.equal(SHELL_TOOL.inputSchema.type, 'object');
  assert.ok(SHELL_TOOL.inputSchema.properties.command);
  assert.ok(SHELL_TOOL.inputSchema.properties.cwd);
});

test('shell-mcp-server runs as stdio process', () => {
  const request = JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'tools/list' });
  const result = spawnSync(process.execPath, ['scripts/shell-mcp-server.mjs'], {
    input: `${request}\n`,
    timeout: 10000,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  const response = JSON.parse(result.stdout.trim());
  assert.equal(response.id, 10);
  assert.ok(response.result.tools.length > 0);
});
