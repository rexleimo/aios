import { existsSync } from 'node:fs';
import path from 'node:path';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function clipLine(value, maxLen = 180) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

function normalizeCounter(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function toPosixPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/');
}

function normalizeDraftTargetId(value) {
  return normalizeText(value);
}

function matchesDraftTargetId(candidate, draftTargetId = '') {
  const normalizedDraftTargetId = normalizeDraftTargetId(draftTargetId);
  if (!normalizedDraftTargetId) return true;
  return normalizeText(candidate?.sourceDraftTargetId) === normalizedDraftTargetId;
}

export function filterSkillCandidatesByDraftId(candidates = [], { draftId = '' } = {}) {
  const normalizedDraftId = normalizeDraftTargetId(draftId);
  const list = Array.isArray(candidates) ? candidates : [];
  if (!normalizedDraftId) return list.slice();
  return list.filter((candidate) => matchesDraftTargetId(candidate, normalizedDraftId));
}

export function filterSkillCandidateState(state = null, { draftId = '' } = {}) {
  const normalizedDraftId = normalizeDraftTargetId(draftId);
  if (!normalizedDraftId || !state || typeof state !== 'object') {
    return state;
  }

  const recent = Array.isArray(state.recentSkillCandidates)
    ? state.recentSkillCandidates
    : [];
  const filteredRecent = filterSkillCandidatesByDraftId(recent, { draftId: normalizedDraftId });
  const latest = state.latestSkillCandidate && typeof state.latestSkillCandidate === 'object'
    ? state.latestSkillCandidate
    : null;
  const latestFallback = latest && matchesDraftTargetId(latest, normalizedDraftId)
    ? latest
    : null;

  return {
    ...state,
    recentSkillCandidates: filteredRecent,
    latestSkillCandidate: filteredRecent[0] || latestFallback,
  };
}

function collectSkillCandidateItems(state, limit = 6, { draftId = '' } = {}) {
  const resolvedLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 6;
  const filteredState = filterSkillCandidateState(state, { draftId });
  const recentCandidates = Array.isArray(filteredState?.recentSkillCandidates)
    ? filteredState.recentSkillCandidates
    : [];
  const fallbackLatest = filteredState?.latestSkillCandidate && typeof filteredState.latestSkillCandidate === 'object'
    ? [filteredState.latestSkillCandidate]
    : [];
  return (recentCandidates.length > 0 ? recentCandidates : fallbackLatest).slice(0, resolvedLimit);
}

export function formatSkillCandidateDetails(state, { limit = 6, standalone = false, draftId = '' } = {}) {
  const items = collectSkillCandidateItems(state, limit, { draftId });

  const lines = [standalone ? 'Skill Candidates:' : '', 'Skill Candidates:'];
  if (standalone) {
    lines.shift();
  }
  if (items.length === 0) {
    lines.push('- (none)');
    return lines.join('\n');
  }

  for (const candidate of items) {
    const skillId = normalizeText(candidate?.skillId) || 'unknown-skill';
    const scope = normalizeText(candidate?.scope) || 'general';
    const failureClass = normalizeText(candidate?.failureClass) || 'unknown';
    const lessonCount = normalizeCounter(candidate?.lessonCount);
    const reviewMode = normalizeText(candidate?.reviewMode) || 'manual';
    const reviewStatus = normalizeText(candidate?.reviewStatus) || 'candidate';
    const draftTargetId = normalizeText(candidate?.sourceDraftTargetId);
    const artifactPath = normalizeText(candidate?.artifactPath);
    const patchHint = clipLine(candidate?.patchHint, 120);

    const bits = [
      `skill=${skillId}`,
      `scope=${scope}`,
      `failure=${failureClass}`,
      lessonCount > 0 ? `lessons=${lessonCount}` : '',
      `review=${reviewMode}/${reviewStatus}`,
      draftTargetId ? `draft=${draftTargetId}` : '',
      artifactPath ? `artifact=${artifactPath}` : '',
      patchHint ? `hint="${patchHint}"` : '',
    ].filter(Boolean);
    lines.push(`- ${bits.join(' ')}`);
  }

  return lines.join('\n');
}

function resolveSkillCandidateFilePath({ rootDir = '', skillId = '' } = {}) {
  const normalizedRootDir = normalizeText(rootDir);
  const normalizedSkillId = normalizeText(skillId) || 'unknown-skill';
  if (!normalizedRootDir) {
    return `.codex/skills/${normalizedSkillId}/SKILL.md`;
  }

  const candidates = [
    path.join(normalizedRootDir, '.codex', 'skills', normalizedSkillId, 'SKILL.md'),
    path.join(normalizedRootDir, '.claude', 'skills', normalizedSkillId, 'SKILL.md'),
    path.join(normalizedRootDir, '.gemini', 'skills', normalizedSkillId, 'SKILL.md'),
    path.join(normalizedRootDir, '.opencode', 'skills', normalizedSkillId, 'SKILL.md'),
    path.join(normalizedRootDir, '.agents', 'skills', normalizedSkillId, 'SKILL.md'),
  ];
  const selected = candidates.find((item) => existsSync(item)) || candidates[0];
  return toPosixPath(path.relative(normalizedRootDir, selected) || selected);
}

function buildSkillPatchTemplate({
  rootDir = '',
  sessionId = '',
  candidate = null,
} = {}) {
  const safeCandidate = candidate && typeof candidate === 'object' ? candidate : {};
  const skillId = normalizeText(safeCandidate.skillId) || 'unknown-skill';
  const scope = normalizeText(safeCandidate.scope) || 'general';
  const failureClass = normalizeText(safeCandidate.failureClass) || 'unknown';
  const lessonKind = normalizeText(safeCandidate.lessonKind) || 'unknown';
  const lessonCount = normalizeCounter(safeCandidate.lessonCount);
  const patchHint = clipLine(safeCandidate.patchHint, 200) || 'TODO: add manual guidance derived from hindsight evidence.';
  const draftTargetId = normalizeText(safeCandidate.sourceDraftTargetId);
  const artifactPath = normalizeText(safeCandidate.artifactPath);
  const skillFilePath = resolveSkillCandidateFilePath({ rootDir, skillId });

  const patchLines = [
    '```diff',
    '*** Begin Patch',
    `*** Update File: ${skillFilePath}`,
    '@@',
    `+## Candidate: ${failureClass} (${scope}) [manual-review]`,
    `+- Trigger: ${lessonKind}${lessonCount > 0 ? ` x${lessonCount}` : ''}`,
    `+- Patch hint: ${patchHint}`,
    `+- Evidence artifact: ${artifactPath || '(missing)'}`,
    `+- Source draft target: ${draftTargetId || '(missing)'}`,
    `+- Session: ${sessionId || '(missing)'}`,
    '*** End Patch',
    '```',
  ];

  return {
    skillId,
    scope,
    failureClass,
    lessonKind,
    lessonCount,
    patchHint,
    draftTargetId,
    artifactPath,
    skillFilePath,
    patchTemplate: patchLines.join('\n'),
  };
}

export function formatSkillCandidatePatchTemplateDocument(state, {
  rootDir = '',
  limit = 6,
  generatedAt = '',
  draftId = '',
} = {}) {
  const items = collectSkillCandidateItems(state, limit, { draftId });
  const sessionId = normalizeText(state?.selection?.sessionId) || normalizeText(state?.session?.sessionId);
  const emittedAt = normalizeText(generatedAt) || new Date().toISOString();
  const lines = [
    '# Skill Candidate Patch Templates',
    '',
    `- generatedAt: ${emittedAt}`,
    `- sessionId: ${sessionId || '(none)'}`,
    `- candidateCount: ${items.length}`,
    '',
  ];

  if (items.length === 0) {
    lines.push('No skill-candidate artifacts were available for patch-template export.');
    return lines.join('\n');
  }

  const templates = items.map((candidate) => buildSkillPatchTemplate({
    rootDir,
    sessionId,
    candidate,
  }));

  for (let index = 0; index < templates.length; index += 1) {
    const template = templates[index];
    lines.push(`## Candidate ${index + 1}: ${template.skillId} / ${template.failureClass}`);
    lines.push(`- scope: ${template.scope}`);
    lines.push(`- lesson: ${template.lessonKind}${template.lessonCount > 0 ? ` x${template.lessonCount}` : ''}`);
    lines.push(`- sourceDraftTargetId: ${template.draftTargetId || '(missing)'}`);
    lines.push(`- artifactPath: ${template.artifactPath || '(missing)'}`);
    lines.push(`- suggestedSkillFile: ${template.skillFilePath}`);
    lines.push(`- patchHint: ${template.patchHint}`);
    lines.push('');
    lines.push(template.patchTemplate);
    if (index < templates.length - 1) {
      lines.push('');
    }
  }

  return lines.join('\n');
}
