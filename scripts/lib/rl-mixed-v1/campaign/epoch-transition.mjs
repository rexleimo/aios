import { applyPointerTransition } from '../../rl-core/checkpoint-registry.mjs';
import { loadPolicyCheckpoint, persistPolicyCheckpoint } from '../policy/checkpoint.mjs';
import { clone } from '../shared.mjs';

export async function applyEpochTransitionAndPolicyPersistence(ctx, { batchId, metrics }) {
  await applyEpochTransition(ctx, metrics.epochOutcome.epoch_outcome);
  const persistedPolicy = await persistPolicyCheckpoint({
    checkpointPaths: ctx.policyCheckpointPaths,
    activePolicy: ctx.activePolicy,
    referencePolicy: ctx.referencePolicy,
    rewardConfig: {
      weights: ctx.resolvedRewardWeights,
      auto_tune: ctx.autoTuneConfig,
      latest_tuning: ctx.latestRewardTuning,
    },
    ope: ctx.latestOpe,
    stability: {
      has_critical: ctx.latestStability.has_critical,
      alerts: ctx.latestStability.alerts,
      last_anneal: metrics.annealStep,
    },
    updateCount: Number(ctx.activePolicy?.contextualBandit?.updateCount || 0),
    batchIndex: ctx.batchIndex,
    activeCheckpointId: ctx.controlState.active_checkpoint_id,
    qualityContext: {
      epochOutcome: metrics.epochOutcome.epoch_outcome,
      batchBetterCount: metrics.batchBetterCount,
      batchWorseCount: metrics.batchWorseCount,
      batchComparisonFailedCount: metrics.batchComparisonFailedCount,
      holdoutOrchestratorStatus: metrics.holdouts.orchestrator?.status || '',
    },
    maxVersions: ctx.policyCheckpointMaxVersions,
  });
  ctx.policyCheckpoint = { ...ctx.policyCheckpoint, ...persistedPolicy.metadata };
  await applyAutoPolicyRollback(ctx, { batchId, persistedPolicy });
}

async function applyEpochTransition(ctx, epochOutcome) {
  if (epochOutcome === 'rollback') {
    const restoredCheckpointId = ctx.controlState.pre_update_ref_checkpoint_id || ctx.controlState.last_stable_checkpoint_id;
    ctx.rollbacksCompleted += 1;
    ctx.controlState = await ctx.applyTrackedEvent({
      event_id: `rollback-completed-${ctx.rollbacksCompleted}`,
      snapshot_patch: {
        ...applyPointerTransition({
          active_checkpoint_id: ctx.controlState.active_checkpoint_id,
          pre_update_ref_checkpoint_id: ctx.controlState.pre_update_ref_checkpoint_id,
          last_stable_checkpoint_id: ctx.controlState.last_stable_checkpoint_id,
        }, {
          type: 'rollback.completed',
          restored_checkpoint_id: restoredCheckpointId,
        }),
        mode: 'collection',
      },
    });
    ctx.rollbackEventIds.push(`rollback-completed-${ctx.rollbacksCompleted}`);
    return;
  }

  if (epochOutcome === 'promotion_eligible') {
    ctx.controlState = await ctx.applyTrackedEvent({
      event_id: `epoch-closed-${ctx.batchIndex}`,
      snapshot_patch: {
        ...applyPointerTransition({
          active_checkpoint_id: ctx.controlState.active_checkpoint_id,
          pre_update_ref_checkpoint_id: ctx.controlState.pre_update_ref_checkpoint_id,
          last_stable_checkpoint_id: ctx.controlState.last_stable_checkpoint_id,
        }, {
          type: 'epoch.closed',
          promotion_eligible: true,
        }),
        mode: 'collection',
      },
    });
    return;
  }

  if (epochOutcome === 'replay_only') {
    ctx.replayOnlyEpochs += 1;
    ctx.controlState = await ctx.applyTrackedEvent({
      event_id: `epoch-replay-only-${ctx.replayOnlyEpochs}`,
      snapshot_patch: { mode: 'collection' },
    });
    return;
  }

  ctx.controlState = await ctx.applyTrackedEvent({
    event_id: `epoch-continue-${ctx.batchIndex}`,
    snapshot_patch: { mode: 'collection' },
  });
}

async function applyAutoPolicyRollback(ctx, { batchId, persistedPolicy }) {
  if (!ctx.guardrailConfig.auto_policy_rollback_on_critical || !ctx.latestStability.has_critical) return;
  const rollbackVersionId = persistedPolicy.index.last_good_version_id;
  const currentVersionId = persistedPolicy.versionEntry.version_id;
  if (!rollbackVersionId || rollbackVersionId === currentVersionId) return;

  const rollbackPolicy = await loadPolicyCheckpoint({
    checkpointPaths: ctx.policyCheckpointPaths,
    resumeTarget: 'last-good',
  });
  if (rollbackPolicy.status !== 'loaded') return;

  ctx.activePolicy = rollbackPolicy.activePolicy || ctx.activePolicy;
  ctx.referencePolicy = rollbackPolicy.referencePolicy || ctx.referencePolicy;
  ctx.autoPolicyRollbacks += 1;
  const rollbackAlert = {
    batch_id: batchId,
    severity: 'critical',
    code: 'auto_policy_rollback_applied',
    from_version_id: currentVersionId,
    to_version_id: rollbackPolicy.metadata.loaded_version_id,
  };
  ctx.stabilityAlerts.push(rollbackAlert);
  ctx.batchSummaries[ctx.batchSummaries.length - 1].auto_policy_rollback = clone(rollbackAlert);
  ctx.policyCheckpoint = {
    ...ctx.policyCheckpoint,
    rollback_applied: true,
    rollback_from_version_id: currentVersionId,
    load_status: 'loaded',
    load_target: 'last-good',
    loaded_version_id: rollbackPolicy.metadata.loaded_version_id,
    loaded_path: rollbackPolicy.metadata.loaded_path,
    loaded_saved_at: rollbackPolicy.metadata.loaded_saved_at,
  };
}
