import { clamp } from './shared.mjs';
import {
  ORCHESTRATOR_BANDIT_REWARD_DEFAULT_WEIGHTS,
  ORCHESTRATOR_BANDIT_REWARD_WEIGHT_BOUNDS,
  ORCHESTRATOR_STABILITY_GUARDRAILS_DEFAULT,
  normalizeRewardWeights,
} from './reward-config.mjs';

// 纯函数：汇总本批次 contextual bandit 奖励，供调参和报表共用。
export function summarizeBanditRewardRows(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      sample_count: 0,
      average_reward: 0,
      min_reward: 0,
      max_reward: 0,
    };
  }
  const values = rows.map((row) => Number(row?.reward || 0));
  return {
    sample_count: values.length,
    average_reward: values.reduce((sum, value) => sum + value, 0) / values.length,
    min_reward: Math.min(...values),
    max_reward: Math.max(...values),
  };
}

// 纯函数：根据本批次结果微调奖励权重，主循环只接收调整结论。
export function tuneRewardWeights({
  weights,
  autoTuneConfig,
  banditRewardSummary,
  epochOutcome,
  batchBetterCount = 0,
  batchWorseCount = 0,
  holdouts = {},
} = {}) {
  const normalizedWeights = normalizeRewardWeights(ORCHESTRATOR_BANDIT_REWARD_DEFAULT_WEIGHTS, weights);
  const disabled = !autoTuneConfig?.enabled;
  const insufficientSamples = Number(banditRewardSummary?.sample_count || 0) < Number(autoTuneConfig?.min_samples || 1);
  if (disabled || insufficientSamples) {
    return {
      tuned: false,
      reason: disabled ? 'disabled' : 'insufficient_samples',
      weights: normalizedWeights,
      adjustments: {},
    };
  }

  const step = Number(autoTuneConfig?.step || 0.03);
  const orchestratorStatus = String(holdouts?.orchestrator?.status || '').trim().toLowerCase();
  const degraded = epochOutcome === 'rollback'
    || orchestratorStatus === 'failed'
    || Number(batchWorseCount || 0) > Number(batchBetterCount || 0)
    || Number(banditRewardSummary?.average_reward || 0) < -0.2;
  const improved = epochOutcome === 'promotion_eligible'
    && Number(batchBetterCount || 0) >= Number(batchWorseCount || 0)
    && orchestratorStatus !== 'failed'
    && Number(banditRewardSummary?.average_reward || 0) > 0;

  if (!degraded && !improved) {
    return {
      tuned: false,
      reason: 'hold',
      weights: normalizedWeights,
      adjustments: {},
    };
  }

  const nextWeights = { ...normalizedWeights };
  const adjustments = {};
  const plan = degraded
    ? {
      terminal: -0.35,
      successRate: -0.2,
      rollbackRate: -1,
      humanHandoffRate: -0.6,
      missedHandoff: -0.8,
      verificationBlocked: -0.5,
    }
    : {
      terminal: 0.5,
      successRate: 0.4,
      rollbackRate: 0.35,
      humanHandoffRate: 0.25,
      missedHandoff: 0.2,
      verificationBlocked: 0.2,
    };

  for (const key of Object.keys(plan)) {
    const delta = step * Number(plan[key] || 0);
    const bounds = ORCHESTRATOR_BANDIT_REWARD_WEIGHT_BOUNDS[key];
    const previous = Number(nextWeights[key] || 0);
    const next = clamp(previous + delta, bounds.min, bounds.max);
    nextWeights[key] = next;
    adjustments[key] = next - previous;
  }

  return {
    tuned: true,
    reason: degraded ? 'degraded' : 'improved',
    weights: nextWeights,
    adjustments,
  };
}

// 纯函数：把稳定性信号转换为标准告警列表，便于 UI 和策略回滚复用。
export function detectStabilityAlerts({
  batchId = '',
  epochOutcome = '',
  degradationStreak = 0,
  batchBetterCount = 0,
  batchWorseCount = 0,
  holdouts = {},
  banditRewardSummary = {},
  rollbackRate = 0,
  guardrails = ORCHESTRATOR_STABILITY_GUARDRAILS_DEFAULT,
} = {}) {
  const alerts = [];
  const normalizedBatchId = String(batchId || '');
  const addAlert = (severity, code, detail = {}) => {
    alerts.push({ batch_id: normalizedBatchId, severity, code, ...detail });
  };

  if (epochOutcome === 'rollback') {
    addAlert('critical', 'epoch_rollback', { degradation_streak: Number(degradationStreak || 0) });
  } else if (Number(degradationStreak || 0) >= 2) {
    addAlert('warning', 'degradation_streak', { degradation_streak: Number(degradationStreak || 0) });
  }

  if (holdouts?.orchestrator?.status === 'failed' || holdouts?.shell?.status === 'failed') {
    addAlert('critical', 'holdout_failed', {
      orchestrator_status: holdouts?.orchestrator?.status || null,
      shell_status: holdouts?.shell?.status || null,
    });
  }

  if (Number(batchWorseCount || 0) - Number(batchBetterCount || 0) > Number(guardrails?.drift_gap_threshold || 0)) {
    addAlert('warning', 'comparison_drift', {
      better: Number(batchBetterCount || 0),
      worse: Number(batchWorseCount || 0),
    });
  }

  if (Number(banditRewardSummary?.sample_count || 0) > 0
    && Number(banditRewardSummary?.average_reward || 0) <= Number(guardrails?.reward_collapse_threshold || -0.35)) {
    addAlert('critical', 'reward_collapse', { average_reward: Number(banditRewardSummary?.average_reward || 0) });
  }

  if (Number(rollbackRate || 0) >= Number(guardrails?.rollback_rate_alert_threshold || 1)) {
    addAlert('warning', 'rollback_rate_high', { rollback_rate: Number(rollbackRate || 0) });
  }

  return {
    alerts,
    has_critical: alerts.some((alert) => alert.severity === 'critical'),
  };
}

// 纯函数：根据 epoch 结果调整探索率，集中管理退火/反退火策略。
export function adjustExplorationRate({
  currentRate = 0.15,
  guardrails = ORCHESTRATOR_STABILITY_GUARDRAILS_DEFAULT,
  epochOutcome = '',
  hasCriticalDrift = false,
} = {}) {
  const minRate = Math.min(Number(guardrails.min_exploration_rate || 0), Number(guardrails.max_exploration_rate || 1));
  const maxRate = Math.max(Number(guardrails.min_exploration_rate || 0), Number(guardrails.max_exploration_rate || 1));
  const current = clamp(currentRate, minRate, maxRate);
  if (guardrails.enable_annealing === false) {
    return {
      previous_rate: current,
      next_rate: current,
      anneal_action: 'disabled',
    };
  }

  let next = current;
  let action = 'hold';
  if (hasCriticalDrift || epochOutcome === 'rollback') {
    next = clamp(current * Number(guardrails.anti_anneal_factor || 1.08), minRate, maxRate);
    action = 'increase_exploration';
  } else if (epochOutcome === 'promotion_eligible') {
    next = clamp(current * Number(guardrails.anneal_factor || 0.92), minRate, maxRate);
    action = 'decrease_exploration';
  }

  return {
    previous_rate: current,
    next_rate: next,
    anneal_action: action,
  };
}
