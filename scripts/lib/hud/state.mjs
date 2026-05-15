import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildHindsightEval } from '../harness/hindsight-eval.mjs';
import { readSoloControl, readSoloRunSummary } from '../harness/solo-journal.mjs';
import { getHarnessTarget } from '../harness/targets.mjs';
import { buildTeamWatchdogState } from '../lifecycle/watchdog.mjs';

export const HUD_PROVIDER_AGENT_MAP = Object.freeze({
  codex: 'codex-cli',
  claude: 'claude-code',
  gemini: 'gemini-cli',
  opencode: 'opencode-cli',
  kiro: 'kiro-cli',
});

const AGENT_PROVIDER_MAP = Object.freeze(
  Object.fromEntries(Object.entries(HUD_PROVIDER_AGENT_MAP).map(([provider, agent]) => [agent, provider]))
);

const DEFAULT_SESSION_SCAN_LIMIT = 200;
const DEFAULT_CHECKPOINT_TAIL_BYTES = 1_000_000;
const DEFAULT_EVENT_TAIL_BYTES = 400_000;
const CHECKPOINT_TAIL_CACHE_MAX_ENTRIES = 32;
const CHECKPOINT_TAIL_CACHE = new Map();
const EVENT_TAIL_CACHE_MAX_ENTRIES = 32;
const EVENT_TAIL_CACHE = new Map();
const JSON_READ_CACHE_MAX_ENTRIES = 64;
const JSON_READ_CACHE = new Map();
const SESSION_INDEX_CACHE_TTL_MS = 30_000;
const SESSION_INDEX_CACHE_MAX_ENTRIES = 8;
const SESSION_INDEX_CACHE = new Map();
const SESSION_INDEX_IN_FLIGHT = new Map();
const DISPATCH_INDEX_CACHE_TTL_MS = 2000;
const DISPATCH_INDEX_CACHE_MAX_ENTRIES = 32;
const DISPATCH_INDEX_CACHE_MAX_NAMES = 200;
const DISPATCH_INDEX_CACHE = new Map();
const DISPATCH_INDEX_IN_FLIGHT = new Map();
const SKILL_CANDIDATE_ARTIFACT_FILE_PATTERN = /^skill-candidate-.*\.json$/i;
const SKILL_CANDIDATE_ARTIFACT_KIND = 'learn-eval.skill-candidate';
const DISPATCH_HINDSIGHT_FIX_HINT_ACTIONS = Object.freeze({
  'ownership-policy': 'runbook.dispatch-merge-triage',
  contract: 'runbook.dispatch-merge-triage',
  timeout: 'gate.timeout-budget',
  'dependency-blocked': 'runbook.failure-triage',
  'unsupported-job': 'runbook.tool-repair',
  'runtime-error': 'runbook.tool-repair',
  default: 'runbook.failure-triage',
});
const QUALITY_GATE_EVENT_KIND = 'verification.quality-gate';

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function getCacheKeyPart(value) {
  return String(value ?? '').replaceAll('::', ':');
}

function toPosixPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/');
}

function clipText(value, maxLen = 240) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

function createDispatchProgressCounts() {
  return {
    total: 0,
    queued: 0,
    running: 0,
    blocked: 0,
    done: 0,
  };
}

function normalizeDispatchRunStatus(rawStatus = '') {
  const value = normalizeText(rawStatus).toLowerCase();
  if (value === 'blocked' || value === 'needs-input') return 'blocked';
  if (value === 'running') return 'running';
  if (value === 'completed' || value === 'simulated' || value === 'done') return 'done';
  if (value === 'queued' || value === 'pending') return 'queued';
  return 'queued';
}

function incrementDispatchProgressCount(counts = null, status = 'queued') {
  if (!counts || typeof counts !== 'object') return;
  counts.total += 1;
  if (status === 'queued' || status === 'running' || status === 'blocked' || status === 'done') {
    counts[status] += 1;
  } else {
    counts.queued += 1;
  }
}

function computeCompletionRatio(done = 0, total = 0) {
  const doneValue = Number.isFinite(done) ? Math.max(0, Number(done)) : 0;
  const totalValue = Number.isFinite(total) ? Math.max(0, Number(total)) : 0;
  if (totalValue <= 0) return 0;
  return Number((doneValue / totalValue).toFixed(3));
}

function normalizeProvider(raw = '') {
  const value = normalizeText(raw).toLowerCase();
  if (!value) return '';
  if (value === 'codex' || value === 'claude' || value === 'gemini' || value === 'opencode' || value === 'kiro') return value;
  return '';
}

function getSessionsRoot(rootDir) {
  return path.join(rootDir, 'memory', 'context-db', 'sessions');
}

async function safeReadJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function safeReadJsonCached(filePath) {
  const cacheKey = normalizeText(filePath);
  if (!cacheKey) return null;

  let stats = null;
  try {
    stats = await fs.stat(filePath);
  } catch {
    JSON_READ_CACHE.delete(cacheKey);
    return null;
  }

  const mtimeMs = Number.isFinite(stats.mtimeMs) ? stats.mtimeMs : 0;
  const size = Number(stats.size) || 0;
  const cached = JSON_READ_CACHE.get(cacheKey);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
    bumpLruCache(JSON_READ_CACHE, cacheKey);
    return cached.value;
  }

  let value = null;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw.trim()) {
      value = null;
    } else {
      value = JSON.parse(raw);
    }
  } catch {
    value = null;
  }

  setLruCache(
    JSON_READ_CACHE,
    cacheKey,
    {
      mtimeMs,
      size,
      value,
    },
    JSON_READ_CACHE_MAX_ENTRIES
  );

  return value;
}

function getCheckpointTailCacheKey(filePath, maxBytes) {
  return `${getCacheKeyPart(filePath)}::${getCacheKeyPart(maxBytes)}`;
}

function getEventTailCacheKey(filePath, maxBytes) {
  return `${getCacheKeyPart(filePath)}::${getCacheKeyPart(maxBytes)}`;
}

function normalizeStringArray(raw = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const values = [];
  for (const item of raw) {
    const text = normalizeText(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    values.push(text);
  }
  return values;
}

function normalizeQualityGateEvent(rawEvent = null) {
  if (!rawEvent || typeof rawEvent !== 'object') return null;
  if (normalizeText(rawEvent.kind) !== QUALITY_GATE_EVENT_KIND) return null;
  const turn = rawEvent.turn && typeof rawEvent.turn === 'object' ? rawEvent.turn : null;
  if (!turn) return null;
  const nextStateRefs = normalizeStringArray(turn.nextStateRefs);
  const categoryRef = nextStateRefs.find((item) => item.startsWith('category:')) || '';
  const failureCategory = categoryRef.startsWith('category:') ? categoryRef.slice('category:'.length) : '';
  return {
    kind: QUALITY_GATE_EVENT_KIND,
    eventId: normalizeText(rawEvent.id),
    seq: Number.isFinite(rawEvent.seq) ? Math.max(0, Math.floor(rawEvent.seq)) : 0,
    ts: normalizeText(rawEvent.ts),
    turnId: normalizeText(turn.turnId),
    outcome: normalizeText(turn.outcome),
    environment: normalizeText(turn.environment),
    nextStateRefs,
    categoryRef,
    failureCategory,
  };
}

function normalizeDispatchInsightStatus(value = '') {
  const status = normalizeText(value).toLowerCase();
  if (status === 'clear' || status === 'attention' || status === 'blocked') return status;
  return '';
}

function normalizeDispatchInsightSeverity(value = '') {
  const severity = normalizeText(value).toLowerCase();
  if (severity === 'block' || severity === 'warn' || severity === 'info') return severity;
  return '';
}

function normalizeDispatchInsightSignal(rawSignal = null) {
  if (!rawSignal || typeof rawSignal !== 'object') return null;
  const id = normalizeText(rawSignal.id);
  const severity = normalizeDispatchInsightSeverity(rawSignal.severity);
  if (!id || !severity) return null;

  const signal = {
    id,
    severity,
    message: normalizeText(rawSignal.message),
  };
  if (Number.isFinite(rawSignal.count)) {
    signal.count = Math.max(0, Math.floor(rawSignal.count));
  }
  const evidence = normalizeText(rawSignal.evidence);
  if (evidence) {
    signal.evidence = evidence;
  }
  return signal;
}

function normalizeDispatchInsightAction(rawAction = null) {
  if (!rawAction || typeof rawAction !== 'object') return null;
  const id = normalizeText(rawAction.id);
  if (!id) return null;

  const action = {
    id,
    label: normalizeText(rawAction.label),
  };
  const command = normalizeText(rawAction.command);
  if (command) {
    action.command = command;
  }
  return action;
}

function normalizeDispatchInsightsArtifact(rawInsights = null) {
  if (!rawInsights || typeof rawInsights !== 'object') return null;

  const status = normalizeDispatchInsightStatus(rawInsights.status);
  const score = Number.isFinite(rawInsights.score) ? Math.max(0, Math.floor(rawInsights.score)) : null;
  if (!status || score === null) return null;

  const signals = Array.isArray(rawInsights.signals)
    ? rawInsights.signals
      .map((signal) => normalizeDispatchInsightSignal(signal))
      .filter(Boolean)
      .slice(0, 3)
    : [];
  const suggestedActions = Array.isArray(rawInsights.suggestedActions)
    ? rawInsights.suggestedActions
      .map((action) => normalizeDispatchInsightAction(action))
      .filter(Boolean)
      .slice(0, 3)
    : [];

  return {
    status,
    score,
    signals,
    suggestedActions,
  };
}

async function readTailText(filePath, maxBytes, stats = null) {
  try {
    const resolvedStats = stats && typeof stats === 'object' ? stats : await fs.stat(filePath);
    const size = Number(resolvedStats.size) || 0;
    if (size <= 0) return '';
    const readSize = Math.min(size, maxBytes);
    const start = size - readSize;

    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(readSize);
      await handle.read(buffer, 0, readSize, start);
      let text = buffer.toString('utf8');
      if (start > 0) {
        const newline = text.indexOf(os.EOL) >= 0 ? text.indexOf(os.EOL) : text.indexOf('\n');
        text = newline >= 0 ? text.slice(newline + 1) : '';
      }
      return text;
    } finally {
      await handle.close();
    }
  } catch {
    return '';
  }
}

async function readLastJsonLine(filePath, { maxBytes = DEFAULT_CHECKPOINT_TAIL_BYTES } = {}) {
  const resolvedMaxBytes = Number.isFinite(maxBytes) ? Math.max(1, Math.floor(maxBytes)) : DEFAULT_CHECKPOINT_TAIL_BYTES;
  const cacheKey = getCheckpointTailCacheKey(filePath, resolvedMaxBytes);

  let stats = null;
  try {
    stats = await fs.stat(filePath);
  } catch {
    CHECKPOINT_TAIL_CACHE.delete(cacheKey);
    return null;
  }

  const mtimeMs = Number.isFinite(stats.mtimeMs) ? Math.floor(stats.mtimeMs) : 0;
  const size = Number(stats.size) || 0;
  const cached = CHECKPOINT_TAIL_CACHE.get(cacheKey);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
    bumpLruCache(CHECKPOINT_TAIL_CACHE, cacheKey);
    return cached.value;
  }

  const tail = await readTailText(filePath, resolvedMaxBytes, stats);
  let value = null;

  if (tail.trim()) {
    const lines = tail
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        value = JSON.parse(lines[index]);
        break;
      } catch {
        // ignore malformed tail rows
      }
    }
  }

  setLruCache(
    CHECKPOINT_TAIL_CACHE,
    cacheKey,
    {
      mtimeMs,
      size,
      value,
    },
    CHECKPOINT_TAIL_CACHE_MAX_ENTRIES
  );

  return value;
}

async function readLatestQualityGateEvent(filePath, { maxBytes = DEFAULT_EVENT_TAIL_BYTES } = {}) {
  const resolvedMaxBytes = Number.isFinite(maxBytes) ? Math.max(1, Math.floor(maxBytes)) : DEFAULT_EVENT_TAIL_BYTES;
  const cacheKey = getEventTailCacheKey(filePath, resolvedMaxBytes);

  let stats = null;
  try {
    stats = await fs.stat(filePath);
  } catch {
    EVENT_TAIL_CACHE.delete(cacheKey);
    return null;
  }

  const mtimeMs = Number.isFinite(stats.mtimeMs) ? Math.floor(stats.mtimeMs) : 0;
  const size = Number(stats.size) || 0;
  const cached = EVENT_TAIL_CACHE.get(cacheKey);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
    bumpLruCache(EVENT_TAIL_CACHE, cacheKey);
    return cached.value;
  }

  let value = null;
  const tail = await readTailText(filePath, resolvedMaxBytes, stats);
  if (tail.trim()) {
    const lines = tail
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        const parsed = JSON.parse(lines[index]);
        const event = normalizeQualityGateEvent(parsed);
        if (event) {
          value = event;
          break;
        }
      } catch {
        // ignore malformed rows
      }
    }
  }

  setLruCache(
    EVENT_TAIL_CACHE,
    cacheKey,
    {
      mtimeMs,
      size,
      value,
    },
    EVENT_TAIL_CACHE_MAX_ENTRIES
  );

  return value;
}

function compareIsoDesc(left = '', right = '') {
  return String(right || '').localeCompare(String(left || ''));
}

function normalizeConcurrency(value, fallback = 8) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(32, Math.max(1, Math.floor(parsed)));
}

async function mapWithConcurrency(items, concurrency, mapper) {
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

function getSessionsIndexCacheKey(rootDir) {
  return `${getCacheKeyPart(rootDir)}::sessions-index`;
}

function getDispatchIndexCacheKey(rootDir, sessionId) {
  return `${getCacheKeyPart(rootDir)}::${getCacheKeyPart(sessionId)}`;
}

async function readDirMtimeMs(dirPath) {
  try {
    const stats = await fs.stat(dirPath);
    const mtimeMs = Number.isFinite(stats.mtimeMs) ? Math.floor(stats.mtimeMs) : 0;
    return mtimeMs > 0 ? mtimeMs : 0;
  } catch {
    return 0;
  }
}

async function loadSessionsIndex(rootDir) {
  const sessionsRoot = getSessionsRoot(rootDir);
  if (!sessionsRoot || !existsSync(sessionsRoot)) {
    return {
      cacheKey: '',
      cachedAtMs: Date.now(),
      dirMtimeMs: 0,
      sessionsRoot,
      names: [],
    };
  }

  const cacheKey = getSessionsIndexCacheKey(rootDir);
  const nowMs = Date.now();
  const dirMtimeMs = await readDirMtimeMs(sessionsRoot);

  const cached = SESSION_INDEX_CACHE.get(cacheKey);
  if (
    cached
    && cached.dirMtimeMs === dirMtimeMs
    && typeof cached.cachedAtMs === 'number'
    && nowMs - cached.cachedAtMs <= SESSION_INDEX_CACHE_TTL_MS
  ) {
    bumpLruCache(SESSION_INDEX_CACHE, cacheKey);
    return cached;
  }

  const inFlight = SESSION_INDEX_IN_FLIGHT.get(cacheKey);
  if (inFlight) {
    return await inFlight;
  }

  const refresh = (async () => {
    let entries = [];
    try {
      entries = await fs.readdir(sessionsRoot, { withFileTypes: true });
    } catch {
      entries = [];
    }

    const names = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => normalizeText(entry.name))
      .filter(Boolean)
      .sort((left, right) => String(right).localeCompare(String(left)));

    const entry = {
      cacheKey,
      cachedAtMs: Date.now(),
      dirMtimeMs,
      sessionsRoot,
      names,
    };

    setLruCache(SESSION_INDEX_CACHE, cacheKey, entry, SESSION_INDEX_CACHE_MAX_ENTRIES);
    return entry;
  })();

  SESSION_INDEX_IN_FLIGHT.set(cacheKey, refresh);
  try {
    return await refresh;
  } finally {
    SESSION_INDEX_IN_FLIGHT.delete(cacheKey);
  }
}

async function loadDispatchIndex(rootDir, sessionId) {
  const normalizedSessionId = normalizeText(sessionId);
  const artifactsDir = normalizedSessionId
    ? path.join(getSessionsRoot(rootDir), normalizedSessionId, 'artifacts')
    : '';
  if (!normalizedSessionId || !artifactsDir || !existsSync(artifactsDir)) {
    return {
      cacheKey: '',
      cachedAtMs: Date.now(),
      dirMtimeMs: 0,
      artifactsDir,
      names: [],
      latestName: '',
      latestDispatch: null,
      skillCandidateNames: [],
      latestSkillCandidateName: '',
      latestSkillCandidate: null,
    };
  }

  const cacheKey = getDispatchIndexCacheKey(rootDir, normalizedSessionId);
  const nowMs = Date.now();
  const dirMtimeMs = await readDirMtimeMs(artifactsDir);

  const cached = DISPATCH_INDEX_CACHE.get(cacheKey);
  if (
    cached
    && cached.dirMtimeMs === dirMtimeMs
    && typeof cached.cachedAtMs === 'number'
    && nowMs - cached.cachedAtMs <= DISPATCH_INDEX_CACHE_TTL_MS
  ) {
    bumpLruCache(DISPATCH_INDEX_CACHE, cacheKey);
    return cached;
  }

  const inFlight = DISPATCH_INDEX_IN_FLIGHT.get(cacheKey);
  if (inFlight) {
    return await inFlight;
  }

  const refresh = (async () => {
    let files = [];
    try {
      files = await fs.readdir(artifactsDir);
    } catch {
      files = [];
    }

    const names = files
      .filter((name) => /^dispatch-run-.*\.json$/i.test(String(name || '').trim()))
      .sort((left, right) => String(right).localeCompare(String(left)))
      .slice(0, DISPATCH_INDEX_CACHE_MAX_NAMES);
    const skillCandidateNames = files
      .filter((name) => SKILL_CANDIDATE_ARTIFACT_FILE_PATTERN.test(String(name || '').trim()))
      .sort((left, right) => String(right).localeCompare(String(left)))
      .slice(0, DISPATCH_INDEX_CACHE_MAX_NAMES);

    const latestName = names[0] || '';
    const latestSkillCandidateName = skillCandidateNames[0] || '';
    const previous = DISPATCH_INDEX_CACHE.get(cacheKey);
    const latestDispatch = previous && previous.latestName === latestName
      ? previous.latestDispatch
      : null;
    const latestSkillCandidate = previous && previous.latestSkillCandidateName === latestSkillCandidateName
      ? previous.latestSkillCandidate
      : null;

    const entry = {
      cacheKey,
      cachedAtMs: Date.now(),
      dirMtimeMs,
      artifactsDir,
      names,
      latestName,
      latestDispatch,
      skillCandidateNames,
      latestSkillCandidateName,
      latestSkillCandidate,
    };

    setLruCache(DISPATCH_INDEX_CACHE, cacheKey, entry, DISPATCH_INDEX_CACHE_MAX_ENTRIES);
    return entry;
  })();

  DISPATCH_INDEX_IN_FLIGHT.set(cacheKey, refresh);
  try {
    return await refresh;
  } finally {
    DISPATCH_INDEX_IN_FLIGHT.delete(cacheKey);
  }
}

export async function listContextDbSessions(rootDir, { agent = '', limit = DEFAULT_SESSION_SCAN_LIMIT } = {}) {
  const requestedAgent = normalizeText(agent);
  const max = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : DEFAULT_SESSION_SCAN_LIMIT;
  const index = await loadSessionsIndex(rootDir);
  const sessionsRoot = index.sessionsRoot;
  if (!sessionsRoot || !existsSync(sessionsRoot)) return [];

  const metas = [];
  const candidates = Array.isArray(index.names) ? index.names.slice(0, max * 4) : [];

  const parsed = await mapWithConcurrency(candidates, 8, async (sessionId) => {
    const meta = await safeReadJsonCached(path.join(sessionsRoot, sessionId, 'meta.json'));
    if (!meta || typeof meta !== 'object') return null;
    if (requestedAgent && normalizeText(meta.agent) !== requestedAgent) return null;
    const updatedAt = normalizeText(meta.updatedAt) || normalizeText(meta.createdAt);
    return {
      ...meta,
      sessionId: normalizeText(meta.sessionId) || sessionId,
      updatedAt,
    };
  });

  for (const meta of parsed) {
    if (!meta) continue;
    metas.push(meta);
  }

  metas.sort((left, right) => compareIsoDesc(left.updatedAt, right.updatedAt));
  return metas.slice(0, max);
}

export async function selectHudSessionId({ rootDir, sessionId = '', provider = '' } = {}) {
  const explicit = normalizeText(sessionId);
  const normalizedProvider = normalizeProvider(provider);

  if (explicit) {
    return {
      sessionId: explicit,
      provider: normalizedProvider || '',
      agent: '',
      source: 'explicit',
    };
  }

  if (normalizedProvider) {
    const agent = HUD_PROVIDER_AGENT_MAP[normalizedProvider];
    const sessions = await listContextDbSessions(rootDir, { agent, limit: 1 });
    const selected = sessions[0];
    if (selected?.sessionId) {
      return {
        sessionId: selected.sessionId,
        provider: normalizedProvider,
        agent,
        source: 'provider-latest',
      };
    }
  }

  const sessions = await listContextDbSessions(rootDir, { limit: 1 });
  const selected = sessions[0];
  if (selected?.sessionId) {
    const agent = normalizeText(selected.agent);
    return {
      sessionId: selected.sessionId,
      provider: AGENT_PROVIDER_MAP[agent] || '',
      agent,
      source: 'any-latest',
    };
  }

  return {
    sessionId: '',
    provider: normalizedProvider || '',
    agent: normalizedProvider ? HUD_PROVIDER_AGENT_MAP[normalizedProvider] : '',
    source: 'none',
  };
}

function resolveDispatchExecutor({ jobId = '', jobRun = null, planByJobId = new Map(), dispatchRun = null } = {}) {
  const fromRun = normalizeText(jobRun?.executor);
  if (fromRun) return fromRun;

  if (jobId && planByJobId instanceof Map && planByJobId.has(jobId)) {
    const plannedExecutor = normalizeText(planByJobId.get(jobId)?.launchSpec?.executor);
    if (plannedExecutor) return plannedExecutor;
  }

  const registry = Array.isArray(dispatchRun?.executorRegistry)
    ? dispatchRun.executorRegistry.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  if (registry.length === 1) return registry[0];
  return 'unknown';
}

function buildDispatchProgress(dispatchRun = null, dispatchPlan = null) {
  const jobRuns = Array.isArray(dispatchRun?.jobRuns) ? dispatchRun.jobRuns : [];
  const plannedJobs = Array.isArray(dispatchPlan?.jobs) ? dispatchPlan.jobs : [];
  if (jobRuns.length === 0 && plannedJobs.length === 0) return null;

  const planByJobId = new Map(
    plannedJobs
      .map((job) => [normalizeText(job?.jobId), job])
      .filter(([jobId]) => jobId)
  );
  const fromRuns = jobRuns.length > 0;
  const entries = fromRuns ? jobRuns : plannedJobs;
  const jobCounts = createDispatchProgressCounts();
  const toolCounts = new Map();

  for (const entry of entries) {
    const jobId = normalizeText(entry?.jobId);
    const status = fromRuns
      ? normalizeDispatchRunStatus(entry?.status)
      : normalizeDispatchRunStatus(entry?.status || 'queued');
    const tool = fromRuns
      ? resolveDispatchExecutor({ jobId, jobRun: entry, planByJobId, dispatchRun })
      : normalizeText(entry?.launchSpec?.executor) || 'unknown';

    incrementDispatchProgressCount(jobCounts, status);
    const current = toolCounts.get(tool) || createDispatchProgressCounts();
    incrementDispatchProgressCount(current, status);
    toolCounts.set(tool, current);
  }

  const tools = Array.from(toolCounts.entries())
    .map(([tool, counts]) => ({
      tool,
      ...counts,
      completionRatio: computeCompletionRatio(counts.done, counts.total),
    }))
    .sort((left, right) =>
      right.blocked - left.blocked
      || right.running - left.running
      || right.total - left.total
      || left.tool.localeCompare(right.tool)
    );

  return {
    jobs: {
      ...jobCounts,
      completionRatio: computeCompletionRatio(jobCounts.done, jobCounts.total),
    },
    tools,
  };
}

async function findLatestDispatchArtifact(rootDir, sessionId) {
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
    const result = {
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
    if (index.cacheKey) {
      index.latestName = latestName;
      index.latestDispatch = result;
    }
    return result;
  }

  const dispatchRun = artifact.dispatchRun && typeof artifact.dispatchRun === 'object'
    ? artifact.dispatchRun
    : null;
  const dispatchPlan = artifact.dispatchPlan && typeof artifact.dispatchPlan === 'object'
    ? artifact.dispatchPlan
    : null;
  const jobRuns = Array.isArray(dispatchRun?.jobRuns) ? dispatchRun.jobRuns : [];
  const workItemTelemetryItems = Array.isArray(artifact?.workItemTelemetry?.items)
    ? artifact.workItemTelemetry.items
    : [];
  const workItemTelemetryById = new Map(
    workItemTelemetryItems
      .map((item) => [normalizeText(item?.itemId), item])
      .filter(([itemId]) => itemId)
  );
  const blocked = jobRuns
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
  const blockedJobIds = blocked.map((row) => row.jobId);

  const workItemTelemetry = artifact.workItemTelemetry && typeof artifact.workItemTelemetry === 'object'
    ? artifact.workItemTelemetry
    : null;
  const totals = workItemTelemetry?.totals && typeof workItemTelemetry.totals === 'object'
    ? workItemTelemetry.totals
    : null;
  const workItems = totals
    ? {
      total: Number.isFinite(totals.total) ? Math.max(0, Math.floor(totals.total)) : null,
      queued: Number.isFinite(totals.queued) ? Math.max(0, Math.floor(totals.queued)) : null,
      running: Number.isFinite(totals.running) ? Math.max(0, Math.floor(totals.running)) : null,
      blocked: Number.isFinite(totals.blocked) ? Math.max(0, Math.floor(totals.blocked)) : null,
      done: Number.isFinite(totals.done) ? Math.max(0, Math.floor(totals.done)) : null,
    }
    : null;
  const progress = buildDispatchProgress(dispatchRun, dispatchPlan);

  const result = {
    artifactPath: toPosixPath(path.relative(rootDir, absPath)),
    persistedAt: normalizeText(artifact.persistedAt) || normalizeText(artifact.dispatchEvidence?.persistedAt) || '',
    ok: dispatchRun?.ok === true,
    mode: normalizeText(dispatchRun?.mode) || normalizeText(dispatchRun?.executionMode) || '',
    jobCount: jobRuns.length,
    blockedJobs: blocked.length,
    blockedJobIds,
    blocked,
    executors: Array.isArray(dispatchRun?.executorRegistry)
      ? dispatchRun.executorRegistry.map((item) => normalizeText(item)).filter(Boolean)
      : [],
    finalOutputs: Array.isArray(dispatchRun?.finalOutputs) ? dispatchRun.finalOutputs.length : 0,
    workItems,
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

function normalizeSkillCandidateArtifactPayload({
  rootDir,
  absPath,
  artifact,
} = {}) {
  const artifactPath = toPosixPath(path.relative(rootDir, absPath));
  const parsedArtifact = artifact && typeof artifact === 'object' ? artifact : null;
  if (!parsedArtifact) {
    return {
      artifactPath,
      persistedAt: '',
      generatedAt: '',
      kind: '',
      skillId: '',
      scope: '',
      failureClass: '',
      lessonKind: '',
      lessonCount: 0,
      patchHint: '',
      sourceArtifactPath: '',
      sourceDraftTargetId: '',
      reviewStatus: '',
      reviewMode: '',
      raw: null,
      parseError: 'invalid-json',
    };
  }

  const candidate = parsedArtifact.candidate && typeof parsedArtifact.candidate === 'object'
    ? parsedArtifact.candidate
    : null;
  const lessonCluster = parsedArtifact.lessonCluster && typeof parsedArtifact.lessonCluster === 'object'
    ? parsedArtifact.lessonCluster
    : null;
  const evidence = parsedArtifact.evidence && typeof parsedArtifact.evidence === 'object'
    ? parsedArtifact.evidence
    : null;
  const review = parsedArtifact.review && typeof parsedArtifact.review === 'object'
    ? parsedArtifact.review
    : null;
  const kind = normalizeText(parsedArtifact.kind);

  return {
    artifactPath,
    persistedAt: normalizeText(parsedArtifact.persistedAt),
    generatedAt: normalizeText(parsedArtifact.generatedAt),
    kind,
    skillId: normalizeText(candidate?.skillId),
    scope: normalizeText(candidate?.scope),
    failureClass: normalizeText(lessonCluster?.failureClass),
    lessonKind: normalizeText(lessonCluster?.kind),
    lessonCount: Number.isFinite(lessonCluster?.count) ? Math.max(0, Math.floor(lessonCluster.count)) : 0,
    patchHint: clipText(candidate?.patchHint, 200),
    sourceArtifactPath: normalizeText(evidence?.sourceArtifactPath),
    sourceDraftTargetId: normalizeText(review?.sourceDraftTargetId),
    reviewStatus: normalizeText(review?.status),
    reviewMode: normalizeText(review?.mode),
    raw: parsedArtifact,
    parseError: kind && kind !== SKILL_CANDIDATE_ARTIFACT_KIND ? 'kind-mismatch' : '',
  };
}

async function findLatestSkillCandidateArtifact(rootDir, sessionId) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) return null;

  const index = await loadDispatchIndex(rootDir, normalizedSessionId);
  const latestName = index.latestSkillCandidateName || index.skillCandidateNames?.[0] || '';
  if (!latestName) return null;

  if (index.latestSkillCandidate && index.latestSkillCandidateName === latestName) {
    return index.latestSkillCandidate;
  }

  const absPath = path.join(index.artifactsDir, latestName);
  const artifact = await safeReadJsonCached(absPath);
  const result = normalizeSkillCandidateArtifactPayload({
    rootDir,
    absPath,
    artifact,
  });

  if (index.cacheKey) {
    index.latestSkillCandidateName = latestName;
    index.latestSkillCandidate = result;
  }

  return result;
}

async function collectRecentSkillCandidates(rootDir, sessionId, { limit = 5 } = {}) {
  const normalizedSessionId = normalizeText(sessionId);
  const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 5;
  if (!normalizedSessionId || max <= 0) return [];

  const index = await loadDispatchIndex(rootDir, normalizedSessionId);
  const names = Array.isArray(index.skillCandidateNames) ? index.skillCandidateNames.slice(0, max) : [];
  if (names.length === 0) return [];

  const parsed = await mapWithConcurrency(names, 4, async (name) => {
    if (index.latestSkillCandidate && index.latestSkillCandidateName === name) {
      return index.latestSkillCandidate;
    }
    const absPath = path.join(index.artifactsDir, name);
    const artifact = await safeReadJsonCached(absPath);
    return normalizeSkillCandidateArtifactPayload({
      rootDir,
      absPath,
      artifact,
    });
  });

  return parsed.filter(Boolean);
}

function inferProviderFromAgent(agent = '') {
  return AGENT_PROVIDER_MAP[normalizeText(agent)] || '';
}

async function collectRecentDispatchEvidence(rootDir, sessionId, { limit = 6 } = {}) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) return [];

  const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 6;
  const index = await loadDispatchIndex(rootDir, normalizedSessionId);
  const candidates = Array.isArray(index.names) ? index.names.slice(0, max) : [];

  return candidates.map((name) => ({
    artifactPath: toPosixPath(path.join('memory', 'context-db', 'sessions', normalizedSessionId, 'artifacts', name)),
  }));
}

function formatErrorMessage(error) {
  if (!error) return '';
  if (error instanceof Error) return error.message || error.stack || String(error);
  return String(error);
}

function buildDispatchFixHint({ sessionId, dispatchHindsight, latestDispatchArtifactPath }) {
  if (!dispatchHindsight || typeof dispatchHindsight !== 'object') return null;

  const pairsAnalyzed = Number.isFinite(dispatchHindsight.pairsAnalyzed) ? Math.max(0, Math.floor(dispatchHindsight.pairsAnalyzed)) : 0;
  if (pairsAnalyzed <= 0) return null;

  const regressions = Number.isFinite(dispatchHindsight.regressions) ? Math.max(0, Math.floor(dispatchHindsight.regressions)) : 0;
  const repeatBlockedTurns = Number.isFinite(dispatchHindsight.repeatedBlockedTurns) ? Math.max(0, Math.floor(dispatchHindsight.repeatedBlockedTurns)) : 0;
  if (regressions === 0 && repeatBlockedTurns === 0) return null;

  const topRepeatedFailure = repeatBlockedTurns > 0 && Array.isArray(dispatchHindsight.topRepeatedFailureClasses)
    ? dispatchHindsight.topRepeatedFailureClasses[0]
    : null;
  const topFailureClass = normalizeText(topRepeatedFailure?.failureClass);
  const targetId = normalizeText(
    (repeatBlockedTurns > 0 && topFailureClass && DISPATCH_HINDSIGHT_FIX_HINT_ACTIONS[topFailureClass])
      ? DISPATCH_HINDSIGHT_FIX_HINT_ACTIONS[topFailureClass]
      : DISPATCH_HINDSIGHT_FIX_HINT_ACTIONS.default
  );
  if (!targetId) return null;

  const target = getHarnessTarget(targetId);
  const evidenceParts = [];
  evidenceParts.push(`pairs=${pairsAnalyzed}`);
  if (repeatBlockedTurns > 0) evidenceParts.push(`repeatBlocked=${repeatBlockedTurns}`);
  if (regressions > 0) evidenceParts.push(`regressions=${regressions}`);
  if (topFailureClass) evidenceParts.push(`topFailure=${topFailureClass}`);

  return {
    schemaVersion: 1,
    generatedAt: nowIso(),
    sessionId: normalizeText(sessionId) || null,
    targetId,
    targetType: target?.targetType || null,
    title: target?.title || targetId,
    evidence: evidenceParts.join(' '),
    nextCommand: sessionId
      ? `node scripts/aios.mjs orchestrate --session ${normalizeText(sessionId)} --dispatch local --execute dry-run --format json`
      : target?.nextCommand || null,
    nextArtifact: normalizeText(latestDispatchArtifactPath) || null,
  };
}

function buildSuggestedCommands({ sessionId, provider, latestDispatch, latestSkillCandidate = null, dispatchHindsight = null }) {
  const commands = [];
  if (!sessionId) return commands;

  commands.push(`node scripts/aios.mjs orchestrate --session ${sessionId} --dispatch local --execute dry-run`);
  commands.push(`node scripts/aios.mjs learn-eval --session ${sessionId}`);

  const regressions = Number.isFinite(dispatchHindsight?.regressions) ? Math.max(0, Math.floor(dispatchHindsight.regressions)) : 0;
  const repeatBlockedTurns = Number.isFinite(dispatchHindsight?.repeatedBlockedTurns) ? Math.max(0, Math.floor(dispatchHindsight.repeatedBlockedTurns)) : 0;
  if (regressions > 0 || repeatBlockedTurns > 0) {
    commands.push('node scripts/aios.mjs doctor');
  }

  const effectiveProvider = provider || inferProviderFromAgent(latestDispatch?.raw?.dispatchEvidence?.agent) || '';
  if (latestDispatch?.blockedJobs > 0 && (effectiveProvider === 'codex' || effectiveProvider === 'claude' || effectiveProvider === 'gemini' || effectiveProvider === 'kiro')) {
    commands.push(
      `node scripts/aios.mjs team --resume ${sessionId} --retry-blocked --provider ${effectiveProvider} --workers 2 --dry-run`
    );
  }

  const candidate = latestSkillCandidate && typeof latestSkillCandidate === 'object'
    ? latestSkillCandidate
    : null;
  const draftTargetId = normalizeText(candidate?.sourceDraftTargetId);
  if (draftTargetId) {
    commands.push(
      `node scripts/aios.mjs learn-eval --session ${sessionId} --apply-draft ${draftTargetId} --apply-dry-run`
    );
  }

  return normalizeStringArray(commands);
}

function buildHarnessSuggestedCommands({ sessionId, latestHarnessRun = null } = {}) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId || !latestHarnessRun || typeof latestHarnessRun !== 'object') {
    return [];
  }

  const commands = [
    `node scripts/aios.mjs harness status --session ${normalizedSessionId} --json`,
  ];
  if (normalizeText(latestHarnessRun.status) !== 'done') {
    commands.push(`node scripts/aios.mjs harness resume --session ${normalizedSessionId}`);
    commands.push(`node scripts/aios.mjs harness stop --session ${normalizedSessionId}`);
  }
  return normalizeStringArray(commands);
}

export async function readHudState({
  rootDir,
  sessionId = '',
  provider = '',
  fast = false,
  skillCandidateLimit = 0,
  watchdog = false,
  nowMs = null,
} = {}) {
  const selection = await selectHudSessionId({ rootDir, sessionId, provider });
  const generatedAt = nowIso();
  const fastMode = fast === true;
  const includeWatchdog = watchdog === true;
  const watchdogNowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const resolvedSkillCandidateLimit = Number.isFinite(skillCandidateLimit)
    ? Math.max(0, Math.floor(skillCandidateLimit))
    : 0;

  if (!selection.sessionId) {
    return {
      schemaVersion: 1,
      generatedAt,
      selection,
      session: null,
      sessionState: null,
      latestCheckpoint: null,
      latestDispatch: null,
      latestHarnessRun: null,
      harnessControl: null,
      harnessSuggestedCommands: [],
      latestSkillCandidate: null,
      recentSkillCandidates: [],
      latestQualityGate: null,
      suggestedCommands: [],
      warnings: ['No ContextDB sessions found in this repo.'],
      ...(includeWatchdog ? { watchdog: null } : {}),
    };
  }

  const sessionsRoot = getSessionsRoot(rootDir);
  const sessionDir = path.join(sessionsRoot, selection.sessionId);
  const metaPath = path.join(sessionDir, 'meta.json');
  const statePath = path.join(sessionDir, 'state.json');
  const checkpointPath = path.join(sessionDir, 'l1-checkpoints.jsonl');
  const eventsPath = path.join(sessionDir, 'l2-events.jsonl');

  let meta = null;
  let state = null;
  let checkpoint = null;
  let dispatch = null;
  let harnessRun = null;
  let harnessControl = null;
  let skillCandidate = null;
  let recentSkillCandidates = [];
  let qualityGateEvent = null;
  let dispatchEvidence = [];
  if (fastMode) {
    [meta, dispatch, harnessRun, harnessControl, skillCandidate, recentSkillCandidates, qualityGateEvent] = await Promise.all([
      safeReadJsonCached(metaPath),
      findLatestDispatchArtifact(rootDir, selection.sessionId),
      readSoloRunSummary({ rootDir, sessionId: selection.sessionId }),
      readSoloControl({ rootDir, sessionId: selection.sessionId }),
      findLatestSkillCandidateArtifact(rootDir, selection.sessionId),
      collectRecentSkillCandidates(rootDir, selection.sessionId, { limit: resolvedSkillCandidateLimit }),
      readLatestQualityGateEvent(eventsPath),
    ]);
  } else {
    [meta, state, checkpoint, dispatch, harnessRun, harnessControl, skillCandidate, recentSkillCandidates, qualityGateEvent, dispatchEvidence] = await Promise.all([
      safeReadJsonCached(metaPath),
      safeReadJsonCached(statePath),
      readLastJsonLine(checkpointPath),
      findLatestDispatchArtifact(rootDir, selection.sessionId),
      readSoloRunSummary({ rootDir, sessionId: selection.sessionId }),
      readSoloControl({ rootDir, sessionId: selection.sessionId }),
      findLatestSkillCandidateArtifact(rootDir, selection.sessionId),
      collectRecentSkillCandidates(rootDir, selection.sessionId, { limit: resolvedSkillCandidateLimit }),
      readLatestQualityGateEvent(eventsPath),
      collectRecentDispatchEvidence(rootDir, selection.sessionId),
    ]);
  }

  const agent = normalizeText(meta?.agent) || normalizeText(selection.agent);
  const providerInferred = selection.provider || inferProviderFromAgent(agent);
  const effectiveSelection = {
    ...selection,
    agent,
    provider: providerInferred,
  };

  const warnings = [];
  if (!meta) warnings.push('Session meta.json missing or unreadable.');
  if (!fastMode && !checkpoint) warnings.push('No checkpoints found for this session yet.');
  if (!dispatch && !harnessRun) warnings.push('No dispatch artifact found for this session yet.');

  const latestDispatch = dispatch
    ? {
      ...dispatch,
      provider: providerInferred,
    }
    : null;
  const watchdogState = includeWatchdog
    ? await buildTeamWatchdogState(
      { sessionId: effectiveSelection.sessionId, provider: providerInferred },
      { rootDir, nowMs: watchdogNowMs }
    )
    : null;

  if (fastMode) {
    return {
      schemaVersion: 1,
      generatedAt,
      selection: effectiveSelection,
      session: meta,
      sessionState: null,
      latestCheckpoint: null,
      latestDispatch,
      latestHarnessRun: harnessRun,
      harnessControl,
      harnessSuggestedCommands: buildHarnessSuggestedCommands({
        sessionId: effectiveSelection.sessionId,
        latestHarnessRun: harnessRun,
      }),
      latestSkillCandidate: skillCandidate,
      recentSkillCandidates,
      latestQualityGate: qualityGateEvent,
      dispatchHindsight: null,
      dispatchFixHint: null,
      suggestedCommands: [],
      warnings,
      ...(includeWatchdog ? { watchdog: watchdogState } : {}),
    };
  }

  const artifactCache = {};
  if (latestDispatch?.artifactPath && latestDispatch.raw && typeof latestDispatch.raw === 'object') {
    artifactCache[latestDispatch.artifactPath] = latestDispatch.raw;
  }

  let dispatchHindsight = null;
  try {
    dispatchHindsight = await buildHindsightEval({
      rootDir,
      meta,
      dispatchEvidence,
      artifactCache,
    });
  } catch (error) {
    warnings.push(`Dispatch hindsight eval failed: ${clipText(formatErrorMessage(error), 160)}`);
    dispatchHindsight = null;
  }

  const suggestedCommands = buildSuggestedCommands({
    sessionId: effectiveSelection.sessionId,
    provider: providerInferred,
    latestDispatch,
    latestSkillCandidate: skillCandidate,
    dispatchHindsight,
  });
  const harnessSuggestedCommands = buildHarnessSuggestedCommands({
    sessionId: effectiveSelection.sessionId,
    latestHarnessRun: harnessRun,
  });
  const dispatchFixHint = buildDispatchFixHint({
    sessionId: effectiveSelection.sessionId,
    dispatchHindsight,
    latestDispatchArtifactPath: latestDispatch?.artifactPath,
  });

  return {
    schemaVersion: 1,
    generatedAt,
    selection: effectiveSelection,
    session: meta,
    sessionState: state,
    latestCheckpoint: checkpoint,
    latestDispatch,
    latestHarnessRun: harnessRun,
    harnessControl,
    harnessSuggestedCommands,
    latestSkillCandidate: skillCandidate,
    recentSkillCandidates,
    latestQualityGate: qualityGateEvent,
    dispatchHindsight,
    dispatchFixHint,
    suggestedCommands,
    warnings,
    ...(includeWatchdog ? { watchdog: watchdogState } : {}),
  };
}

export async function readHudDispatchSummary({
  rootDir,
  sessionId = '',
  provider = '',
  meta = null,
  limit = 6,
  includeHindsight = true,
} = {}) {
  const normalizedSessionId = normalizeText(sessionId || meta?.sessionId);
  const warnings = [];
  if (!normalizedSessionId) {
    return {
      schemaVersion: 1,
      generatedAt: nowIso(),
      sessionId: null,
      provider: normalizeProvider(provider) || null,
      latestDispatch: null,
      latestSkillCandidate: null,
      latestQualityGate: null,
      dispatchHindsight: null,
      dispatchFixHint: null,
      warnings: ['Missing sessionId for dispatch summary.'],
    };
  }

  const sessionMeta = meta && typeof meta === 'object'
    ? meta
    : await safeReadJsonCached(path.join(getSessionsRoot(rootDir), normalizedSessionId, 'meta.json'));
  if (!sessionMeta) {
    warnings.push('Session meta.json missing or unreadable.');
  }

  const providerInferred = normalizeProvider(provider) || inferProviderFromAgent(sessionMeta?.agent || '');
  const eventsPath = path.join(getSessionsRoot(rootDir), normalizedSessionId, 'l2-events.jsonl');

  const [dispatch, latestSkillCandidate, latestQualityGate, dispatchEvidence] = await Promise.all([
    findLatestDispatchArtifact(rootDir, normalizedSessionId),
    findLatestSkillCandidateArtifact(rootDir, normalizedSessionId),
    readLatestQualityGateEvent(eventsPath),
    collectRecentDispatchEvidence(rootDir, normalizedSessionId, { limit }),
  ]);

  const latestDispatch = dispatch
    ? {
      ...dispatch,
      provider: providerInferred,
    }
    : null;

  let dispatchHindsight = null;
  if (includeHindsight) {
    const artifactCache = {};
    if (latestDispatch?.artifactPath && latestDispatch.raw && typeof latestDispatch.raw === 'object') {
      artifactCache[latestDispatch.artifactPath] = latestDispatch.raw;
    }

    try {
      dispatchHindsight = await buildHindsightEval({
        rootDir,
        meta: sessionMeta,
        dispatchEvidence,
        artifactCache,
      });
    } catch (error) {
      warnings.push(`Dispatch hindsight eval failed: ${clipText(formatErrorMessage(error), 160)}`);
      dispatchHindsight = null;
    }
  }

  const dispatchFixHint = buildDispatchFixHint({
    sessionId: normalizedSessionId,
    dispatchHindsight,
    latestDispatchArtifactPath: latestDispatch?.artifactPath,
  });

  return {
    schemaVersion: 1,
    generatedAt: nowIso(),
    sessionId: normalizedSessionId,
    provider: providerInferred || null,
    latestDispatch,
    latestSkillCandidate,
    latestQualityGate,
    dispatchHindsight,
    dispatchFixHint,
    warnings,
  };
}
