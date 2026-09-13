/**
 * 节奏梯（借鉴 LoopX cadence 阶梯退避，见 research/upstream/loopx-analysis.md §4.4）。
 *
 * 定时器只负责唤醒，要不要跑由 should-run 决定。cadence 决定"下一次唤醒多远"：
 * - material 进展（success）→ active_work，回到基准间隔；
 * - noop/blocked/失败 → monitor_wait，×1.5 逐步放宽至上限；
 * - human-gate → human_gate，停等操作者（不自动唤醒）。
 * 与 backoff.mjs 的差异：backoff 是失败重试的指数退避，cadence 是监控节奏的
 * 前瞻放宽——两者叠加，互不替代。纯函数模块，状态由 run summary 持久化。
 */

export const DEFAULT_CADENCE_CONFIG = Object.freeze({
  baseDelayMs: 180_000,
  maxDelayMs: 1_800_000,
  multiplier: 1.5,
});

export const CADENCE_CLASSES = Object.freeze(['active_work', 'monitor_wait', 'human_gate']);

export function resolveCadenceConfig({
  enabled = false,
  baseDelayMs = DEFAULT_CADENCE_CONFIG.baseDelayMs,
  maxDelayMs = DEFAULT_CADENCE_CONFIG.maxDelayMs,
  multiplier = DEFAULT_CADENCE_CONFIG.multiplier,
} = {}) {
  const base = Number(baseDelayMs);
  if (!Number.isFinite(base) || base < 0) throw new TypeError('cadence baseDelayMs must be a non-negative number');
  const max = Number(maxDelayMs);
  if (!Number.isFinite(max) || max < base) throw new TypeError('cadence maxDelayMs must be >= baseDelayMs');
  const factor = Number(multiplier);
  if (!Number.isFinite(factor) || factor < 1) throw new TypeError('cadence multiplier must be >= 1');
  return Object.freeze({ enabled: enabled === true, baseDelayMs: base, maxDelayMs: max, multiplier: factor });
}

function widen(previousDelayMs, config) {
  const previous = Number.isFinite(previousDelayMs) && previousDelayMs > 0
    ? previousDelayMs
    : config.baseDelayMs;
  return Math.min(Math.floor(previous * config.multiplier), config.maxDelayMs);
}

/**
 * 由上一轮 outcome 推导下一次唤醒节奏。material 进展回基准；human_gate 的
 * untilMs 为 null（无自动唤醒），等待显式 resume。
 */
export function resolveCadenceState({ previous = null, outcome = {}, nowMs = Date.now(), config = DEFAULT_CADENCE_CONFIG } = {}) {
  const normalizedOutcome = String(outcome?.outcome || '').trim();
  const failureClass = String(outcome?.failureClass || '').trim();

  if (normalizedOutcome === 'human-gate') {
    return Object.freeze({
      cadenceClass: 'human_gate',
      delayMs: config.maxDelayMs,
      untilMs: null,
    });
  }

  if (normalizedOutcome === 'success') {
    return Object.freeze({
      cadenceClass: 'active_work',
      delayMs: config.baseDelayMs,
      untilMs: nowMs + config.baseDelayMs,
    });
  }

  // noop/blocked/infra-retry/failed/stopped：监控等待，逐步放宽。
  const delayMs = widen(previous?.delayMs, config);
  return Object.freeze({
    cadenceClass: 'monitor_wait',
    delayMs,
    untilMs: nowMs + delayMs,
    lastFailureClass: failureClass || undefined,
  });
}

/** 现在是否已到唤醒点（untilMs 为 null 表示无限等待）。 */
export function cadenceReady(cadenceState, nowMs = Date.now()) {
  if (!cadenceState) return true;
  if (cadenceState.untilMs === null) return false;
  const until = Number(cadenceState.untilMs);
  return !Number.isFinite(until) || until <= nowMs;
}
