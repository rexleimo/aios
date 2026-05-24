import path from 'node:path';

import { clamp, normalizeMode, safePositiveInteger } from './shared.mjs';

export function normalizePolicyReleaseConfig({
  policyRelease = null,
  rootDir = process.cwd(),
  requestedExecutionMode = 'dry-run',
  env = process.env,
} = {}) {
  if (!policyRelease || typeof policyRelease !== 'object' || Array.isArray(policyRelease)) {
    return {
      enabled: false,
      mode: 'legacy',
      requested_execution_mode: String(requestedExecutionMode || 'dry-run'),
      policy_execution_mode: String(requestedExecutionMode || 'dry-run'),
      baseline_execution_mode: 'dry-run',
      rollout_rate: 1,
      kill_switch_env_key: 'AIOS_RL_POLICY_RELEASE_OFF',
      kill_switch_file: '',
      auto_downgrade: false,
      auto_promotion: false,
      downgrade_failure_rate_threshold: 0.6,
      downgrade_consecutive_failures: 3,
      downgrade_min_samples: 6,
      downgrade_rollout_factor: 0.5,
      downgrade_min_rollout_rate: 0.05,
      promotion_success_rate_threshold: 0.85,
      promotion_consecutive_successes: 6,
      promotion_min_samples: 8,
      promotion_rollout_step: 0.15,
      promotion_initial_rollout_rate: 0.1,
      promotion_max_rollout_rate: 1,
      eval_window_size: 24,
      state_path: path.join(rootDir, 'experiments', 'rl-mixed-v1', 'release', 'orchestrator-policy-release.state.json'),
      env,
    };
  }

  const requested = String(requestedExecutionMode || 'dry-run').trim() || 'dry-run';
  const mode = normalizeMode(policyRelease.mode || 'canary');
  const statePath = String(policyRelease.statePath || '').trim();

  return {
    enabled: true,
    mode,
    requested_execution_mode: requested,
    policy_execution_mode: String(policyRelease.policyExecutionMode || requested).trim() || requested,
    baseline_execution_mode: String(policyRelease.baselineExecutionMode || 'dry-run').trim() || 'dry-run',
    rollout_rate: clamp(policyRelease.rolloutRate ?? 0.1, 0, 1),
    kill_switch_env_key: String(policyRelease.killSwitchEnvKey || 'AIOS_RL_POLICY_RELEASE_OFF').trim() || 'AIOS_RL_POLICY_RELEASE_OFF',
    kill_switch_file: String(policyRelease.killSwitchFile || '').trim(),
    auto_downgrade: policyRelease.autoDowngrade !== false,
    auto_promotion: policyRelease.autoPromotion === true,
    downgrade_failure_rate_threshold: clamp(policyRelease.downgradeFailureRateThreshold ?? 0.6, 0.05, 1),
    downgrade_consecutive_failures: safePositiveInteger(policyRelease.downgradeConsecutiveFailures, 3),
    downgrade_min_samples: safePositiveInteger(policyRelease.downgradeMinSamples, 6),
    downgrade_rollout_factor: clamp(policyRelease.downgradeRolloutFactor ?? 0.5, 0.1, 0.95),
    downgrade_min_rollout_rate: clamp(policyRelease.downgradeMinRolloutRate ?? 0.05, 0, 0.5),
    promotion_success_rate_threshold: clamp(policyRelease.promotionSuccessRateThreshold ?? 0.85, 0.5, 1),
    promotion_consecutive_successes: safePositiveInteger(policyRelease.promotionConsecutiveSuccesses, 6),
    promotion_min_samples: safePositiveInteger(policyRelease.promotionMinSamples, 8),
    promotion_rollout_step: clamp(policyRelease.promotionRolloutStep ?? 0.15, 0.01, 1),
    promotion_initial_rollout_rate: clamp(policyRelease.promotionInitialRolloutRate ?? 0.1, 0.01, 1),
    promotion_max_rollout_rate: clamp(policyRelease.promotionMaxRolloutRate ?? 1, 0.1, 1),
    eval_window_size: safePositiveInteger(policyRelease.evalWindowSize, 24),
    state_path: statePath || path.join(rootDir, 'experiments', 'rl-mixed-v1', 'release', 'orchestrator-policy-release.state.json'),
    env,
  };
}
