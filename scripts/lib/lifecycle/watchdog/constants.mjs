/* 中文注释：watchdog 的扫描预算和 idle 默认值集中维护，避免各模块重复硬编码。 */
export const DEFAULT_STALE_THRESHOLD_MINUTES = 30;
export const MAX_SCAN_FILES = 2000;
export const SKIP_DIRS = new Set(['.git', 'node_modules', '.worktrees', 'dist', 'coverage']);

export const IDLE_DEFAULTS = Object.freeze({
  checkIntervalSeconds: 30,
  idleThresholdSeconds: 120,
  maxNudgeCount: 3,
  nudgeMessage: 'You appear to be idle. Review your current task and continue working.',
});
