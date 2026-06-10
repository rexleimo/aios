/* 中文注释：Interception 回归测试覆盖压缩、召回、指标和客户端配置，防止链路退化成 prompt-only。 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { compressPreSendTurn } from '../lib/interception/index.mjs';

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
  assert.equal(parsed.turn_compression_matrix.ok, true);
  assert.equal(parsed.turn_compression_matrix.clients.length, parsed.capability_matrix.length);
  for (const client of parsed.turn_compression_matrix.clients) {
    assert.equal(client.compliance_status, 'compliant');
    assert.equal(client.direct_host_bypass_allowed, false);
    assert.equal(client.pre_send.saved_bytes > 0, true, `${client.client_id} pre_send metric missing`);
    assert.equal(client.post_receive.saved_bytes > 0, true, `${client.client_id} post_receive metric missing`);
  }
});

test('interception doctor and mcp migration keep browser MCP proxied', async () => {
  const result = runAios(['interception', 'doctor', '--json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.mcp_proxy.ok, true);
  assert.equal(parsed.proof.metrics.records, 2);
  assert.equal(parsed.proof.turn_compression_matrix.ok, true);
  assert.equal(parsed.proof.turn_compression_matrix.clients.length, parsed.capability_matrix.length);
  assert.equal(parsed.targets_after.some((item) => item.client === 'project' && item.proxied), true);

  const mcpRaw = await readFile(path.join(process.cwd(), '.mcp.json'), 'utf8');
  assert.match(mcpRaw, /aios-mcp-proxy\.mjs/);
});

test('interception tail --latest returns the newest proof session with recent pre/post metrics', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-interception-tail-'));
  const sessionId = `tail-cli-${Date.now()}`;

  try {
    await mkdir(path.join(workspaceRoot, 'config'), { recursive: true });
    await copyFile(
      path.join(process.cwd(), 'config', 'host-capabilities.json'),
      path.join(workspaceRoot, 'config', 'host-capabilities.json')
    );

    const proof = runAios(['interception', 'proof', '--session', sessionId, '--workspace', workspaceRoot, '--json']);
    assert.equal(proof.status, 0, proof.stderr || proof.stdout);

    const tail = runAios(['interception', 'tail', '--latest', '--workspace', workspaceRoot, '--json']);
    assert.equal(tail.status, 0, tail.stderr || tail.stdout);
    const parsed = JSON.parse(tail.stdout);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.session_id, sessionId);
    assert.equal(parsed.total_records > 0, true);
    assert.equal(parsed.recent.some((record) => record.event_kind === 'pre_send'), true);
    assert.equal(parsed.recent.some((record) => record.event_kind === 'post_receive'), true);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('interception doctor --enforce-turns fails when selected metrics lack post_receive', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-interception-enforce-turns-'));
  const sessionId = `missing-post-${Date.now()}`;

  try {
    await mkdir(path.join(workspaceRoot, 'config'), { recursive: true });
    await copyFile(
      path.join(process.cwd(), 'config', 'host-capabilities.json'),
      path.join(workspaceRoot, 'config', 'host-capabilities.json')
    );

    await compressPreSendTurn({
      workspaceRoot,
      cwd: workspaceRoot,
      sessionId,
      clientId: 'codex-cli',
      hostLevel: 'L2',
      prompt: 'PRE_SEND_ONLY_SENTINEL'.repeat(120),
      mode: 'tight',
      thresholds: { minRawBytes: 64 },
      metrics: { enabled: true },
    });

    const result = runAios(['interception', 'doctor', '--workspace', workspaceRoot, '--session', sessionId, '--enforce-turns', '--json']);
    assert.notEqual(result.status, 0, result.stderr || result.stdout);
    const parsed = JSON.parse(result.stdout);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.turn_compliance.enforced, true);
    assert.equal(parsed.turn_compliance.session_id, sessionId);
    assert.equal(parsed.turn_compliance.pre_send, 1);
    assert.equal(parsed.turn_compliance.post_receive, 0);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
