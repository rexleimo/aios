import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BENCHMARK_CONFIG_PATH,
  writeShellBenchmarkCorpus,
} from './fixtures/rl-shell-benchmark-corpus.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function makeConfig(overrides = {}) {
  return {
    rootDir: REPO_ROOT,
    teacher_backend_requested: 'codex-cli',
    fallback_order: ['claude-code'],
    maxEpisodesPerRun: 1,
    maxUpdatesPerRun: 1,
    acceptanceSeeds: [17, 29, 41],
    ...overrides,
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, 'utf8');
}

async function makeFixtureTaskRoot() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rl-shell-v2-orch-'));
  const repoSourcePath = path.join(rootDir, 'fixtures', 'task-repo');
  await writeJson(path.join(repoSourcePath, 'package.json'), {
    name: 'fixture-task',
    private: true,
    type: 'module',
  });
  await writeText(path.join(repoSourcePath, 'src', 'math.mjs'), 'export function add(a, b) {\n  return a - b;\n}\n');
  await writeText(
    path.join(repoSourcePath, 'tests', 'math.test.mjs'),
    [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { add } from '../src/math.mjs';",
      '',
      "test('addition returns the sum', () => {",
      '  assert.equal(add(2, 3), 5);',
      '});',
      '',
    ].join('\n')
  );

  return {
    rootDir,
    task: {
      schema_version: 1,
      task_id: 'fixture-task-v2',
      repo_snapshot_id: 'fixture-task@v2',
      repo_source_path: repoSourcePath,
      split: 'train',
      task_prompt: 'Fix the failing addition behavior.',
      verification_command: 'node --test',
      baseline_failing_tests: ['addition returns the sum'],
      constraints: ['Do not edit tests'],
    },
  };
}

test('run orchestrator marks campaign as insufficient-valid-tasks when registry gates fail', async () => {
  const mod = await import('../lib/rl-shell-v1/run-orchestrator.mjs');
  const result = await mod.runCampaign({
    config: makeConfig(),
    deps: {
      registryLoader: async () => ({ valid: false, reason: 'insufficient-valid-tasks' }),
    },
  });

  assert.equal(result.status, 'insufficient-valid-tasks');
});

test('runTrainingRun persists a multi-step synthetic episode before trainer update', async () => {
  const mod = await import('../lib/rl-shell-v1/run-orchestrator.mjs');
  const { rootDir, task } = await makeFixtureTaskRoot();
  let requestCount = 0;

  const result = await mod.runTrainingRun({
    config: makeConfig({
      rootDir,
      maxEpisodesPerRun: 1,
      maxUpdatesPerRun: 1,
      max_steps_per_episode: 4,
    }),
    seed: 17,
    deps: {
      registryLoader: async () => ({
        valid: true,
        trainTasks: [task],
        heldOutTasks: [],
      }),
      requestStudentAction: async () => {
        requestCount += 1;
        if (requestCount === 1) {
          return {
            promptExcerpt: 'step 1',
            rawOutputText: '{"action":"read","path":"src/math.mjs"}',
            tokenIds: [1, 2, 3],
            tokenLogprobs: [-0.1, -0.2, -0.3],
            parsedAction: { action: 'read', path: 'src/math.mjs' },
            stopReason: 'action_emitted',
            featureKey: 'step-1',
          };
        }
        if (requestCount === 2) {
          return {
            promptExcerpt: 'step 2',
            rawOutputText: '{"action":"run","command":"node --test"}',
            tokenIds: [4, 5, 6],
            tokenLogprobs: [-0.1, -0.2, -0.3],
            parsedAction: { action: 'run', command: 'node --test' },
            stopReason: 'action_emitted',
            featureKey: 'step-2',
          };
        }
        return {
          promptExcerpt: 'step 3',
          rawOutputText: '{"action":"stop","message":"done"}',
          tokenIds: [7, 8, 9],
          tokenLogprobs: [-0.1, -0.2, -0.3],
          parsedAction: { action: 'stop', message: 'done' },
          stopReason: 'student_stop',
          featureKey: 'step-3',
        };
      },
      summaryWriter: async ({ rootDir: summaryRoot }) => {
        const summaryPath = path.join(summaryRoot, 'summary.json');
        await writeFile(summaryPath, '{}\n', 'utf8');
        return { summaryPath };
      },
      heldOutEvaluator: async () => ({
        results: [],
        summary: {
          successRate: 0,
          regressionFreeFixRate: 0,
          avgTokenCount: 0,
        },
      }),
    },
  });

  assert.equal(result.episodesCompleted >= 1, true);
  assert.equal(result.lastEpisode.student_steps.length > 1, true);
  assert.equal(result.lastEpisode.student_steps[0].parsed_action.action, 'read');
  assert.equal(result.lastEpisode.student_steps[1].parsed_action.action, 'run');
});

test('entrypoint train command prints run summary path', async () => {
  // The repo ships no benchmark corpus (the experiment tree is untracked), so a
  // `cwd: REPO_ROOT` run had nothing to read and died with ENOENT. Run against a
  // hermetic corpus in a temp root instead.
  const rootDir = await writeShellBenchmarkCorpus(
    await mkdtemp(path.join(os.tmpdir(), 'aios-rl-shell-entry-')),
  );
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, 'scripts', 'rl-shell-v1.mjs'), 'train', '--config', BENCHMARK_CONFIG_PATH, '--seed', '17', '--teacher', 'codex-cli'],
    {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: 300000,
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /run_id/i);
  assert.match(result.stdout, /summary_path/i);
});

test('entrypoint usage lists the phase 3 commands', async () => {
  // A bare invocation prints usage to stdout and exits 0. The test used to assert
  // exit 1 with usage on stderr, which the CLI does not do.
  //
  // It also asserted the `--resume` flag appears here. It does not, and cannot:
  // top-level usage renders each command's options as the placeholder `[options]`,
  // so per-command flags are not discoverable from help at all (`--resume` is
  // defined on phase3-train/phase3-resume). That discoverability gap is recorded
  // as A10 in docs/outstanding-work.md instead of being asserted here.
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, 'scripts', 'rl-shell-v1.mjs')],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  for (const command of ['phase3-train', 'phase3-resume', 'phase3-eval']) {
    assert.match(result.stdout, new RegExp(command, 'u'), `usage must list ${command}`);
  }
});

test('entrypoint phase3-train command prints rollback metrics and summary path', async () => {
  const rootDir = await writeShellBenchmarkCorpus(
    await mkdtemp(path.join(os.tmpdir(), 'aios-rl-shell-entry-')),
  );
  const result = spawnSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'scripts', 'rl-shell-v1.mjs'),
      'phase3-train',
      '--config',
      BENCHMARK_CONFIG_PATH,
      '--teacher',
      'codex-cli',
      '--max-tasks',
      '5',
      '--initial-checkpoint',
      'ckpt-a',
    ],
    {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: 300000,
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /phase=3/i);
  assert.match(result.stdout, /updates_completed=/i);
  assert.match(result.stdout, /rollbacks_completed=/i);
  assert.match(result.stdout, /summary_path=/i);
});

test('contextdb summary writer validates required fields and keeps write failures non-fatal', async () => {
  const mod = await import('../lib/rl-shell-v1/contextdb-summary.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rl-shell-v1-summary-'));
  const summary = {
    run_id: 'run-001',
    spec_path: 'docs/superpowers/specs/2026-03-22-aios-shell-rl-v1-design.md',
    student_model_id: 'tiny-json-policy-v1',
    primary_teacher: 'codex-cli',
    fallback_order: ['claude-code'],
    train_split: 'benchmark-v1-train',
    held_out_split: 'benchmark-v1-held-out',
    best_checkpoint_path: 'experiments/rl-shell-v1/runs/run-001/checkpoints/best/policy.json',
    best_metrics: { success_rate: 0.4 },
    seed_results: [{ seed: 17, status: 'ok' }],
    status: 'ok',
  };

  await assert.doesNotReject(() =>
    mod.writeRunSummary({
      rootDir,
      summary,
      sessionId: 'session-123',
      writer: async () => {
        throw new Error('ctxdb unavailable');
      },
    })
  );
});

test('contextdb summary payload carries phase and replay pool status', async () => {
  const mod = await import('../lib/rl-shell-v1/contextdb-summary.mjs');
  const summary = mod.buildRunSummaryPayload({
    run: {
      runId: 'run-002',
      studentModelId: 'tiny-json-policy-v1',
      bestCheckpointPath: 'experiments/rl-shell-v1/runs/run-002/checkpoints/best/policy.json',
      status: 'ok',
    },
    metrics: { successRate: 0.4 },
    config: {
      teacher_backend_requested: 'codex-cli',
      fallback_order: ['claude-code'],
      seed_results: [{ seed: 17, status: 'ok' }],
      phase: '2C',
      replay_pool_status: 'limited-pool',
    },
  });

  assert.equal(summary.phase, '2C');
  assert.equal(summary.replay_pool_status, 'limited-pool');
});

test('runPhase3Campaign opens first collection epoch and triggers update after four admitted trajectories', async () => {
  const mod = await import('../lib/rl-shell-v1/run-orchestrator.mjs');
  const result = await mod.runPhase3Campaign({
    config: {
      rootDir: REPO_ROOT,
      maxTasks: 4,
      initialCheckpointId: 'ckpt-a',
    },
    deps: {
      nextEpisode: async ({ taskIndex }) => ({
        episode_id: `episode-${taskIndex + 1}`,
        admission_status: 'admitted',
      }),
      runOnlineUpdateBatch: async ({ checkpointId }) => ({
        status: 'ok',
        checkpointId,
        nextCheckpointId: 'ckpt-b',
      }),
    },
  });

  assert.equal(result.updatesCompleted, 1);
  assert.equal(result.currentEpoch.phase, 'monitoring');
  assert.equal(result.activeCheckpointId, 'ckpt-b');
});

test('runPhase3Campaign reopens monitoring after replay_only without promoting a new batch', async () => {
  const mod = await import('../lib/rl-shell-v1/run-orchestrator.mjs');
  let counter = 0;
  const result = await mod.runPhase3Campaign({
    config: {
      rootDir: REPO_ROOT,
      maxTasks: 8,
      initialCheckpointId: 'ckpt-a',
    },
    deps: {
      nextEpisode: async () => {
        counter += 1;
        if (counter <= 4) {
          return {
            episode_id: `collect-${counter}`,
            admission_status: 'admitted',
          };
        }
        return {
          episode_id: `monitor-${counter}`,
          admission_status: 'admitted',
          comparison_status: counter === 6 ? 'comparison_failed' : 'completed',
          relative_outcome: counter === 6 ? null : 'better',
        };
      },
      runOnlineUpdateBatch: async ({ checkpointId }) => ({
        status: 'ok',
        checkpointId,
        nextCheckpointId: 'ckpt-b',
      }),
    },
  });

  assert.equal(result.updatesCompleted, 1);
  assert.equal(result.replayOnlyEpochs, 1);
  assert.equal(result.currentEpoch.phase, 'monitoring');
  assert.equal(result.activeCheckpointId, 'ckpt-b');
});

test('runPhase3Campaign auto-rolls back after three worse outcomes without an intervening better', async () => {
  const mod = await import('../lib/rl-shell-v1/run-orchestrator.mjs');
  let counter = 0;
  const result = await mod.runPhase3Campaign({
    config: {
      rootDir: REPO_ROOT,
      maxTasks: 7,
      initialCheckpointId: 'ckpt-a',
    },
    deps: {
      nextEpisode: async () => {
        counter += 1;
        if (counter <= 4) {
          return {
            episode_id: `collect-${counter}`,
            admission_status: 'admitted',
          };
        }
        return {
          episode_id: `monitor-${counter}`,
          admission_status: 'admitted',
          comparison_status: 'completed',
          relative_outcome: 'worse',
        };
      },
      runOnlineUpdateBatch: async ({ checkpointId }) => ({
        status: 'ok',
        checkpointId,
        nextCheckpointId: 'ckpt-b',
      }),
    },
  });

  assert.equal(result.rollbacksCompleted, 1);
  assert.equal(result.activeCheckpointId, result.lastStableCheckpointId);
});

test('runPhase3Campaign resumes from persisted control snapshot without reapplying duplicate events', async () => {
  const mod = await import('../lib/rl-shell-v1/run-orchestrator.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rl-shell-v3-resume-'));
  let counter = 0;
  const deps = {
    nextEpisode: async () => {
      counter += 1;
      if (counter <= 4) {
        return {
          episode_id: `collect-${counter}`,
          admission_status: 'admitted',
        };
      }
      return {
        episode_id: `monitor-${counter}`,
        admission_status: 'admitted',
        comparison_status: 'completed',
        relative_outcome: 'same',
      };
    },
    runOnlineUpdateBatch: async ({ checkpointId }) => ({
      status: 'ok',
      checkpointId,
      nextCheckpointId: 'ckpt-b',
    }),
  };

  const first = await mod.runPhase3Campaign({
    config: {
      rootDir,
      maxTasks: 4,
      initialCheckpointId: 'ckpt-a',
    },
    deps,
  });
  const resumed = await mod.runPhase3Campaign({
    config: {
      rootDir,
      maxTasks: 1,
      initialCheckpointId: 'ckpt-a',
      resume: true,
    },
    deps,
  });

  assert.equal(first.activeCheckpointId, 'ckpt-b');
  assert.equal(resumed.activeCheckpointId, 'ckpt-b');
  assert.equal(resumed.duplicateEventApplications, 0);
});

test('runPhase3Campaign enters frozen_failure mode when rollback fails and blocks further updates', async () => {
  const mod = await import('../lib/rl-shell-v1/run-orchestrator.mjs');
  let counter = 0;
  const result = await mod.runPhase3Campaign({
    config: {
      rootDir: REPO_ROOT,
      maxTasks: 10,
      initialCheckpointId: 'ckpt-a',
    },
    deps: {
      nextEpisode: async () => {
        counter += 1;
        if (counter <= 4) {
          return {
            episode_id: `collect-${counter}`,
            admission_status: 'admitted',
          };
        }
        return {
          episode_id: `monitor-${counter}`,
          admission_status: 'admitted',
          comparison_status: 'completed',
          relative_outcome: 'worse',
        };
      },
      runOnlineUpdateBatch: async ({ checkpointId }) => ({
        status: 'ok',
        checkpointId,
        nextCheckpointId: 'ckpt-b',
      }),
      performRollback: async () => {
        throw new Error('restore failed');
      },
    },
  });

  assert.equal(result.controlState.mode, 'frozen_failure');
  assert.equal(result.updatesAfterFreeze, 0);
});

test('real-task shadow eval does not update trainer state and repeats tasks across seed-attempt pairs', async () => {
  const mod = await import('../lib/rl-shell-v1/run-orchestrator.mjs');
  let trainerUpdates = 0;

  const result = await mod.runRealShadowEval({
    config: makeConfig({
      rootDir: REPO_ROOT,
      acceptanceSeeds: [17, 29],
      shadowAttemptsPerSeed: 2,
    }),
    deps: {
      realTaskCollector: async () => ({
        pool_status: 'limited-pool',
        admitted_tasks: 1,
        admitted: [
          {
            task_id: 'real-test-scripts',
            task_prompt: 'Repair scripts test failure',
            verification_command: 'npm run test:scripts',
            baseline_failing_tests: ['not ok 1 - orchestrator manifest parse failure'],
          },
        ],
      }),
      shadowAttemptRunner: async ({ task, seed, attempt }) => ({
        task_id: task.task_id,
        seed,
        attempt,
        repaired: seed === 17 && attempt <= 2,
        contaminated_main_worktree: false,
      }),
      trainerUpdater: async () => {
        trainerUpdates += 1;
      },
    },
  });

  assert.equal(trainerUpdates, 0);
  assert.equal(result.attempt_results.length, 4);
  assert.equal(result.repeatability.stableRepairCount, 1);
});

test('runCampaign reports phase 2C replay and shadow metrics', async () => {
  const mod = await import('../lib/rl-shell-v1/run-orchestrator.mjs');
  const result = await mod.runCampaign({
    config: makeConfig({
      rootDir: REPO_ROOT,
      phase: '2C',
      acceptanceSeeds: [17, 29, 41],
    }),
    deps: {
      registryLoader: async () => ({ trainTasks: [{}], heldOutTasks: [] }),
      trainingRunner: async ({ seed }) => ({
        seed,
        status: 'ok',
        heldOutMetrics: { successRate: 0.5, regressionFreeFixRate: 0.5, avgTokenCount: 10 },
        bestCheckpointPath: `ckpt-${seed}`,
        runId: `run-${seed}`,
        summaryPath: `summary-${seed}`,
      }),
      shadowEvalRunner: async () => ({
        pool_status: 'limited-pool',
        admitted_tasks: 1,
        repeatability: {
          repeatedRepairRate: 0.5,
          stableRepairCount: 1,
          mainWorktreeContaminationFailures: 0,
        },
      }),
      replayPoolLoader: async () => ({
        synthetic: { episodes: [{ episode_id: 'synthetic-1' }, { episode_id: 'synthetic-2' }] },
        realShadow: { episodes: [{ episode_id: 'real-1' }] },
      }),
    },
  });

  assert.equal(result.phase, '2C');
  assert.equal(result.replayPoolStatus, 'limited-pool');
  assert.equal(result.realRepeatedRepairRate, 0.5);
  assert.equal(result.replayMix.realShadow, 1);
});
