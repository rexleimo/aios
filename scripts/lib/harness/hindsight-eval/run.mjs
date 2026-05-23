import path from 'node:path';

import {
  buildArtifactSignatures,
  buildHindsightCacheKey,
  getCachedHindsight,
  setCachedHindsight,
} from './cache.mjs';
import { extractDispatchRunRecord, extractProviderFromAgent } from './extract.mjs';
import { readJsonOptional } from './io.mjs';
import { accumulateCounts, buildPairTransitions, distillLessons } from './lessons.mjs';
import { normalizeText, nowIso, topEntries } from './shared.mjs';

function emptyHindsightResult({ sessionId, provider, artifacts }) {
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

function collectArtifactRefs(dispatchEvidence, maxArtifacts) {
  const artifacts = [];
  const seen = new Set();
  for (const record of Array.isArray(dispatchEvidence) ? dispatchEvidence : []) {
    const artifactPath = normalizeText(record?.artifactPath);
    if (!artifactPath || seen.has(artifactPath)) continue;
    seen.add(artifactPath);
    artifacts.push({ artifactPath, ts: normalizeText(record?.ts) });
    if (artifacts.length >= maxArtifacts) break;
  }
  return artifacts;
}

async function loadDispatchRecords({ rootDir, artifacts, artifactCache }) {
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
    loaded.push(extractDispatchRunRecord({ artifactPath: entry.artifactPath, artifact }));
  }
  loaded.sort((left, right) => String(right.persistedAt || '').localeCompare(String(left.persistedAt || '')));
  return loaded;
}

function analyzePairs({ loaded, maxPairs, sessionId, provider, maxLessons }) {
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
    if (pairs.length >= maxPairs) break;
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

  return {
    ...summary,
    topRepeatedJobs: topEntries(repeatedJobCounts, 5).map((item) => ({ jobId: item.key, count: item.count })),
    topRepeatedFailureClasses: topEntries(repeatedFailureCounts, 5).map((item) => ({ failureClass: item.key, count: item.count })),
    lessons: distillLessons({ pairs, sessionId, provider }).slice(0, maxLessons),
  };
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
  const resolvedMaxArtifacts = Number.isFinite(maxArtifacts) ? Math.max(2, Math.floor(maxArtifacts)) : 6;
  const resolvedMaxPairs = Number.isFinite(maxPairs) ? Math.max(1, Math.floor(maxPairs)) : 3;
  const resolvedMaxLessons = Number.isFinite(maxLessons) ? Math.max(0, Math.floor(maxLessons)) : 12;
  const artifacts = collectArtifactRefs(dispatchEvidence, resolvedMaxArtifacts);

  if (artifacts.length < 2) {
    return emptyHindsightResult({ sessionId, provider, artifacts });
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
    return { ...cached, generatedAt: nowIso() };
  }

  const loaded = await loadDispatchRecords({ rootDir, artifacts, artifactCache });
  if (loaded.length < 2) {
    return emptyHindsightResult({ sessionId, provider, artifacts });
  }

  const analysis = analyzePairs({
    loaded,
    maxPairs: resolvedMaxPairs,
    sessionId,
    provider,
    maxLessons: resolvedMaxLessons,
  });
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
    ...analysis,
  };

  if (loaded.length === artifacts.length) {
    setCachedHindsight(cacheKey, result);
  }

  return result;
}