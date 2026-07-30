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
