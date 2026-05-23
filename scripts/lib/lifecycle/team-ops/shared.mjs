import { resolveClientTeamProviders } from '../../clients/registry.mjs';

export const FAST_WATCH_DATA_REFRESH_MS = 1000;
export const DEFAULT_SKILL_CANDIDATE_LIMIT = 6;
export const FAST_WATCH_MINIMAL_SKILL_CANDIDATE_LIMIT = 3;
export const MAX_SKILL_CANDIDATE_LIMIT = 20;
const SKILL_CANDIDATE_VIEWS = new Set(['inline', 'detail']);
const TEAM_PROVIDER_NAMES = new Set(resolveClientTeamProviders('all'));
export const DEFAULT_WATCH_STALLED_MS = 30_000;
const MIN_WATCH_STALLED_MS = 1000;
const MAX_WATCH_STALLED_MS = 10 * 60 * 1000;

export function normalizeText(value) {
  return String(value ?? '').trim();
}

export function normalizeCounter(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function toPosixPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/');
}

export function normalizeSkillCandidateView(value, fallback = 'inline') {
  const normalized = normalizeText(value).toLowerCase();
  if (SKILL_CANDIDATE_VIEWS.has(normalized)) return normalized;
  if (normalized === 'list') return 'detail';
  return fallback;
}

export function formatArtifactTimestamp(ts = new Date()) {
  return ts.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function normalizeConcurrency(value, fallback = 4) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(16, Math.max(1, Math.floor(parsed)));
}

export function normalizeWatchStalledMs(rawValue, fallback = DEFAULT_WATCH_STALLED_MS) {
  const parsed = Number.parseInt(String(rawValue ?? '').trim(), 10);
  const resolved = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.min(MAX_WATCH_STALLED_MS, Math.max(MIN_WATCH_STALLED_MS, Math.floor(resolved)));
}

export function normalizeProvider(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (TEAM_PROVIDER_NAMES.has(normalized)) {
    return normalized;
  }
  return 'codex';
}

export function normalizeQualityOutcome(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'retry-needed') return 'failed';
  if (normalized === 'success') return 'ok';
  return normalized;
}

export function normalizeQualityCategory(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeProgressCounts(progress = null) {
  if (!progress || typeof progress !== 'object') return null;
  const total = Number.isFinite(progress.total) ? Math.max(0, Math.floor(progress.total)) : 0;
  if (total <= 0) return null;
  return {
    total,
    done: Number.isFinite(progress.done) ? Math.max(0, Math.floor(progress.done)) : 0,
    running: Number.isFinite(progress.running) ? Math.max(0, Math.floor(progress.running)) : 0,
    blocked: Number.isFinite(progress.blocked) ? Math.max(0, Math.floor(progress.blocked)) : 0,
    queued: Number.isFinite(progress.queued) ? Math.max(0, Math.floor(progress.queued)) : 0,
  };
}

function normalizeToolProgress(toolProgress = []) {
  if (!Array.isArray(toolProgress)) return [];
  return toolProgress
    .map((entry) => ({
      tool: normalizeText(entry?.tool),
      counts: normalizeProgressCounts(entry),
    }))
    .filter((entry) => entry.tool && entry.counts)
    .sort((left, right) =>
      right.counts.blocked - left.counts.blocked
      || right.counts.running - left.counts.running
      || right.counts.total - left.counts.total
      || left.tool.localeCompare(right.tool)
    );
}

function buildProgressSnapshot(state = null) {
  const dispatch = state?.latestDispatch && typeof state.latestDispatch === 'object'
    ? state.latestDispatch
    : null;
  const jobCounts = normalizeProgressCounts(dispatch?.jobProgress);
  if (!dispatch || !jobCounts) return null;
  const tools = normalizeToolProgress(dispatch?.toolProgress);
  const active = jobCounts.done < jobCounts.total;
  const signature = JSON.stringify({
    ok: dispatch.ok === true,
    mode: normalizeText(dispatch.mode),
    jobCounts,
    tools: tools.map((entry) => ({ tool: entry.tool, ...entry.counts })),
  });
  return {
    active,
    jobCounts,
    tools,
    signature,
  };
}

function formatStalledToolSummary(tools = [], limit = 2) {
  const capped = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 2;
  if (!Array.isArray(tools) || tools.length === 0) return '';
  const top = tools.slice(0, capped).map((entry) => (
    `${entry.tool}:${entry.counts.done}/${entry.counts.total}(r=${entry.counts.running} b=${entry.counts.blocked} q=${entry.counts.queued})`
  ));
  if (tools.length > capped) {
    top.push(`+${tools.length - capped}`);
  }
  return top.join(' | ');
}

export function createStatusWatchStallTracker({
  thresholdMs = DEFAULT_WATCH_STALLED_MS,
  nowFn = () => Date.now(),
} = {}) {
  const normalizedThresholdMs = normalizeWatchStalledMs(thresholdMs, DEFAULT_WATCH_STALLED_MS);
  let previousSignature = '';
  let lastChangedAtMs = null;

  return {
    thresholdMs: normalizedThresholdMs,
    observe(state = null, { nowMs: injectedNowMs = null } = {}) {
      const rawNow = Number.isFinite(injectedNowMs)
        ? Number(injectedNowMs)
        : Number(nowFn());
      const nowMs = Number.isFinite(rawNow) ? rawNow : Date.now();
      const snapshot = buildProgressSnapshot(state);
      if (!snapshot || !snapshot.active) {
        previousSignature = snapshot?.signature || '';
        lastChangedAtMs = nowMs;
        return null;
      }

      if (!previousSignature || snapshot.signature !== previousSignature) {
        previousSignature = snapshot.signature;
        lastChangedAtMs = nowMs;
        return null;
      }

      if (!Number.isFinite(lastChangedAtMs)) {
        lastChangedAtMs = nowMs;
        return null;
      }

      const stalledForMs = Math.max(0, nowMs - lastChangedAtMs);
      if (stalledForMs < normalizedThresholdMs) {
        return null;
      }

      return {
        stalled: true,
        stalledForMs,
        stalledThresholdMs: normalizedThresholdMs,
        stalledJobCounts: snapshot.jobCounts,
        stalledToolSummary: formatStalledToolSummary(snapshot.tools),
      };
    },
  };
}

export function normalizeQualityCategoryPrefixes(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value
      .map((item) => normalizeQualityCategory(item))
      .filter(Boolean)));
  }
  return Array.from(new Set(normalizeText(value)
    .split(',')
    .map((item) => normalizeQualityCategory(item))
    .filter(Boolean)));
}

export function normalizeQualityCategoryPrefixMode(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === 'all' ? 'all' : 'any';
}

export function resolveQualityCategory(record) {
  const qualityGate = record?.qualityGate && typeof record.qualityGate === 'object'
    ? record.qualityGate
    : null;
  return normalizeText(qualityGate?.failureCategory) || normalizeText(qualityGate?.categoryRef);
}

export function hasFailedQualityGate(record) {
  const qualityGate = record?.qualityGate && typeof record.qualityGate === 'object'
    ? record.qualityGate
    : null;
  return normalizeQualityOutcome(qualityGate?.outcome) === 'failed';
}

export function matchesQualityCategory(record, categoryFilter) {
  if (!categoryFilter) return true;
  if (!hasFailedQualityGate(record)) return false;
  return normalizeQualityCategory(resolveQualityCategory(record)) === categoryFilter;
}

export function matchesQualityCategoryPrefix(record, categoryPrefixFilters = [], mode = 'any') {
  if (!Array.isArray(categoryPrefixFilters) || categoryPrefixFilters.length === 0) return true;
  if (!hasFailedQualityGate(record)) return false;
  const category = normalizeQualityCategory(resolveQualityCategory(record));
  if (mode === 'all') {
    return categoryPrefixFilters.every((prefix) => category.startsWith(prefix));
  }
  return categoryPrefixFilters.some((prefix) => category.startsWith(prefix));
}

export async function mapWithConcurrency(items, concurrency, mapper) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const resolvedConcurrency = normalizeConcurrency(concurrency, 1);
  const results = new Array(items.length);
  let cursor = 0;

  const workerCount = Math.min(resolvedConcurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) break;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}
