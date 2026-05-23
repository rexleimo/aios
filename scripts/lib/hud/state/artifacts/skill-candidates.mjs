import path from 'node:path';

import { safeReadJsonCached } from '../io.mjs';
import {
  clipText,
  mapWithConcurrency,
  normalizeText,
  SKILL_CANDIDATE_ARTIFACT_KIND,
  toPosixPath,
} from '../shared.mjs';
import { loadDispatchIndex } from './cache.mjs';

// 纯函数：把候选技能产物规整成 HUD 使用的扁平结构。
export function normalizeSkillCandidateArtifactPayload({
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

export async function findLatestSkillCandidateArtifact(rootDir, sessionId) {
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
  const result = normalizeSkillCandidateArtifactPayload({ rootDir, absPath, artifact });

  if (index.cacheKey) {
    index.latestSkillCandidateName = latestName;
    index.latestSkillCandidate = result;
  }

  return result;
}

export async function collectRecentSkillCandidates(rootDir, sessionId, { limit = 5 } = {}) {
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
    return normalizeSkillCandidateArtifactPayload({ rootDir, absPath, artifact });
  });

  return parsed.filter(Boolean);
}