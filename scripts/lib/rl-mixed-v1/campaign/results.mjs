function resolveOrchestratorTaskSource(ctx) {
  return typeof ctx.orchestratorLiveTaskCollector === 'function' ? 'live_collector' : 'registry';
}

export function buildDrillResumeResult(ctx) {
  return {
    status: 'ok',
    summary: {
      environment_counts: ctx.environmentCounts,
      mixed_batch_count: 0,
      batch_combinations: [],
      drills: {
        resume: {
          duplicateEventApplications: ctx.duplicateEventApplications,
          active_checkpoint_id: ctx.controlState.active_checkpoint_id,
          last_stable_checkpoint_id: ctx.controlState.last_stable_checkpoint_id,
          resumed: true,
        },
        rollback: null,
      },
      holdout_validation: ctx.holdout_validation,
      policy_checkpoint: ctx.policyCheckpoint,
      reward_config: {
        weights: ctx.resolvedRewardWeights,
        auto_tune: ctx.autoTuneConfig,
      },
      ope: ctx.latestOpe,
      stability_guardrails: {
        config: ctx.guardrailConfig,
        alerts: [],
        annealing: [],
        auto_policy_rollbacks: 0,
      },
      active_environments: ctx.resolvedEnvironments,
      orchestrator_task_source: resolveOrchestratorTaskSource(ctx),
    },
    controlState: ctx.controlState,
  };
}

export function buildNoWorkResult(ctx) {
  return {
    status: 'no_work_available',
    summary: {
      environment_counts: ctx.environmentCounts,
      mixed_batch_count: ctx.batchIndex,
      batch_combinations: [...new Set(ctx.batchCombinations)],
      drills: { rollback: null, resume: null },
      holdout_validation: ctx.holdout_validation,
      policy_checkpoint: ctx.policyCheckpoint,
      reward_config: {
        weights: ctx.resolvedRewardWeights,
        auto_tune: ctx.autoTuneConfig,
        latest_tuning: ctx.latestRewardTuning,
      },
      ope: ctx.latestOpe,
      stability_guardrails: {
        config: ctx.guardrailConfig,
        alerts: ctx.stabilityAlerts,
        annealing: ctx.annealingHistory,
        auto_policy_rollbacks: ctx.autoPolicyRollbacks,
      },
      active_environments: ctx.resolvedEnvironments,
      orchestrator_task_source: resolveOrchestratorTaskSource(ctx),
    },
    controlState: ctx.controlState,
  };
}

export function buildFinalResult(ctx) {
  const summary = {
    environment_counts: ctx.environmentCounts,
    mixed_batch_count: ctx.batchIndex,
    batch_combinations: [...new Set(ctx.batchCombinations)],
    batch_summaries: ctx.batchSummaries,
    updates_completed: ctx.updatesCompleted,
    rollbacks_completed: ctx.rollbacksCompleted,
    replay_only_epochs: ctx.replayOnlyEpochs,
    better_count: ctx.betterCount,
    same_count: ctx.sameCount,
    worse_count: ctx.worseCount,
    comparison_failed_count: ctx.comparisonFailedCount,
    active_checkpoint_id: ctx.controlState.active_checkpoint_id,
    pre_update_ref_checkpoint_id: ctx.controlState.pre_update_ref_checkpoint_id,
    last_stable_checkpoint_id: ctx.controlState.last_stable_checkpoint_id,
    holdout_validation: ctx.holdout_validation,
    bandit_policy_state: {
      update_count: Number(ctx.activePolicy?.contextualBandit?.updateCount || 0),
      context_count: Object.keys(ctx.activePolicy?.contextualBandit?.contexts || {}).length,
    },
    policy_checkpoint: ctx.policyCheckpoint,
    reward_config: {
      weights: ctx.resolvedRewardWeights,
      auto_tune: ctx.autoTuneConfig,
      latest_tuning: ctx.latestRewardTuning,
    },
    ope: ctx.latestOpe,
    stability_guardrails: {
      config: ctx.guardrailConfig,
      alerts: ctx.stabilityAlerts,
      latest: ctx.latestStability,
      annealing: ctx.annealingHistory,
      auto_policy_rollbacks: ctx.autoPolicyRollbacks,
      current_exploration_rate: Number(ctx.currentTrainerConfig.contextual_bandit_exploration_rate || 0),
    },
    drills: {
      rollback: ctx.mode === 'drill-rollback'
        ? {
          degradation_streak: 3,
          rollback_event_ids: ctx.rollbackEventIds,
          active_checkpoint_id: ctx.controlState.active_checkpoint_id,
          control_mode: ctx.controlState.mode,
        }
        : null,
      resume: null,
    },
    duplicateEventApplications: ctx.duplicateEventApplications,
    active_environments: ctx.resolvedEnvironments,
    orchestrator_holdout_harness_mode: ctx.orchestratorHoldoutHarnessMode,
    orchestrator_task_source: resolveOrchestratorTaskSource(ctx),
  };

  return {
    status: 'ok',
    summary,
    controlState: ctx.controlState,
  };
}
