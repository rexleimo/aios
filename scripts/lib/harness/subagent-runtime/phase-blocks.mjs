import { recordPhaseModelDispatch } from './client-args.mjs';
import { buildBlockedJobRun } from './job-runs.mjs';
import { clipText, normalizeText } from './text.mjs';

// 纯函数：把不同执行器返回的 attempts 统一为非负整数。
function normalizeAttemptCount(raw, fallback = 0) {
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(0, Math.floor(raw));
}

export function buildBlockedPhaseJobRun({
  plan,
  job,
  dependencyRuns,
  executorLabel,
  reason,
  elapsedMs,
  costTelemetry = null,
  rawOutput = '',
  attempts = 0,
  rootDir,
  modelRouting = null,
  io = null,
  dispatchDescription = '',
}) {
  const normalizedReason = normalizeText(reason) || 'blocked';
  io?.log?.(`[subagent-runtime] blocked ${job.jobId} reason=${normalizedReason}`);
  recordPhaseModelDispatch({
    rootDir,
    job,
    modelRouting,
    success: false,
    elapsedMs,
    description: normalizeText(dispatchDescription) || normalizedReason,
  });
  return buildBlockedJobRun(plan, job, dependencyRuns, {
    executorLabel,
    reason: normalizedReason,
    elapsedMs,
    cost: costTelemetry,
    rawOutput: clipText(rawOutput),
    attempts: normalizeAttemptCount(attempts),
  });
}
