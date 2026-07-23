import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { createGaiaLiveArtifact } from './live-artifacts.mjs';
import { validateGaiaLiveManifest } from './live-manifest.mjs';

function buildJobs(manifest) {
  return manifest.abManifest.runs.flatMap(({ client, model }) => [
    { client, model, arm: 'baseline' },
    { client, model, arm: 'optimized' },
  ]);
}

function assertMode(mode) {
  if (mode !== 'dry-run' && mode !== 'execute') {
    throw new Error('GAIA live runner mode must be dry-run or execute');
  }
}

function assertAdapter(adapter, label) {
  if (typeof adapter !== 'function') {
    throw new Error(`GAIA live execute requires a ${label} adapter`);
  }
}

function parseTaskManifest(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    throw new Error('GAIA live task manifest must be valid JSON');
  }

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('GAIA live task manifest must be an object');
  }
  if (document.schemaVersion !== 1 || !Array.isArray(document.tasks)) {
    throw new Error('GAIA live task manifest must contain schemaVersion 1 and tasks');
  }

  const taskIds = new Set();
  document.tasks.forEach((task, index) => {
    const label = `GAIA live task ${index}`;
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      throw new Error(`${label} must be an object`);
    }
    if (typeof task.taskId !== 'string' || task.taskId.trim().length === 0) {
      throw new Error(`${label}.taskId must be a non-empty string`);
    }
    if (taskIds.has(task.taskId)) {
      throw new Error(`duplicate GAIA live taskId: ${task.taskId}`);
    }
    taskIds.add(task.taskId);
    if (!Number.isInteger(task.level) || task.level < 1 || task.level > 3) {
      throw new Error(`${label}.level must be one of 1, 2, or 3`);
    }
    if (typeof task.prompt !== 'string' || task.prompt.trim().length === 0) {
      throw new Error(`${label}.prompt must be a non-empty string`);
    }
    if (typeof task.expected !== 'string' || task.expected.trim().length === 0) {
      throw new Error(`${label}.expected must be a non-empty string`);
    }
  });

  return document.tasks;
}

function taskForClient(task) {
  const { expected: _expected, ...clientTask } = task;
  return clientTask;
}

function assertEstimatedCost(cost) {
  if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
    throw new Error('GAIA live task cost estimate must be a finite non-negative number');
  }
}

function assertLaunchResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('GAIA live task client must return an outcome object');
  }
  if (typeof result.actual !== 'string' || result.actual.trim().length === 0) {
    throw new Error('GAIA live task client outcome.actual must be a non-empty string');
  }
  if (typeof result.spendUsd !== 'number' || !Number.isFinite(result.spendUsd) || result.spendUsd < 0) {
    throw new Error('GAIA live task client outcome.spendUsd must be a finite non-negative number');
  }
}

async function loadTasks(manifest, readTaskManifest) {
  const text = await readTaskManifest(manifest.execution.taskManifest.path);
  if (typeof text !== 'string') {
    throw new Error('GAIA live task manifest reader must return text');
  }
  const digest = createHash('sha256').update(text).digest('hex');
  if (digest !== manifest.execution.taskManifest.sha256.toLowerCase()) {
    throw new Error('GAIA live task manifest SHA-256 digest mismatch');
  }
  return parseTaskManifest(text).slice(0, manifest.execution.taskManifest.maxTasks);
}

async function writeFailureArtifact({ writeArtifact, job, task, actual = '', status, spendUsd }) {
  const artifact = createGaiaLiveArtifact({
    task,
    job,
    actual,
    status,
    spendUsd,
  });
  await writeArtifact(artifact);
  return artifact;
}

export async function runGaiaLiveEvaluation(rawManifest, {
  mode,
  browserPreflight,
  readTaskManifest = (taskPath) => readFile(taskPath, 'utf8'),
  estimateTaskCost,
  launchTask,
  writeArtifact,
} = {}) {
  assertMode(mode);
  const manifest = validateGaiaLiveManifest(rawManifest);
  const jobs = buildJobs(manifest);

  if (mode === 'dry-run') {
    return { mode, jobs };
  }

  assertAdapter(browserPreflight, 'browser preflight');
  assertAdapter(readTaskManifest, 'task manifest reader');
  const tasks = await loadTasks(manifest, readTaskManifest);
  const browser = await browserPreflight({
    browserProfile: manifest.abManifest.runs[0].arms.baseline.browserProfile,
  });
  if (!browser || browser.ready !== true) {
    throw new Error(browser?.reason || 'GAIA live browser preflight failed');
  }
  assertAdapter(estimateTaskCost, 'task cost estimator');
  assertAdapter(launchTask, 'task client');
  assertAdapter(writeArtifact, 'artifact writer');

  const artifacts = [];
  let remainingSpendUsd = manifest.execution.maxSpendUsd;
  for (const job of jobs) {
    const controls = manifest.abManifest.runs.find((run) => (
      run.client === job.client && run.model === job.model
    )).arms[job.arm];
    const policy = manifest.execution.policies[job.arm];

    for (const task of tasks) {
      let estimatedSpendUsd;
      try {
        estimatedSpendUsd = await estimateTaskCost({ task, job, policy, controls });
        assertEstimatedCost(estimatedSpendUsd);
        if (estimatedSpendUsd > remainingSpendUsd) {
          throw new Error('GAIA live task cost estimate exceeds remaining spend');
        }

        const availableSpendUsd = remainingSpendUsd;
        remainingSpendUsd -= estimatedSpendUsd;
        const result = await launchTask({
          client: job.client,
          model: job.model,
          arm: job.arm,
          policy,
          task: taskForClient(task),
          timeoutSeconds: controls.timeoutSeconds,
          remainingSpendUsd: availableSpendUsd,
        });
        assertLaunchResult(result);
        // A successful call replaces its reservation with the actual spend.
        remainingSpendUsd += estimatedSpendUsd;
        if (result.spendUsd > remainingSpendUsd) {
          const breach = new Error('GAIA live task client spend exceeds remaining spend');
          breach.name = 'SpendLimitBreachError';
          breach.actual = result.actual;
          breach.spendUsd = result.spendUsd;
          throw breach;
        }

        remainingSpendUsd -= result.spendUsd;
        const artifact = createGaiaLiveArtifact({
          task,
          job,
          actual: result.actual,
          status: 'completed',
          spendUsd: result.spendUsd,
        });
        await writeArtifact(artifact);
        artifacts.push(artifact);
      } catch (error) {
        const costLimited = error?.message === 'GAIA live task cost estimate exceeds remaining spend';
        const timedOut = error?.name === 'TimeoutError';
        const spendLimitBreached = error?.name === 'SpendLimitBreachError';
        const artifact = await writeFailureArtifact({
          writeArtifact,
          job,
          task,
          actual: spendLimitBreached ? error.actual : '',
          status: spendLimitBreached
            ? 'spend_limit_breach'
            : (costLimited ? 'cost_limit' : (timedOut ? 'timeout' : 'client_error')),
          spendUsd: spendLimitBreached ? error.spendUsd : (costLimited ? 0 : (estimatedSpendUsd ?? 0)),
        });
        artifacts.push(artifact);
        if (spendLimitBreached) {
          remainingSpendUsd = 0;
          return {
            mode,
            jobs,
            artifacts,
            terminal: {
              status: 'spend_limit_breach',
              remainingSpendUsd: 0,
            },
          };
        }
        break;
      }
    }
  }

  return { mode, jobs, artifacts };
}
