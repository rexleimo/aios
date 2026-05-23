import { promises as fs } from 'node:fs';
import path from 'node:path';

import { getCacheKeyPart, normalizeText } from './shared.mjs';

const HINDSIGHT_CACHE_MAX_ENTRIES = 24;
const HINDSIGHT_CACHE = new Map();
const ARTIFACT_SIGNATURE_CACHE_MAX_ENTRIES = 128;
const ARTIFACT_SIGNATURE_NEGATIVE_TTL_MS = 750;
const ARTIFACT_SIGNATURE_CACHE = new Map();

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

// 纯函数：把影响 hindsight 的输入压缩成稳定缓存键，签名变化会自动失效。
export function buildHindsightCacheKey({
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

export function getCachedHindsight(cacheKey) {
  if (!cacheKey) return null;
  const cached = HINDSIGHT_CACHE.get(cacheKey);
  if (!cached || typeof cached !== 'object') return null;
  HINDSIGHT_CACHE.delete(cacheKey);
  HINDSIGHT_CACHE.set(cacheKey, cached);
  return cached;
}

export function setCachedHindsight(cacheKey, result) {
  if (!cacheKey || !result || typeof result !== 'object') return;
  setLruCache(HINDSIGHT_CACHE, cacheKey, result, HINDSIGHT_CACHE_MAX_ENTRIES);
}

export async function buildArtifactSignatures(rootDir, artifacts = []) {
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

    setLruCache(ARTIFACT_SIGNATURE_CACHE, cacheKey, { mtimeMs, size, missing, cachedAtMs: nowMs }, ARTIFACT_SIGNATURE_CACHE_MAX_ENTRIES);
    return { artifactPath, mtimeMs, size };
  }));

  return signatures.filter(Boolean);
}