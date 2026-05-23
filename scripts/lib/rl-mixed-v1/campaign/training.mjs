import { applyPointerTransition } from '../../rl-core/checkpoint-registry.mjs';
import { applyTrajectoryUpdate, runOnlineUpdateBatch } from '../../rl-core/trainer.mjs';
import { buildBatchCombinations } from '../control.mjs';
import { clone } from '../shared.mjs';
import { summarizeBanditRewardRows } from '../reward-tuning.mjs';
import { buildTrajectoryFromEpisode } from '../trajectory.mjs';
import { buildBatchOpeRows, composeOpeEvaluation } from '../policy/ope.mjs';
import { writeNdjsonRows } from '../policy/io.mjs';

export async function applyTrainingBatch(ctx, { collectionEpisodes, batchEnvironments }) {
  ctx.batchIndex += 1;
  const batchId = `batch-${String(ctx.batchIndex).padStart(3, '0')}`;
  ctx.batchCombinations.push(...buildBatchCombinations(batchEnvironments));
  ctx.batchSummaries.push({ batch_id: batchId, environments: [...batchEnvironments] });

  const trajectories = buildBatchTrajectories(ctx, collectionEpisodes);
  const batchBanditRows = trajectories.filter((row) => row?.updateType === 'contextual_bandit');
  const batchRewardSummary = summarizeBanditRewardRows(batchBanditRows);
  await appendOpeRows(ctx, { batchId, batchBanditRows });

  const updateResult = runOnlineUpdateBatch({
    batchId,
    checkpointId: ctx.controlState.active_checkpoint_id,
    policy: ctx.activePolicy || undefined,
    referencePolicy: ctx.referencePolicy || undefined,
    applyUpdate: applyTrajectoryUpdate,
    trajectories,
    config: ctx.currentTrainerConfig,
  });
  ctx.activePolicy = updateResult.policy || ctx.activePolicy;
  ctx.referencePolicy = updateResult.referencePolicy || ctx.referencePolicy;
  ctx.updatesCompleted += 1;

  updateLatestOpe(ctx, batchRewardSummary);
  ctx.controlState = await ctx.applyTrackedEvent({
    event_id: `update-completed-${ctx.batchIndex}`,
    snapshot_patch: {
      ...applyPointerTransition({
        active_checkpoint_id: ctx.controlState.active_checkpoint_id,
        pre_update_ref_checkpoint_id: ctx.controlState.pre_update_ref_checkpoint_id,
        last_stable_checkpoint_id: ctx.controlState.last_stable_checkpoint_id,
      }, {
        type: 'update.completed',
        previous_active_checkpoint_id: ctx.controlState.active_checkpoint_id,
        new_active_checkpoint_id: updateResult.nextCheckpointId,
      }),
      mode: 'monitoring',
    },
  });

  return { batchId, batchRewardSummary };
}

function buildBatchTrajectories(ctx, collectionEpisodes) {
  const batchOrchestratorEpisodes = collectionEpisodes.filter((episode) => episode.environment === 'orchestrator');
  const rewardContext = {
    batchOrchestratorEpisodes,
    historical: {
      updatesCompleted: ctx.updatesCompleted,
      rollbacksCompleted: ctx.rollbacksCompleted,
    },
    rewardWeights: ctx.resolvedRewardWeights,
  };
  return collectionEpisodes.map((episode) => buildTrajectoryFromEpisode(episode, rewardContext));
}

async function appendOpeRows(ctx, { batchId, batchBanditRows }) {
  if (batchBanditRows.length === 0) return;
  const behaviorVersionId = ctx.policyCheckpoint.latest_version_id || ctx.policyCheckpoint.loaded_version_id || null;
  const opeRows = buildBatchOpeRows({ trajectories: batchBanditRows, batchId, behaviorVersionId });
  if (opeRows.length === 0) return;
  ctx.opeLogRows = [...ctx.opeLogRows, ...opeRows].slice(-ctx.opeConfig.max_log_rows);
  await writeNdjsonRows(ctx.policyCheckpointPaths.opeLogPath, ctx.opeLogRows);
}

function updateLatestOpe(ctx, batchRewardSummary) {
  const opeRowsForEval = ctx.opeLogRows.slice(Math.max(0, ctx.opeLogRows.length - ctx.opeConfig.window_size));
  ctx.latestOpe = composeOpeEvaluation({
    rows: opeRowsForEval,
    activePolicy: ctx.activePolicy,
    referencePolicy: ctx.referencePolicy,
    trainerConfig: ctx.currentTrainerConfig,
    opeConfig: ctx.opeConfig,
  });
  const summary = ctx.batchSummaries[ctx.batchSummaries.length - 1];
  summary.ope = ctx.latestOpe;
  summary.bandit_reward_summary = batchRewardSummary;
  summary.reward_weights = clone(ctx.resolvedRewardWeights);
  summary.trainer_config = {
    contextual_bandit_exploration_rate: Number(ctx.currentTrainerConfig.contextual_bandit_exploration_rate || 0),
    contextual_bandit_temperature: Number(ctx.currentTrainerConfig.contextual_bandit_temperature || 1),
    learning_rate: Number(ctx.currentTrainerConfig.learning_rate || 0),
  };
}
