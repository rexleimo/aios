import { normalizeText } from './shared.mjs';
import { normalizeWorkItems } from './work-items.mjs';

// 纯函数集合：把外部 dispatch/overlay 输入规整成稳定 schema，主流程不再写 if/else 容错。
export function normalizeLearnEvalOverlay(rawOverlay) {
  if (!rawOverlay || typeof rawOverlay !== 'object') {
    return null;
  }

  const appliedRecommendations = Array.isArray(rawOverlay.appliedRecommendations)
    ? rawOverlay.appliedRecommendations.map((item) => ({ ...item }))
    : [];

  return {
    sourceSessionId: String(rawOverlay.sourceSessionId || '').trim(),
    sourceGoal: String(rawOverlay.sourceGoal || '').trim(),
    selectedRecommendationId: rawOverlay.selectedRecommendationId ? String(rawOverlay.selectedRecommendationId).trim() : null,
    appliedRecommendationIds: Array.isArray(rawOverlay.appliedRecommendationIds)
      ? rawOverlay.appliedRecommendationIds.map((item) => String(item))
      : appliedRecommendations.map((item) => item.targetId),
    appliedRecommendations,
  };
}

export function normalizeDispatchPlan(rawPlan) {
  if (!rawPlan || typeof rawPlan !== 'object') {
    return null;
  }

  return {
    ...rawPlan,
    workItems: normalizeWorkItems(rawPlan.workItems),
    workItemQueue: rawPlan.workItemQueue && typeof rawPlan.workItemQueue === 'object'
      ? {
        enabled: rawPlan.workItemQueue.enabled === true,
        maxParallel: Number.isFinite(rawPlan.workItemQueue.maxParallel)
          ? Math.max(1, Math.floor(rawPlan.workItemQueue.maxParallel))
          : 1,
        entries: Array.isArray(rawPlan.workItemQueue.entries)
          ? rawPlan.workItemQueue.entries.map((entry) => ({
            queueId: normalizeText(entry?.queueId),
            phaseId: normalizeText(entry?.phaseId),
            role: normalizeText(entry?.role),
            itemId: normalizeText(entry?.itemId),
            jobId: normalizeText(entry?.jobId),
            dependsOn: Array.isArray(entry?.dependsOn)
              ? entry.dependsOn.map((item) => normalizeText(item)).filter(Boolean)
              : [],
            status: normalizeText(entry?.status) || 'queued',
          }))
          : [],
      }
      : {
        enabled: false,
        maxParallel: 1,
        entries: [],
      },
    notes: Array.isArray(rawPlan.notes) ? [...rawPlan.notes] : [],
    executorRegistry: Array.isArray(rawPlan.executorRegistry) ? [...rawPlan.executorRegistry] : [],
    executorDetails: Array.isArray(rawPlan.executorDetails)
      ? rawPlan.executorDetails.map((item) => ({
        ...item,
        executionModes: Array.isArray(item.executionModes) ? [...item.executionModes] : [],
        jobTypes: Array.isArray(item.jobTypes) ? [...item.jobTypes] : [],
        supportedRoles: Array.isArray(item.supportedRoles) ? [...item.supportedRoles] : [],
        outputTypes: Array.isArray(item.outputTypes) ? [...item.outputTypes] : [],
      }))
      : [],
    jobs: Array.isArray(rawPlan.jobs)
      ? rawPlan.jobs.map((job) => ({
        ...job,
        dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
        outputs: Array.isArray(job.outputs) ? [...job.outputs] : [],
        launchSpec: job.launchSpec
          ? {
            ...job.launchSpec,
            workItemRefs: Array.isArray(job.launchSpec.workItemRefs)
              ? job.launchSpec.workItemRefs.map((item) => normalizeText(item)).filter(Boolean)
              : [],
          }
          : {},
      }))
      : [],
  };
}

export function normalizeDispatchRuntime(rawRuntime) {
  if (!rawRuntime || typeof rawRuntime !== 'object') {
    return null;
  }

  return {
    id: String(rawRuntime.id || '').trim(),
    manifestVersion: Number.isFinite(rawRuntime.manifestVersion) ? rawRuntime.manifestVersion : null,
    label: String(rawRuntime.label || '').trim(),
    description: String(rawRuntime.description || '').trim(),
    requiresModel: rawRuntime.requiresModel === true,
    executionMode: rawRuntime.executionMode ? String(rawRuntime.executionMode) : null,
  };
}

export function normalizeDispatchRun(rawRun) {
  if (!rawRun || typeof rawRun !== 'object') {
    return null;
  }

  return {
    ...rawRun,
    runtime: normalizeDispatchRuntime(rawRun.runtime),
    executorRegistry: Array.isArray(rawRun.executorRegistry) ? [...rawRun.executorRegistry] : [],
    executorDetails: Array.isArray(rawRun.executorDetails)
      ? rawRun.executorDetails.map((item) => ({
        ...item,
        executionModes: Array.isArray(item.executionModes) ? [...item.executionModes] : [],
        jobTypes: Array.isArray(item.jobTypes) ? [...item.jobTypes] : [],
        supportedRoles: Array.isArray(item.supportedRoles) ? [...item.supportedRoles] : [],
        outputTypes: Array.isArray(item.outputTypes) ? [...item.outputTypes] : [],
      }))
      : [],
    finalOutputs: Array.isArray(rawRun.finalOutputs) ? rawRun.finalOutputs.map((item) => ({ ...item })) : [],
    jobRuns: Array.isArray(rawRun.jobRuns)
      ? rawRun.jobRuns.map((jobRun) => ({
        ...jobRun,
        dependsOn: Array.isArray(jobRun.dependsOn) ? [...jobRun.dependsOn] : [],
        inputSummary: jobRun.inputSummary ? { ...jobRun.inputSummary } : {},
        output: jobRun.output ? { ...jobRun.output } : null,
      }))
      : [],
  };
}

export function normalizeDispatchEvidence(rawEvidence) {
  if (!rawEvidence || typeof rawEvidence !== 'object') {
    return null;
  }

  return {
    ...rawEvidence,
    persisted: rawEvidence.persisted === true,
    mode: rawEvidence.mode ? String(rawEvidence.mode) : null,
    reason: rawEvidence.reason ? String(rawEvidence.reason) : null,
    artifactPath: rawEvidence.artifactPath ? String(rawEvidence.artifactPath) : null,
    eventKind: rawEvidence.eventKind ? String(rawEvidence.eventKind) : null,
    eventId: rawEvidence.eventId ? String(rawEvidence.eventId) : null,
    checkpointId: rawEvidence.checkpointId ? String(rawEvidence.checkpointId) : null,
    checkpointStatus: rawEvidence.checkpointStatus ? String(rawEvidence.checkpointStatus) : null,
    error: rawEvidence.error ? String(rawEvidence.error) : null,
  };
}

export function normalizeDispatchPolicy(rawPolicy) {
  if (!rawPolicy || typeof rawPolicy !== 'object') {
    return null;
  }

  return {
    status: rawPolicy.status ? String(rawPolicy.status) : 'caution',
    parallelism: rawPolicy.parallelism ? String(rawPolicy.parallelism) : 'parallel-with-merge-gate',
    blockerIds: Array.isArray(rawPolicy.blockerIds) ? rawPolicy.blockerIds.map((item) => String(item)) : [],
    advisoryIds: Array.isArray(rawPolicy.advisoryIds) ? rawPolicy.advisoryIds.map((item) => String(item)) : [],
    requiredActions: Array.isArray(rawPolicy.requiredActions)
      ? rawPolicy.requiredActions.map((item) => ({
        type: item?.type ? String(item.type) : 'command',
        action: String(item?.action || ''),
        sourceId: item?.sourceId ? String(item.sourceId) : null,
      }))
      : [],
    executorPreferences: Array.isArray(rawPolicy.executorPreferences)
      ? rawPolicy.executorPreferences.map((item) => ({
        executor: String(item?.executor || ''),
        confidence: item?.confidence ? String(item.confidence) : 'planned',
        observedCount: Number.isFinite(item?.observedCount) ? item.observedCount : 0,
        source: item?.source ? String(item.source) : 'dispatch-plan',
      }))
      : [],
    notes: Array.isArray(rawPolicy.notes) ? rawPolicy.notes.map((item) => String(item)) : [],
  };
}

export function normalizeDispatchPreflight(rawPreflight) {
  if (!rawPreflight || typeof rawPreflight !== 'object') {
    return null;
  }

  return {
    mode: rawPreflight.mode ? String(rawPreflight.mode) : 'none',
    results: Array.isArray(rawPreflight.results)
      ? rawPreflight.results.map((item) => ({
        type: item?.type ? String(item.type) : 'command',
        sourceId: item?.sourceId ? String(item.sourceId) : null,
        action: String(item?.action || ''),
        status: item?.status ? String(item.status) : 'skipped',
        runner: item?.runner ? String(item.runner) : 'unsupported',
        summary: item?.summary ? String(item.summary) : '',
        exitCode: Number.isFinite(item?.exitCode) ? item.exitCode : null,
      }))
      : [],
  };
}
