/* 中文注释：watchdog facade 保持旧导入路径稳定；信号、恢复、渲染和 enforcer 已拆分。 */
export { DEFAULT_STALE_THRESHOLD_MINUTES, IDLE_DEFAULTS, MAX_SCAN_FILES, SKIP_DIRS } from './watchdog/constants.mjs';
export { buildRollbackCommand, buildTeamResumeCommand, buildWatchdogReadiness, decideWatchdogRecovery } from './watchdog/recovery.mjs';
export { formatWatchdogText } from './watchdog/rendering.mjs';
export { buildTeamWatchdogState, runTeamWatchdog } from './watchdog/run.mjs';
export {
  collectWatchdogSignals,
  countBlockedJobs,
  countRollbackManifests,
  dedupePids,
  determineCpuState,
  extractWorkerPids,
  fileExists,
  isProcessAlive,
  latestMtimeMs,
  normalizePid,
  readGitCommitAgeMinutes,
  readLatestDispatchArtifact,
  readSessionPidFiles,
} from './watchdog/signals.mjs';
export { ageMinutesFromEpoch, normalizeNonNegativeInteger, normalizeNumber, normalizeText, normalizeUniqueTextArray } from './watchdog/shared.mjs';
export { buildIdleDetector, decideNudgeAction, detectIdleState, runTodoEnforcerLoop } from './watchdog/todo-enforcer.mjs';
