import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
  os,
  path,
  normalizeSoloIterationOutcome,
  runSoloHarnessLoop,
  writeSoloIterationCheckpoint,
  runContextDbCli,
  getSoloHarnessPaths,
  initSoloRunJournal,
  readSoloRunStatus,
} from './support.mjs';

async function prepareRun(rootDir, sessionId = 'pacing-1') {
  await initSoloRunJournal({
    rootDir,
    sessionId,
    objective: 'Pacing objective',
    provider: 'stub-host',
    clientId: 'codex-cli',
    profile: 'standard',
    worktree: { enabled: false, baseRef: 'HEAD', path: '', preserved: false, cleanupReason: '' },
  });
}

const BASE_LOOP = (rootDir) => ({
  rootDir,
  sessionId: 'pacing-1',
  objective: 'Pacing objective',
  provider: 'stub-host',
  clientId: 'codex-cli',
  profile: 'standard',
  sleepImpl: async () => {},
});

test('pacing disabled keeps loop behavior identical: every turn executes, no waits', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-pacing-off-'));
  try {
    await prepareRun(rootDir);
    const waits = [];
    let turns = 0;
    const result = await runSoloHarnessLoop({
      ...BASE_LOOP(rootDir),
      pacing: null,
      maxIterations: 3,
      executeTurn: async ({ iteration }) => {
        turns += 1;
        return {
          outcome: 'success',
          summary: `progress ${iteration}`,
          shouldStop: iteration === 3,
          failureClass: 'none',
        };
      },
      sleepImpl: async (ms) => {
        waits.push(ms);
      },
    });
    assert.equal(turns, 3);
    assert.deepEqual(waits, []);
    assert.equal(result.summary.pacing, null);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('unchanged-poll quiet gate shuts the loop down after the noop threshold', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-pacing-quiet-'));
  try {
    await prepareRun(rootDir);
    let turns = 0;
    const result = await runSoloHarnessLoop({
      ...BASE_LOOP(rootDir),
      pacing: { quietThreshold: 2 },
      maxIterations: 10,
      executeTurn: async () => {
        turns += 1;
        return { outcome: 'noop', summary: 'nothing actionable', shouldStop: false, failureClass: 'no-progress' };
      },
    });

    assert.equal(turns, 2, 'the third poll is refused by the quiet gate');
    assert.equal(result.pacingDecision.action, 'quiet');
    assert.equal(result.pacingDecision.reasonCode, 'unchanged_poll');
    assert.equal(result.summary.status, 'stopped');
    assert.equal(result.summary.lastFailureClass, 'stop-requested');

    const status = await readSoloRunStatus({ rootDir, sessionId: 'pacing-1' });
    assert.equal(status.pacing.consecutiveNoop, 2);
    assert.equal(status.pacing.lastDecision.action, 'quiet');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('quota gate waits instead of burning a turn when the window is exhausted', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-pacing-quota-'));
  try {
    await prepareRun(rootDir);
    let turns = 0;
    const waits = [];
    const sentinel = new Error('PACING_TEST_STOP');
    await assert.rejects(
      () => runSoloHarnessLoop({
        ...BASE_LOOP(rootDir),
        pacing: { quota: { computeQuota: 1 / 1440 } },
        maxIterations: 10,
        executeTurn: async () => {
          turns += 1;
          return { outcome: 'success', summary: 'material progress', shouldStop: false, failureClass: 'none' };
        },
        sleepImpl: async (ms) => {
          waits.push(ms);
          throw sentinel; // 用哨兵终止测试：验证第一次 wait 的时长
        },
      }),
      (error) => error === sentinel,
    );

    assert.equal(turns, 1, 'turn 2 must not execute while quota is exhausted');
    assert.equal(waits.length, 1);
    assert.ok(waits[0] > 23 * 60 * 60 * 1000, 'wait targets the 24h window freeing');

    const status = await readSoloRunStatus({ rootDir, sessionId: 'pacing-1' });
    assert.equal(status.pacing.quota.spendCount, 1, 'only the material turn charged');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('cadence gate spaces turns by the ladder and resets on material progress', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-pacing-cadence-'));
  try {
    await prepareRun(rootDir);
    const outcomes = [
      { outcome: 'noop', summary: 'polling', shouldStop: false, failureClass: 'no-progress' },
      { outcome: 'success', summary: 'material progress', shouldStop: true, failureClass: 'none' },
    ];
    let turns = 0;
    const waits = [];
    const result = await runSoloHarnessLoop({
      ...BASE_LOOP(rootDir),
      pacing: { cadence: { enabled: true, baseDelayMs: 1000, maxDelayMs: 1000, multiplier: 1.5 } },
      maxIterations: 5,
      executeTurn: async () => {
        turns += 1;
        return outcomes[Math.min(turns - 1, outcomes.length - 1)];
      },
      /* 中文注释：cadence 判定用真实时钟；窗口必须大于轮间持久化开销，且 sleep
         必须真实等待让 untilMs 到期，否则 wait 分支会无限重入（生产由真实定时器保证）。 */
      sleepImpl: async (ms) => {
        waits.push(ms);
        await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(ms, 0), 1200)));
      },
    });

    assert.equal(turns, 2);
    assert.ok(waits.length >= 1, 'cadence inserted at least one wait between turns');
    assert.equal(result.summary.pacing.cadence.cadenceClass, 'active_work');
    assert.equal(result.summary.status, 'done');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('safe-bypass grants exactly one read-only turn and seals its material claim', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-pacing-bypass-'));
  try {
    await prepareRun(rootDir);
    const seenBypassFlags = [];
    let turns = 0;
    const result = await runSoloHarnessLoop({
      ...BASE_LOOP(rootDir),
      pacing: { safeBypass: true },
      maxIterations: 10,
      executeTurn: async ({ iteration, bypass }) => {
        turns += 1;
        seenBypassFlags.push(bypass === true);
        if (turns === 1) {
          // 第一轮撞上操作者门 → 触发 bypass 授予。
          return { outcome: 'human-gate', summary: 'needs operator decision', shouldStop: true, failureClass: 'ownership-gate' };
        }
        // 绕行轮试图声称 material 进展 —— 必须被封印降级。
        return { outcome: 'success', summary: 'claiming material progress from bypass', shouldStop: false, failureClass: 'none' };
      },
    });

    assert.deepEqual(seenBypassFlags, [false, true], 'the second turn is the single bypass turn');
    assert.equal(turns, 2, 'the loop stops right after the bypass turn');
    assert.equal(result.summary.status, 'human-gate');
    assert.match(result.summary.lastOutcome, /human-gate/);

    const status = await readSoloRunStatus({ rootDir, sessionId: 'pacing-1' });
    assert.equal(status.pacing.quota.spendCount, 0, 'sealed bypass turn never charges quota');
    assert.match(status.latestEvidence.join('\n'), /safe-bypass: material claims rejected/u);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('safe-bypass disabled keeps human-gate stops immediate', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-pacing-nobypass-'));
  try {
    await prepareRun(rootDir);
    let turns = 0;
    const result = await runSoloHarnessLoop({
      ...BASE_LOOP(rootDir),
      pacing: { safeBypass: false },
      maxIterations: 10,
      executeTurn: async () => {
        turns += 1;
        return { outcome: 'human-gate', summary: 'needs operator', shouldStop: true, failureClass: 'ownership-gate' };
      },
    });
    assert.equal(turns, 1);
    assert.equal(result.summary.status, 'human-gate');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('stop signals abort the active turn tree instead of letting it run to completion', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-pacing-signal-'));
  try {
    await prepareRun(rootDir, 'pacing-signal');
    const observed = { aborted: false, signalSeen: false };
    const result = await runSoloHarnessLoop({
      ...BASE_LOOP(rootDir),
      sessionId: 'pacing-signal',
      objective: 'Signal abort objective',
      maxIterations: 3,
      executeTurn: async ({ abortSignal }) => {
        observed.signalSeen = abortSignal instanceof AbortSignal;
        /* 中文注释：模拟操作者 Ctrl-C：信号处理器应立即中止当前 turn 树。 */
        process.emit('SIGINT');
        await new Promise((resolve) => setTimeout(resolve, 20));
        observed.aborted = abortSignal.aborted === true;
        return { outcome: 'stopped', summary: 'aborted by signal', shouldStop: true, failureClass: 'stop-requested' };
      },
    });

    assert.equal(observed.signalSeen, true, 'loop passes an AbortSignal into the active turn');
    assert.equal(observed.aborted, true, 'SIGINT aborts the active turn tree');
    assert.equal(result.summary.status, 'stopped');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
