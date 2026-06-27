import { normalizeText } from '../../../src/shared/normalize.mjs';

function normalizeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStatus(raw = '') {
  const value = normalizeText(raw).toLowerCase();
  if (value === 'completed' || value === 'simulated' || value === 'done') return 'done';
  if (value === 'running') return 'running';
  if (value === 'blocked' || value === 'needs-input') return 'blocked';
  if (value === 'pending' || value === 'queued') return 'queued';
  return 'queued';
}

function inferFailureClass(jobRun, status) {
  if (status !== 'blocked') {
    return 'none';
  }
  const text = normalizeText(`${jobRun?.output?.error || ''} ${jobRun?.output?.rawOutput || ''}`).toLowerCase();
  if (!text) return 'runtime-error';
  if (text.includes('timed out')) return 'timeout';
  if (text.includes('blocked by dependency')) return 'dependency-blocked';
  if (text.includes('file policy violation') || text.includes('ownedpathprefixes') || text.includes('ownership')) {
    return 'ownership-policy';
  }
  if (text.includes('invalid handoff payload') || text.includes('failed to parse json handoff')) {
    return 'contract';
  }
  if (text.includes('unsupported job type')) return 'unsupported-job';
  return 'runtime-error';
}

function inferRetryClass(jobRun) {
  const attempts = Math.max(0, normalizeInteger(jobRun?.attempts, 0));
  if (attempts > 1) {
    return 'same-hypothesis';
  }
  const text = normalizeText(`${jobRun?.output?.error || ''} ${jobRun?.output?.rawOutput || ''}`).toLowerCase();
  if (text.includes('new hypothesis') || text.includes('changed hypothesis')) {
    return 'new-hypothesis';
  }
  return 'none';
}

function normalizeArtifactRefs(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => normalizeText(item)).filter(Boolean);
}

function createItemFromJobRun(jobRun, artifactRefs = []) {
  const status = normalizeStatus(jobRun?.status);
  return {
    itemId: normalizeText(jobRun?.jobId) || 'unknown-item',
    itemType: normalizeText(jobRun?.jobType) || 'phase',
    role: normalizeText(jobRun?.role) || 'unknown-role',
    status,
    failureClass: inferFailureClass(jobRun, status),
    retryClass: inferRetryClass(jobRun),
    attempts: Math.max(0, normalizeInteger(jobRun?.attempts, 0)),
    ...(Number.isFinite(jobRun?.elapsedMs) && jobRun.elapsedMs >= 0 ? { elapsedMs: Math.floor(jobRun.elapsedMs) } : {}),
    dependsOn: Array.isArray(jobRun?.dependsOn) ? jobRun.dependsOn.map((item) => normalizeText(item)).filter(Boolean) : [],
    artifactRefs: normalizeArtifactRefs(artifactRefs),
  };
}

function createItemFromPlannedJob(job, artifactRefs = []) {
  return {
    itemId: normalizeText(job?.jobId) || 'unknown-item',
    itemType: normalizeText(job?.jobType) || 'phase',
    role: normalizeText(job?.role) || 'unknown-role',
    status: normalizeStatus(job?.status || 'queued'),
    failureClass: 'none',
    retryClass: 'none',
    attempts: 0,
    dependsOn: Array.isArray(job?.dependsOn) ? job.dependsOn.map((item) => normalizeText(item)).filter(Boolean) : [],
    artifactRefs: normalizeArtifactRefs(artifactRefs),
  };
}

function summarizeTotals(items = []) {
  const totals = {
    total: items.length,
    queued: 0,
    running: 0,
    blocked: 0,
    done: 0,
  };
  for (const item of items) {
    const status = normalizeStatus(item?.status);
    if (status in totals) {
      totals[status] += 1;
    }
  }
  return totals;
}

export function buildWorkItemTelemetry({ dispatchRun = null, dispatchPlan = null, artifactRefs = [] } = {}) {
  const refs = normalizeArtifactRefs(artifactRefs);
  const items = Array.isArray(dispatchRun?.jobRuns) && dispatchRun.jobRuns.length > 0
    ? dispatchRun.jobRuns.map((jobRun) => createItemFromJobRun(jobRun, refs))
    : Array.isArray(dispatchPlan?.jobs)
      ? dispatchPlan.jobs.map((job) => createItemFromPlannedJob(job, refs))
      : [];

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    totals: summarizeTotals(items),
    items,
  };
}

export function withWorkItemArtifactRef(workItemTelemetry = null, artifactPath = '') {
  if (!workItemTelemetry || typeof workItemTelemetry !== 'object') {
    return buildWorkItemTelemetry({ artifactRefs: artifactPath ? [artifactPath] : [] });
  }

  const ref = normalizeText(artifactPath);
  if (!ref) {
    return {
      ...workItemTelemetry,
      totals: summarizeTotals(Array.isArray(workItemTelemetry.items) ? workItemTelemetry.items : []),
      items: Array.isArray(workItemTelemetry.items) ? workItemTelemetry.items.map((item) => ({ ...item })) : [],
    };
  }

  const items = Array.isArray(workItemTelemetry.items)
    ? workItemTelemetry.items.map((item) => {
      const existing = normalizeArtifactRefs(item?.artifactRefs);
      const merged = existing.includes(ref) ? existing : [...existing, ref];
      return {
        ...item,
        artifactRefs: merged,
      };
    })
    : [];

  return {
    ...workItemTelemetry,
    totals: summarizeTotals(items),
    items,
  };
}
