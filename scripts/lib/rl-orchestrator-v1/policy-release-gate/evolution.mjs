import { clamp, normalizeMode } from './shared.mjs';
import { normalizeState } from './state.mjs';

function calculatePolicyFailureRate(recent = []) {
  const policyRows = recent.filter((row) => row.policy_applied === true);
  if (policyRows.length === 0) {
    return 0;
  }
  const failureCount = policyRows.filter((row) => row.failed === true).length;
  return failureCount / policyRows.length;
}

function calculateSuccessRate(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return 0;
  }
  const successCount = rows.filter((row) => row.success === true).length;
  return successCount / rows.length;
}

function resolvePolicyExecutorEffectiveness({ decision, evidence } = {}) {
  if (decision?.apply_policy_executor !== true) {
    return false;
  }

  const routedExecutor = typeof decision.applied_executor === 'string' && decision.applied_executor.trim().length > 0
    ? decision.applied_executor.trim()
    : '';
  if (!routedExecutor) {
    return true;
  }

  const appliedExecutor = typeof evidence?.decision_payload?.dispatch_phase_executor_applied === 'string'
    ? evidence.decision_payload.dispatch_phase_executor_applied.trim()
    : '';
  if (!appliedExecutor) {
    return true;
  }

  return appliedExecutor === routedExecutor;
}

function downgradeState(state, config, reason) {
  const next = {
    ...state,
    counters: {
      ...state.counters,
      downgrades: Number(state.counters.downgrades || 0) + 1,
      consecutive_policy_failures: 0,
    },
    last_downgrade_reason: reason,
  };

  if (next.effective_mode === 'full') {
    next.effective_mode = 'canary';
    next.effective_rollout_rate = clamp(config.rollout_rate, config.downgrade_min_rollout_rate, 1);
    return next;
  }

  if (next.effective_mode === 'canary') {
    const reduced = next.effective_rollout_rate * config.downgrade_rollout_factor;
    if (reduced <= config.downgrade_min_rollout_rate) {
      next.effective_mode = 'observe';
      next.effective_rollout_rate = 0;
    } else {
      next.effective_rollout_rate = clamp(reduced, config.downgrade_min_rollout_rate, 1);
    }
    return next;
  }

  next.effective_mode = 'observe';
  next.effective_rollout_rate = 0;
  return next;
}

function resolvePromotionRows(state = {}) {
  const mode = normalizeMode(state.effective_mode || 'legacy');
  const recent = Array.isArray(state.recent) ? state.recent : [];

  if (mode === 'observe') {
    return recent.filter((row) => row.policy_fallback !== true);
  }

  if (mode === 'canary') {
    return recent.filter((row) => row.policy_applied === true && row.policy_fallback !== true);
  }

  return [];
}

function assessPromotionEligibility({
  config,
  state,
  decision,
} = {}) {
  if (!config.auto_promotion) {
    return {
      eligible: false,
      reason: null,
    };
  }

  const effectiveMode = normalizeMode(state.effective_mode || decision?.effective_mode || config.mode);
  if (effectiveMode === 'legacy' || effectiveMode === 'off' || effectiveMode === 'full') {
    return {
      eligible: false,
      reason: null,
    };
  }
  if (normalizeMode(decision?.effective_mode || effectiveMode) === 'off') {
    return {
      eligible: false,
      reason: null,
    };
  }

  const rows = resolvePromotionRows(state);
  const sampleCount = rows.length;
  const successRate = calculateSuccessRate(rows);
  const streak = Number(state?.counters?.consecutive_policy_success || 0);

  const byRate = sampleCount >= config.promotion_min_samples
    && successRate >= config.promotion_success_rate_threshold;
  const byStreak = effectiveMode === 'canary'
    && streak >= config.promotion_consecutive_successes;
  const eligible = byRate || byStreak;
  if (!eligible) {
    return {
      eligible: false,
      reason: null,
    };
  }

  const reason = byStreak
    ? `consecutive_policy_success=${streak}`
    : `${effectiveMode}_success_rate=${successRate.toFixed(3)} sample_count=${sampleCount}`;
  return {
    eligible: true,
    reason,
  };
}

function promoteState(state, config, reason) {
  const mode = normalizeMode(state.effective_mode || config.mode);
  const next = {
    ...state,
    counters: {
      ...state.counters,
      promotions: Number(state.counters.promotions || 0) + 1,
      consecutive_policy_success: 0,
    },
    last_promotion_reason: reason,
  };

  if (mode === 'observe' || mode === 'off') {
    const startRollout = clamp(
      config.promotion_initial_rollout_rate,
      config.downgrade_min_rollout_rate,
      config.promotion_max_rollout_rate
    );
    next.effective_mode = 'canary';
    next.effective_rollout_rate = startRollout;
    return next;
  }

  if (mode === 'canary') {
    const baseRate = clamp(next.effective_rollout_rate || 0, 0, config.promotion_max_rollout_rate);
    const increased = clamp(
      baseRate + config.promotion_rollout_step,
      config.downgrade_min_rollout_rate,
      config.promotion_max_rollout_rate
    );
    if (increased >= 1 || config.promotion_max_rollout_rate >= 1 && increased >= config.promotion_max_rollout_rate) {
      next.effective_mode = 'full';
      next.effective_rollout_rate = 1;
      return next;
    }
    next.effective_mode = 'canary';
    next.effective_rollout_rate = increased;
    return next;
  }

  return next;
}

export function updatePolicyReleaseState({
  config,
  state,
  decision,
  evidence,
} = {}) {
  const next = normalizeState(state, config);
  const success = evidence?.terminal_outcome === 'success' && evidence?.verification_result === 'passed';
  const failed = evidence?.terminal_outcome === 'failed'
    || evidence?.verification_result === 'failed'
    || evidence?.verification_result === 'blocked';
  const policyRequested = decision.apply_policy_executor === true;
  const policyAppliedEffective = resolvePolicyExecutorEffectiveness({ decision, evidence });

  next.updated_at = new Date().toISOString();
  next.counters.total += 1;

  if (policyAppliedEffective) {
    next.counters.policy_applied += 1;
    if (success) {
      next.counters.policy_success += 1;
      next.counters.consecutive_policy_success += 1;
      next.counters.consecutive_policy_failures = 0;
    }
    if (failed) {
      next.counters.policy_failure += 1;
      next.counters.consecutive_policy_failures += 1;
      next.counters.consecutive_policy_success = 0;
    }
  } else {
    next.counters.baseline_routed += 1;
    if (policyRequested) {
      next.counters.policy_fallback += 1;
    }
  }

  next.recent.push({
    timestamp: next.updated_at,
    policy_applied: policyAppliedEffective,
    policy_requested: policyRequested,
    policy_fallback: policyRequested && !policyAppliedEffective,
    success,
    failed,
  });
  next.recent = next.recent.slice(-config.eval_window_size);

  let downgraded = false;
  let promoted = false;
  if (config.auto_downgrade && decision.apply_policy_executor) {
    const failureRate = calculatePolicyFailureRate(next.recent);
    const policySampleCount = next.recent.filter((row) => row.policy_applied).length;
    const consecutiveFail = next.counters.consecutive_policy_failures;
    const shouldDowngradeByRate = policySampleCount >= config.downgrade_min_samples
      && failureRate >= config.downgrade_failure_rate_threshold;
    const shouldDowngradeByStreak = consecutiveFail >= config.downgrade_consecutive_failures;

    if (shouldDowngradeByRate || shouldDowngradeByStreak) {
      const reason = shouldDowngradeByStreak
        ? `consecutive_policy_failures=${consecutiveFail}`
        : `policy_failure_rate=${failureRate.toFixed(3)}`;
      const downgradedState = downgradeState(next, config, reason);
      downgradedState.updated_at = next.updated_at;
      return {
        state: downgradedState,
        downgraded: true,
        downgrade_reason: reason,
        promoted: false,
        promotion_reason: null,
      };
    }
  }

  const promotion = assessPromotionEligibility({
    config,
    state: next,
    decision,
  });
  if (promotion.eligible) {
    const promotedState = promoteState(next, config, promotion.reason);
    promotedState.updated_at = next.updated_at;
    return {
      state: promotedState,
      downgraded: false,
      downgrade_reason: null,
      promoted: true,
      promotion_reason: promotion.reason,
    };
  }

  return {
    state: next,
    downgraded,
    downgrade_reason: null,
    promoted,
    promotion_reason: null,
  };
}
