import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  normalizeSoloIterationOutcome,
  resolveSoloBackoffState,
  runSoloHarnessLoop,
  writeSoloIterationCheckpoint,
} from '../lib/harness/solo-runtime.mjs';
import { runContextDbCli } from '../lib/contextdb-cli.mjs';
import {
  getSoloHarnessPaths,
  initSoloRunJournal,
  readSoloRunSummary,
  readSoloControl,
  readSoloRunStatus,
  requestSoloHarnessStop,
} from '../lib/harness/solo-journal.mjs';
import { buildIterationPrompt, runHarnessCommand } from '../lib/lifecycle/harness.mjs';

test('normalizeSoloIterationOutcome fills defaults for a success outcome', () => {
  const success = normalizeSoloIterationOutcome({
    sessionId: 's1',
    iteration: 1,
    outcome: 'success',
    summary: 'done',
    shouldStop: false,
  });

  assert.equal(success.failureClass, 'none');
  assert.equal(success.backoffAction, 'none');
  assert.equal(success.checkpointStatus, 'running');
  assert.equal(success.stage, 'development');
  assert.deepEqual(success.evidence, ['summary: done']);
});

test('normalizeSoloIterationOutcome preserves blocked no-progress decisions', () => {
  const blocked = normalizeSoloIterationOutcome({
    sessionId: 's1',
    iteration: 2,
    outcome: 'blocked',
    summary: 'No safe next mutation',
    stage: 'validation',
    evidence: ['npm test failed'],
    failureClass: 'no-progress',
    shouldStop: false,
  });

  assert.equal(blocked.failureClass, 'no-progress');
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(blocked.stage, 'validation');
  assert.deepEqual(blocked.evidence, ['npm test failed']);
});

test('resolveSoloBackoffState doubles delay for infra failures', () => {
  const infra = resolveSoloBackoffState({
    previous: { consecutiveInfraFailures: 1, nextDelayMs: 60000, until: null },
    outcome: { outcome: 'infra-retry', failureClass: 'runtime-error' },
    nowIso: '2026-04-26T15:00:00.000Z',
  });

  assert.equal(infra.consecutiveInfraFailures, 2);
  assert.equal(infra.nextDelayMs, 120000);
});

test('buildIterationPrompt injects offload canvas as compact resume context', () => {
  const prompt = buildIterationPrompt({
    objective: 'Resume offloaded evidence',
    iteration: 2,
    offloadCanvas: {
      relativePath: '.aios/offload/canvas/demo-session/task-canvas.mmd',
      mermaid: 'graph LR\n    m_n0001_abc123["n0001-abc123 Bash: npm test"]\n',
      truncated: false,
    },
  });

  assert.match(prompt, /Offload Canvas/);
  assert.match(prompt, /\.aios\/offload\/canvas\/demo-session\/task-canvas\.mmd/);
  assert.match(prompt, /n0001-abc123 Bash: npm test/);
  assert.match(prompt, /aios refs grep\/read/);
});

test('runSoloHarnessLoop appends iterations and stops when executeTurn requests it', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-runtime-'));

  try {
    await initSoloRunJournal({
      rootDir,
      sessionId: 's1',
      objective: 'Ship X',
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

    const result = await runSoloHarnessLoop({
      rootDir,
      sessionId: 's1',
      objective: 'Ship X',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      maxIterations: 2,
      executeTurn: async ({ iteration }) => ({
        outcome: iteration === 1 ? 'success' : 'stopped',
        summary: iteration === 1 ? 'made progress' : 'operator requested stop',
        keyChanges: iteration === 1 ? ['docs/checklist.md'] : [],
        keyLearnings: [],
        nextAction: 'continue',
        shouldStop: iteration === 2,
        failureClass: iteration === 2 ? 'stop-requested' : 'none',
      }),
      sleepImpl: async () => {},
    });

    assert.equal(result.summary.iterationCount, 2);
    assert.equal(result.summary.status, 'stopped');

    const status = await readSoloRunStatus({ rootDir, sessionId: 's1' });
    assert.equal(status.iterationCount, 2);
    assert.equal(status.lastFailureClass, 'stop-requested');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runSoloHarnessLoop passes offload canvas to executeTurn', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-runtime-offload-canvas-'));

  try {
    await initSoloRunJournal({
      rootDir,
      sessionId: 'canvas-session',
      objective: 'Resume with canvas',
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
    const canvasDir = path.join(rootDir, '.aios', 'offload', 'canvas', 'canvas-session');
    await mkdir(canvasDir, { recursive: true });
    await writeFile(
      path.join(canvasDir, 'task-canvas.mmd'),
      'graph LR\n    m_n0001_abc123["n0001-abc123 Bash: npm test"]\n',
      'utf8'
    );

    let capturedCanvas = null;
    await runSoloHarnessLoop({
      rootDir,
      sessionId: 'canvas-session',
      objective: 'Resume with canvas',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      maxIterations: 1,
      executeTurn: async ({ offloadCanvas }) => {
        capturedCanvas = offloadCanvas;
        return {
          outcome: 'success',
          summary: 'used canvas',
          keyChanges: [],
          keyLearnings: [],
          nextAction: 'done',
          shouldStop: true,
          failureClass: 'none',
        };
      },
      sleepImpl: async () => {},
    });

    assert.ok(capturedCanvas);
    assert.match(capturedCanvas.relativePath, /\.aios\/offload\/canvas\/canvas-session\/task-canvas\.mmd/);
    assert.match(capturedCanvas.mermaid, /n0001-abc123 Bash: npm test/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runSoloHarnessLoop writes stage checkpoint evidence through checkpoint writer', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-runtime-stage-checkpoint-'));

  try {
    await initSoloRunJournal({
      rootDir,
      sessionId: 'stage-session',
      objective: 'Ship checkpoint strengthening',
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

    const checkpoints = [];
    const result = await runSoloHarnessLoop({
      rootDir,
      sessionId: 'stage-session',
      objective: 'Ship checkpoint strengthening',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      maxIterations: 1,
      executeTurn: async () => ({
        outcome: 'success',
        stage: 'validation',
        summary: 'validated harness stage evidence',
        evidence: ['node --test scripts/tests/harness-runtime.test.mjs'],
        keyChanges: ['scripts/lib/harness/solo-runtime.mjs'],
        keyLearnings: [],
        nextAction: 'ship',
        shouldStop: true,
        failureClass: 'none',
      }),
      checkpointWriter: async (payload) => {
        checkpoints.push(payload);
        return { persisted: true, checkpointId: 'stage-session#C1' };
      },
      sleepImpl: async () => {},
    });

    assert.equal(result.summary.status, 'done');
    assert.equal(checkpoints.length, 1);
    assert.equal(checkpoints[0].outcome.stage, 'validation');
    assert.deepEqual(checkpoints[0].outcome.evidence, ['node --test scripts/tests/harness-runtime.test.mjs']);
    assert.equal(checkpoints[0].summary.objective, 'Ship checkpoint strengthening');

    const paths = getSoloHarnessPaths({ rootDir, sessionId: 'stage-session' });
    const logRaw = await readFile(path.join(paths.iterationDir, 'iteration-0001.log.jsonl'), 'utf8');
    assert.match(logRaw, /\"kind\":\"checkpoint\"/);
    assert.match(logRaw, /stage-session#C1/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('writeSoloIterationCheckpoint persists stage telemetry into ContextDB when session exists', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-runtime-contextdb-checkpoint-'));

  try {
    runContextDbCli(['init', '--workspace', rootDir]);
    runContextDbCli([
      'session:new',
      '--workspace',
      rootDir,
      '--agent',
      'codex-cli',
      '--project',
      'checkpoint-test',
      '--goal',
      'Persist solo stage checkpoints',
      '--session-id',
      'ctx-stage-session',
    ]);

    const outcome = normalizeSoloIterationOutcome({
      sessionId: 'ctx-stage-session',
      iteration: 1,
      outcome: 'success',
      stage: 'validation',
      summary: 'validated stage checkpoint persistence',
      evidence: ['node --test scripts/tests/harness-runtime.test.mjs'],
      keyChanges: ['scripts/lib/harness/solo-runtime.mjs'],
      nextAction: 'continue',
      shouldStop: true,
      failureClass: 'none',
    });

    const result = await writeSoloIterationCheckpoint({
      rootDir,
      sessionId: 'ctx-stage-session',
      summary: { objective: 'Persist solo stage checkpoints' },
      outcome,
    });

    assert.equal(result.persisted, true);
    assert.equal(result.checkpointId, 'ctx-stage-session#C1');

    const checkpointsPath = path.join(rootDir, '.aios', 'context-db', 'sessions', 'ctx-stage-session', 'l1-checkpoints.jsonl');
    const checkpointsRaw = await readFile(checkpointsPath, 'utf8');
    const checkpoint = JSON.parse(checkpointsRaw.trim());
    assert.equal(checkpoint.status, 'done');
    assert.match(checkpoint.summary, /^\[validation\]/);
    assert.equal(checkpoint.telemetry.verification.result, 'passed');
    assert.match(checkpoint.telemetry.verification.evidence, /stage=validation/);
    assert.deepEqual(checkpoint.artifacts, [
      'node --test scripts/tests/harness-runtime.test.mjs',
      'scripts/lib/harness/solo-runtime.mjs',
    ]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runHarnessCommand supports dry-run, stop, status, and resume with injected executeTurn', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-harness-command-'));
  const logs = [];

  try {
    const dryRun = await runHarnessCommand(
      {
        subcommand: 'run',
        objective: 'Ship release checklist',
        sessionId: 'demo-session',
        provider: 'codex',
        profile: 'standard',
        worktree: true,
        baseRef: 'HEAD',
        dryRun: true,
        json: true,
      },
      {
        rootDir,
        io: { log: (line) => logs.push(String(line)) },
      }
    );
    assert.equal(dryRun.exitCode, 0);
    const dryRunPayload = JSON.parse(logs.at(-1));
    assert.equal(dryRunPayload.sessionId, 'demo-session');
    assert.equal(dryRunPayload.worktree.enabled, true);

    const stopResult = await runHarnessCommand(
      { subcommand: 'stop', sessionId: 'demo-session', json: true },
      { rootDir, io: { log: (line) => logs.push(String(line)) } }
    );
    assert.equal(stopResult.exitCode, 0);
    const control = await readSoloControl({ rootDir, sessionId: 'demo-session' });
    assert.equal(control.stopRequested, true);

    const statusResult = await runHarnessCommand(
      { subcommand: 'status', sessionId: 'demo-session', json: true },
      { rootDir, io: { log: (line) => logs.push(String(line)) } }
    );
    assert.equal(statusResult.exitCode, 0);
    const statusPayload = JSON.parse(logs.at(-1));
    assert.equal(statusPayload.stopRequested, true);

    const resumeResult = await runHarnessCommand(
      {
        subcommand: 'resume',
        sessionId: 'demo-session',
        json: true,
      },
      {
        rootDir,
        io: { log: (line) => logs.push(String(line)) },
        executeTurn: async () => ({
          outcome: 'success',
          summary: 'resumed successfully',
          keyChanges: ['README.md'],
          keyLearnings: [],
          nextAction: 'done',
          shouldStop: true,
          failureClass: 'none',
        }),
        sleepImpl: async () => {},
      }
    );
    assert.equal(resumeResult.exitCode, 0);
    const finalPayload = JSON.parse(logs.at(-1));
    assert.equal(finalPayload.lastOutcome, 'success');
    assert.equal(finalPayload.status, 'done');

    const finalControl = await readSoloControl({ rootDir, sessionId: 'demo-session' });
    assert.equal(finalControl.stopRequested, false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runHarnessCommand forwards maxIterations budget to run and resume loops', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-harness-budget-'));
  const logs = [];

  try {
    const runResult = await runHarnessCommand(
      {
        subcommand: 'run',
        objective: 'Budget test',
        sessionId: 'budget-session',
        provider: 'codex',
        profile: 'standard',
        worktree: false,
        maxIterations: 1,
        json: true,
      },
      {
        rootDir,
        io: { log: (line) => logs.push(String(line)) },
        executeTurn: async ({ iteration }) => ({
          outcome: 'success',
          summary: `iteration ${iteration}`,
          keyChanges: [],
          keyLearnings: [],
          nextAction: 'continue',
          shouldStop: false,
          failureClass: 'none',
        }),
        sleepImpl: async () => {},
      }
    );
    assert.equal(runResult.exitCode, 0);
    assert.equal(runResult.status.iterationCount, 2);
    assert.equal(runResult.status.status, 'human-gate');
    assert.equal(runResult.status.lastFailureClass, 'safety-gate');

    const resumeResult = await runHarnessCommand(
      {
        subcommand: 'resume',
        sessionId: 'budget-session',
        maxIterations: 1,
        json: true,
      },
      {
        rootDir,
        io: { log: (line) => logs.push(String(line)) },
        executeTurn: async ({ iteration }) => ({
          outcome: 'success',
          summary: `resume iteration ${iteration}`,
          keyChanges: [],
          keyLearnings: [],
          nextAction: 'continue',
          shouldStop: false,
          failureClass: 'none',
        }),
        sleepImpl: async () => {},
      }
    );
    assert.equal(resumeResult.exitCode, 0);
    assert.equal(resumeResult.status.iterationCount, 3);
    assert.equal(resumeResult.status.status, 'human-gate');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runHarnessCommand persists AIOS install root for workspace-scoped live resumes', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-harness-aios-root-'));
  const logs = [];

  try {
    const runResult = await runHarnessCommand(
      {
        subcommand: 'run',
        objective: 'External workspace',
        sessionId: 'external-session',
        provider: 'codex',
        profile: 'standard',
        worktree: false,
        maxIterations: 1,
        json: true,
      },
      {
        rootDir,
        aiosRootDir: '/opt/aios',
        io: { log: (line) => logs.push(String(line)) },
        executeTurn: async () => ({
          outcome: 'success',
          summary: 'stop after first pass',
          keyChanges: [],
          keyLearnings: [],
          nextAction: 'done',
          shouldStop: true,
          failureClass: 'none',
        }),
        sleepImpl: async () => {},
      }
    );

    assert.equal(runResult.exitCode, 0);
    const summary = await readSoloRunSummary({ rootDir, sessionId: 'external-session' });
    assert.equal(summary.aiosRootDir, '/opt/aios');
    assert.equal(summary.workspaceRoot, rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

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
