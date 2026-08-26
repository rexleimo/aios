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

test('executeCommand supports cancellation via onCancel callback', async () => {
  let cancelFn = null;
  const promise = executeCommand('sleep 60', undefined, 10000, {
    onCancel: (fn) => { cancelFn = fn; },
  });
  // 等待 onCancel 注册完成
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(typeof cancelFn, 'function', 'cancel callback registered');
  cancelFn();
  const result = await promise;
  assert.equal(result.cancelled, true, 'result flagged as cancelled');
  assert.equal(result.timedOut, false, 'not flagged as timeout');
});

test('handleMessage cancels in-flight command via notifications/cancelled', async () => {
  const pending = new Map();
  const callPromise = handleMessage({
    jsonrpc: '2.0',
    id: 20,
    method: 'tools/call',
    params: { name: 'aios_shell', arguments: { command: 'sleep 60' } },
  }, { pending });
  // 等待 tools/call 注册进 pending map
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok(pending.has(20), 'request registered in pending map');
  assert.equal(typeof pending.get(20).cancel, 'function', 'cancel handler registered');

  const cancelledResponse = await handleMessage({
    jsonrpc: '2.0',
    method: 'notifications/cancelled',
    params: { requestId: 20 },
  }, { pending });
  assert.equal(cancelledResponse, undefined, 'notification returns no response');
  assert.ok(!pending.has(20), 'pending entry removed after cancel');

  const callResult = await callPromise;
  assert.ok(callResult.result.content.some((c) => c.text.includes('cancelled')), 'call reports cancelled');
});

test('pending commands are cancelled when stdin closes', async () => {
  // 通过子进程验证：发一个长命令后关闭 stdin，server 应清理并退出
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['scripts/shell-mcp-server.mjs'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', () => {});
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 30, method: 'tools/call', params: { name: 'aios_shell', arguments: { command: 'sleep 60' } } }) + '\n');
  await new Promise((resolve) => setTimeout(resolve, 300));
  child.stdin.end();
  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(exitCode, 0, 'server exits cleanly after stdin close');
  assert.match(output, /cancelled/, 'in-flight command reported as cancelled on close');
});

test('long command does not block ping (concurrent main loop)', async () => {
  // 核心治本验证：一条长命令在途时，ping 必须立即响应（修复前会被串行阻塞）
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['scripts/shell-mcp-server.mjs'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const received = []; // {id, at}
  child.stdout.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) {
        try { received.push({ id: JSON.parse(line).id, at: Date.now() }); } catch {}
      }
    }
  });
  child.stderr.on('data', () => {});

  // 发送长命令（2s），立即发送 ping
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 40, method: 'tools/call', params: { name: 'aios_shell', arguments: { command: 'sleep 2' } } }) + '\n');
  await new Promise((resolve) => setTimeout(resolve, 50));
  const pingSentAt = Date.now();
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 41, method: 'ping' }) + '\n');

  // 等待长命令完成 + 响应排空
  await new Promise((resolve) => setTimeout(resolve, 3000));
  child.stdin.end();
  await new Promise((resolve) => child.on('close', resolve));

  const ping = received.find((r) => r.id === 41);
  const call = received.find((r) => r.id === 40);
  assert.ok(ping, 'ping response received');
  assert.ok(call, 'tools/call response received');
  // ping 必须先于长命令返回：ping 在命令完成前就已响应
  assert.ok(ping.at < call.at, `ping (${ping.at}) answered before long command (${call.at})`);
  const pingLatency = ping.at - pingSentAt;
  assert.ok(pingLatency < 1500, `ping answered within ${pingLatency}ms (long command still running)`);
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
