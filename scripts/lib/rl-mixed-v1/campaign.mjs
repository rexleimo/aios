import { createMixedCampaignContext } from './campaign/setup.mjs';
import { collectBatchEpisodes } from './campaign/collection.mjs';
import { applyTrainingBatch } from './campaign/training.mjs';
import { runMonitoringEpoch } from './campaign/monitoring.mjs';
import { applyEpochTransitionAndPolicyPersistence } from './campaign/epoch-transition.mjs';
import { buildDrillResumeResult, buildFinalResult, buildNoWorkResult } from './campaign/results.mjs';
import { POLICY_CHECKPOINT_DEFAULT_MAX_VERSIONS } from './policy/constants.mjs';

export async function runMixedCampaign({
  rootDir = process.cwd(),
  activeEnvironments = ['shell', 'browser', 'orchestrator'],
  adapters: adapterOverrides = {},
  orchestratorHarnessMode = 'fixture',
  orchestratorHarnessOptions = {},
  orchestratorLiveTaskCollector = null,
  orchestratorHoldoutHarnessMode = orchestratorHarnessMode,
  orchestratorHoldoutHarnessOptions = orchestratorHarnessOptions,
  initialCheckpointId = 'ckpt-mixed-a',
  onlineBatchSize = 4,
  batchTargetCount = 3,
  namespace = 'rl-mixed-v1',
  mode = 'mixed',
  resume = false,
  policyResumeTarget = 'latest',
  policyCheckpointMaxVersions = POLICY_CHECKPOINT_DEFAULT_MAX_VERSIONS,
  rewardWeights = {},
  rewardAutoTune = {},
  stabilityGuardrails = {},
  banditTrainerConfig = {},
  ope = {},
} = {}) {
  const ctx = await createMixedCampaignContext({
    rootDir,
    activeEnvironments,
    adapters: adapterOverrides,
    orchestratorHarnessMode,
    orchestratorHarnessOptions,
    orchestratorLiveTaskCollector,
    orchestratorHoldoutHarnessMode,
    orchestratorHoldoutHarnessOptions,
    initialCheckpointId,
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
  });

  if (mode === 'drill-resume') {
    return buildDrillResumeResult(ctx);
  }

  while (ctx.batchIndex < ctx.batchTargetCount) {
    const collection = await collectBatchEpisodes(ctx);
    if (collection.status === 'no_work') {
      return buildNoWorkResult(ctx);
    }
    if (collection.collectionEpisodes.length === 0) {
      break;
    }

    const training = await applyTrainingBatch(ctx, collection);
    const metrics = await runMonitoringEpoch(ctx, training);
    await applyEpochTransitionAndPolicyPersistence(ctx, {
      batchId: training.batchId,
      metrics,
    });
  }

  return buildFinalResult(ctx);
}
