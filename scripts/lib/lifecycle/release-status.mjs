/* 中文注释：release-status facade 保持旧导入路径稳定；真实职责拆到 release-status/*。 */
export {
  HISTORY_TREND_FAILURE_DELTA_WARN,
  HISTORY_TREND_FAILURE_DELTA_WARN_ENV,
  HISTORY_TREND_FAILURE_DELTA_WARN_ENV_ALIAS,
  HISTORY_TREND_FALLBACK_DELTA_WARN,
  HISTORY_TREND_FALLBACK_DELTA_WARN_ENV,
  HISTORY_TREND_FALLBACK_DELTA_WARN_ENV_ALIAS,
} from './release-status/constants.mjs';
export { buildHealthSummary } from './release-status/health.mjs';
export {
  buildDailyHistory,
  buildHistorySignals,
  buildRecentSummary,
  renderHistoryExport,
  toTrendToken,
} from './release-status/history.mjs';
export { normalizeReleaseStatusOptions, planReleaseStatus } from './release-status/options.mjs';
export { buildFailureResult, renderReleaseStatusText } from './release-status/rendering.mjs';
export { runReleaseStatus } from './release-status/run.mjs';
