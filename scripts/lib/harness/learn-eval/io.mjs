import { promises as fs } from 'node:fs';
import path from 'node:path';
import { contextDbRelativePath, resolveContextDbRoot } from '../../aios/state-root.mjs';

export const SESSION_STATUS_NAMES = ['running', 'blocked', 'done'];
export const VERIFICATION_RESULT_NAMES = ['unknown', 'passed', 'failed', 'partial'];
export const ORCHESTRATION_DISPATCH_EVENT_KIND = 'orchestration.dispatch-run';

export function getSessionsRoot(rootDir) {
  return path.join(resolveContextDbRoot(rootDir, { preferLegacyExisting: true }), 'sessions');
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readJsonLines(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readJsonOptional(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function readJsonLinesOptional(filePath) {
  try {
    return await readJsonLines(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export function parseDispatchArtifactPathFromEvidence(value) {
  const match = /artifact=([^;]+)/.exec(String(value || ''));
  const artifactPath = match ? match[1].trim() : null;
  return artifactPath && isDispatchArtifactPath(artifactPath) ? artifactPath : null;
}

export function parseDispatchEventIdFromEvidence(value) {
  const match = /event=([^;]+)/.exec(String(value || ''));
  return match ? match[1].trim() : null;
}

export function isDispatchArtifactPath(value) {
  return /(?:^|\/)artifacts\/dispatch-run-.*\.json$/i.test(String(value || '').trim().replace(/\\/g, '/'));
}

export async function collectDispatchEvidence(rootDir, sessionId, checkpoints = [], events = []) {
  const candidates = new Map();

  for (const checkpoint of checkpoints) {
    const artifactPath = (Array.isArray(checkpoint.artifacts) ? checkpoint.artifacts : []).find((item) => isDispatchArtifactPath(item))
      || parseDispatchArtifactPathFromEvidence(checkpoint.telemetry?.verification?.evidence);
    if (!artifactPath) continue;

    candidates.set(artifactPath, {
      artifactPath,
      checkpointSeq: checkpoint.seq,
      checkpointTs: checkpoint.ts,
      eventId: parseDispatchEventIdFromEvidence(checkpoint.telemetry?.verification?.evidence),
    });
  }

  for (const event of events) {
    if (event.kind !== ORCHESTRATION_DISPATCH_EVENT_KIND) continue;
    const artifactPath = (Array.isArray(event.refs) ? event.refs : []).find((item) => isDispatchArtifactPath(item));
    if (!artifactPath) continue;

    const existing = candidates.get(artifactPath) || {};
    candidates.set(artifactPath, {
      ...existing,
      artifactPath,
      eventId: existing.eventId || `${sessionId}#${event.seq}`,
      eventTs: event.ts,
      eventText: event.text,
    });
  }

  const records = [];
  const artifactCache = {};
  for (const candidate of candidates.values()) {
    const artifact = await readJsonOptional(path.join(rootDir, candidate.artifactPath));
    const dispatchRun = artifact?.dispatchRun;
    const jobRuns = Array.isArray(dispatchRun?.jobRuns) ? dispatchRun.jobRuns : [];
    const blockedJobs = jobRuns.filter((jobRun) => jobRun.status === 'blocked').length;
    const workItems = extractWorkItemEvidence(artifact);
    if (artifact && typeof artifact === 'object') {
      artifactCache[candidate.artifactPath] = artifact;
    }
    records.push({
      artifactPath: candidate.artifactPath,
      eventId: candidate.eventId || null,
      checkpointSeq: Number.isFinite(candidate.checkpointSeq) ? candidate.checkpointSeq : null,
      ts: String(artifact?.persistedAt || candidate.eventTs || candidate.checkpointTs || ''),
      ok: dispatchRun?.ok === true,
      blockedJobs,
      jobCount: jobRuns.length,
      executors: Array.isArray(dispatchRun?.executorRegistry) ? [...dispatchRun.executorRegistry] : [],
      finalOutputs: Array.isArray(dispatchRun?.finalOutputs) ? dispatchRun.finalOutputs.length : 0,
      workItems,
    });
  }

  records.sort((left, right) => String(right.ts || '').localeCompare(String(left.ts || '')));
  return { records, artifactCache };
}

export function safeAverage(total, count) {
  return count > 0 ? total / count : 0;
}

export function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

export function createCountRecord(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

export function normalizeFailureCategory(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || undefined;
}

export function normalizeWorkItemStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'done' || normalized === 'completed' || normalized === 'simulated') return 'done';
  if (normalized === 'running') return 'running';
  if (normalized === 'blocked' || normalized === 'needs-input') return 'blocked';
  if (normalized === 'queued' || normalized === 'pending') return 'queued';
  return 'queued';
}

export function extractWorkItemEvidence(artifact = null) {
  const items = Array.isArray(artifact?.workItemTelemetry?.items)
    ? artifact.workItemTelemetry.items
    : [];
  const byTypeCounts = new Map();
  const failureCounts = new Map();
  const retryCounts = new Map();
  let done = 0;
  let blocked = 0;

  for (const item of items) {
    const itemType = String(item?.itemType || 'unknown').trim() || 'unknown';
    const status = normalizeWorkItemStatus(item?.status);
    const byType = byTypeCounts.get(itemType) || { total: 0, blocked: 0 };
    byType.total += 1;
    if (status === 'blocked') {
      byType.blocked += 1;
      blocked += 1;
      const failureClass = String(item?.failureClass || 'none').trim();
      if (failureClass && failureClass !== 'none') {
        failureCounts.set(failureClass, (failureCounts.get(failureClass) || 0) + 1);
      }
    }
    if (status === 'done') {
      done += 1;
    }
    byTypeCounts.set(itemType, byType);

    const retryClass = String(item?.retryClass || 'none').trim();
    if (retryClass && retryClass !== 'none') {
      retryCounts.set(retryClass, (retryCounts.get(retryClass) || 0) + 1);
    }
  }

  return {
    total: items.length,
    blocked,
    done,
    byType: Array.from(byTypeCounts.entries()).map(([itemType, counts]) => ({
      itemType,
      total: counts.total,
      blocked: counts.blocked,
    })),
    failureCounts: Array.from(failureCounts.entries()).map(([failureClass, count]) => ({ failureClass, count })),
    retryCounts: Array.from(retryCounts.entries()).map(([retryClass, count]) => ({ retryClass, count })),
  };
}

export async function findLatestSessionMeta(rootDir) {
  const sessionsRoot = getSessionsRoot(rootDir);
  let entries = [];
  try {
    entries = await fs.readdir(sessionsRoot, { withFileTypes: true });
  } catch (error) {
    const code = error && typeof error === 'object' ? error.code : undefined;
    if (code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const metas = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(sessionsRoot, entry.name, 'meta.json');
    try {
      const meta = await readJson(metaPath);
      metas.push(meta);
    } catch {
      // ignore malformed sessions and keep scanning
    }
  }

  metas.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return metas[0] ?? null;
}

export async function loadSessionArtifacts(rootDir, sessionId) {
  const sessionDir = path.join(getSessionsRoot(rootDir), sessionId);
  const metaPath = path.join(sessionDir, 'meta.json');
  const checkpointsPath = path.join(sessionDir, 'l1-checkpoints.jsonl');
  const eventsPath = path.join(sessionDir, 'l2-events.jsonl');
  const [meta, checkpoints, events] = await Promise.all([
    readJson(metaPath),
    readJsonLines(checkpointsPath),
    readJsonLinesOptional(eventsPath),
  ]);
  return { meta, checkpoints, events };
}
