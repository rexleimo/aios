import { validateHandoffPayload } from '../handoff.mjs';
import { recordPhaseModelDispatch } from './client-args.mjs';
import { evaluatePhaseFilePolicy, summarizeFilePolicyViolation } from './file-policy.mjs';
import { buildFailureReason } from './job-runs.mjs';
import { maybeRecordWorkerDeathNotice } from './phase-death-notice.mjs';
import { normalizeResultAttempts } from './phase-job-helpers.mjs';
import { buildBlockedPhaseJobRun } from './phase-blocks.mjs';
import { buildCompletedPhaseJobRun, normalizePhaseHandoffPayload, resolvePhaseJobStatus } from './phase-output.mjs';
import { maybeSyncPlanOnPhaseSuccess } from './phase-plan-sync.mjs';
import { hasCostTelemetry } from './telemetry.mjs';

export async function finalizePhaseJobRun({
  plan,
  job,
  phase,
  dependencyRuns,
  executorLabel,
  rootDir,
  io,
  modelRouting,
  executionClientId,
  clientId,
  result,
  elapsedMs,
  outputText,
  rawJson,
  redactedRawCommandOutput,
  compactOutputText,
  compactRawCommandOutput,
  costTelemetry,
  appendJobFindingsToRoleMemoryImpl,
}) {
  const attempts = normalizeResultAttempts(result);
  const block = (reason, options = {}) => buildBlockedPhaseJobRun({
    plan,
    job,
    dependencyRuns,
    executorLabel,
    reason,
    elapsedMs,
    costTelemetry,
    rawOutput: options.rawOutput ?? compactRawCommandOutput,
    attempts: options.attempts ?? attempts,
    rootDir,
    modelRouting,
    io,
    dispatchDescription: options.dispatchDescription,
  });
  const allowTimedOutHandoff = result.exitCode !== 0
    && /timed out/i.test(String(result.error || ''))
    && Boolean(rawJson);
  if (result.exitCode !== 0 && !allowTimedOutHandoff) {
    const attemptCount = normalizeResultAttempts(result, 1);
    const failureReason = buildFailureReason({
      baseReason: result.error || `exit=${result.exitCode}${attemptCount > 1 ? ` after ${attemptCount} attempts` : ''}`,
      exitCode: result.exitCode,
      rawCommandOutput: redactedRawCommandOutput,
    });
    await maybeRecordWorkerDeathNotice({
      rootDir,
      plan,
      job,
      failureReason,
      exitCode: result.exitCode,
      io,
    });
    return block(failureReason, { attempts: attemptCount, rawOutput: compactRawCommandOutput });
  }
  if (allowTimedOutHandoff) {
    io?.log?.(`[subagent-runtime] continuing ${job.jobId} with last-message payload after timeout`);
  }
  if (!rawJson) {
    return block('Failed to parse JSON handoff from subagent output', { rawOutput: compactRawCommandOutput });
  }

  const normalizedPayload = normalizePhaseHandoffPayload({ rawJson, plan, job, phase });
  const validation = validateHandoffPayload(normalizedPayload);
  if (!validation.ok) {
    return block(`Invalid handoff payload: ${validation.errors.join('; ')}`, {
      rawOutput: compactOutputText,
      dispatchDescription: 'Invalid handoff payload',
    });
  }
  const filePolicy = evaluatePhaseFilePolicy(validation.value, phase, job);
  if (!filePolicy.ok) {
    return block(summarizeFilePolicyViolation(filePolicy.violations), { rawOutput: compactOutputText });
  }

  const payloadStatus = validation.value.status;
  const jobStatus = resolvePhaseJobStatus(payloadStatus);
  const costNote = hasCostTelemetry(costTelemetry)
    ? ` tokens=${costTelemetry.totalTokens} usd=${costTelemetry.usd}`
    : '';
  io?.log?.(`[subagent-runtime] completed ${job.jobId} status=${payloadStatus} elapsedMs=${elapsedMs}${costNote}`);
  recordPhaseModelDispatch({
    rootDir,
    job,
    modelRouting,
    success: jobStatus === 'completed',
    elapsedMs,
    description: `${job.jobId} ${payloadStatus}`,
  });

  if (jobStatus === 'completed') {
    await appendJobFindingsToRoleMemoryImpl({
      role: job.role,
      rootDir,
      jobId: job.jobId,
      taskTitle: plan.taskTitle,
      findings: validation.value.findings,
      contextSummary: validation.value.contextSummary,
    }).catch(() => {});
    await maybeSyncPlanOnPhaseSuccess({
      rootDir,
      plan,
      job,
      payloadStatus,
      io,
    });
  }

  return buildCompletedPhaseJobRun({
    job,
    dependencyRuns,
    executorLabel,
    elapsedMs,
    costTelemetry,
    modelRouting,
    executionClientId,
    clientId,
    result,
    payload: validation.value,
    outputText: compactOutputText,
  });
}
