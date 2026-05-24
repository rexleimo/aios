/* 中文注释：Interception 回归测试覆盖压缩、召回、指标和客户端配置，防止链路退化成 prompt-only。 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { encodeEnvelope, decodeEnvelope } from '../lib/interception/core/envelope.mjs';
import { runShellEnvelope } from '../lib/interception/shell/shell-wrapper.mjs';
import { readMetricsRecords } from '../lib/interception/metrics/metrics-sink.mjs';
import { readRawRef } from '../lib/interception/refs/raw-ref-store.mjs';

const SENTINEL = 'UNIQUE_SHELL_GATEWAY_SENTINEL';

test('shell envelope round trips without shell quoting semantics', () => {
  const envelope = { command: 'node -e "console.log(1)"', cwd: 'E:/tmp/a b', env: { A: 'B' } };
  assert.deepEqual(decodeEnvelope(encodeEnvelope(envelope)), envelope);
});

test('shell gateway returns compact packet and stores raw output', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-shell-gateway-'));
  try {
    const packet = await runShellEnvelope({
      envelope: {
        command: process.execPath,
        args: ['-e', `console.log('${SENTINEL}'.repeat(20)); console.error('ERROR at src/app.ts:42')`],
        cwd: workspaceRoot,
      },
      workspaceRoot,
      sessionId: 'shell-session',
      host: 'aios-harness',
      thresholds: { minRawBytes: 64 },
      now: () => new Date('2026-05-23T00:00:00.000Z'),
      metrics: { enabled: true },
    });

    assert.equal(packet.type, 'aios.compact_packet');
    assert.equal(JSON.stringify(packet).includes(SENTINEL), false);
    assert.equal(packet.refs.length, 1);
    assert.match(packet.errors.join('\n'), /ERROR at src\/app\.ts:42/);

    const records = await readMetricsRecords({ workspaceRoot, sessionId: 'shell-session' });
    assert.equal(records.length, 1);
    assert.equal(records[0].ref_id, packet.refs[0].ref_id);
    assert.equal(records[0].source, 'shell');
    assert.equal(records[0].saved_bytes, packet.metrics.saved_bytes);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('shell gateway executes planner rewrite instead of original broad command', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-shell-rewrite-'));
  try {
    const packet = await runShellEnvelope({
      envelope: {
        command: 'git',
        args: ['diff'],
        cwd: workspaceRoot,
      },
      workspaceRoot,
      sessionId: 'shell-rewrite-session',
      host: 'aios-harness',
      thresholds: { minRawBytes: 1 },
      now: () => new Date('2026-05-23T00:00:00.000Z'),
      metrics: { enabled: true },
    });

    assert.equal(packet.type, 'aios.compact_packet');
    const recalled = await readRawRef({
      workspaceRoot,
      sessionId: 'shell-rewrite-session',
      refId: packet.refs[0].ref_id,
    });
    assert.match(recalled.meta.command, /--stat/);
    assert.equal(recalled.meta.command, 'git diff --stat');
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
