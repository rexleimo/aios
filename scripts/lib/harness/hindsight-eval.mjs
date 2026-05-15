import { promises as fs } from 'node:fs';
import path from 'node:path';

const HINDSIGHT_CACHE_MAX_ENTRIES = 24;
const HINDSIGHT_CACHE = new Map();
const ARTIFACT_SIGNATURE_CACHE_MAX_ENTRIES = 128;
const ARTIFACT_SIGNATURE_NEGATIVE_TTL_MS = 750;
const ARTIFACT_SIGNATURE_CACHE = new Map();

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function getCacheKeyPart(value) {
  return String(value ?? '').replaceAll('::', ':');
}

function bumpLruCache(cache, cacheKey) {
  if (!cacheKey || !(cache instanceof Map) || !cache.has(cacheKey)) return;
  const value = cache.get(cacheKey);
  cache.delete(cacheKey);
  cache.set(cacheKey, value);
}

function setLruCache(cache, cacheKey, value, maxEntries) {
  if (!cacheKey || !(cache instanceof Map)) return;
  if (cache.has(cacheKey)) {
    cache.delete(cacheKey);
  }
  cache.set(cacheKey, value);
  const limit = Number.isFinite(maxEntries) ? Math.max(1, Math.floor(maxEntries)) : 50;
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function buildHindsightCacheKey({
  rootDir,
  sessionId,
  provider,
  artifacts,
  artifactSignatures = [],
  maxArtifacts,
  maxPairs,
  maxLessons,
} = {}) {
  const artifactKey = Array.isArray(artifacts)
    ? artifacts.map((item) => getCacheKeyPart(item?.artifactPath)).join('|')
    : '';
  const signatureKey = Array.isArray(artifactSignatures) && artifactSignatures.length > 0
    ? artifactSignatures
      .map((item) => `${getCacheKeyPart(item?.artifactPath)}@${getCacheKeyPart(item?.mtimeMs)}@${getCacheKeyPart(item?.size)}`)
      .join('|')
    : '';

  return [
    getCacheKeyPart(rootDir),
    getCacheKeyPart(sessionId),
    getCacheKeyPart(provider),
    `maxArtifacts=${getCacheKeyPart(maxArtifacts)}`,
    `maxPairs=${getCacheKeyPart(maxPairs)}`,
    `maxLessons=${getCacheKeyPart(maxLessons)}`,
    `artifacts=${artifactKey}`,
    `signatures=${signatureKey}`,
  ].join('::');
}

function getCachedHindsight(cacheKey) {
  if (!cacheKey) return null;
  const cached = HINDSIGHT_CACHE.get(cacheKey);
  if (!cached || typeof cached !== 'object') return null;
  HINDSIGHT_CACHE.delete(cacheKey);
  HINDSIGHT_CACHE.set(cacheKey, cached);
  return cached;
}

function setCachedHindsight(cacheKey, result) {
  if (!cacheKey || !result || typeof result !== 'object') return;
  if (HINDSIGHT_CACHE.has(cacheKey)) {
    HINDSIGHT_CACHE.delete(cacheKey);
  }
  HINDSIGHT_CACHE.set(cacheKey, result);
  while (HINDSIGHT_CACHE.size > HINDSIGHT_CACHE_MAX_ENTRIES) {
    const oldestKey = HINDSIGHT_CACHE.keys().next().value;
    if (!oldestKey) break;
    HINDSIGHT_CACHE.delete(oldestKey);
  }
}

function normalizeStringArray(raw = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const results = [];
  for (const item of raw) {
    const text = normalizeText(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    results.push(text);
  }
  return results;
}

function clipText(value, maxLen = 300) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

function normalizeTurnStatus(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'done' || normalized === 'completed' || normalized === 'simulated') return 'done';
  if (normalized === 'running') return 'running';
  if (normalized === 'blocked' || normalized === 'needs-input') return 'blocked';
  if (normalized === 'queued' || normalized === 'pending') return 'queued';
  return 'queued';
}

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

function extractTurn(jobRun, { telemetryByItemId = null } = {}) {
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

function extractDispatchRunRecord({ artifactPath, artifact }) {
  const dispatchRun = artifact?.dispatchRun && typeof artifact.dispatchRun === 'object'
    ? artifact.dispatchRun
    : null;
  const jobRuns = Array.isArray(dispatchRun?.jobRuns) ? dispatchRun.jobRuns : [];
  const telemetryByItemId = buildWorkItemTelemetryMap(artifact);
  const turns = jobRuns
    .map((jobRun) => extractTurn(jobRun, { telemetryByItemId }))
    .filter(Boolean);
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

function extractProviderFromAgent(agent = '') {
  const value = normalizeText(agent);
  if (value === 'codex-cli') return 'codex';
  if (value === 'claude-code') return 'claude';
  if (value === 'gemini-cli') return 'gemini';
  return '';
}

function buildLessonHint({ kind, failureClass, fromError }) {
  const error = normalizeText(fromError);
  if (kind === 'regression') {
    return 'Regression detected (done -> blocked). Check recent changes or environment drift before continuing parallel execution.';
  }

  if (kind !== 'repeat-blocked') {
    return '';
  }

  if (failureClass === 'ownership-policy') {
    return 'Repeated file policy/ownership blockage. Check phase canEditFiles + ownedPathPrefixes and ensure touched files are within allowed prefixes.';
  }
  if (failureClass === 'contract') {
    return 'Repeated handoff contract blockage. Ensure the subagent outputs a single JSON object conforming to agent-handoff.schema.json (no surrounding text).';
  }
  if (failureClass === 'timeout') {
    return 'Repeated timeout blockage. Split the work-item, reduce scope, or add a timeout budget gate before retries.';
  }
  if (failureClass === 'dependency-blocked') {
    return 'Blocked by dependency. Ensure upstream jobs ran successfully and that retry scope includes required dependencies.';
  }
  if (error) {
    return `Repeated blockage: ${clipText(error, 160)}`;
  }
  return 'Repeated blockage detected. Inspect the dispatch artifact and stabilize the failing job before retrying.';
}

function buildSuggestedCommands({ sessionId, provider, kind } = {}) {
  const commands = [];
  const id = normalizeText(sessionId);
  if (!id) return commands;
  commands.push(`node scripts/aios.mjs hud --session ${id} --preset full`);
  commands.push(`node scripts/aios.mjs orchestrate --session ${id} --dispatch local --execute dry-run --format json`);

  const effectiveProvider = normalizeText(provider);
  if ((kind === 'repeat-blocked' || kind === 'regression') && (effectiveProvider === 'codex' || effectiveProvider === 'claude' || effectiveProvider === 'gemini' || effectiveProvider === 'kiro')) {
    commands.push(`node scripts/aios.mjs team --resume ${id} --retry-blocked --provider ${effectiveProvider} --workers 2 --dry-run`);
  }

  return commands;
}

function buildPairTransitions(fromRecord, toRecord) {
  const comparedJobIds = [];
  const transitions = [];

  for (const [jobId, fromTurn] of fromRecord.byJobId.entries()) {
    const toTurn = toRecord.byJobId.get(jobId);
    if (!toTurn) continue;

    comparedJobIds.push(jobId);
    const fromStatus = fromTurn.normalizedStatus;
    const toStatus = toTurn.normalizedStatus;
    if (fromStatus === 'blocked' && toStatus === 'done') {
      transitions.push({ kind: 'resolved', fromTurn, toTurn });
      continue;
    }
    if (fromStatus === 'blocked' && toStatus === 'blocked') {
      transitions.push({ kind: 'repeat-blocked', fromTurn, toTurn });
      continue;
    }
    if (fromStatus === 'done' && toStatus === 'blocked') {
      transitions.push({ kind: 'regression', fromTurn, toTurn });
      continue;
    }
  }

  return {
    fromArtifactPath: fromRecord.artifactPath,
    toArtifactPath: toRecord.artifactPath,
    comparedJobs: comparedJobIds.length,
    transitions,
  };
}

function accumulateCounts(summary, transitions = []) {
  for (const transition of transitions) {
    if (transition.kind === 'resolved') summary.resolvedBlockedTurns += 1;
    if (transition.kind === 'repeat-blocked') summary.repeatedBlockedTurns += 1;
    if (transition.kind === 'regression') summary.regressions += 1;
  }
}

function topEntries(map, limit = 5) {
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit);
}

function distillLessons({ pairs = [], sessionId = '', provider = '' } = {}) {
  const lessons = [];
  for (const pair of pairs) {
    for (const transition of pair.transitions) {
      if (transition.kind !== 'repeat-blocked' && transition.kind !== 'regression') continue;
      const fromTurn = transition.fromTurn;
      const toTurn = transition.toTurn;
      const kind = transition.kind;
      lessons.push({
        schemaVersion: 1,
        kind,
        jobId: fromTurn.jobId,
        role: fromTurn.role,
        jobType: fromTurn.jobType,
        workItemRefs: normalizeStringArray(fromTurn.workItemRefs.length > 0 ? fromTurn.workItemRefs : toTurn.workItemRefs),
        from: {
          artifactPath: pair.fromArtifactPath,
          turnId: fromTurn.turnId,
          status: fromTurn.normalizedStatus,
          attempts: fromTurn.attempts,
          failureClass: fromTurn.failureClass,
          retryClass: fromTurn.retryClass,
          error: fromTurn.error,
        },
        to: {
          artifactPath: pair.toArtifactPath,
          turnId: toTurn.turnId,
          status: toTurn.normalizedStatus,
          attempts: toTurn.attempts,
          failureClass: toTurn.failureClass,
          retryClass: toTurn.retryClass,
          error: toTurn.error,
        },
        hint: buildLessonHint({
          kind,
          failureClass: fromTurn.failureClass,
          fromError: fromTurn.error,
        }),
        suggestedCommands: buildSuggestedCommands({ sessionId, provider, kind }),
      });
    }
  }
  return lessons;
}

async function readJsonOptional(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : null;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function buildArtifactSignatures(rootDir, artifacts = []) {
  const resolvedRootDir = normalizeText(rootDir);
  if (!resolvedRootDir) return [];
  const entries = Array.isArray(artifacts) ? artifacts : [];
  const nowMs = Date.now();

  const signatures = await Promise.all(entries.map(async (entry) => {
    const artifactPath = normalizeText(entry?.artifactPath);
    if (!artifactPath) return null;

    const cacheKey = `${getCacheKeyPart(resolvedRootDir)}::artifact-signature::${getCacheKeyPart(artifactPath)}`;
    const cached = ARTIFACT_SIGNATURE_CACHE.get(cacheKey);
    if (cached && typeof cached === 'object') {
      const missing = cached.missing === true;
      const cachedAtMs = typeof cached.cachedAtMs === 'number' ? cached.cachedAtMs : 0;
      if (!missing || nowMs - cachedAtMs <= ARTIFACT_SIGNATURE_NEGATIVE_TTL_MS) {
        bumpLruCache(ARTIFACT_SIGNATURE_CACHE, cacheKey);
        return {
          artifactPath,
          mtimeMs: Number.isFinite(cached.mtimeMs) ? Math.floor(cached.mtimeMs) : 0,
          size: Number.isFinite(cached.size) ? Math.floor(cached.size) : 0,
        };
      }
    }

    let mtimeMs = 0;
    let size = 0;
    let missing = false;
    try {
      const stat = await fs.stat(path.join(resolvedRootDir, artifactPath));
      mtimeMs = Number.isFinite(stat.mtimeMs) ? Math.floor(stat.mtimeMs) : 0;
      size = Number.isFinite(stat.size) ? Math.floor(stat.size) : 0;
    } catch {
      missing = true;
    }

    setLruCache(
      ARTIFACT_SIGNATURE_CACHE,
      cacheKey,
      {
        mtimeMs,
        size,
        missing,
        cachedAtMs: nowMs,
      },
      ARTIFACT_SIGNATURE_CACHE_MAX_ENTRIES
    );

    return {
      artifactPath,
      mtimeMs,
      size,
    };
  }));

  return signatures.filter(Boolean);
}

export async function buildHindsightEval({
  rootDir,
  meta = null,
  dispatchEvidence = [],
  artifactCache = null,
  maxArtifacts = 6,
  maxPairs = 3,
  maxLessons = 12,
} = {}) {
  const sessionId = normalizeText(meta?.sessionId || meta?.session?.sessionId || '');
  const provider = extractProviderFromAgent(meta?.agent || meta?.session?.agent || '');

  const artifacts = [];
  const seen = new Set();
  const resolvedMaxArtifacts = Number.isFinite(maxArtifacts) ? Math.max(2, Math.floor(maxArtifacts)) : 6;
  const resolvedMaxPairs = Number.isFinite(maxPairs) ? Math.max(1, Math.floor(maxPairs)) : 3;
  const resolvedMaxLessons = Number.isFinite(maxLessons) ? Math.max(0, Math.floor(maxLessons)) : 12;

  for (const record of Array.isArray(dispatchEvidence) ? dispatchEvidence : []) {
    const artifactPath = normalizeText(record?.artifactPath);
    if (!artifactPath || seen.has(artifactPath)) continue;
    seen.add(artifactPath);
    artifacts.push({
      artifactPath,
      ts: normalizeText(record?.ts),
    });
    if (artifacts.length >= resolvedMaxArtifacts) break;
  }

  if (artifacts.length < 2) {
    return {
      schemaVersion: 1,
      generatedAt: nowIso(),
      sessionId: sessionId || null,
      provider: provider || null,
      artifacts: artifacts.map((item) => ({ ...item })),
      pairsAnalyzed: 0,
      comparedJobs: 0,
      resolvedBlockedTurns: 0,
      repeatedBlockedTurns: 0,
      regressions: 0,
      topRepeatedJobs: [],
      topRepeatedFailureClasses: [],
      lessons: [],
    };
  }

  const artifactSignatures = await buildArtifactSignatures(rootDir, artifacts);
  const cacheKey = buildHindsightCacheKey({
    rootDir,
    sessionId,
    provider,
    artifacts,
    artifactSignatures,
    maxArtifacts: resolvedMaxArtifacts,
    maxPairs: resolvedMaxPairs,
    maxLessons: resolvedMaxLessons,
  });
  const cached = getCachedHindsight(cacheKey);
  if (cached) {
    return {
      ...cached,
      generatedAt: nowIso(),
    };
  }

  const loaded = [];
  for (const entry of artifacts) {
    const artifactAbsPath = path.join(rootDir, entry.artifactPath);
    const cachedArtifact = artifactCache && typeof artifactCache === 'object'
      ? artifactCache[entry.artifactPath]
      : null;
    const artifact = cachedArtifact && typeof cachedArtifact === 'object'
      ? cachedArtifact
      : await readJsonOptional(artifactAbsPath);
    if (!artifact) continue;
    const record = extractDispatchRunRecord({
      artifactPath: entry.artifactPath,
      artifact,
    });
    loaded.push(record);
  }

  loaded.sort((left, right) => String(right.persistedAt || '').localeCompare(String(left.persistedAt || '')));

  if (loaded.length < 2) {
    return {
      schemaVersion: 1,
      generatedAt: nowIso(),
      sessionId: sessionId || null,
      provider: provider || null,
      artifacts: artifacts.map((item) => ({ ...item })),
      pairsAnalyzed: 0,
      comparedJobs: 0,
      resolvedBlockedTurns: 0,
      repeatedBlockedTurns: 0,
      regressions: 0,
      topRepeatedJobs: [],
      topRepeatedFailureClasses: [],
      lessons: [],
    };
  }

  const pairs = [];
  const summary = {
    pairsAnalyzed: 0,
    comparedJobs: 0,
    resolvedBlockedTurns: 0,
    repeatedBlockedTurns: 0,
    regressions: 0,
  };
  const repeatedJobCounts = new Map();
  const repeatedFailureCounts = new Map();

  for (let index = 0; index < loaded.length - 1; index += 1) {
    if (pairs.length >= resolvedMaxPairs) break;
    const newer = loaded[index];
    const older = loaded[index + 1];
    const pair = buildPairTransitions(older, newer);
    summary.pairsAnalyzed += 1;
    summary.comparedJobs += pair.comparedJobs;
    accumulateCounts(summary, pair.transitions);

    for (const transition of pair.transitions) {
      if (transition.kind !== 'repeat-blocked') continue;
      repeatedJobCounts.set(transition.fromTurn.jobId, (repeatedJobCounts.get(transition.fromTurn.jobId) || 0) + 1);
      repeatedFailureCounts.set(transition.fromTurn.failureClass, (repeatedFailureCounts.get(transition.fromTurn.failureClass) || 0) + 1);
    }

    pairs.push(pair);
  }

  const lessons = distillLessons({ pairs, sessionId, provider }).slice(0, resolvedMaxLessons);

  const result = {
    schemaVersion: 1,
    generatedAt: nowIso(),
    sessionId: sessionId || null,
    provider: provider || null,
    artifacts: loaded.map((item) => ({
      artifactPath: item.artifactPath,
      persistedAt: item.persistedAt,
      ok: item.ok,
      mode: item.mode,
      turns: item.turns.length,
    })),
    ...summary,
    topRepeatedJobs: topEntries(repeatedJobCounts, 5).map((item) => ({ jobId: item.key, count: item.count })),
    topRepeatedFailureClasses: topEntries(repeatedFailureCounts, 5).map((item) => ({ failureClass: item.key, count: item.count })),
    lessons,
  };

  if (loaded.length === artifacts.length) {
    setCachedHindsight(cacheKey, result);
  }

  return result;
}
