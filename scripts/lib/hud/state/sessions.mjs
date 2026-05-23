import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolveContextDbRoot } from '../../aios/state-root.mjs';
import { readDirMtimeMs, safeReadJsonCached } from './io.mjs';
import {
  bumpLruCache,
  compareIsoDesc,
  DEFAULT_SESSION_SCAN_LIMIT,
  getCacheKeyPart,
  mapWithConcurrency,
  normalizeText,
  setLruCache,
} from './shared.mjs';
import {
  AGENT_PROVIDER_MAP,
  HUD_PROVIDER_AGENT_MAP,
  normalizeProvider,
} from './providers.mjs';

const SESSION_INDEX_CACHE_TTL_MS = 30_000;
const SESSION_INDEX_CACHE_MAX_ENTRIES = 8;
const SESSION_INDEX_CACHE = new Map();
const SESSION_INDEX_IN_FLIGHT = new Map();

export function getSessionsRoot(rootDir) {
  return path.join(resolveContextDbRoot(rootDir, { preferLegacyExisting: true }), 'sessions');
}

function getSessionsIndexCacheKey(rootDir) {
  return `${getCacheKeyPart(rootDir)}::sessions-index`;
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
