import path from 'node:path';

import { contextDbRelativePath } from '../../../aios/state-root.mjs';
import { buildDispatchProgress } from '../dispatch-progress.mjs';
import { normalizeDispatchInsightsArtifact } from '../dispatch-insights.mjs';
import { safeReadJson } from '../io.mjs';
import { clipText, normalizeText, toPosixPath } from '../shared.mjs';
import { loadDispatchIndex } from './cache.mjs';

function buildInvalidDispatchArtifact(rootDir, absPath) {
  return {
    artifactPath: toPosixPath(path.relative(rootDir, absPath)),
    persistedAt: '',
    ok: false,
    mode: '',
    jobCount: 0,
    blockedJobs: 0,
    blockedJobIds: [],
    blocked: [],
    executors: [],
    finalOutputs: 0,
    workItems: null,
    jobProgress: null,
    toolProgress: [],
    raw: null,
    parseError: 'invalid-json',
  };
}

// 纯函数：把 jobRuns 中的 blocked 状态整理成 HUD 可直接展示的摘要。
function buildBlockedJobRows(jobRuns = [], workItemTelemetryById = new Map()) {
  return jobRuns
    .filter((jobRun) => normalizeText(jobRun?.status).toLowerCase() === 'blocked')
    .map((jobRun) => ({
      jobId: normalizeText(jobRun?.jobId),
      jobType: normalizeText(jobRun?.jobType) || 'unknown',
      role: normalizeText(jobRun?.role) || 'unknown',
      turnId: normalizeText(jobRun?.turnId),
      workItemRefs: Array.isArray(jobRun?.workItemRefs)
        ? jobRun.workItemRefs.map((ref) => normalizeText(ref)).filter(Boolean)
        : [],
      attempts: Number.isFinite(jobRun?.attempts) ? Math.max(0, Math.floor(jobRun.attempts)) : 0,
      failureClass: normalizeText(workItemTelemetryById.get(normalizeText(jobRun?.jobId))?.failureClass),
      retryClass: normalizeText(workItemTelemetryById.get(normalizeText(jobRun?.jobId))?.retryClass),
      error: clipText(jobRun?.output?.error || jobRun?.output?.rawOutput || ''),
    }))
    .filter((row) => row.jobId);
}

function buildWorkItemsSummary(workItemTelemetry) {
  const totals = workItemTelemetry?.totals && typeof workItemTelemetry.totals === 'object'
    ? workItemTelemetry.totals
    : null;
  return totals
    ? {
      total: Number.isFinite(totals.total) ? Math.max(0, Math.floor(totals.total)) : null,
      queued: Number.isFinite(totals.queued) ? Math.max(0, Math.floor(totals.queued)) : null,
      running: Number.isFinite(totals.running) ? Math.max(0, Math.floor(totals.running)) : null,
      blocked: Number.isFinite(totals.blocked) ? Math.max(0, Math.floor(totals.blocked)) : null,
      done: Number.isFinite(totals.done) ? Math.max(0, Math.floor(totals.done)) : null,
    }
    : null;
}

export async function findLatestDispatchArtifact(rootDir, sessionId) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) return null;

  const index = await loadDispatchIndex(rootDir, normalizedSessionId);
  const latestName = index.latestName || index.names?.[0] || '';
  if (!latestName) return null;

  if (index.latestDispatch && index.latestName === latestName) {
    return index.latestDispatch;
  }

  const absPath = path.join(index.artifactsDir, latestName);
  const artifact = await safeReadJson(absPath);
  if (!artifact || typeof artifact !== 'object') {
    const result = buildInvalidDispatchArtifact(rootDir, absPath);
    if (index.cacheKey) {
      index.latestName = latestName;
      index.latestDispatch = result;
    }
    return result;
  }

  const dispatchRun = artifact.dispatchRun && typeof artifact.dispatchRun === 'object' ? artifact.dispatchRun : null;
  const dispatchPlan = artifact.dispatchPlan && typeof artifact.dispatchPlan === 'object' ? artifact.dispatchPlan : null;
  const jobRuns = Array.isArray(dispatchRun?.jobRuns) ? dispatchRun.jobRuns : [];
  const workItemTelemetryItems = Array.isArray(artifact?.workItemTelemetry?.items) ? artifact.workItemTelemetry.items : [];
  const workItemTelemetryById = new Map(
    workItemTelemetryItems
      .map((item) => [normalizeText(item?.itemId), item])
      .filter(([itemId]) => itemId)
  );
  const blocked = buildBlockedJobRows(jobRuns, workItemTelemetryById);
  const workItemTelemetry = artifact.workItemTelemetry && typeof artifact.workItemTelemetry === 'object'
    ? artifact.workItemTelemetry
    : null;
  const progress = buildDispatchProgress(dispatchRun, dispatchPlan);

  const result = {
    artifactPath: toPosixPath(path.relative(rootDir, absPath)),
    persistedAt: normalizeText(artifact.persistedAt) || normalizeText(artifact.dispatchEvidence?.persistedAt) || '',
    ok: dispatchRun?.ok === true,
    mode: normalizeText(dispatchRun?.mode) || normalizeText(dispatchRun?.executionMode) || '',
    jobCount: jobRuns.length,
    blockedJobs: blocked.length,
    blockedJobIds: blocked.map((row) => row.jobId),
    blocked,
    executors: Array.isArray(dispatchRun?.executorRegistry)
      ? dispatchRun.executorRegistry.map((item) => normalizeText(item)).filter(Boolean)
      : [],
    finalOutputs: Array.isArray(dispatchRun?.finalOutputs) ? dispatchRun.finalOutputs.length : 0,
    workItems: buildWorkItemsSummary(workItemTelemetry),
    jobProgress: progress?.jobs || null,
    toolProgress: Array.isArray(progress?.tools) ? progress.tools : [],
    dispatchInsights: normalizeDispatchInsightsArtifact(artifact.dispatchInsights),
    raw: artifact,
  };

  if (index.cacheKey) {
    index.latestName = latestName;
    index.latestDispatch = result;
  }

  return result;
}

export async function collectRecentDispatchEvidence(rootDir, sessionId, { limit = 6 } = {}) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) return [];

  const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 6;
  const index = await loadDispatchIndex(rootDir, normalizedSessionId);
  const candidates = Array.isArray(index.names) ? index.names.slice(0, max) : [];

  return candidates.map((name) => ({
    artifactPath: contextDbRelativePath(rootDir, 'sessions', normalizedSessionId, 'artifacts', name),
  }));
}