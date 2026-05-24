/* 中文注释：恢复决策模块只根据信号给出 observe/retry/rollback/respawn，不扫描文件。 */
import { DEFAULT_STALE_THRESHOLD_MINUTES } from './constants.mjs';
import {
  normalizeNonNegativeInteger,
  normalizeNumber,
  normalizeText,
  normalizeUniqueTextArray,
} from './shared.mjs';

export function buildTeamResumeCommand(sessionId, provider = 'codex', workers = 2) {
  const normalizedSessionId = normalizeText(sessionId) || '<session-id>';
  return `node scripts/aios.mjs team --resume ${normalizedSessionId} --retry-blocked --provider ${provider} --workers ${workers} --dry-run`;
}

export function buildRollbackCommand(sessionId) {
  const normalizedSessionId = normalizeText(sessionId) || '<session-id>';
  return `node scripts/aios.mjs snapshot-rollback --session ${normalizedSessionId} --dry-run`;
}

export function buildWatchdogReadiness(recovery = {}) {
  const decision = normalizeText(recovery?.decision || 'observe').toLowerCase();
  const nextActions = normalizeUniqueTextArray(recovery?.nextActions);
  const reason = normalizeText(recovery?.reason);

  if (decision === 'observe') {
    return {
      verdict: 'ready',
      blockedReasons: [],
      warnings: [],
      nextActions,
      evidence: [],
    };
  }

  if (decision === 'retry' || decision === 'respawn') {
    return {
      verdict: 'warning',
      blockedReasons: [],
      warnings: normalizeUniqueTextArray([reason || 'watchdog recovery is recommended']),
      nextActions,
      evidence: [],
    };
  }

  return {
    verdict: 'blocked',
    blockedReasons: normalizeUniqueTextArray([decision || 'blocked']),
    warnings: normalizeUniqueTextArray([reason || 'watchdog recovery is blocked']),
    nextActions,
    evidence: [],
  };
}

export function decideWatchdogRecovery(signals = {}) {
  const staleThresholdMinutes = normalizeNumber(signals.staleThresholdMinutes, DEFAULT_STALE_THRESHOLD_MINUTES);
  const sessionId = normalizeText(signals.sessionId);
  const provider = normalizeText(signals.provider) || 'codex';
  const workers = normalizeNonNegativeInteger(signals.workers, 2) || 2;
  const normalizedSignals = {
    commitAgeMinutes: normalizeNumber(signals.commitAgeMinutes, null),
    fileActivityAgeMinutes: normalizeNumber(signals.fileActivityAgeMinutes, null),
    logAgeMinutes: normalizeNumber(signals.logAgeMinutes, null),
    cpuState: normalizeText(signals.cpuState) || 'unknown',
    blockedJobs: normalizeNonNegativeInteger(signals.blockedJobs, 0),
    rollbackArtifacts: normalizeNonNegativeInteger(signals.rollbackArtifacts, 0),
    paused: signals.paused === true,
  };

  if (normalizedSignals.paused) {
    return {
      decision: 'pause',
      reason: 'pause file is present; recovery actions are suspended',
      signals: normalizedSignals,
      nextActions: ['Remove the session .pause file to resume watchdog recovery.'],
    };
  }

  if (normalizedSignals.blockedJobs > 0 && normalizedSignals.rollbackArtifacts > 0) {
    return {
      decision: 'rollback',
      reason: 'blocked jobs have pre-mutation rollback artifacts available',
      signals: normalizedSignals,
      nextActions: [buildRollbackCommand(sessionId), buildTeamResumeCommand(sessionId, provider, workers)],
    };
  }

  if (normalizedSignals.blockedJobs > 0) {
    return {
      decision: 'retry',
      reason: 'blocked jobs detected without rollback artifacts',
      signals: normalizedSignals,
      nextActions: [buildTeamResumeCommand(sessionId, provider, workers)],
    };
  }

  const staleCommit = normalizedSignals.commitAgeMinutes === null || normalizedSignals.commitAgeMinutes >= staleThresholdMinutes;
  const staleFiles = normalizedSignals.fileActivityAgeMinutes === null || normalizedSignals.fileActivityAgeMinutes >= staleThresholdMinutes;
  const staleLogs = normalizedSignals.logAgeMinutes === null || normalizedSignals.logAgeMinutes >= staleThresholdMinutes;
  const deadProcess = normalizedSignals.cpuState === 'dead';

  if (staleCommit && staleFiles && staleLogs && deadProcess) {
    return {
      decision: 'respawn',
      reason: 'all worker activity signals are stale and the worker process is dead',
      signals: normalizedSignals,
      nextActions: [buildTeamResumeCommand(sessionId, provider, workers)],
    };
  }

  return {
    decision: 'observe',
    reason: 'worker activity signals are fresh or inconclusive',
    signals: normalizedSignals,
    nextActions: [],
  };
}
