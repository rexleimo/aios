import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { readDirMtimeMs } from '../io.mjs';
import { getSessionsRoot } from '../sessions.mjs';
import {
  bumpLruCache,
  getCacheKeyPart,
  normalizeText,
  setLruCache,
  SKILL_CANDIDATE_ARTIFACT_FILE_PATTERN,
} from '../shared.mjs';

const DISPATCH_INDEX_CACHE_TTL_MS = 2000;
const DISPATCH_INDEX_CACHE_MAX_ENTRIES = 32;
const DISPATCH_INDEX_CACHE_MAX_NAMES = 200;
const DISPATCH_INDEX_CACHE = new Map();
const DISPATCH_INDEX_IN_FLIGHT = new Map();

// 纯函数：把根目录和会话 ID 归一成缓存键，避免 Windows 路径大小写造成重复索引。
function getDispatchIndexCacheKey(rootDir, sessionId) {
  return `${getCacheKeyPart(rootDir)}::${getCacheKeyPart(sessionId)}`;
}

function createEmptyDispatchIndex(artifactsDir = '') {
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

function listArtifactNames(files, pattern) {
  return files
    .filter((name) => pattern.test(String(name || '').trim()))
    .sort((left, right) => String(right).localeCompare(String(left)))
    .slice(0, DISPATCH_INDEX_CACHE_MAX_NAMES);
}

export async function loadDispatchIndex(rootDir, sessionId) {
  const normalizedSessionId = normalizeText(sessionId);
  const artifactsDir = normalizedSessionId
    ? path.join(getSessionsRoot(rootDir), normalizedSessionId, 'artifacts')
    : '';
  if (!normalizedSessionId || !artifactsDir || !existsSync(artifactsDir)) {
    return createEmptyDispatchIndex(artifactsDir);
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

    const names = listArtifactNames(files, /^dispatch-run-.*\.json$/i);
    const skillCandidateNames = listArtifactNames(files, SKILL_CANDIDATE_ARTIFACT_FILE_PATTERN);
    const latestName = names[0] || '';
    const latestSkillCandidateName = skillCandidateNames[0] || '';
    const previous = DISPATCH_INDEX_CACHE.get(cacheKey);
    const latestDispatch = previous && previous.latestName === latestName ? previous.latestDispatch : null;
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