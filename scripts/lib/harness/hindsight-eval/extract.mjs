import { buildRuntimeClientProviderMap } from '../../clients/registry.mjs';
import { clipText, normalizeStringArray, normalizeText, normalizeTurnStatus } from './shared.mjs';

function extractJobError(jobRun) {
  return clipText(jobRun?.output?.error || jobRun?.output?.rawOutput || '');
}

function inferFailureClassFromError(_errorText) {
  // 北极星原则：失败类别只来自显式声明（telemetry.failureClass），
  // 程序不根据错误文本关键词猜类别；无声明时返回中性 runtime-error。
  return 'runtime-error';
}

function buildWorkItemTelemetryMap(artifact) {
  const items = Array.isArray(artifact?.workItemTelemetry?.items) ? artifact.workItemTelemetry.items : [];
  const map = new Map();
  for (const item of items) {
    const itemId = normalizeText(item?.itemId);
    if (!itemId) continue;
    map.set(itemId, item);
  }
  return map;
}

export function extractTurn(jobRun, { telemetryByItemId = null } = {}) {
  const jobId = normalizeText(jobRun?.jobId);
  if (!jobId) return null;

  const error = extractJobError(jobRun);
  const telemetry = telemetryByItemId instanceof Map ? telemetryByItemId.get(jobId) : null;
  // 北极星原则：失败/重试类别只来自显式声明（telemetry.failureClass / jobRun.failureClass），
  // 程序不根据错误文本猜类别；无声明时 failureClass 回退中性 runtime-error。
  const failureClass = normalizeText(telemetry?.failureClass)
    || normalizeText(jobRun?.failureClass)
    || inferFailureClassFromError(error);
  const retryClass = normalizeText(telemetry?.retryClass)
    || normalizeText(jobRun?.retryClass)
    || 'none';
  const attempts = Number.isFinite(jobRun?.attempts) ? Math.max(0, Math.floor(jobRun.attempts)) : 0;

  return {
    jobId,
    jobType: normalizeText(jobRun?.jobType) || 'unknown',
    role: normalizeText(jobRun?.role) || 'unknown',
    status: normalizeText(jobRun?.status) || 'queued',
    normalizedStatus: normalizeTurnStatus(jobRun?.status),
    turnId: normalizeText(jobRun?.turnId),
    workItemRefs: normalizeStringArray(jobRun?.workItemRefs),
    attempts,
    failureClass,
    retryClass,
    error,
  };
}

export function extractDispatchRunRecord({ artifactPath, artifact }) {
  const dispatchRun = artifact?.dispatchRun && typeof artifact.dispatchRun === 'object' ? artifact.dispatchRun : null;
  const jobRuns = Array.isArray(dispatchRun?.jobRuns) ? dispatchRun.jobRuns : [];
  const telemetryByItemId = buildWorkItemTelemetryMap(artifact);
  const turns = jobRuns.map((jobRun) => extractTurn(jobRun, { telemetryByItemId })).filter(Boolean);
  const byJobId = new Map(turns.map((turn) => [turn.jobId, turn]));

  return {
    artifactPath: normalizeText(artifactPath),
    persistedAt: normalizeText(artifact?.persistedAt),
    mode: normalizeText(dispatchRun?.mode) || normalizeText(dispatchRun?.executionMode),
    ok: dispatchRun?.ok === true,
    turns,
    byJobId,
  };
}

export function extractProviderFromAgent(agent = '') {
  const value = normalizeText(agent).toLowerCase();
  return buildRuntimeClientProviderMap('all')[value] || '';
}