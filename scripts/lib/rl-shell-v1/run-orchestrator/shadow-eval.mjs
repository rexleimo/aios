import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createDefaultExecutionPolicy, runVerification } from '../temp-runner.mjs';
import { collectRealTasks } from '../real-task-registry.mjs';
import { createEpisodeWorktree, destroyEpisodeWorktree } from '../worktree-runner.mjs';
import { summarizeRealShadowEval } from '../eval-harness.mjs';

async function runDefaultShadowAttempt({ rootDir, task, seed, attempt }) {
  const workspace = await createEpisodeWorktree({
    rootDir,
    runId: `shadow-s${seed}-a${attempt}`,
    taskId: task.task_id,
  });
  workspace.taskManifest = {
    baseline_failing_tests: task.baseline_failing_tests || [],
  };

  try {
    const verification = await runVerification({
      workspace,
      verificationCommand: task.verification_command,
      policy: {
        ...createDefaultExecutionPolicy(),
        max_steps_per_episode: Number(createDefaultExecutionPolicy().max_steps_per_episode || 0) + 1,
      },
    });
    return {
      task_id: task.task_id,
      seed,
      attempt,
      repaired: verification.verification_status === 'ok',
      contaminated_main_worktree: false,
      verification_status: verification.verification_status,
      tests_after: verification.tests_after,
    };
  } finally {
    await destroyEpisodeWorktree(workspace);
  }
}

export async function runRealShadowEval({ config, deps = {} }) {
  const rootDir = config.rootDir || process.cwd();
  const realTaskCollector = deps.realTaskCollector || (async () => await collectRealTasks({ rootDir }));
  const shadowAttemptRunner = deps.shadowAttemptRunner || runDefaultShadowAttempt;
  const seeds = Array.isArray(config.acceptanceSeeds) && config.acceptanceSeeds.length > 0
    ? config.acceptanceSeeds
    : [17, 29];
  const attemptsPerSeed = Number(config.shadowAttemptsPerSeed || 2);

  const taskPool = await realTaskCollector({ rootDir, config });
  const attemptResults = [];
  for (const task of taskPool.admitted || []) {
    for (const seed of seeds) {
      for (let attempt = 1; attempt <= attemptsPerSeed; attempt += 1) {
        attemptResults.push(await shadowAttemptRunner({ rootDir, task, seed, attempt, config }));
      }
    }
  }

  const repeatability = summarizeRealShadowEval({
    pool_status: taskPool.pool_status,
    admitted_tasks: taskPool.admitted_tasks,
    attempt_results: attemptResults,
  });

  const shadowDir = path.join(rootDir, 'experiments', 'rl-shell-v1', 'shadow-evals');
  await mkdir(shadowDir, { recursive: true });
  const shadowArtifactPath = path.join(shadowDir, `shadow-${Date.now()}.json`);
  await writeFile(shadowArtifactPath, `${JSON.stringify({
    pool_status: taskPool.pool_status,
    admitted_tasks: taskPool.admitted_tasks,
    attempt_results: attemptResults,
    repeatability,
  }, null, 2)}\n`, 'utf8');

  return {
    pool_status: taskPool.pool_status,
    admitted_tasks: taskPool.admitted_tasks,
    admitted: taskPool.admitted || [],
    attempt_results: attemptResults,
    repeatability,
    shadowArtifactPath,
  };
}
