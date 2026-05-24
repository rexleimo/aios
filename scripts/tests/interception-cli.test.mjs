/* 中文注释：Interception 回归测试覆盖压缩、召回、指标和客户端配置，防止链路退化成 prompt-only。 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const cli = path.join(process.cwd(), 'scripts', 'aios.mjs');

function runAios(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('interception proof command emits savings and capability matrix', async () => {
  const sessionId = `proof-cli-${Date.now()}`;
  const result = runAios(['interception', 'proof', '--session', sessionId, '--json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.metrics.records, 2);
  assert.equal(parsed.metrics.total_saved_bytes > 0, true);
  assert.equal(parsed.metrics.raw_contains_sentinel, false);
  assert.equal(parsed.capability_matrix.some((item) => item.client === 'aios-harness' && item.targetLevel === 'L3'), true);
});

test('interception doctor and mcp migration keep browser MCP proxied', async () => {
  const result = runAios(['interception', 'doctor', '--json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.mcp_proxy.ok, true);
  assert.equal(parsed.proof.metrics.records, 2);
  assert.equal(parsed.targets_after.some((item) => item.client === 'project' && item.proxied), true);

  const mcpRaw = await readFile(path.join(process.cwd(), '.mcp.json'), 'utf8');
  assert.match(mcpRaw, /aios-mcp-proxy\.mjs/);
});
