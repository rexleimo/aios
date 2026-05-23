import { buildRuntimeClientProviderMap } from '../../clients/registry.mjs';
import { clipText, normalizeStringArray, normalizeText, normalizeTurnStatus } from './shared.mjs';

function extractJobError(jobRun) {
  return clipText(jobRun?.output?.error || jobRun?.output?.rawOutput || '');
}

function inferFailureClassFromError(errorText) {
  const text = normalizeText(errorText).toLowerCase();
  if (!text) return 'runtime-error';
  if (text.includes('timed out')) return 'timeout';
  if (text.includes('blocked by dependency')) return 'dependency-blocked';
  if (text.includes('file policy violation') || text.includes('ownedpathprefixes') || text.includes('ownership')) {
    return 'ownership-policy';
  }
  if (text.includes('invalid handoff payload') || text.includes('failed to parse json handoff') || text.includes('output a single json object')) {
    return 'contract';
  }
  if (text.includes('unsupported job type')) return 'unsupported-job';
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
  const failureClass = normalizeText(telemetry?.failureClass) || inferFailureClassFromError(error);
  const retryClass = normalizeText(telemetry?.retryClass) || 'none';
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