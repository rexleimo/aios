import { normalizeModelRouting } from '../../model-router.mjs';
import { normalizeHandoffPayload } from '../handoff.mjs';
import { clipText, normalizeText } from './text.mjs';
import { hasCostTelemetry, normalizeCostTelemetry } from './telemetry.mjs';

export function buildBlockedJobRun(plan, job, dependencyRuns, {
  executorLabel,
  reason,
  elapsedMs = null,
  cost = null,
  rawOutput = '',
  attempts = 0,
}) {
  const modelRouting = normalizeModelRouting(job?.launchSpec?.modelRouting);
  const jobRun = {
    jobId: job.jobId,
    jobType: job.jobType,
    role: job.role,
    executor: normalizeText(job?.launchSpec?.executor) || 'unknown',
    executorLabel,
    dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
    status: 'blocked',
    ...(modelRouting ? { modelRouting } : {}),
    inputSummary: {
      dependencyCount: dependencyRuns.length,
      inputTypes: Array.isArray(job.launchSpec?.inputs) ? [...job.launchSpec.inputs] : [],
    },
    output: {
      outputType: job.launchSpec?.outputType || 'unknown',
      error: normalizeText(reason) || 'blocked',
      ...(normalizeText(rawOutput) ? { rawOutput: clipText(rawOutput) } : {}),
    },
  };
  if (Number.isFinite(elapsedMs) && elapsedMs >= 0) {
    jobRun.elapsedMs = Math.floor(elapsedMs);
  }
  if (hasCostTelemetry(cost)) {
    jobRun.cost = normalizeCostTelemetry(cost);
  }
  if (Number.isFinite(attempts) && attempts > 0) {
    jobRun.attempts = Math.max(0, Math.floor(attempts));
  }
  return jobRun;
}

export function shouldAutoCompleteReadOnlyReviewPhase(job, dependencyRuns = []) {
  const role = normalizeText(job?.role);
  if (role !== 'reviewer' && role !== 'security-reviewer') {
    return false;
  }
  if (!Array.isArray(dependencyRuns) || dependencyRuns.length === 0) {
    return false;
  }
  return dependencyRuns.every((run) => {
    if (!run || run.status !== 'completed') {
      return false;
    }
    const payload = run?.output?.payload;
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    const filesTouched = Array.isArray(payload.filesTouched) ? payload.filesTouched : [];
    return filesTouched.length === 0;
  });
}

export function buildAutoCompletedReadOnlyReviewRun(plan, job, dependencyRuns, { executorLabel }) {
  const role = normalizeText(job?.role) || 'reviewer';
  const handoffTarget = normalizeText(job?.launchSpec?.handoffTarget) || 'next-phase';
  const upstreamIds = dependencyRuns.map((run) => normalizeText(run?.jobId)).filter(Boolean);
  const contextSummary = 'Auto-completed no-op review: upstream handoffs touched no files.';
  const payload = normalizeHandoffPayload({
    status: 'completed',
    fromRole: role,
    toRole: handoffTarget,
    taskTitle: normalizeText(plan?.taskTitle) || 'orchestration-task',
    contextSummary,
    findings: [
      `Skipped model invocation because ${dependencyRuns.length} upstream handoff(s) reported no file changes.`,
      ...(upstreamIds.length > 0 ? [`Upstream jobs: ${upstreamIds.join(', ')}`] : []),
    ],
    filesTouched: [],
    openQuestions: [],
    recommendations: [],
  });

  const modelRouting = normalizeModelRouting(job?.launchSpec?.modelRouting);

  return {
    jobId: job.jobId,
    jobType: job.jobType,
    role,
    executor: normalizeText(job?.launchSpec?.executor) || 'unknown',
    executorLabel,
    dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
    status: 'completed',
    elapsedMs: 0,
    ...(modelRouting ? { modelRouting } : {}),
    inputSummary: {
      dependencyCount: dependencyRuns.length,
      inputTypes: Array.isArray(job.launchSpec?.inputs) ? [...job.launchSpec.inputs] : [],
    },
    output: {
      outputType: job.launchSpec?.outputType || 'handoff',
      payload,
      rawOutput: contextSummary,
    },
  };
}

export function buildFailureReason({ baseReason, exitCode, rawCommandOutput }) {
  const normalizedBase = normalizeText(baseReason);
  const trimmedOutput = normalizeText(rawCommandOutput);
  if (!trimmedOutput) {
    return normalizedBase || `exit=${exitCode}`;
  }

  const firstLine = trimmedOutput
    .split(/\r?\n/u)
    .map((line) => normalizeText(line))
    .find((line) => line.length > 0) || '';

  if (!firstLine) {
    return normalizedBase || `exit=${exitCode}`;
  }

  if (normalizedBase.length > 0 && normalizedBase !== `exit=${exitCode}`) {
    return `${normalizedBase}; ${firstLine}`;
  }
  return `exit=${exitCode}; ${firstLine}`;
}

export function normalizeSeededJobRun(rawJobRun = {}) {
  const jobId = normalizeText(rawJobRun?.jobId);
  if (!jobId) {
    return null;
  }
  const status = normalizeText(rawJobRun?.status).toLowerCase();
  if (status === 'blocked' || status === 'needs-input') {
    return null;
  }
  const output = rawJobRun?.output && typeof rawJobRun.output === 'object'
    ? { ...rawJobRun.output }
    : { outputType: 'handoff' };
  return {
    jobId,
    jobType: normalizeText(rawJobRun?.jobType) || 'phase',
    role: normalizeText(rawJobRun?.role) || 'seed',
    executor: normalizeText(rawJobRun?.executor) || 'seed',
    executorLabel: normalizeText(rawJobRun?.executorLabel) || normalizeText(rawJobRun?.executor) || 'seed',
    dependsOn: Array.isArray(rawJobRun?.dependsOn)
      ? rawJobRun.dependsOn.map((item) => normalizeText(item)).filter(Boolean)
      : [],
    status: status || 'completed',
    inputSummary: rawJobRun?.inputSummary && typeof rawJobRun.inputSummary === 'object'
      ? { ...rawJobRun.inputSummary }
      : {
        dependencyCount: 0,
        inputTypes: [],
      },
    output,
  };
}
