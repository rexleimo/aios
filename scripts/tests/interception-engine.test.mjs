/* 中文注释：Interception 回归测试覆盖压缩、召回、指标和客户端配置，防止链路退化成 prompt-only。 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createInterceptionEngine,
  readRawRef,
} from '../lib/interception/index.mjs';

const SENTINEL = 'UNIQUE_RAW_PAYLOAD_SENTINEL';

test('interception engine returns compact packet without leaking raw sentinel and stores recallable raw ref', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-interception-'));
  try {
    const engine = createInterceptionEngine({
      workspaceRoot,
      now: () => new Date('2026-05-23T00:00:00.000Z'),
      thresholds: { minRawBytes: 64 },
    });

    const rawOutput = [
      'begin noisy output',
      'ERROR important failure at src/app.ts:42',
      SENTINEL.repeat(20),
      'tail line',
    ].join('\n');

    const result = await engine.interceptToolResult({
      kind: 'shell',
      host: 'aios-harness',
      sessionId: 'test-session',
      cwd: workspaceRoot,
      payload: {
        command: 'cat huge.log',
        exitCode: 1,
        stdout: rawOutput,
        stderr: '',
      },
    });

    assert.equal(result.type, 'aios.compact_packet');
    assert.equal(result.host, 'aios-harness');
    assert.equal(result.source, 'shell');
    assert.equal(result.refs.length, 1);
    assert.equal(result.metrics.raw_bytes > result.metrics.compact_bytes, true);
    assert.equal(JSON.stringify(result).includes(SENTINEL), false);
    assert.match(result.errors.join('\n'), /ERROR important failure/);

    const recalled = await readRawRef({
      workspaceRoot,
      sessionId: 'test-session',
      refId: result.refs[0].ref_id,
    });
    assert.equal(recalled.raw.includes(SENTINEL), true);
    assert.equal(recalled.meta.sha256, result.refs[0].sha256);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('interception engine passes through small output without creating a raw ref', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-interception-'));
  try {
    const engine = createInterceptionEngine({
      workspaceRoot,
      now: () => new Date('2026-05-23T00:00:00.000Z'),
      thresholds: { minRawBytes: 4096 },
    });

    const result = await engine.interceptToolResult({
      kind: 'shell',
      host: 'aios-harness',
      sessionId: 'tiny',
      cwd: workspaceRoot,
      payload: {
        command: 'echo ok',
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      },
    });

    assert.equal(result.type, 'aios.compact_packet');
    assert.equal(result.refs.length, 0);
    assert.equal(result.summary, 'ok');
    assert.equal(result.metrics.saved_bytes, 0);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
