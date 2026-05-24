/* 中文注释：Interception 回归测试覆盖压缩、召回、指标和客户端配置，防止链路退化成 prompt-only。 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runShellEnvelope } from '../lib/interception/shell/shell-wrapper.mjs';
import { readInterceptionRef, grepInterceptionRefs } from '../lib/interception/refs/index.mjs';
import { readMetricsRecords } from '../lib/interception/metrics/metrics-sink.mjs';

const SENTINEL = 'UNIQUE_GOAL_CHAIN_SENTINEL';

test('goal chain: shell gateway writes compact packet and refs API recalls raw output', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-goal-chain-'));
  try {
    const packet = await runShellEnvelope({
      envelope: {
        command: 'node',
        args: ['-e', `console.log('${SENTINEL}'.repeat(20)); console.error('ERROR at src/goal.ts:9')`],
        cwd: workspaceRoot,
      },
      workspaceRoot,
      sessionId: 'goal-chain',
      host: 'aios-harness',
      thresholds: { minRawBytes: 64 },
      now: () => new Date('2026-05-23T00:00:00.000Z'),
      metrics: { enabled: true },
    });

    assert.equal(packet.type, 'aios.compact_packet');
    assert.equal(JSON.stringify(packet).includes(SENTINEL), false);
    assert.equal(packet.refs.length, 1);

    const refId = packet.refs[0].ref_id;
    const read = await readInterceptionRef({ workspaceRoot, refId, sessionId: 'goal-chain' });
    assert.equal(read.raw.includes(SENTINEL), true);

    const grep = await grepInterceptionRefs({ workspaceRoot, pattern: SENTINEL, sessionId: 'goal-chain' });
    assert.equal(grep.some(item => item.ref_id === refId), true);

    const metrics = await readMetricsRecords({ workspaceRoot, sessionId: 'goal-chain' });
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].ref_id, refId);
    assert.equal(metrics[0].raw_bytes, packet.metrics.raw_bytes);
    assert.equal(metrics[0].saving_ratio, packet.metrics.saving_ratio);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
