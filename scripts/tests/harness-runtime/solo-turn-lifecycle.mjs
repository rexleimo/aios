import assert from 'node:assert/strict';
import test from 'node:test';

import { mkdtemp, rm, os, path } from './support.mjs';

/* 中文注释：turn 生命周期契约测试 —— 超时树没清干净必须 fail-closed（blocked），
   干净超时才允许 infra-retry，操作者中止按 stopped 结算并透传 abort signal。 */

test('buildProductionExecuteTurn fail-closes when a timed-out process tree survives', async () => {
  const { buildProductionExecuteTurn } = await import('../../lib/lifecycle/harness/execute-turn.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-turn-orphan-'));
  let captured = null;
  try {
    const executeTurn = buildProductionExecuteTurn({
      rootDir,
      aiosRootDir: rootDir,
      sessionId: 'solo-turn-orphan',
      objective: 'orphan guard',
      provider: 'codex',
      turnTimeoutMs: 123456,
      spawnCommandImpl: async (command, args, options) => {
        captured = { command, args, options };
        return {
          status: 1,
          stdout: '',
          stderr: '',
          timedOut: true,
          childPid: 4242,
          killEscalated: true,
          treeAlive: true,
        };
      },
    });

    const result = await executeTurn({
      iteration: 1,
      continuity: '',
      offloadCanvas: null,
      summary: { workspaceRoot: rootDir, aiosRootDir: rootDir },
      worktree: { enabled: false },
    });

    assert.equal(captured.options.timeoutMs, 123456);
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.shouldStop, true);
    assert.equal(result.failureClass, 'runtime-error');
    assert.equal(result.evidence.includes('treeAlive=true'), true);
    assert.equal(result.evidence.includes('childPid=4242'), true);
    assert.equal(result.evidence.includes('killEscalated=SIGKILL'), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('buildProductionExecuteTurn keeps infra-retry when the timed-out tree is fully cleaned', async () => {
  const { buildProductionExecuteTurn } = await import('../../lib/lifecycle/harness/execute-turn.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-turn-clean-'));
  let captured = null;
  try {
    const executeTurn = buildProductionExecuteTurn({
      rootDir,
      aiosRootDir: rootDir,
      sessionId: 'solo-turn-clean',
      objective: 'clean timeout retry',
      provider: 'codex',
      spawnCommandImpl: async (command, args, options) => {
        captured = { command, args, options };
        return { status: 1, stdout: '', stderr: '', timedOut: true, killEscalated: false, treeAlive: false };
      },
    });

    const result = await executeTurn({
      iteration: 1,
      continuity: '',
      offloadCanvas: null,
      summary: { workspaceRoot: rootDir, aiosRootDir: rootDir },
      worktree: { enabled: false },
    });

    assert.equal(captured.options.timeoutMs, 30 * 60 * 1000);
    assert.equal(result.outcome, 'infra-retry');
    assert.equal(result.shouldStop, false);
    assert.equal(result.failureClass, 'runtime-error');
    assert.equal(result.evidence.includes('treeAlive=false'), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('buildProductionExecuteTurn maps operator abort to stopped and passes the abort signal through', async () => {
  const { buildProductionExecuteTurn } = await import('../../lib/lifecycle/harness/execute-turn.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-turn-abort-'));
  const controller = new AbortController();
  let captured = null;
  try {
    const executeTurn = buildProductionExecuteTurn({
      rootDir,
      aiosRootDir: rootDir,
      sessionId: 'solo-turn-abort',
      objective: 'abort mapping',
      provider: 'codex',
      spawnCommandImpl: async (command, args, options) => {
        captured = { command, args, options };
        return { status: 1, stdout: '', stderr: '', aborted: true, timedOut: false, treeAlive: false };
      },
    });

    const result = await executeTurn({
      iteration: 1,
      continuity: '',
      offloadCanvas: null,
      summary: { workspaceRoot: rootDir, aiosRootDir: rootDir },
      worktree: { enabled: false },
      abortSignal: controller.signal,
    });

    assert.equal(captured.options.signal, controller.signal);
    assert.equal(result.outcome, 'stopped');
    assert.equal(result.shouldStop, true);
    assert.equal(result.failureClass, 'stop-requested');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
