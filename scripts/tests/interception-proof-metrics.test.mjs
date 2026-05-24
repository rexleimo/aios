/* 中文注释：Interception 回归测试覆盖压缩、召回、指标和客户端配置，防止链路退化成 prompt-only。 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createInterceptionEngine, readRawRef } from '../lib/interception/index.mjs';
import { metricsSessionPath, readMetricsRecords } from '../lib/interception/metrics/metrics-sink.mjs';

const SENTINEL = 'UNIQUE_PROOF_SENTINEL';

test('proof metrics: compact packet omits raw, raw ref recalls it, metrics quantify savings', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-proof-metrics-'));
  try {
    const engine = createInterceptionEngine({
      workspaceRoot,
      now: () => new Date('2026-05-23T00:00:00.000Z'),
      thresholds: { minRawBytes: 64 },
      metrics: { enabled: true },
    });

    const raw = [
      'ERROR proof failure at src/proof.ts:77',
      SENTINEL.repeat(50),
      'done',
    ].join('\n');

    const packet = await engine.interceptToolResult({
      kind: 'shell',
      host: 'aios-harness',
      sessionId: 'proof-session',
      cwd: workspaceRoot,
      payload: { command: 'cat proof.log', exitCode: 1, stdout: raw, stderr: '' },
    });

    assert.equal(JSON.stringify(packet).includes(SENTINEL), false);
    assert.equal(packet.refs.length, 1);
    assert.equal(packet.metrics.raw_bytes > 64, true);
    assert.equal(packet.metrics.saved_bytes > 0, true);
    assert.equal(packet.metrics.saving_ratio > 0.5, true);

    const recalled = await readRawRef({ workspaceRoot, sessionId: 'proof-session', refId: packet.refs[0].ref_id });
    assert.equal(recalled.raw.includes(SENTINEL), true);

    const metricsPath = metricsSessionPath(workspaceRoot, 'proof-session');
    const metricsText = await readFile(metricsPath, 'utf8');
    assert.equal(metricsText.includes(packet.refs[0].ref_id), true);

    const records = await readMetricsRecords({ workspaceRoot, sessionId: 'proof-session' });
    assert.equal(records.length, 1);
    assert.equal(records[0].ref_id, packet.refs[0].ref_id);
    assert.equal(records[0].raw_bytes, packet.metrics.raw_bytes);
    assert.equal(records[0].compact_bytes, packet.metrics.compact_bytes);
    assert.equal(records[0].saved_bytes, packet.metrics.saved_bytes);
    assert.equal(records[0].saving_ratio, packet.metrics.saving_ratio);
    assert.equal(records[0].raw_contains_sentinel, false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
