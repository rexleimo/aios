import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mkdtemp,
  readFile,
  rm,
  os,
  path,
  runSoloHarnessLoop,
  getSoloHarnessPaths,
  initSoloRunJournal,
  requestSoloHarnessStop,
} from './support.mjs';

test('runSoloHarnessLoop exits on requested stop before another executeTurn begins', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-runtime-stop-'));

  try {
    await initSoloRunJournal({
      rootDir,
      sessionId: 'stop-session',
      objective: 'Stop test',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      worktree: {
        enabled: false,
        baseRef: 'HEAD',
        path: '',
        preserved: false,
        cleanupReason: '',
      },
    });
    await requestSoloHarnessStop({ rootDir, sessionId: 'stop-session' });

    let called = 0;
    const result = await runSoloHarnessLoop({
      rootDir,
      sessionId: 'stop-session',
      objective: 'Stop test',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      maxIterations: 3,
      executeTurn: async () => {
        called += 1;
        return {
          outcome: 'success',
          summary: 'unexpected',
          shouldStop: false,
        };
      },
      sleepImpl: async () => {},
    });

    assert.equal(called, 0);
    assert.equal(result.summary.status, 'stopped');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runSoloHarnessLoop emits lifecycle hook evidence and iteration hook logs', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-runtime-hooks-'));

  try {
    await initSoloRunJournal({
      rootDir,
      sessionId: 'hook-session',
      objective: 'Hook validation',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      worktree: {
        enabled: false,
        baseRef: 'HEAD',
        path: '',
        preserved: false,
        cleanupReason: '',
      },
    });

    const hookCalls = [];
    const result = await runSoloHarnessLoop({
      rootDir,
      sessionId: 'hook-session',
      objective: 'Hook validation',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      maxIterations: 1,
      executeTurn: async () => ({
        outcome: 'success',
        summary: 'done with hooks',
        keyChanges: ['scripts/lib/harness/solo-runtime.mjs'],
        keyLearnings: [],
        nextAction: 'none',
        shouldStop: true,
        failureClass: 'none',
      }),
      lifecycleHooks: {
        onTurnStart: ({ iteration }) => {
          hookCalls.push(`start:${iteration}`);
          return 'turn start ok';
        },
        onTurnComplete: ({ outcome }) => {
          hookCalls.push(`complete:${outcome.outcome}`);
          return 'turn complete ok';
        },
        onBeforeContinuityCommit: () => {
          hookCalls.push('pre-commit');
          return 'continuity commit ok';
        },
        onSessionEnd: ({ reason }) => {
          hookCalls.push(`end:${reason}`);
          return 'session end ok';
        },
      },
      sleepImpl: async () => {},
    });

    assert.equal(result.summary.status, 'done');
    assert.equal(hookCalls.includes('start:1'), true);
    assert.equal(hookCalls.includes('complete:success'), true);
    assert.equal(hookCalls.includes('pre-commit'), true);
    assert.equal(hookCalls.includes('end:iteration-stop'), true);

    const paths = getSoloHarnessPaths({ rootDir, sessionId: 'hook-session' });
    const hookRaw = await readFile(paths.hookEventsPath, 'utf8');
    assert.match(hookRaw, /onTurnStart/);
    assert.match(hookRaw, /onTurnComplete/);
    assert.match(hookRaw, /onBeforeContinuityCommit/);
    assert.match(hookRaw, /onSessionEnd/);

    const logRaw = await readFile(
      path.join(paths.iterationDir, 'iteration-0001.log.jsonl'),
      'utf8'
    );
    assert.match(logRaw, /\"kind\":\"hook\"/);
    assert.match(logRaw, /turn-start/);
    assert.match(logRaw, /turn-complete/);
    assert.match(logRaw, /pre-continuity-commit/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('classifySoloFailure does not treat search results mentioning ownership as an ownership gate', async () => {
  const { classifySoloFailure } = await import('../../lib/harness/solo-runtime.mjs');
  const detail = 'docs/plans/plan-ownership-preflight-gates.md\nSearch result mentions ownership, but no gate was raised.';
  assert.equal(classifySoloFailure(detail), 'runtime-error');
});
