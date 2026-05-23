import { createRecommendation } from './factories.mjs';
import { getQualityGateFixCommand } from './shared.mjs';
import { HINDSIGHT_DRAFT_GATE_TARGETS, HINDSIGHT_DRAFT_SKILL_PATCH_CANDIDATES } from './actions.mjs';

const HINDSIGHT_LESSON_DRAFT_MIN_COUNT = 2;
const HINDSIGHT_LESSON_DRAFT_MAX_ITEMS = 4;
const HINDSIGHT_LESSON_KIND_PRIORITY = {
  'repeat-blocked': 2,
  regression: 1,
};
const HINDSIGHT_SKILL_CANDIDATE_ARTIFACT_KIND = 'learn-eval.skill-candidate';

function normalizeHindsightLessonKind(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'repeat-blocked' || normalized === 'regression') return normalized;
  return '';
}

function normalizeHindsightFailureClass(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || 'unknown';
}

function normalizeTargetToken(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'unknown';
}

function aggregateHindsightLessonCandidates(rawLessons = []) {
  const lessons = Array.isArray(rawLessons) ? rawLessons : [];
  const groups = new Map();

  for (const lesson of lessons) {
    const kind = normalizeHindsightLessonKind(lesson?.kind);
    if (!kind) continue;
    const failureClass = normalizeHindsightFailureClass(lesson?.from?.failureClass || lesson?.to?.failureClass);
    const groupKey = `${kind}::${failureClass}`;
    const existing = groups.get(groupKey) || {
      kind,
      failureClass,
      count: 0,
      jobIds: new Set(),
      workItemRefs: new Set(),
      hints: new Set(),
      suggestedCommands: new Set(),
    };
    existing.count += 1;

    const jobId = String(lesson?.jobId || '').trim();
    if (jobId) existing.jobIds.add(jobId);

    for (const workItemRef of Array.isArray(lesson?.workItemRefs) ? lesson.workItemRefs : []) {
      const normalizedWorkItemRef = String(workItemRef || '').trim();
      if (!normalizedWorkItemRef) continue;
      existing.workItemRefs.add(normalizedWorkItemRef);
    }

    const hint = String(lesson?.hint || '').trim();
    if (hint) existing.hints.add(hint);

    for (const command of Array.isArray(lesson?.suggestedCommands) ? lesson.suggestedCommands : []) {
      const normalizedCommand = String(command || '').trim();
      if (!normalizedCommand) continue;
      existing.suggestedCommands.add(normalizedCommand);
    }

    groups.set(groupKey, existing);
  }

  return Array.from(groups.values())
    .filter((group) => group.count >= HINDSIGHT_LESSON_DRAFT_MIN_COUNT)
    .map((group) => ({
      ...group,
      jobIds: Array.from(group.jobIds),
      workItemRefs: Array.from(group.workItemRefs),
      hints: Array.from(group.hints),
      suggestedCommands: Array.from(group.suggestedCommands),
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      const rightPriority = HINDSIGHT_LESSON_KIND_PRIORITY[right.kind] || 0;
      const leftPriority = HINDSIGHT_LESSON_KIND_PRIORITY[left.kind] || 0;
      if (rightPriority !== leftPriority) return rightPriority - leftPriority;
      return left.failureClass.localeCompare(right.failureClass);
    });
}

function buildHindsightMemoDraftText({ sessionId = '', group } = {}) {
  const normalizedSessionId = String(sessionId || '').trim() || 'unknown-session';
  const normalizedGroup = group && typeof group === 'object' ? group : {};
  const jobs = Array.isArray(normalizedGroup.jobIds) && normalizedGroup.jobIds.length > 0
    ? normalizedGroup.jobIds.slice(0, HINDSIGHT_LESSON_DRAFT_MAX_ITEMS).join(',')
    : 'none';
  const workItems = Array.isArray(normalizedGroup.workItemRefs) && normalizedGroup.workItemRefs.length > 0
    ? normalizedGroup.workItemRefs.slice(0, HINDSIGHT_LESSON_DRAFT_MAX_ITEMS).join(',')
    : 'none';
  const hint = Array.isArray(normalizedGroup.hints) && normalizedGroup.hints.length > 0
    ? normalizedGroup.hints[0]
    : 'Review dispatch hindsight evidence before promoting this workflow.';
  return `[hindsight-draft] session=${normalizedSessionId} kind=${normalizeTargetToken(normalizedGroup.kind)} failure=${normalizeTargetToken(normalizedGroup.failureClass)} count=${Number.isFinite(normalizedGroup.count) ? normalizedGroup.count : 0} jobs=${jobs} workItems=${workItems}; hint=${hint} #hindsight #draft #dispatch`;
}

function buildSkillPatchCandidateMemoText({
  sessionId = '',
  group = null,
  candidate = null,
} = {}) {
  const normalizedSessionId = String(sessionId || '').trim() || 'unknown-session';
  const normalizedGroup = group && typeof group === 'object' ? group : {};
  const normalizedCandidate = candidate && typeof candidate === 'object' ? candidate : {};
  const jobs = Array.isArray(normalizedGroup.jobIds) && normalizedGroup.jobIds.length > 0
    ? normalizedGroup.jobIds.slice(0, HINDSIGHT_LESSON_DRAFT_MAX_ITEMS).join(',')
    : 'none';
  const workItems = Array.isArray(normalizedGroup.workItemRefs) && normalizedGroup.workItemRefs.length > 0
    ? normalizedGroup.workItemRefs.slice(0, HINDSIGHT_LESSON_DRAFT_MAX_ITEMS).join(',')
    : 'none';
  const skillId = String(normalizedCandidate.skillId || '').trim() || 'unknown-skill';
  const scope = String(normalizedCandidate.scope || '').trim() || 'general';
  const patchHint = String(normalizedCandidate.patchHint || '').trim() || 'Review hindsight cluster and produce a manual skill patch proposal.';
  return `[skill-candidate] session=${normalizedSessionId} kind=${normalizeTargetToken(normalizedGroup.kind)} failure=${normalizeTargetToken(normalizedGroup.failureClass)} skill=${skillId} scope=${scope} count=${Number.isFinite(normalizedGroup.count) ? normalizedGroup.count : 0} jobs=${jobs} workItems=${workItems}; patchHint=${patchHint} #skill-candidate #hindsight #draft`;
}

function buildSkillPatchCandidateArtifactDraft({
  sessionId = '',
  group = null,
  candidate = null,
  sourceArtifactPath = '',
  generatedAt = '',
  targetId = '',
} = {}) {
  const normalizedSessionId = String(sessionId || '').trim() || 'unknown-session';
  const normalizedGroup = group && typeof group === 'object' ? group : {};
  const normalizedCandidate = candidate && typeof candidate === 'object' ? candidate : {};
  const normalizedGeneratedAt = String(generatedAt || '').trim();
  const normalizedTargetId = String(targetId || '').trim();
  const skillId = String(normalizedCandidate.skillId || '').trim() || 'unknown-skill';
  const scope = String(normalizedCandidate.scope || '').trim() || 'general';
  const patchHint = String(normalizedCandidate.patchHint || '').trim() || 'Review hindsight cluster and produce a manual skill patch proposal.';
  const jobIds = Array.isArray(normalizedGroup.jobIds)
    ? normalizedGroup.jobIds
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, HINDSIGHT_LESSON_DRAFT_MAX_ITEMS)
    : [];
  const workItemRefs = Array.isArray(normalizedGroup.workItemRefs)
    ? normalizedGroup.workItemRefs
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, HINDSIGHT_LESSON_DRAFT_MAX_ITEMS)
    : [];
  const hints = Array.isArray(normalizedGroup.hints)
    ? normalizedGroup.hints
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, HINDSIGHT_LESSON_DRAFT_MAX_ITEMS)
    : [];

  return {
    schemaVersion: 1,
    kind: HINDSIGHT_SKILL_CANDIDATE_ARTIFACT_KIND,
    sessionId: normalizedSessionId,
    generatedAt: normalizedGeneratedAt || undefined,
    lessonCluster: {
      kind: normalizeTargetToken(normalizedGroup.kind),
      failureClass: normalizeTargetToken(normalizedGroup.failureClass),
      count: Number.isFinite(normalizedGroup.count) ? Math.max(0, Math.floor(normalizedGroup.count)) : 0,
      jobIds,
      workItemRefs,
      hints,
    },
    candidate: {
      skillId,
      scope,
      patchHint,
    },
    evidence: {
      sourceArtifactPath: String(sourceArtifactPath || '').trim() || null,
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: normalizedTargetId || null,
    },
  };
}

export function buildHindsightDraftRecommendations(summary, recommendations = []) {
  const dispatchHindsight = summary?.signals?.dispatch?.hindsight && typeof summary.signals.dispatch.hindsight === 'object'
    ? summary.signals.dispatch.hindsight
    : null;
  const lessonGroups = aggregateHindsightLessonCandidates(dispatchHindsight?.lessons);
  if (lessonGroups.length === 0) return [];

  const topGroup = lessonGroups[0];
  const sessionId = String(summary?.session?.sessionId || '').trim();
  const latestArtifactPath = String(summary?.signals?.dispatch?.latestArtifactPath || '').trim();
  const topHint = Array.isArray(topGroup.hints) && topGroup.hints.length > 0
    ? topGroup.hints[0]
    : 'Review the distilled lesson and keep it in advisory mode until manually approved.';
  const evidenceParts = [
    `kind=${topGroup.kind}`,
    `failure=${topGroup.failureClass}`,
    `lessons=${topGroup.count}`,
    `jobs=${topGroup.jobIds.length}`,
    `workItems=${topGroup.workItemRefs.length}`,
  ];
  if (lessonGroups.length > 1) {
    evidenceParts.push(`groups=${lessonGroups.length}`);
  }

  const memoText = buildHindsightMemoDraftText({ sessionId, group: topGroup });
  const normalizedKind = normalizeTargetToken(topGroup.kind);
  const normalizedFailureClass = normalizeTargetToken(topGroup.failureClass);
  const drafts = [
    createRecommendation({
      kind: 'observe',
      targetType: 'sample',
      targetId: `draft.memo.${normalizedKind}.${normalizedFailureClass}`,
      title: 'hindsight memo candidate',
      reason: `High-confidence hindsight lesson cluster detected. Review this memo draft before persisting it. ${topHint}`,
      evidence: evidenceParts.join(' '),
      nextCommand: `node scripts/aios.mjs memo add ${JSON.stringify(memoText)}`,
      draftAction: {
        kind: 'memo-add',
        text: memoText,
      },
      nextArtifact: latestArtifactPath || undefined,
      priority: 20,
    }),
  ];

  const gateTargetId = HINDSIGHT_DRAFT_GATE_TARGETS[topGroup.failureClass] || '';
  if (gateTargetId) {
    const gateAlreadyRecommended = recommendations.some((item) => item.kind === 'fix' && item.targetId === gateTargetId);
    if (!gateAlreadyRecommended) {
      drafts.push(createRecommendation({
        kind: 'observe',
        targetType: 'gate',
        targetId: `draft.gate.${normalizedKind}.${normalizedFailureClass}`,
        title: 'hindsight gate candidate',
        reason: `Hindsight evidence is stable enough to draft ${gateTargetId}; keep manual review in the loop before enforcing it.`,
        evidence: [...evidenceParts, `candidate=${gateTargetId}`].join(' '),
        nextCommand: getQualityGateFixCommand(),
        draftAction: {
          kind: 'quality-gate',
          mode: 'pre-pr',
          candidateTargetId: gateTargetId,
        },
        nextArtifact: latestArtifactPath || undefined,
        priority: 15,
      }));
    }
  }

  const skillPatchCandidate = HINDSIGHT_DRAFT_SKILL_PATCH_CANDIDATES[topGroup.failureClass] || null;
  if (skillPatchCandidate && typeof skillPatchCandidate === 'object') {
    const draftSkillTargetId = `draft.skill.${normalizedKind}.${normalizedFailureClass}`;
    const skillMemoText = buildSkillPatchCandidateMemoText({
      sessionId,
      group: topGroup,
      candidate: skillPatchCandidate,
    });
    const skillArtifactDraft = buildSkillPatchCandidateArtifactDraft({
      sessionId,
      group: topGroup,
      candidate: skillPatchCandidate,
      sourceArtifactPath: latestArtifactPath,
      generatedAt: dispatchHindsight?.generatedAt || summary?.session?.updatedAt || '',
      targetId: draftSkillTargetId,
    });
    drafts.push(createRecommendation({
      kind: 'observe',
      targetType: 'sample',
      targetId: draftSkillTargetId,
      title: 'hindsight skill patch candidate',
      reason: `Hindsight evidence suggests a reusable ${skillPatchCandidate.skillId} patch candidate; keep manual review before editing skill docs.`,
      evidence: [...evidenceParts, `skill=${skillPatchCandidate.skillId}`, `scope=${skillPatchCandidate.scope}`].join(' '),
      nextCommand: `node scripts/aios.mjs memo add ${JSON.stringify(skillMemoText)}`,
      draftAction: {
        kind: 'skill-candidate',
        skillId: skillPatchCandidate.skillId,
        scope: skillPatchCandidate.scope,
        patchHint: skillPatchCandidate.patchHint,
        failureClass: topGroup.failureClass,
        lessonKind: topGroup.kind,
        artifactDraft: skillArtifactDraft,
        text: skillMemoText,
      },
      nextArtifact: latestArtifactPath || undefined,
      priority: 14,
    }));
  }

  return drafts;
}
