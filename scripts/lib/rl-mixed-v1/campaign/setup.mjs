import { applyControlEvent, createControlStateStore, readControlSnapshot, writeControlSnapshot } from '../../rl-core/control-state-store.mjs';
import { createTrainerConfig } from '../../rl-core/trainer.mjs';
import { createDefaultAdapters } from '../adapters.mjs';
import { buildControlSnapshot, normalizeEnvironmentCounts } from '../control.mjs';
import {
  ORCHESTRATOR_BANDIT_REWARD_DEFAULT_WEIGHTS,
  normalizeOpeConfig,
  normalizeRewardAutoTuneConfig,
  normalizeRewardWeights,
  normalizeStabilityGuardrails,
} from '../reward-config.mjs';
import { clamp, toFiniteNumber } from '../shared.mjs';
import { buildPolicyCheckpointMetadata } from '../policy/index.mjs';
import { buildPolicyCheckpointPaths, ensureNamespaceRoot, loadPolicyCheckpoint } from '../policy/checkpoint.mjs';
import { readNdjsonRows } from '../policy/io.mjs';
import { normalizePolicyOpeMetrics } from '../policy/ope.mjs';

export async function createMixedCampaignContext(options) {
  const ctx = await createBaseContext(options);
  ctx.applyTrackedEvent = async (event) => {
    const result = await applyControlEvent(ctx.controlStore, event);
    if (!result.applied) {
      ctx.duplicateEventApplications += 1;
    }
    return result.snapshot;
  };
  ctx.controlState = await initializeControlState(ctx, options.initialCheckpointId, options.resume);
  await restorePolicyIfRequested(ctx, options);
  return ctx;
}

async function createBaseContext({
  rootDir,
  activeEnvironments,
  adapters: adapterOverrides,
  orchestratorHarnessMode,
  orchestratorHarnessOptions,
  orchestratorLiveTaskCollector,
  orchestratorHoldoutHarnessMode,
  orchestratorHoldoutHarnessOptions,
  onlineBatchSize,
  batchTargetCount,
  namespace,
  mode,
  resume,
  policyResumeTarget,
  policyCheckpointMaxVersions,
  rewardWeights,
  rewardAutoTune,
  stabilityGuardrails,
  banditTrainerConfig,
  ope,
}) {
  const adapters = createDefaultAdapters({
    overrides: adapterOverrides,
    rootDir,
    orchestratorHarnessMode,
    orchestratorHarnessOptions,
    orchestratorLiveTaskCollector,
  });
  const resolvedEnvironments = [...activeEnvironments];
  const baseDir = await ensureNamespaceRoot(rootDir, namespace);
  const policyCheckpointPaths = buildPolicyCheckpointPaths(baseDir);
  const opeConfig = normalizeOpeConfig(ope);
  const autoTuneConfig = normalizeRewardAutoTuneConfig(rewardAutoTune);
  const guardrailConfig = normalizeStabilityGuardrails(stabilityGuardrails);
  const baseTrainerConfig = createTrainerConfig({
    ...banditTrainerConfig,
    contextual_bandit_exploration_rate: clamp(
      toFiniteNumber(
        banditTrainerConfig?.contextual_bandit_exploration_rate,
        createTrainerConfig().contextual_bandit_exploration_rate
      ),
      guardrailConfig.min_exploration_rate,
      guardrailConfig.max_exploration_rate
    ),
  });
  const controlStore = await createControlStateStore({ rootDir, namespace });
  const resolvedRewardWeights = normalizeRewardWeights(ORCHESTRATOR_BANDIT_REWARD_DEFAULT_WEIGHTS, rewardWeights);

  return {
    rootDir,
    adapters,
    resolvedEnvironments,
    orchestratorLiveTaskCollector,
    orchestratorHoldoutHarnessMode,
    orchestratorHoldoutHarnessOptions,
    onlineBatchSize,
    batchTargetCount,
    namespace,
    mode,
    policyResumeTarget,
    policyCheckpointMaxVersions,
    policyCheckpointPaths,
    opeConfig,
    autoTuneConfig,
    guardrailConfig,
    controlStore,
    attempts: Object.fromEntries(resolvedEnvironments.map((environment) => [environment, 0])),
    environmentCounts: normalizeEnvironmentCounts(resolvedEnvironments),
    batchCombinations: [],
    batchSummaries: [],
    holdout_validation: {},
    rollbackEventIds: [],
    duplicateEventApplications: 0,
    activePolicy: null,
    referencePolicy: null,
    resolvedRewardWeights,
    currentTrainerConfig: { ...baseTrainerConfig },
    opeLogRows: await readNdjsonRows(policyCheckpointPaths.opeLogPath),
    stabilityAlerts: [],
    annealingHistory: [],
    autoPolicyRollbacks: 0,
    latestOpe: null,
    latestStability: { has_critical: false, alerts: [] },
    latestRewardTuning: { tuned: false, reason: 'init', adjustments: {}, weights: resolvedRewardWeights },
    policyCheckpoint: buildPolicyCheckpointMetadata({
      checkpointPaths: policyCheckpointPaths,
      loadStatus: resume ? 'pending' : 'cold_start',
      loadTarget: policyResumeTarget,
      rewardConfig: { weights: resolvedRewardWeights, auto_tune: autoTuneConfig },
    }),
    controlState: null,
    applyTrackedEvent: null,
    noWorkPolls: 0,
    batchIndex: 0,
    envCursor: 0,
    updatesCompleted: 0,
    rollbacksCompleted: 0,
    replayOnlyEpochs: 0,
    betterCount: 0,
    sameCount: 0,
    worseCount: 0,
    comparisonFailedCount: 0,
  };
}

async function initializeControlState(ctx, initialCheckpointId, resume) {
  let controlState = resume
    ? await readControlSnapshot(ctx.controlStore)
    : await writeControlSnapshot(ctx.controlStore, buildControlSnapshot(initialCheckpointId));
  if (!controlState.active_checkpoint_id) {
    controlState = await writeControlSnapshot(ctx.controlStore, buildControlSnapshot(initialCheckpointId));
  }
  return controlState;
}

async function restorePolicyIfRequested(ctx, { resume, policyResumeTarget, rewardWeights }) {
  if (!resume) return;
  const restoredPolicy = await loadPolicyCheckpoint({
    checkpointPaths: ctx.policyCheckpointPaths,
    resumeTarget: policyResumeTarget,
  });
  ctx.policyCheckpoint = restoredPolicy.metadata;
  if (restoredPolicy.status !== 'loaded') return;
  ctx.activePolicy = restoredPolicy.activePolicy;
  ctx.referencePolicy = restoredPolicy.referencePolicy;
  if (restoredPolicy.rewardConfig?.weights) {
    ctx.resolvedRewardWeights = normalizeRewardWeights(restoredPolicy.rewardConfig.weights, rewardWeights);
  }
  if (restoredPolicy.ope) {
    ctx.latestOpe = normalizePolicyOpeMetrics(restoredPolicy.ope);
  }
  if (restoredPolicy.stability?.last_anneal?.next_rate != null) {
    ctx.currentTrainerConfig.contextual_bandit_exploration_rate = clamp(
      Number(restoredPolicy.stability.last_anneal.next_rate || ctx.currentTrainerConfig.contextual_bandit_exploration_rate),
      ctx.guardrailConfig.min_exploration_rate,
      ctx.guardrailConfig.max_exploration_rate
    );
  }
}
