import { clipLine, normalizeText } from './shared.mjs';

export function formatSkillCandidateLine(state) {
  const candidate = state?.latestSkillCandidate && typeof state.latestSkillCandidate === 'object'
    ? state.latestSkillCandidate
    : null;
  if (!candidate) return '';

  const skillId = normalizeText(candidate.skillId);
  const scope = normalizeText(candidate.scope);
  const failureClass = normalizeText(candidate.failureClass);
  const lessonCount = Number.isFinite(candidate.lessonCount) ? Math.max(0, Math.floor(candidate.lessonCount)) : 0;
  const reviewMode = normalizeText(candidate.reviewMode);
  const reviewStatus = normalizeText(candidate.reviewStatus);
  const sourceDraftTargetId = normalizeText(candidate.sourceDraftTargetId);
  const sourceArtifactPath = normalizeText(candidate.sourceArtifactPath);
  const artifactPath = normalizeText(candidate.artifactPath);
  const patchHint = clipLine(candidate.patchHint, 100);

  const parts = [];
  if (skillId) parts.push(`skill=${skillId}`);
  if (scope) parts.push(`scope=${scope}`);
  if (failureClass) parts.push(`failure=${failureClass}`);
  if (lessonCount > 0) parts.push(`lessons=${lessonCount}`);
  if (reviewMode) parts.push(`review=${reviewMode}`);
  if (reviewStatus) parts.push(`status=${reviewStatus}`);
  if (sourceDraftTargetId) parts.push(`draft=${sourceDraftTargetId}`);
  if (sourceArtifactPath) parts.push(`source=${sourceArtifactPath}`);
  if (artifactPath) parts.push(`artifact=${artifactPath}`);
  if (patchHint) parts.push(`hint="${patchHint}"`);
  if (parts.length === 0) return '';

  return clipLine(`SkillCandidate: ${parts.join(' ')}`, 260);
}

export function formatMinimalSkillCandidateLabel(state) {
  const candidate = state?.latestSkillCandidate && typeof state.latestSkillCandidate === 'object'
    ? state.latestSkillCandidate
    : null;
  if (!candidate) return '';

  const skillId = normalizeText(candidate.skillId);
  const failureClass = normalizeText(candidate.failureClass);
  const scope = normalizeText(candidate.scope);
  const lessonCount = Number.isFinite(candidate.lessonCount) ? Math.max(0, Math.floor(candidate.lessonCount)) : 0;
  if (!skillId) return '';

  const scopeOrFailure = failureClass || scope || '';
  const countLabel = lessonCount > 0 ? `#${lessonCount}` : '';
  return scopeOrFailure
    ? `skill=${skillId}/${scopeOrFailure}${countLabel}`
    : `skill=${skillId}${countLabel}`;
}
