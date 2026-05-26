import { normalizeHandoffPayload } from '../handoff.mjs';
import { mergeParallelHandoffs } from '../orchestrator.mjs';
import { buildBlockedJobRun } from './job-runs.mjs';
import { normalizeText } from './text.mjs';

function summarizeBlockedDependencies(dependencyRuns = []) {
  return dependencyRuns
    .filter((run) => {
      const status = normalizeText(run?.output?.payload?.status).toLowerCase();
      return status === 'blocked' || status === 'needs-input' || normalizeText(run?.status).toLowerCase() === 'blocked';
    })
    .map((run) => ({
      jobId: normalizeText(run?.jobId),
      role: normalizeText(run?.role || run?.output?.payload?.fromRole),
      status: normalizeText(run?.output?.payload?.status || run?.status),
      openQuestions: Array.isArray(run?.output?.payload?.openQuestions) ? [...run.output.payload.openQuestions] : [],
    }));
}

function buildMergeGateQuestion(mergeResult) {
  if (mergeResult.ok) return '';
  const parts = [];
  if (mergeResult.blocked.length > 0) parts.push(`${mergeResult.blocked.length} blocked handoff(s)`);
  if (mergeResult.ownershipViolations.length > 0) parts.push(`${mergeResult.ownershipViolations.length} ownership violation(s)`);
  if (mergeResult.conflicts.length > 0) parts.push(`${mergeResult.conflicts.length} file conflict(s)`);
  return `Please resolve ${parts.join(', ') || 'the merge-gate blockers'} before automation merges these parallel results.`;
}

function buildMergeGateNextAction(blockedDependencies = [], mergeResult) {
  const blockedJobIds = blockedDependencies.map((item) => item.jobId).filter(Boolean);
  if (blockedJobIds.length > 0) {
    return `Resolve upstream blocked handoff(s): ${blockedJobIds.join(', ')}.`;
  }
  if (mergeResult.ownershipViolations.length > 0) {
    return 'Reassign file ownership or rerun the violating worker with an owned path prefix.';
  }
  if (mergeResult.conflicts.length > 0) {
    return 'Choose a single owner for each conflicted file before retrying the merge gate.';
  }
  return 'Inspect merge-gate details and retry after the blocker is resolved.';
}

export function executeMergeGateJob(plan, job, dependencyRuns, { executorLabel }) {
  const payloads = dependencyRuns.map((run) => run?.output?.payload).filter(Boolean);
  if (payloads.length !== dependencyRuns.length) {
    return buildBlockedJobRun(plan, job, dependencyRuns, {
      executorLabel,
      reason: 'Missing upstream handoff payloads; merge-gate cannot run',
    });
  }

  let mergeResult;
  try {
    mergeResult = mergeParallelHandoffs(payloads);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildBlockedJobRun(plan, job, dependencyRuns, { executorLabel, reason: message });
  }

  const payload = normalizeHandoffPayload({
    status: mergeResult.ok ? 'completed' : 'blocked',
    fromRole: 'merge-gate',
    toRole: 'complete',
    taskTitle: plan.taskTitle,
    contextSummary: mergeResult.ok
      ? `Merge gate passed for ${job.group}.`
      : `Merge gate blocked for ${job.group}.`,
    findings: mergeResult.mergedFindings,
    filesTouched: mergeResult.touchedFiles,
    openQuestions: mergeResult.ok ? [] : [buildMergeGateQuestion(mergeResult)],
    recommendations: mergeResult.mergedRecommendations,
  });
  const blockedDependencies = summarizeBlockedDependencies(dependencyRuns);

  return {
    jobId: job.jobId,
    jobType: job.jobType,
    role: job.role,
    executor: normalizeText(job?.launchSpec?.executor) || 'unknown',
    executorLabel,
    dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
    status: mergeResult.ok ? 'completed' : 'blocked',
    inputSummary: {
      dependencyCount: dependencyRuns.length,
      inputTypes: Array.isArray(job.launchSpec?.inputs) ? [...job.launchSpec.inputs] : [],
    },
    output: {
      outputType: job.launchSpec?.outputType || 'merged-handoff',
      payload,
      mergeResult: {
        ok: mergeResult.ok,
        blockedCount: mergeResult.blocked.length,
        conflictCount: mergeResult.conflicts.length,
        ownershipViolationCount: mergeResult.ownershipViolations.length,
        blocked: mergeResult.blocked,
        ownershipViolations: mergeResult.ownershipViolations,
        conflicts: mergeResult.conflicts,
        touchedFiles: mergeResult.touchedFiles,
        question: buildMergeGateQuestion(mergeResult),
        nextAction: buildMergeGateNextAction(blockedDependencies, mergeResult),
        blockedDependencies,
      },
    },
  };
}
