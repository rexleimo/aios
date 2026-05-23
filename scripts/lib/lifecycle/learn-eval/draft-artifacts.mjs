import { contextDbRelativePath } from '../../aios/state-root.mjs';

export const DRAFT_TARGET_PREFIX = 'draft.';
export const SKILL_CANDIDATE_ARTIFACT_KIND = 'learn-eval.skill-candidate';

export function normalizeDraftTargetId(value = '') {
  return String(value || '').trim();
}

export function normalizeArtifactToken(value = '', fallback = 'unknown') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

export function formatArtifactTimestamp(ts = new Date()) {
  return ts.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildSkillCandidateArtifactPath(rootDir, sessionId, { skillId = '', failureClass = '', stamp = '' } = {}) {
  const normalizedSessionId = String(sessionId || '').trim();
  const normalizedStamp = String(stamp || '').trim() || formatArtifactTimestamp();
  const skillToken = normalizeArtifactToken(skillId, 'skill');
  const failureToken = normalizeArtifactToken(failureClass, 'failure');
  return contextDbRelativePath(
    rootDir,
    'sessions',
    normalizedSessionId,
    'artifacts',
    `skill-candidate-${normalizedStamp}-${skillToken}-${failureToken}.json`
  );
}

export function buildSkillCandidateArtifactPayload(draftAction, { sessionId = '', persistedAt = '' } = {}) {
  const normalizedSessionId = String(sessionId || '').trim() || 'unknown-session';
  const normalizedPersistedAt = String(persistedAt || '').trim() || new Date().toISOString();
  const artifactDraft = draftAction?.artifactDraft && typeof draftAction.artifactDraft === 'object'
    ? draftAction.artifactDraft
    : {};
  const candidate = artifactDraft?.candidate && typeof artifactDraft.candidate === 'object'
    ? artifactDraft.candidate
    : {};
  const lessonCluster = artifactDraft?.lessonCluster && typeof artifactDraft.lessonCluster === 'object'
    ? artifactDraft.lessonCluster
    : {};
  const evidence = artifactDraft?.evidence && typeof artifactDraft.evidence === 'object'
    ? artifactDraft.evidence
    : {};
  const review = artifactDraft?.review && typeof artifactDraft.review === 'object'
    ? artifactDraft.review
    : {};

  return {
    schemaVersion: Number.isFinite(artifactDraft.schemaVersion) ? Math.max(1, Math.floor(artifactDraft.schemaVersion)) : 1,
    kind: String(artifactDraft.kind || SKILL_CANDIDATE_ARTIFACT_KIND).trim() || SKILL_CANDIDATE_ARTIFACT_KIND,
    sessionId: String(artifactDraft.sessionId || normalizedSessionId).trim() || normalizedSessionId,
    generatedAt: String(artifactDraft.generatedAt || '').trim() || normalizedPersistedAt,
    persistedAt: normalizedPersistedAt,
    lessonCluster: {
      kind: String(lessonCluster.kind || draftAction?.lessonKind || 'unknown').trim() || 'unknown',
      failureClass: String(lessonCluster.failureClass || draftAction?.failureClass || 'unknown').trim() || 'unknown',
      count: Number.isFinite(lessonCluster.count) ? Math.max(0, Math.floor(lessonCluster.count)) : 0,
      jobIds: Array.isArray(lessonCluster.jobIds) ? lessonCluster.jobIds : [],
      workItemRefs: Array.isArray(lessonCluster.workItemRefs) ? lessonCluster.workItemRefs : [],
      hints: Array.isArray(lessonCluster.hints) ? lessonCluster.hints : [],
    },
    candidate: {
      skillId: String(candidate.skillId || draftAction?.skillId || 'unknown-skill').trim() || 'unknown-skill',
      scope: String(candidate.scope || draftAction?.scope || 'general').trim() || 'general',
      patchHint: String(candidate.patchHint || draftAction?.patchHint || '').trim(),
    },
    evidence: {
      ...evidence,
      sourceMemoText: String(draftAction?.text || '').trim() || null,
    },
    review: {
      status: String(review.status || 'candidate').trim() || 'candidate',
      mode: String(review.mode || 'manual').trim() || 'manual',
      sourceDraftTargetId: String(review.sourceDraftTargetId || '').trim() || null,
    },
  };
}
