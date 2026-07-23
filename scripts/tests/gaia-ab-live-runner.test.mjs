import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseGaiaLiveManifest } from '../lib/gaia-ab-eval/live-manifest.mjs';
import { runGaiaLiveEvaluation } from '../lib/gaia-ab-eval/live-runner.mjs';
import { summarizeGaiaScores } from '../lib/gaia-ab-eval/scorer.mjs';

const TASK_DIGEST = 'a'.repeat(64);

function controls() {
  return {
    taskSet: 'gaia-validation-smoke',
    toolProfile: 'common-tools-v1',
    browserProfile: 'common-browser-cdp-v1',
    timeoutSeconds: 300,
    retryPolicy: 'never',
    concurrency: 1,
  };
}

function run(client, model) {
  return {
    client,
    model,
    arms: {
      baseline: controls(),
      optimized: controls(),
    },
  };
}

function liveManifest() {
  return {
    schemaVersion: 1,
    abManifest: {
      schemaVersion: 1,
      report: { aggregateAcrossModels: false },
      runs: [
        run('codex', 'gpt-5.6-terra'),
        run('claude', 'claude-sonnet-5'),
        run('hermes', 'deepseek-v4-pro'),
      ],
    },
    execution: {
      taskManifest: {
        path: 'fixtures/gaia-validation-smoke.json',
        sha256: TASK_DIGEST,
        maxTasks: 3,
      },
      maxSpendUsd: 10,
      artifactDir: '.aios/gaia-ab-artifacts',
      policies: {
        baseline: 'minimal-context-v1',
        optimized: 'on-demand-context-v1',
      },
    },
  };
}

async function withTaskManifest(assertion) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gaia-live-runner-'));
  const taskPath = path.join(directory, 'tasks.json');
  const taskDocument = {
    schemaVersion: 1,
    tasks: [
      {
        taskId: 'smoke-l1',
        level: 1,
        prompt: 'Return yes.',
        expected: 'yes',
      },
      {
        taskId: 'not-selected',
        level: 2,
        prompt: 'Return no.',
        expected: 'no',
      },
    ],
  };
  const text = `${JSON.stringify(taskDocument)}\n`;
  const config = liveManifest();
  config.execution.taskManifest = {
    path: taskPath,
    sha256: createHash('sha256').update(text).digest('hex'),
    maxTasks: 1,
  };
  config.execution.artifactDir = path.join(directory, 'artifacts');

  try {
    await writeFile(taskPath, text, 'utf8');
    await assertion({ config, text });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

test('GAIA live manifest pins client identities and explicit execution limits', () => {
  const parsed = parseGaiaLiveManifest(JSON.stringify(liveManifest()));

  assert.equal(parsed.execution.taskManifest.maxTasks, 3);
  assert.equal(parsed.execution.maxSpendUsd, 10);
  assert.throws(() => {
    const invalid = liveManifest();
    invalid.execution.maxSpendUsd = 0;
    parseGaiaLiveManifest(JSON.stringify(invalid));
  }, /maxSpendUsd/iu);
  assert.throws(() => {
    const invalid = liveManifest();
    invalid.abManifest.runs[1].model = 'sonnet';
    parseGaiaLiveManifest(JSON.stringify(invalid));
  }, /claude.*claude-sonnet-5/iu);
});

test('GAIA live dry-run creates six isolated jobs without launching a client', async () => {
  let launches = 0;
  const result = await runGaiaLiveEvaluation(liveManifest(), {
    mode: 'dry-run',
    browserPreflight: async () => ({ ready: true }),
    launchClient: async () => {
      launches += 1;
      return { actual: 'unreachable' };
    },
  });

  assert.equal(launches, 0);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.jobs.length, 6);
  assert.deepEqual(result.jobs[0], {
    client: 'codex',
    model: 'gpt-5.6-terra',
    arm: 'baseline',
  });
});

test('GAIA live execute blocks every model launch when browser preflight fails', async () => {
  await withTaskManifest(async ({ config, text }) => {
    let launches = 0;

    await assert.rejects(
      () => runGaiaLiveEvaluation(config, {
        mode: 'execute',
        browserPreflight: async () => ({
          ready: false,
          reason: 'browser-use project is missing',
        }),
        readTaskManifest: async () => text,
        launchTask: async () => {
          launches += 1;
          return { actual: 'unreachable', spendUsd: 0.1 };
        },
      }),
      /browser-use project is missing/iu,
    );
    assert.equal(launches, 0);
  });
});

test('GAIA live execute rejects a bad task digest before browser or client adapters run', async () => {
  await withTaskManifest(async ({ config, text }) => {
    config.execution.taskManifest.sha256 = '0'.repeat(64);
    let browserCalls = 0;
    let launches = 0;

    await assert.rejects(
      () => runGaiaLiveEvaluation(config, {
        mode: 'execute',
        browserPreflight: async () => {
          browserCalls += 1;
          return { ready: true };
        },
        readTaskManifest: async () => text,
        estimateTaskCost: async () => 0.1,
        launchTask: async () => {
          launches += 1;
          return { actual: 'unreachable', spendUsd: 0.1 };
        },
        writeArtifact: async () => {},
      }),
      /task manifest SHA-256 digest mismatch/iu,
    );

    assert.equal(browserCalls, 0);
    assert.equal(launches, 0);
  });
});

test('GAIA live execute isolates a cost-limited arm and records a redacted terminal artifact', async () => {
  await withTaskManifest(async ({ config, text }) => {
    config.execution.taskManifest.maxTasks = 2;
    const launches = [];
    const artifacts = [];
    const result = await runGaiaLiveEvaluation(config, {
      mode: 'execute',
      browserPreflight: async () => ({ ready: true }),
      readTaskManifest: async () => text,
      estimateTaskCost: async ({ job, task }) => (
        job.client === 'codex' && job.arm === 'baseline' && task.taskId === 'smoke-l1'
          ? 11
          : 0.1
      ),
      launchTask: async (input) => {
        launches.push(input);
        return {
          actual: input.task.taskId === 'smoke-l1' ? 'yes' : 'no',
          spendUsd: 0.1,
          authorization: 'must-not-be-persisted',
        };
      },
      writeArtifact: async (artifact) => artifacts.push(artifact),
    });

    const failure = artifacts.find((artifact) => artifact.status === 'cost_limit');
    assert.equal(launches.length, 10);
    assert.equal(launches.filter((launch) => launch.client === 'codex' && launch.arm === 'baseline').length, 0);
    assert.equal(artifacts.length, 11);
    assert.deepEqual(Object.keys(failure).sort(), [
      'actual', 'arm', 'client', 'expected', 'level', 'model', 'spendUsd', 'status', 'taskId',
    ]);
    assert.equal(failure.spendUsd, 0);
    assert.equal('prompt' in failure, false);
    assert.equal('authorization' in failure, false);
    assert.equal('error' in failure, false);
    assert.ok(launches.every((launch) => launch.remainingSpendUsd >= 0 && launch.remainingSpendUsd <= 10));
    assert.deepEqual(summarizeGaiaScores(artifacts.filter((artifact) => artifact.status === 'completed')).overall, {
      correct: 10,
      total: 10,
      accuracy: 1,
    });
    assert.equal(result.artifacts.length, 11);
  });
});

test('GAIA live execute reserves timeout cost and isolates the timed-out arm', async () => {
  await withTaskManifest(async ({ config, text }) => {
    config.execution.taskManifest.maxTasks = 2;
    const launches = [];
    const artifacts = [];
    const timeout = new Error('simulated task timeout');
    timeout.name = 'TimeoutError';
    const result = await runGaiaLiveEvaluation(config, {
      mode: 'execute',
      browserPreflight: async () => ({ ready: true }),
      readTaskManifest: async () => text,
      estimateTaskCost: async ({ job, task }) => (
        job.client === 'codex' && job.arm === 'baseline' && task.taskId === 'smoke-l1'
          ? 2
          : 0.1
      ),
      launchTask: async (input) => {
        launches.push(input);
        if (input.client === 'codex' && input.arm === 'baseline' && input.task.taskId === 'smoke-l1') {
          throw timeout;
        }
        return {
          actual: input.task.taskId === 'smoke-l1' ? 'yes' : 'no',
          spendUsd: 0.1,
          authorization: 'must-not-be-persisted',
        };
      },
      writeArtifact: async (artifact) => artifacts.push(artifact),
    });

    const failure = artifacts.find((artifact) => artifact.status === 'timeout');
    const nextJobFirstLaunch = launches.find((launch) => (
      launch.client === 'codex' && launch.arm === 'optimized' && launch.task.taskId === 'smoke-l1'
    ));
    assert.equal(launches.length, 11);
    assert.equal(launches.filter((launch) => launch.client === 'codex' && launch.arm === 'baseline').length, 1);
    assert.equal(artifacts.length, 11);
    assert.equal(failure.spendUsd, 2);
    assert.equal(nextJobFirstLaunch.remainingSpendUsd, 8);
    assert.equal('prompt' in failure, false);
    assert.equal('authorization' in failure, false);
    assert.equal('error' in failure, false);
    assert.deepEqual(summarizeGaiaScores(artifacts.filter((artifact) => artifact.status === 'completed')).overall, {
      correct: 10,
      total: 10,
      accuracy: 1,
    });
    assert.equal(result.artifacts.length, 11);
  });
});

test('GAIA live execute reserves client-error cost and isolates the rejected arm', async () => {
  await withTaskManifest(async ({ config, text }) => {
    config.execution.taskManifest.maxTasks = 2;
    const launches = [];
    const artifacts = [];
    const result = await runGaiaLiveEvaluation(config, {
      mode: 'execute',
      browserPreflight: async () => ({ ready: true }),
      readTaskManifest: async () => text,
      estimateTaskCost: async ({ job, task }) => (
        job.client === 'codex' && job.arm === 'baseline' && task.taskId === 'smoke-l1'
          ? 2
          : 0.1
      ),
      launchTask: async (input) => {
        launches.push(input);
        if (input.client === 'codex' && input.arm === 'baseline' && input.task.taskId === 'smoke-l1') {
          throw new Error('simulated client rejection');
        }
        return {
          actual: input.task.taskId === 'smoke-l1' ? 'yes' : 'no',
          spendUsd: 0.1,
          authorization: 'must-not-be-persisted',
        };
      },
      writeArtifact: async (artifact) => artifacts.push(artifact),
    });

    const failure = artifacts.find((artifact) => artifact.status === 'client_error');
    const nextJobFirstLaunch = launches.find((launch) => (
      launch.client === 'codex' && launch.arm === 'optimized' && launch.task.taskId === 'smoke-l1'
    ));
    assert.equal(launches.length, 11);
    assert.equal(launches.filter((launch) => launch.client === 'codex' && launch.arm === 'baseline').length, 1);
    assert.equal(failure.spendUsd, 2);
    assert.equal(nextJobFirstLaunch.remainingSpendUsd, 8);
    assert.equal('prompt' in failure, false);
    assert.equal('authorization' in failure, false);
    assert.equal('error' in failure, false);
    assert.deepEqual(summarizeGaiaScores(artifacts.filter((artifact) => artifact.status === 'completed')).overall, {
      correct: 10,
      total: 10,
      accuracy: 1,
    });
    assert.equal(result.artifacts.length, 11);
  });
});

test('GAIA live execute reconciles successful actual spend against its estimate', async () => {
  await withTaskManifest(async ({ config, text }) => {
    config.execution.taskManifest.maxTasks = 1;
    const launches = [];
    const result = await runGaiaLiveEvaluation(config, {
      mode: 'execute',
      browserPreflight: async () => ({ ready: true }),
      readTaskManifest: async () => text,
      estimateTaskCost: async ({ job }) => (
        job.client === 'codex' && job.arm === 'baseline' ? 2 : 0.1
      ),
      launchTask: async (input) => {
        launches.push(input);
        return {
          actual: 'yes',
          spendUsd: input.client === 'codex' && input.arm === 'baseline' ? 0.5 : 0.1,
        };
      },
      writeArtifact: async () => {},
    });

    const nextJobFirstLaunch = launches.find((launch) => (
      launch.client === 'codex' && launch.arm === 'optimized'
    ));
    assert.equal(launches.length, 6);
    assert.equal(nextJobFirstLaunch.remainingSpendUsd, 9.5);
    assert.ok(launches.every((launch) => launch.remainingSpendUsd >= 0 && launch.remainingSpendUsd <= 10));
    assert.deepEqual(summarizeGaiaScores(result.artifacts).overall, {
      correct: 6,
      total: 6,
      accuracy: 1,
    });
  });
});

test('GAIA live execute stops globally after an actual spend exceeds its granted limit', async () => {
  await withTaskManifest(async ({ config, text }) => {
    config.execution.taskManifest.maxTasks = 2;
    const launches = [];
    const artifacts = [];
    const result = await runGaiaLiveEvaluation(config, {
      mode: 'execute',
      browserPreflight: async () => ({ ready: true }),
      readTaskManifest: async () => text,
      estimateTaskCost: async () => 0.1,
      launchTask: async (input) => {
        launches.push(input);
        return {
          actual: input.task.taskId === 'smoke-l1' ? 'yes' : 'no',
          spendUsd: input.client === 'codex' && input.arm === 'baseline' ? 11 : 0.1,
          authorization: 'must-not-be-persisted',
        };
      },
      writeArtifact: async (artifact) => artifacts.push(artifact),
    });

    const breach = artifacts.find((artifact) => artifact.status === 'spend_limit_breach');
    assert.equal(launches.length, 1);
    assert.equal(artifacts.length, 1);
    assert.equal(breach.spendUsd, 11);
    assert.equal('prompt' in breach, false);
    assert.equal('authorization' in breach, false);
    assert.equal('error' in breach, false);
    assert.deepEqual(result.terminal, {
      status: 'spend_limit_breach',
      remainingSpendUsd: 0,
    });
  });
});

test('GAIA live execute runs capped local tasks and writes redacted score artifacts', async () => {
  await withTaskManifest(async ({ config, text }) => {
    const launches = [];
    const artifacts = [];
    const result = await runGaiaLiveEvaluation(config, {
      mode: 'execute',
      browserPreflight: async () => ({ ready: true }),
      readTaskManifest: async () => text,
      estimateTaskCost: async () => 0.1,
      launchTask: async (input) => {
        launches.push(input);
        return {
          actual: 'yes',
          spendUsd: 0.1,
          authorization: 'must-not-be-persisted',
        };
      },
      writeArtifact: async (artifact) => artifacts.push(artifact),
    });

    assert.equal(launches.length, 6);
    assert.equal(artifacts.length, 6);
    assert.equal(launches[0].timeoutSeconds, 300);
    assert.equal(launches[0].task.taskId, 'smoke-l1');
    assert.equal('expected' in launches[0].task, false);
    assert.equal('prompt' in artifacts[0], false);
    assert.equal('authorization' in artifacts[0], false);
    assert.deepEqual(summarizeGaiaScores(artifacts).overall, {
      correct: 6,
      total: 6,
      accuracy: 1,
    });
    assert.equal(result.artifacts.length, 6);
  });
});
