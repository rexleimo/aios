import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
  os,
  path,
  readSoloRunSummary,
  readSoloControl,
  runHarnessCommand,
  withFakeProviderPath,
  writeFakeCli,
} from './support.mjs';

test('runHarnessCommand supports dry-run, stop, status, and resume with injected executeTurn', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-harness-command-'));
  const logs = [];

  try {
    await withFakeProviderPath(['codex'], async () => {
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
      assert.equal(dryRunPayload.session.sessionId, 'demo-session');
      assert.equal(dryRunPayload.session.worktree.enabled, true);

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
    });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runHarnessCommand dry-run recognizes OpenCode project skill roots', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-harness-opencode-skills-'));
  const binDir = path.join(rootDir, 'bin');
  const logs = [];
  const originalPath = process.env.PATH;
  const originalPathCase = process.env.Path;
  const originalPathExt = process.env.PATHEXT;

  try {
    await writeFakeCli(binDir, 'opencode');
    await mkdir(path.join(rootDir, '.opencode', 'skills', 'find-skills'), { recursive: true });
    await writeFile(path.join(rootDir, '.opencode', 'skills', 'find-skills', 'SKILL.md'), '# find-skills\n', 'utf8');

    const testPath = `${binDir}${path.delimiter}${originalPath || originalPathCase || ''}`;
    process.env.PATH = testPath;
    process.env.Path = testPath;
    if (process.platform === 'win32') {
      process.env.PATHEXT = originalPathExt || '.COM;.EXE;.BAT;.CMD';
    }

    const dryRun = await runHarnessCommand(
      {
        subcommand: 'run',
        objective: 'Verify OpenCode skill discovery',
        sessionId: 'opencode-session',
        provider: 'opencode',
        dryRun: true,
        json: true,
      },
      {
        rootDir,
        io: { log: (line) => logs.push(String(line)) },
      }
    );

    assert.equal(dryRun.exitCode, 0);
    const payload = JSON.parse(logs.at(-1));
    const skillCheck = payload.checks.find((item) => item.label === 'Skills indexed');
    assert.equal(skillCheck.ok, true);
    assert.match(skillCheck.detail, /1 skills found/u);
  } finally {
    process.env.PATH = originalPath;
    if (originalPathCase === undefined) {
      delete process.env.Path;
    } else {
      process.env.Path = originalPathCase;
    }
    if (originalPathExt === undefined) {
      delete process.env.PATHEXT;
    } else {
      process.env.PATHEXT = originalPathExt;
    }
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runHarnessCommand forwards maxIterations budget to run and resume loops', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-harness-budget-'));
  const logs = [];

  try {
    await withFakeProviderPath(['codex'], async () => {
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
    });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runHarnessCommand persists AIOS install root for workspace-scoped live resumes', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-harness-aios-root-'));
  const logs = [];

  try {
    await withFakeProviderPath(['codex'], async () => {
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
      assert.equal(summary.aiosRootDir, path.resolve('/opt/aios'));
      assert.equal(summary.workspaceRoot, rootDir);
    });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
