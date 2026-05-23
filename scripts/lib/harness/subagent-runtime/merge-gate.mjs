import { normalizeHandoffPayload } from '../handoff.mjs';
import { mergeParallelHandoffs } from '../orchestrator.mjs';
import { buildBlockedJobRun } from './job-runs.mjs';
import { normalizeText } from './text.mjs';

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
    recommendations: mergeResult.mergedRecommendations,
  });

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
        touchedFiles: mergeResult.touchedFiles,
      },
    },
  };
}
