import { reduceDegradationStreak } from '../../rl-core/comparison-engine.mjs';
import { runHoldouts } from '../adapters.mjs';
import { computeMixedEpochOutcome } from '../epoch.mjs';
import { normalizeRewardWeights } from '../reward-config.mjs';
import { adjustExplorationRate, detectStabilityAlerts, tuneRewardWeights } from '../reward-tuning.mjs';
import { clone, safeRatio } from '../shared.mjs';
import { buildMonitoringEpisode } from '../trajectory.mjs';

export async function runMonitoringEpoch(ctx, { batchId, batchRewardSummary }) {
  const monitoringResults = [];
  const monitoringSeen = new Set();
  const comparisonPattern = ctx.mode === 'drill-rollback' ? ['worse', 'worse', 'worse'] : ['better', 'same', 'better'];

  for (let compareIndex = 0; compareIndex < ctx.resolvedEnvironments.length; compareIndex += 1) {
    const environment = ctx.resolvedEnvironments[compareIndex % ctx.resolvedEnvironments.length];
    const task = await sampleMonitoringTask(ctx, environment);
    if (!task) continue;

    const comparison = await compareMonitoringTask(ctx, { task, environment, compareIndex, comparisonPattern });
    monitoringSeen.add(environment);
    monitoringResults.push(buildMonitoringEpisode({ task, comparison, environment, batchIndex: ctx.batchIndex, compareIndex }));
    updateGlobalComparisonCounters(ctx, comparison);
  }

  const degradation = reduceDegradationStreak(monitoringResults);
  const holdouts = await runHoldouts({
    activeEnvironments: ctx.resolvedEnvironments,
    adapters: ctx.adapters,
    activeCheckpointId: ctx.controlState.active_checkpoint_id,
    baselineCheckpointId: ctx.controlState.last_stable_checkpoint_id,
    orchestratorHoldoutHarnessMode: ctx.orchestratorHoldoutHarnessMode,
    orchestratorHoldoutHarnessOptions: {
      rootDir: ctx.orchestratorHoldoutHarnessOptions.rootDir || ctx.rootDir,
      ...ctx.orchestratorHoldoutHarnessOptions,
    },
  });
  Object.assign(ctx.holdout_validation, holdouts);

  const metrics = buildEpochMetrics(ctx, { monitoringResults, monitoringSeen, degradation, holdouts });
  updateBatchSummaryWithMonitoring(ctx, { batchId, batchRewardSummary, holdouts, metrics });
  return { holdouts, ...metrics };
}

async function sampleMonitoringTask(ctx, environment) {
  const adapter = ctx.adapters[environment];
  const task = await adapter.sampleTask({ seed: ctx.batchIndex + 100, attempt: ctx.attempts[environment] });
  ctx.attempts[environment] += 1;
  return task;
}

async function compareMonitoringTask(ctx, { task, environment, compareIndex, comparisonPattern }) {
  const adapter = ctx.adapters[environment];
  const comparison = await adapter.compareAgainstReference({
    task,
    activeCheckpointId: ctx.controlState.active_checkpoint_id,
    preUpdateRefCheckpointId: ctx.controlState.pre_update_ref_checkpoint_id || ctx.controlState.last_stable_checkpoint_id,
  });
  if (ctx.mode !== 'drill-rollback') return comparison;
  return {
    ...comparison,
    comparison_status: 'completed',
    relative_outcome: comparisonPattern[compareIndex] || 'worse',
    replay_route: 'negative',
  };
}

function updateGlobalComparisonCounters(ctx, comparison) {
  if (comparison.comparison_status === 'comparison_failed') {
    ctx.comparisonFailedCount += 1;
  } else if (comparison.relative_outcome === 'better') {
    ctx.betterCount += 1;
  } else if (comparison.relative_outcome === 'same') {
    ctx.sameCount += 1;
  } else if (comparison.relative_outcome === 'worse') {
    ctx.worseCount += 1;
  }
}

function buildEpochMetrics(ctx, { monitoringResults, monitoringSeen, degradation, holdouts }) {
  const coverage_sufficient = ctx.resolvedEnvironments.every((environment) => monitoringSeen.has(environment));
  const shell_safety_gate_passed = holdouts.shell ? holdouts.shell.status !== 'failed' : true;
  const batchComparisonFailedCount = monitoringResults.filter((result) => result.comparison_status === 'comparison_failed').length;
  const batchBetterCount = monitoringResults.filter((result) => result.relative_outcome === 'better').length;
  const batchWorseCount = monitoringResults.filter((result) => result.relative_outcome === 'worse').length;
  const epochOutcome = computeMixedEpochOutcome({
    coverage_sufficient,
    shell_safety_gate_passed,
    comparison_failed_count: batchComparisonFailedCount,
    degradation_streak: degradation.degradationStreak,
    better_count: batchBetterCount,
    worse_count: batchWorseCount,
  });
  return {
    coverage_sufficient,
    shell_safety_gate_passed,
    batchComparisonFailedCount,
    batchBetterCount,
    batchWorseCount,
    degradationStreak: degradation.degradationStreak,
    epochOutcome,
  };
}

function updateBatchSummaryWithMonitoring(ctx, { batchId, batchRewardSummary, holdouts, metrics }) {
  const summary = ctx.batchSummaries[ctx.batchSummaries.length - 1];
  summary.epoch_outcome = metrics.epochOutcome.epoch_outcome;
  summary.coverage_sufficient = metrics.coverage_sufficient;
  const projectedRollbackCount = ctx.rollbacksCompleted + (metrics.epochOutcome.epoch_outcome === 'rollback' ? 1 : 0);
  const rollbackRate = safeRatio(projectedRollbackCount, ctx.updatesCompleted);
  ctx.latestStability = detectStabilityAlerts({
    batchId,
    epochOutcome: metrics.epochOutcome.epoch_outcome,
    degradationStreak: metrics.degradationStreak,
    batchBetterCount: metrics.batchBetterCount,
    batchWorseCount: metrics.batchWorseCount,
    holdouts,
    banditRewardSummary: batchRewardSummary,
    rollbackRate,
    guardrails: ctx.guardrailConfig,
  });
  ctx.stabilityAlerts.push(...ctx.latestStability.alerts);
  summary.stability_alerts = clone(ctx.latestStability.alerts);

  ctx.latestRewardTuning = tuneRewardWeights({
    weights: ctx.resolvedRewardWeights,
    autoTuneConfig: ctx.autoTuneConfig,
    banditRewardSummary: batchRewardSummary,
    epochOutcome: metrics.epochOutcome.epoch_outcome,
    batchBetterCount: metrics.batchBetterCount,
    batchWorseCount: metrics.batchWorseCount,
    holdouts,
  });
  ctx.resolvedRewardWeights = normalizeRewardWeights(ctx.resolvedRewardWeights, ctx.latestRewardTuning.weights);
  summary.reward_tuning = clone(ctx.latestRewardTuning);

  const annealStep = adjustExplorationRate({
    currentRate: ctx.currentTrainerConfig.contextual_bandit_exploration_rate,
    guardrails: ctx.guardrailConfig,
    epochOutcome: metrics.epochOutcome.epoch_outcome,
    hasCriticalDrift: ctx.latestStability.has_critical,
  });
  ctx.currentTrainerConfig = { ...ctx.currentTrainerConfig, contextual_bandit_exploration_rate: annealStep.next_rate };
  ctx.annealingHistory.push({ batch_id: batchId, ...annealStep });
  summary.annealing = clone(annealStep);
  metrics.annealStep = annealStep;
}
