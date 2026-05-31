import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadTaskRegistry, sampleTrainingTask } from '../task-registry.mjs';
import { createStudentPolicy } from '../student-policy.mjs';
import { buildStudentFeatureKey, requestStudentAction } from '../student-runner.mjs';
import { computeTerminalReward, fuseReward } from '../reward-fusion.mjs';
import { applyPpoUpdate, buildMixedReplayBatch, createReferencePolicyFrom, createTrainerConfig, maybeRefreshReferencePolicy } from '../trainer.mjs';
import { appendMetrics, createRunLayout, persistEpisode, writeCheckpointMetadata } from '../trajectory-store.mjs';
import { runHeldOutEval } from '../eval-harness.mjs';
import { buildRunSummaryPayload, writeRunSummary } from '../contextdb-summary.mjs';
import {
  createDefaultExecutionPolicy,
  createEpisodeWorkspace,
  destroyEpisodeWorkspace,
  executeAction,
  getStopConditionCandidate,
  runBaselineFailureCheck,
  runVerification,
} from '../temp-runner.mjs';
import { loadReplayPool } from '../replay-pool.mjs';
import { buildEpisodeRecord } from './episode-record.mjs';
import { clone, createRunId, createTeacherFailureResponse, shouldStopRun } from './helpers.mjs';

export { createRunId, shouldStopRun } from './helpers.mjs';

export async function runTrainingRun({ config, seed, deps = {} }) {
  if (!config.teacher_backend_requested) {
    throw new Error('teacher_backend_requested is required');
  }

  const rootDir = config.rootDir || process.cwd();
  const requestAction = deps.requestStudentAction || requestStudentAction;
  const trainerUpdater = deps.trainerUpdater || applyPpoUpdate;
  const heldOutEvaluator = deps.heldOutEvaluator || runHeldOutEval;
  const summaryWriter = deps.summaryWriter || writeRunSummary;
  const taskSampler = deps.taskSampler || sampleTrainingTask;
  const persistEpisodeFn = deps.persistEpisode || persistEpisode;
  const appendMetricsFn = deps.appendMetrics || appendMetrics;
  const createWorkspace = deps.createWorkspace || createEpisodeWorkspace;
  const destroyWorkspace = deps.destroyWorkspace || destroyEpisodeWorkspace;
  const executeEpisodeAction = deps.executeAction || executeAction;
  const runBaselineCheck = deps.runBaselineCheck || runBaselineFailureCheck;
  const runFinalVerification = deps.runVerification || runVerification;
  const stopConditionResolver = deps.getStopConditionCandidate || getStopConditionCandidate;
  const registryLoader = deps.registryLoader || (async () => await loadTaskRegistry({
    rootDir,
    configPath: config.configPath || '.aios/experiments/rl-shell-v1/configs/benchmark-v1.json',
  }));
  const registry = await registryLoader({ seed, rootDir, config });
  if (registry?.valid === false) {
    return { status: registry.reason || 'invalid-registry', seed };
  }

  const runId = createRunId({ seed });
  const runDir = await createRunLayout({
    rootDir: path.join(rootDir, '.aios', 'experiments', 'rl-shell-v1'),
    runId,
  });

  const task = taskSampler(registry, { seed, attempt: 0 });
  const policy = deps.policyFactory ? await deps.policyFactory({ seed, config }) : createStudentPolicy({ seed });
  let referencePolicy = createReferencePolicyFrom(policy);
  const executionPolicy = {
    ...createDefaultExecutionPolicy(),
    ...Object.fromEntries(
      Object.entries(config).filter(([key]) =>
        ['max_steps_per_episode', 'max_command_seconds', 'max_episode_seconds', 'max_output_bytes_per_stream', 'no_progress_window'].includes(key)
      )
    ),
  };

  const startedAt = new Date();
  const workspace = await createWorkspace({ taskManifest: task, rootDir });
  let baseline;
  let verification;
  const studentSteps = [];
  let stopCondition = 'unsafe_runner_state';
  let stopReason = 'unsafe_runner_state';

  try {
    baseline = await runBaselineCheck({
      workspace,
      verificationCommand: task.verification_command,
      policy: executionPolicy,
    });

    const trace = [{
      task_prompt: task.task_prompt,
      baseline_failing_tests: baseline.failingTests,
    }];
    const maxSteps = Number(config.max_steps_per_episode || executionPolicy.max_steps_per_episode);

    while (studentSteps.length < maxSteps) {
      const studentAction = await requestAction({
        policy,
        trace,
        budget: { remainingSteps: maxSteps - studentSteps.length },
      });
      const parsedAction = studentAction.parsedAction || { action: 'stop', message: 'parse_failed' };
      const observationEvent = await executeEpisodeAction({
        workspace,
        action: parsedAction,
        policy: executionPolicy,
      });

      studentSteps.push({
        step_index: studentSteps.length + 1,
        prompt_excerpt: studentAction.promptExcerpt || task.task_prompt,
        raw_output_text: studentAction.rawOutputText,
        token_ids: studentAction.tokenIds,
        token_logprobs: studentAction.tokenLogprobs,
        parsed_action: parsedAction,
        observation_event: observationEvent,
        feature_key: studentAction.featureKey,
      });
      trace.push({ observation_event: observationEvent });

      const stopCandidate = stopConditionResolver({ workspace, policy: executionPolicy });
      if (stopCandidate) {
        stopCondition = stopCandidate;
        stopReason = stopCandidate;
        break;
      }
      if (parsedAction.action === 'stop') {
        stopCondition = 'student_stop';
        stopReason = studentAction.stopReason || 'student_stop';
        break;
      }
    }

    if (!stopCondition || stopCondition === 'unsafe_runner_state') {
      stopCondition = studentSteps.length >= Number(config.max_steps_per_episode || executionPolicy.max_steps_per_episode)
        ? 'max_steps_reached'
        : stopCondition;
      stopReason = stopCondition === 'max_steps_reached' ? 'budget_exhausted' : stopReason;
    }

    verification = await runFinalVerification({
      workspace,
      verificationCommand: task.verification_command,
      policy: {
        ...executionPolicy,
        max_steps_per_episode: Number(executionPolicy.max_steps_per_episode || 0) + 1,
      },
    });
    if (verification.verification_status === 'ok') {
      stopCondition = 'verification_passed';
      stopReason = 'verification_passed';
    }
  } finally {
    await destroyWorkspace(workspace);
  }

  const terminalReward = computeTerminalReward({
    baselineFailures: baseline.failingTests,
    finalFailures: verification.tests_after,
    newFailures: verification.new_failures,
    verificationStatus: verification.verification_status,
  });

  const teacherResponse = deps.teacherCaller
    ? await deps.teacherCaller({ task, studentSteps, verification, seed, config })
    : createTeacherFailureResponse(config.teacher_backend_requested);

  const rewardParts = {
    terminalReward,
    ...fuseReward({
      terminalReward,
      shapingScore: teacherResponse.shaping_score,
      callStatus: teacherResponse.call_status,
    }),
  };

  const placeholderMetrics = {
    advantage: 0,
    return: 0,
    policy_loss: 0,
    distill_loss: 0,
    kl_loss: 0,
  };
  const episode = buildEpisodeRecord({
    runId,
    task,
    seed,
    startedAt,
    endedAt: new Date(),
    studentSteps: studentSteps.map((step) => ({
      step_index: step.step_index,
      prompt_excerpt: step.prompt_excerpt,
      raw_output_text: step.raw_output_text,
      token_ids: step.token_ids,
      token_logprobs: step.token_logprobs,
      parsed_action: step.parsed_action,
      observation_event: step.observation_event,
    })),
    baseline,
    verification,
    rewardParts,
    teacherResponse,
    trainerMetrics: placeholderMetrics,
    stopCondition,
    stopReason,
    executionPolicy,
  });
  const persistedEpisode = await persistEpisodeFn({ runDir, episode });

  const trainerConfig = createTrainerConfig();
  const trainerResult = trainerUpdater({
    policy,
    referencePolicy,
    trajectory: {
      featureKey: buildStudentFeatureKey({ trace: [{ task_prompt: task.task_prompt, baseline_failing_tests: baseline.failingTests }] }),
      stepFeatureKeys: studentSteps.map((step) => step.feature_key || 'default'),
      stepTokenIds: studentSteps.map((step) => step.token_ids),
      tokenIds: studentSteps.flatMap((step) => step.token_ids),
      rewards: studentSteps.map((_, index) => (index === studentSteps.length - 1 ? rewardParts.fusedReward : 0)),
      distillationStatus: teacherResponse.reference_solution ? 'applied' : 'skipped',
      teacherTokenIds: [],
    },
    config: trainerConfig,
  });
  referencePolicy = maybeRefreshReferencePolicy({
    policy,
    referencePolicy,
    updateCount: policy.updateCount,
    config: trainerConfig,
  });
  const replayPool = deps.replayPool || (config.phase === '2C' ? await loadReplayPool({ rootDir }) : null);
  const replayBatch = replayPool
    ? buildMixedReplayBatch({
        pool: replayPool,
        batchSize: Number(config.replayBatchSize || 5),
      })
    : { realShadow: [], synthetic: [], effectiveRealRatio: 0 };

  await appendMetricsFn({
    runDir,
    metric: {
      step: policy.updateCount,
      reward: rewardParts.fusedReward,
      terminal_reward: rewardParts.terminalReward,
      step_count: studentSteps.length,
      stop_condition: stopCondition,
      episode_path: persistedEpisode.episodePath,
      replay_real_count: replayBatch.realShadow.length,
      replay_synthetic_count: replayBatch.synthetic.length,
    },
  });

  const checkpointPath = path.join(runDir.checkpointsDir, 'best', 'policy.json');
  await mkdir(path.dirname(checkpointPath), { recursive: true });
  await writeFile(checkpointPath, `${JSON.stringify(clone(policy), null, 2)}\n`, 'utf8');
  await writeCheckpointMetadata({
    runDir,
    kind: 'best',
    metadata: { checkpointPath, seed, updateCount: policy.updateCount },
  });
  await writeCheckpointMetadata({
    runDir,
    kind: 'latest',
    metadata: { checkpointPath, seed, updateCount: policy.updateCount },
  });

  const heldOutEval = await heldOutEvaluator({
    checkpoint: policy,
    registry,
    policyFactory: (checkpoint) => checkpoint,
    teacherMode: 'none',
  });

  const summary = buildRunSummaryPayload({
    run: {
      runId,
      studentModelId: 'tiny-json-policy-v1',
      bestCheckpointPath: checkpointPath,
      status: 'ok',
    },
    metrics: heldOutEval.summary,
    config: {
      teacher_backend_requested: config.teacher_backend_requested,
      fallback_order: config.fallback_order || [],
      seed_results: [{ seed, status: 'ok', success_rate: heldOutEval.summary.successRate }],
    },
  });

  const summaryResult = await summaryWriter({
    rootDir,
    summary,
    sessionId: config.sessionId || '',
  });

  return {
    runId,
    seed,
    status: 'ok',
    runDir,
    summaryPath: summaryResult.summaryPath,
    bestCheckpointPath: checkpointPath,
    heldOutMetrics: heldOutEval.summary,
    referencePolicy,
    episodesCompleted: 1,
    updatesCompleted: Number(policy.updateCount || 0),
    replayBatch,
    lastEpisode: {
      ...episode,
      ...trainerResult.metrics,
      student_steps: episode.student_steps,
      advantage: trainerResult.metrics.advantage,
      return: trainerResult.metrics.return,
      replay_eligible: episode.replay_eligible,
      replay_priority: episode.replay_priority,
      stop_condition: episode.stop_condition,
    },
  };
}
