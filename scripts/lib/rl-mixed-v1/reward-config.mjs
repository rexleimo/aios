import { clamp, toFiniteNumber } from './shared.mjs';

export const ORCHESTRATOR_BANDIT_REWARD_DEFAULT_WEIGHTS = Object.freeze({
  terminal: 0.8,
  successRate: 0.4,
  rollbackRate: -0.6,
  humanHandoffRate: -0.3,
  missedHandoff: -0.4,
  verificationBlocked: -0.2,
});

export const ORCHESTRATOR_BANDIT_REWARD_WEIGHT_BOUNDS = Object.freeze({
  terminal: { min: 0.2, max: 1.4 },
  successRate: { min: 0.1, max: 1.2 },
  rollbackRate: { min: -1.8, max: -0.1 },
  humanHandoffRate: { min: -1.2, max: -0.05 },
  missedHandoff: { min: -1.4, max: -0.05 },
  verificationBlocked: { min: -1.0, max: -0.05 },
});

export const ORCHESTRATOR_REWARD_AUTOTUNE_DEFAULT = Object.freeze({
  enabled: true,
  step: 0.03,
  min_samples: 2,
});

export const ORCHESTRATOR_STABILITY_GUARDRAILS_DEFAULT = Object.freeze({
  enable_annealing: true,
  anneal_factor: 0.92,
  anti_anneal_factor: 1.08,
  min_exploration_rate: 0.03,
  max_exploration_rate: 0.35,
  drift_gap_threshold: 1,
  reward_collapse_threshold: -0.35,
  rollback_rate_alert_threshold: 0.35,
  auto_policy_rollback_on_critical: true,
});

export const ORCHESTRATOR_OPE_DEFAULT = Object.freeze({
  window_size: 240,
  max_log_rows: 2000,
  clip_weight: 20,
  min_logging_probability: 1e-4,
});

function clampWeight(key, value) {
  const bounds = ORCHESTRATOR_BANDIT_REWARD_WEIGHT_BOUNDS[key];
  return clamp(value, bounds.min, bounds.max);
}

// 纯函数：合并并裁剪奖励权重，让训练逻辑只处理已归一化的配置。
export function normalizeRewardWeights(baseWeights = ORCHESTRATOR_BANDIT_REWARD_DEFAULT_WEIGHTS, overrides = {}) {
  const merged = {
    ...baseWeights,
    ...(overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {}),
  };
  return {
    terminal: clampWeight('terminal', merged.terminal),
    successRate: clampWeight('successRate', merged.successRate),
    rollbackRate: clampWeight('rollbackRate', merged.rollbackRate),
    humanHandoffRate: clampWeight('humanHandoffRate', merged.humanHandoffRate),
    missedHandoff: clampWeight('missedHandoff', merged.missedHandoff),
    verificationBlocked: clampWeight('verificationBlocked', merged.verificationBlocked),
  };
}

// 纯函数：统一奖励自动调参配置，避免 campaign 主循环关心默认值和边界。
export function normalizeRewardAutoTuneConfig(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    enabled: source.enabled !== false,
    step: clamp(toFiniteNumber(source.step, ORCHESTRATOR_REWARD_AUTOTUNE_DEFAULT.step), 0.005, 0.15),
    min_samples: Math.max(1, Math.floor(toFiniteNumber(source.min_samples, ORCHESTRATOR_REWARD_AUTOTUNE_DEFAULT.min_samples))),
  };
}

// 纯函数：统一稳定性护栏配置，保证退火与回滚规则使用同一套边界。
export function normalizeStabilityGuardrails(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    enable_annealing: source.enable_annealing !== false,
    anneal_factor: clamp(toFiniteNumber(source.anneal_factor, ORCHESTRATOR_STABILITY_GUARDRAILS_DEFAULT.anneal_factor), 0.7, 0.99),
    anti_anneal_factor: clamp(toFiniteNumber(source.anti_anneal_factor, ORCHESTRATOR_STABILITY_GUARDRAILS_DEFAULT.anti_anneal_factor), 1.01, 1.6),
    min_exploration_rate: clamp(toFiniteNumber(source.min_exploration_rate, ORCHESTRATOR_STABILITY_GUARDRAILS_DEFAULT.min_exploration_rate), 0, 0.5),
    max_exploration_rate: clamp(toFiniteNumber(source.max_exploration_rate, ORCHESTRATOR_STABILITY_GUARDRAILS_DEFAULT.max_exploration_rate), 0.05, 0.9),
    drift_gap_threshold: Math.max(0, Math.floor(toFiniteNumber(source.drift_gap_threshold, ORCHESTRATOR_STABILITY_GUARDRAILS_DEFAULT.drift_gap_threshold))),
    reward_collapse_threshold: clamp(toFiniteNumber(source.reward_collapse_threshold, ORCHESTRATOR_STABILITY_GUARDRAILS_DEFAULT.reward_collapse_threshold), -1.5, 1.5),
    rollback_rate_alert_threshold: clamp(toFiniteNumber(source.rollback_rate_alert_threshold, ORCHESTRATOR_STABILITY_GUARDRAILS_DEFAULT.rollback_rate_alert_threshold), 0.05, 1),
    auto_policy_rollback_on_critical: source.auto_policy_rollback_on_critical !== false,
  };
}

// 纯函数：统一 OPE 配置，控制日志窗口和重要性采样裁剪阈值。
export function normalizeOpeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    window_size: Math.max(20, Math.floor(toFiniteNumber(source.window_size, ORCHESTRATOR_OPE_DEFAULT.window_size))),
    max_log_rows: Math.max(100, Math.floor(toFiniteNumber(source.max_log_rows, ORCHESTRATOR_OPE_DEFAULT.max_log_rows))),
    clip_weight: clamp(toFiniteNumber(source.clip_weight, ORCHESTRATOR_OPE_DEFAULT.clip_weight), 1, 100),
    min_logging_probability: clamp(toFiniteNumber(source.min_logging_probability, ORCHESTRATOR_OPE_DEFAULT.min_logging_probability), 1e-9, 1),
  };
}
