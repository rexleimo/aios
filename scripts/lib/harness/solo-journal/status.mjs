/* 中文注释：status 读取只组合 summary/control/path，供 HUD 和 harness status 使用。 */
import { readSoloControl } from './control.mjs';
import { defaultWorktreeState, formatRelativePath, normalizeText } from './normalizers.mjs';
import { getSoloHarnessPaths } from './paths.mjs';
import { readSoloRunSummary } from './summary.mjs';

export async function readSoloRunStatus({ rootDir, sessionId } = {}) {
  const summary = await readSoloRunSummary({ rootDir, sessionId });
  if (!summary) return null;

  const control = await readSoloControl({ rootDir, sessionId });
  const paths = getSoloHarnessPaths({ rootDir, sessionId: summary.sessionId });
  return {
    sessionId: summary.sessionId,
    objective: summary.objective,
    status: summary.status,
    provider: summary.provider,
    profile: summary.profile,
    iterationCount: summary.iterationCount,
    lastIteration: summary.lastIteration,
    lastOutcome: summary.lastOutcome,
    lastFailureClass: summary.lastFailureClass,
    lastStage: summary.lastStage,
    latestEvidence: summary.latestEvidence,
    nextDelayMs: Number.isFinite(summary.backoff?.nextDelayMs) ? summary.backoff.nextDelayMs : 0,
    // 节奏管理投影（should-run 门启用时才有值；attended 默认为 null）
    pacing: summary.pacing ? {
      lastDecision: summary.pacing.lastDecision || null,
      cadenceClass: summary.pacing.cadence?.cadenceClass || null,
      cadenceUntilMs: Number.isFinite(summary.pacing.cadence?.untilMs) ? summary.pacing.cadence.untilMs : null,
      consecutiveNoop: Number.isFinite(summary.pacing.consecutiveNoop) ? summary.pacing.consecutiveNoop : 0,
      quota: summary.pacing.quota?.spend ? { spendCount: summary.pacing.quota.spend.length } : null,
    } : null,
    stopRequested: control?.stopRequested === true || summary.stopRequested === true,
    worktree: defaultWorktreeState(summary.worktree),
    continuitySummaryPath: normalizeText(summary.continuity?.markdownPath),
    continuityJsonPath: normalizeText(summary.continuity?.jsonPath),
    hookEventsPath: formatRelativePath(rootDir, paths.hookEventsPath),
    updatedAt: summary.updatedAt,
  };
}
