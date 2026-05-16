import { promises as fs } from 'node:fs';
import path from 'node:path';
import { contextDbRelativePath, resolveContextDbRoot } from '../aios/state-root.mjs';

import { getHarnessTarget } from './targets.mjs';
import { buildHindsightEval } from './hindsight-eval.mjs';

const SESSION_STATUS_NAMES = ['running', 'blocked', 'done'];
const VERIFICATION_RESULT_NAMES = ['unknown', 'passed', 'failed', 'partial'];
const RECOMMENDATION_KIND_ORDER = ['fix', 'observe', 'promote'];
const RECOMMENDATION_KIND_BASE_PRIORITY = {
  fix: 300,
  observe: 200,
  promote: 100,
};
const RECOMMENDATION_SECTION_LABELS = {
  fix: 'Fix',
  observe: 'Observe',
  promote: 'Promote',
};
const ORCHESTRATION_DISPATCH_EVENT_KIND = 'orchestration.dispatch-run';
const DISPATCH_HINDSIGHT_FAILURE_ACTIONS = {
  'ownership-policy': {
    targetType: 'runbook',
    targetId: 'runbook.dispatch-merge-triage',
    reason: 'Dispatch hindsight shows repeated ownership/policy blockage; fix file ownership boundaries before retrying parallel execution.',
    priority: 50,
  },
  contract: {
    targetType: 'runbook',
    targetId: 'runbook.dispatch-merge-triage',
    reason: 'Dispatch hindsight shows repeated handoff contract blockage; ensure subagents emit a single JSON handoff conforming to the schema before retrying.',
    priority: 50,
  },
  timeout: {
    targetType: 'gate',
    targetId: 'gate.timeout-budget',
    reason: 'Dispatch hindsight shows repeated timeouts; add wait/timeout budgets or split work-items before retrying.',
    priority: 45,
  },
  'dependency-blocked': {
    targetType: 'runbook',
    targetId: 'runbook.failure-triage',
    reason: 'Dispatch hindsight shows repeat blocked-by-dependency turns; ensure dependencies complete and unblock the merge gate before retrying.',
    priority: 40,
  },
  'unsupported-job': {
    targetType: 'runbook',
    targetId: 'runbook.tool-repair',
    reason: 'Dispatch hindsight shows repeated unsupported job errors; repair orchestrator tooling/runtime before retrying.',
    priority: 40,
  },
  'runtime-error': {
    targetType: 'runbook',
    targetId: 'runbook.tool-repair',
    reason: 'Dispatch hindsight shows repeated runtime errors; stabilize tooling and capture a recovery path before retrying.',
    priority: 40,
  },
  default: {
    targetType: 'runbook',
    targetId: 'runbook.failure-triage',
    reason: 'Dispatch hindsight shows recurring regressions or repeated blocked turns; stabilize the failing jobs before retrying.',
    priority: 45,
  },
};
const HINDSIGHT_LESSON_DRAFT_MIN_COUNT = 2;
const HINDSIGHT_LESSON_DRAFT_MAX_ITEMS = 4;
const HINDSIGHT_LESSON_KIND_PRIORITY = {
  'repeat-blocked': 2,
  regression: 1,
};
const HINDSIGHT_DRAFT_GATE_TARGETS = {
  timeout: 'gate.timeout-budget',
  'ownership-policy': 'gate.blocked-triage',
  contract: 'gate.blocked-triage',
  'dependency-blocked': 'gate.blocked-triage',
  'runtime-error': 'gate.quality-triage',
  'unsupported-job': 'gate.quality-triage',
};
const HINDSIGHT_DRAFT_SKILL_PATCH_CANDIDATES = {
  'ownership-policy': {
    skillId: 'skill-constraints',
    scope: 'ownership-policy',
    patchHint: 'Add ownership boundary and ownedPathPrefixes preflight guidance for parallel phases before execution.',
  },
  contract: {
    skillId: 'skill-constraints',
    scope: 'handoff-contract',
    patchHint: 'Reinforce single-JSON handoff contract validation before merge-gate execution.',
  },
  timeout: {
    skillId: 'aios-long-running-harness',
    scope: 'timeout-budget',
    patchHint: 'Add timeout budgets and split long work-items before retrying repeated blocked turns.',
  },
  'dependency-blocked': {
    skillId: 'aios-long-running-harness',
    scope: 'dependency-gating',
    patchHint: 'Add dependency completion checks before retry-blocked resume workflows.',
  },
  'runtime-error': {
    skillId: 'debug',
    scope: 'runtime-triage',
    patchHint: 'Add evidence-first runtime triage sequence before retries in unstable flows.',
  },
  'unsupported-job': {
    skillId: 'aios-project-system',
    scope: 'runtime-capability',
    patchHint: 'Clarify executor/job-type compatibility and fallback routing for unsupported job failures.',
  },
};
const HINDSIGHT_SKILL_CANDIDATE_ARTIFACT_KIND = 'learn-eval.skill-candidate';

function getQualityGateFixCommand() {
  return 'node scripts/aios.mjs quality-gate pre-pr';
}

function getVerificationCommand() {
  return 'node scripts/aios.mjs quality-gate full';
}

function getQualityGatePromoteCommand() {
  return 'node scripts/aios.mjs quality-gate pre-pr';
}

function getDoctorCommand() {
  return 'node scripts/aios.mjs doctor';
}

function getDispatchReplayCommand(sessionId) {
  return `node scripts/aios.mjs orchestrate --session ${sessionId} --dispatch local --execute dry-run --format json`;
}

function buildOrchestrateCommand(blueprint, taskTitle, contextSummary = '') {
  const args = ['node scripts/aios.mjs', 'orchestrate', blueprint, '--task', JSON.stringify(taskTitle)];
  if (String(contextSummary || '').trim()) {
    args.push('--context', JSON.stringify(String(contextSummary).trim()));
  }
  return args.join(' ');
}

function inferPromotionBlueprint(summary) {
  const context = [
    summary.session.goal,
    summary.session.project,
    ...summary.signals.failures.top.map((item) => item.category),
  ].join(' ').toLowerCase();

  if (/security|auth|login|permission|secret|token|privacy|compliance|audit|risk/.test(context)) {
    return 'security';
  }
  if (/refactor|cleanup|rename|restructure|simplify|dedupe|extract|tidy/.test(context)) {
    return 'refactor';
  }
  if (/bug|fix|issue|incident|error|regression|flaky|crash|repair|defect/.test(context)) {
    return 'bugfix';
  }
  return 'feature';
}

function buildPromotionContext(summary, blueprint) {
  return `learn-eval promotion candidate for ${blueprint}; passRate=${summary.signals.verification.passRate}; retries=${summary.signals.retry.average}`;
}

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

function buildHindsightDraftRecommendations(summary, recommendations = []) {
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

function createRecommendation({
  kind,
  targetType,
  targetId,
  title,
  reason,
  evidence,
  nextCommand,
  nextArtifact,
  draftAction,
  priority = 0,
}) {
  const targetDefinition = targetId ? getHarnessTarget(targetId) : null;
  const resolvedTitle = title || targetDefinition?.title || targetId;
  const resolvedNextCommand = nextCommand || targetDefinition?.nextCommand;
  return {
    kind,
    targetType,
    targetId,
    title: resolvedTitle,
    reason,
    evidence,
    priority: RECOMMENDATION_KIND_BASE_PRIORITY[kind] + Math.max(0, Math.floor(priority)),
    ...(resolvedNextCommand ? { nextCommand: resolvedNextCommand } : {}),
    ...(nextArtifact ? { nextArtifact } : {}),
    ...(draftAction && typeof draftAction === 'object' ? { draftAction: { ...draftAction } } : {}),
  };
}

const FAILURE_CATEGORY_ACTIONS = {
  auth: {
    targetType: 'gate',
    targetId: 'gate.auth-preflight',
    reason: 'Auth-related failures are recurring; add a reusable login/session-validity check before execution.',
    priority: 40,
  },
  timeout: {
    targetType: 'gate',
    targetId: 'gate.timeout-budget',
    reason: 'Timeouts are recurring; add wait-budget checks or split long actions before dispatch.',
    priority: 40,
  },
  network: {
    targetType: 'gate',
    targetId: 'gate.retry-backoff',
    reason: 'Network failures are recurring; standardize retry/backoff and transient-error handling.',
    priority: 40,
  },
  permission: {
    targetType: 'gate',
    targetId: 'gate.human-approval',
    reason: 'Permission-related failures suggest the workflow needs a clear human approval or access check.',
    priority: 40,
  },
  'rate-limit': {
    targetType: 'gate',
    targetId: 'gate.rate-limit-pacing',
    reason: 'Rate limits are recurring; add pacing and cooldown controls before retries.',
    priority: 40,
  },
  'quality-build': {
    targetType: 'gate',
    targetId: 'gate.quality-build',
    reason: 'Build failures are recurring inside the local quality gate; repair the build before dispatch.',
    priority: 40,
  },
  'quality-types': {
    targetType: 'gate',
    targetId: 'gate.quality-types',
    reason: 'Typecheck failures are recurring inside the local quality gate; fix type errors before dispatch.',
    priority: 40,
  },
  'quality-scripts': {
    targetType: 'gate',
    targetId: 'gate.quality-scripts',
    reason: 'Script test failures are recurring inside the local quality gate; stabilize script coverage before dispatch.',
    priority: 40,
  },
  'quality-contextdb': {
    targetType: 'gate',
    targetId: 'gate.quality-contextdb',
    reason: 'ContextDB regressions are recurring inside the local quality gate; repair context pack/index behavior before dispatch.',
    priority: 40,
  },
  'quality-logs': {
    targetType: 'gate',
    targetId: 'gate.quality-log-audit',
    reason: 'The local quality gate is failing on stdout log audit; remove accidental debug logs or tighten the allowlist for intentional CLI output.',
    priority: 40,
  },
  'quality-security': {
    targetType: 'gate',
    targetId: 'gate.quality-security',
    reason: 'Security config failures are recurring inside the local quality gate; repair the security checklist before dispatch.',
    priority: 40,
  },
  'quality-git': {
    targetType: 'gate',
    targetId: 'gate.quality-git',
    reason: 'Git state checks are failing inside the local quality gate; repair repository health before dispatch.',
    priority: 35,
  },
  'quality-multi': {
    targetType: 'gate',
    targetId: 'gate.quality-triage',
    reason: 'Multiple quality-gate checks are failing together; triage the failing checks before dispatch.',
    priority: 35,
  },
  tool: {
    targetType: 'runbook',
    targetId: 'runbook.tool-repair',
    reason: 'Generic tool failures are recurring; capture the recovery path in a reusable runbook.',
    priority: 40,
  },
  'merge-gate-blocked': {
    targetType: 'runbook',
    targetId: 'runbook.dispatch-merge-triage',
    reason: 'Dry-run orchestration is blocking at the merge gate; resolve ownership or blocked handoff issues before enabling a real runtime.',
    priority: 45,
  },
  default: {
    targetType: 'runbook',
    targetId: 'runbook.failure-triage',
    reason: 'Failures are recurring; document a short triage path before promoting the workflow.',
    priority: 40,
  },
};

function getSessionsRoot(rootDir) {
  return path.join(resolveContextDbRoot(rootDir, { preferLegacyExisting: true }), 'sessions');
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readJsonLines(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readJsonOptional(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function readJsonLinesOptional(filePath) {
  try {
    return await readJsonLines(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function parseDispatchArtifactPathFromEvidence(value) {
  const match = /artifact=([^;]+)/.exec(String(value || ''));
  const artifactPath = match ? match[1].trim() : null;
  return artifactPath && isDispatchArtifactPath(artifactPath) ? artifactPath : null;
}

function parseDispatchEventIdFromEvidence(value) {
  const match = /event=([^;]+)/.exec(String(value || ''));
  return match ? match[1].trim() : null;
}

function isDispatchArtifactPath(value) {
  return /(?:^|\/)artifacts\/dispatch-run-.*\.json$/i.test(String(value || '').trim());
}

async function collectDispatchEvidence(rootDir, sessionId, checkpoints = [], events = []) {
  const candidates = new Map();

  for (const checkpoint of checkpoints) {
    const artifactPath = (Array.isArray(checkpoint.artifacts) ? checkpoint.artifacts : []).find((item) => isDispatchArtifactPath(item))
      || parseDispatchArtifactPathFromEvidence(checkpoint.telemetry?.verification?.evidence);
    if (!artifactPath) continue;

    candidates.set(artifactPath, {
      artifactPath,
      checkpointSeq: checkpoint.seq,
      checkpointTs: checkpoint.ts,
      eventId: parseDispatchEventIdFromEvidence(checkpoint.telemetry?.verification?.evidence),
    });
  }

  for (const event of events) {
    if (event.kind !== ORCHESTRATION_DISPATCH_EVENT_KIND) continue;
    const artifactPath = (Array.isArray(event.refs) ? event.refs : []).find((item) => isDispatchArtifactPath(item));
    if (!artifactPath) continue;

    const existing = candidates.get(artifactPath) || {};
    candidates.set(artifactPath, {
      ...existing,
      artifactPath,
      eventId: existing.eventId || `${sessionId}#${event.seq}`,
      eventTs: event.ts,
      eventText: event.text,
    });
  }

  const records = [];
  const artifactCache = {};
  for (const candidate of candidates.values()) {
    const artifact = await readJsonOptional(path.join(rootDir, candidate.artifactPath));
    const dispatchRun = artifact?.dispatchRun;
    const jobRuns = Array.isArray(dispatchRun?.jobRuns) ? dispatchRun.jobRuns : [];
    const blockedJobs = jobRuns.filter((jobRun) => jobRun.status === 'blocked').length;
    const workItems = extractWorkItemEvidence(artifact);
    if (artifact && typeof artifact === 'object') {
      artifactCache[candidate.artifactPath] = artifact;
    }
    records.push({
      artifactPath: candidate.artifactPath,
      eventId: candidate.eventId || null,
      checkpointSeq: Number.isFinite(candidate.checkpointSeq) ? candidate.checkpointSeq : null,
      ts: String(artifact?.persistedAt || candidate.eventTs || candidate.checkpointTs || ''),
      ok: dispatchRun?.ok === true,
      blockedJobs,
      jobCount: jobRuns.length,
      executors: Array.isArray(dispatchRun?.executorRegistry) ? [...dispatchRun.executorRegistry] : [],
      finalOutputs: Array.isArray(dispatchRun?.finalOutputs) ? dispatchRun.finalOutputs.length : 0,
      workItems,
    });
  }

  records.sort((left, right) => String(right.ts || '').localeCompare(String(left.ts || '')));
  return { records, artifactCache };
}

function safeAverage(total, count) {
  return count > 0 ? total / count : 0;
}

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function createCountRecord(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function normalizeFailureCategory(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || undefined;
}

function formatCost(cost) {
  const parts = [];
  if (cost.inputTokens > 0) parts.push(`inputTokens=${cost.inputTokens}`);
  if (cost.outputTokens > 0) parts.push(`outputTokens=${cost.outputTokens}`);
  if (cost.totalTokens > 0) parts.push(`totalTokens=${cost.totalTokens}`);
  if (cost.usd > 0) parts.push(`usd=${formatNumber(cost.usd, 3)}`);
  return parts.length > 0 ? parts.join(' ') : '(none)';
}

function normalizeWorkItemStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'done' || normalized === 'completed' || normalized === 'simulated') return 'done';
  if (normalized === 'running') return 'running';
  if (normalized === 'blocked' || normalized === 'needs-input') return 'blocked';
  if (normalized === 'queued' || normalized === 'pending') return 'queued';
  return 'queued';
}

function extractWorkItemEvidence(artifact = null) {
  const items = Array.isArray(artifact?.workItemTelemetry?.items)
    ? artifact.workItemTelemetry.items
    : [];
  const byTypeCounts = new Map();
  const failureCounts = new Map();
  const retryCounts = new Map();
  let done = 0;
  let blocked = 0;

  for (const item of items) {
    const itemType = String(item?.itemType || 'unknown').trim() || 'unknown';
    const status = normalizeWorkItemStatus(item?.status);
    const byType = byTypeCounts.get(itemType) || { total: 0, blocked: 0 };
    byType.total += 1;
    if (status === 'blocked') {
      byType.blocked += 1;
      blocked += 1;
      const failureClass = String(item?.failureClass || 'none').trim();
      if (failureClass && failureClass !== 'none') {
        failureCounts.set(failureClass, (failureCounts.get(failureClass) || 0) + 1);
      }
    }
    if (status === 'done') {
      done += 1;
    }
    byTypeCounts.set(itemType, byType);

    const retryClass = String(item?.retryClass || 'none').trim();
    if (retryClass && retryClass !== 'none') {
      retryCounts.set(retryClass, (retryCounts.get(retryClass) || 0) + 1);
    }
  }

  return {
    total: items.length,
    blocked,
    done,
    byType: Array.from(byTypeCounts.entries()).map(([itemType, counts]) => ({
      itemType,
      total: counts.total,
      blocked: counts.blocked,
    })),
    failureCounts: Array.from(failureCounts.entries()).map(([failureClass, count]) => ({ failureClass, count })),
    retryCounts: Array.from(retryCounts.entries()).map(([retryClass, count]) => ({ retryClass, count })),
  };
}

function getEvidenceStrength(item) {
  const matches = String(item?.evidence || '').match(/-?\d+(?:\.\d+)?/g);
  return matches
    ? matches.reduce((total, value) => total + Number(value), 0)
    : 0;
}

function sortRecommendations(items) {
  return [...items].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }

    const evidenceDelta = getEvidenceStrength(right) - getEvidenceStrength(left);
    if (evidenceDelta !== 0) {
      return evidenceDelta;
    }

    const targetDelta = String(left.targetId || '').localeCompare(String(right.targetId || ''));
    if (targetDelta !== 0) {
      return targetDelta;
    }

    return left.title.localeCompare(right.title);
  });
}

function finalizeRecommendations(items) {
  const all = sortRecommendations(items);
  return {
    all,
    fix: all.filter((item) => item.kind === 'fix'),
    observe: all.filter((item) => item.kind === 'observe'),
    promote: all.filter((item) => item.kind === 'promote'),
  };
}

function formatRecommendations(items) {
  return items.length > 0
    ? items.map((item) => {
      const nextSteps = [];
      if (item.nextCommand) nextSteps.push(`Next: ${item.nextCommand}`);
      if (item.nextArtifact) nextSteps.push(`Artifact: ${item.nextArtifact}`);
      const suffix = nextSteps.length > 0 ? ` ${nextSteps.join(' ')}` : '';
      return `- [${item.targetId}] ${item.title}: ${item.reason} (${item.evidence})${suffix}`;
    }).join('\n')
    : '- (none)';
}

async function findLatestSessionMeta(rootDir) {
  const sessionsRoot = getSessionsRoot(rootDir);
  let entries = [];
  try {
    entries = await fs.readdir(sessionsRoot, { withFileTypes: true });
  } catch (error) {
    const code = error && typeof error === 'object' ? error.code : undefined;
    if (code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const metas = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(sessionsRoot, entry.name, 'meta.json');
    try {
      const meta = await readJson(metaPath);
      metas.push(meta);
    } catch {
      // ignore malformed sessions and keep scanning
    }
  }

  metas.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return metas[0] ?? null;
}

async function loadSessionArtifacts(rootDir, sessionId) {
  const sessionDir = path.join(getSessionsRoot(rootDir), sessionId);
  const metaPath = path.join(sessionDir, 'meta.json');
  const checkpointsPath = path.join(sessionDir, 'l1-checkpoints.jsonl');
  const eventsPath = path.join(sessionDir, 'l2-events.jsonl');
  const [meta, checkpoints, events] = await Promise.all([
    readJson(metaPath),
    readJsonLines(checkpointsPath),
    readJsonLinesOptional(eventsPath),
  ]);
  return { meta, checkpoints, events };
}

function buildRecommendations(summary) {
  const recommendations = [];

  if (summary.sample.analyzedCheckpoints === 0) {
    recommendations.push(createRecommendation({
      kind: 'observe',
      targetType: 'sample',
      targetId: 'sample.no-checkpoints',
      title: 'no checkpoints yet',
      reason: 'There are no checkpoints to evaluate for this session.',
      evidence: 'analyzed=0',
      priority: 50,
    }));
    return finalizeRecommendations(recommendations);
  }

  if (summary.sample.telemetryCheckpoints === 0) {
    recommendations.push(createRecommendation({
      kind: 'observe',
      targetType: 'sample',
      targetId: 'sample.telemetry-missing',
      title: 'telemetry missing',
      reason: 'Recent checkpoints have no structured telemetry yet.',
      evidence: `checkpoints=${summary.sample.analyzedCheckpoints} telemetry=0`,
      priority: 40,
    }));
    return finalizeRecommendations(recommendations);
  }

  if (summary.sample.telemetryCheckpoints < 3) {
    recommendations.push(createRecommendation({
      kind: 'observe',
      targetType: 'sample',
      targetId: 'sample.insufficient-sample',
      title: 'insufficient sample',
      reason: 'Keep collecting telemetry before promoting this workflow.',
      evidence: `telemetry=${summary.sample.telemetryCheckpoints}`,
      priority: 30,
    }));
  }

  if (summary.signals.verification.knownCount === 0 || summary.signals.verification.unknownRate >= 0.5) {
    recommendations.push(createRecommendation({
      kind: 'fix',
      targetType: 'gate',
      targetId: 'gate.verification-results',
      title: 'wire real verification results',
      reason: 'Most checkpoints are still unknown, so learn-eval cannot trust the outcome signal yet.',
      evidence: `unknown=${summary.signals.verification.counts.unknown}/${summary.sample.analyzedCheckpoints}`,
      nextCommand: getVerificationCommand(),
      priority: 50,
    }));
  }

  const dominantFailure = summary.signals.failures.top[0];
  if (dominantFailure && (summary.signals.verification.counts.failed > 0 || summary.status.counts.blocked > 0)) {
    if (dominantFailure.category === 'merge-gate-blocked') {
      recommendations.push(createRecommendation({
        kind: 'fix',
        targetType: 'runbook',
        targetId: 'runbook.dispatch-merge-triage',
        title: 'dispatch merge triage runbook',
        reason: 'Dry-run orchestration is blocking at the merge gate; resolve ownership or blocked handoff issues before enabling a real runtime.',
        evidence: `${dominantFailure.category}=${dominantFailure.count} blockedRuns=${summary.signals.dispatch.blockedRuns} blockedJobs=${summary.signals.dispatch.blockedJobs}`,
        nextCommand: getDispatchReplayCommand(summary.session.sessionId),
        nextArtifact: summary.signals.dispatch.latestArtifactPath || undefined,
        priority: 45,
      }));
    } else {
      const action = FAILURE_CATEGORY_ACTIONS[dominantFailure.category] ?? FAILURE_CATEGORY_ACTIONS.default;
      recommendations.push(createRecommendation({
        kind: 'fix',
        targetType: action.targetType,
        targetId: action.targetId,
        title: action.title,
        reason: action.reason,
        evidence: `${dominantFailure.category}=${dominantFailure.count}`,
        nextCommand: action.nextCommand,
        priority: action.priority,
      }));
    }
  } else if (summary.status.counts.blocked > 0) {
    recommendations.push(createRecommendation({
      kind: 'fix',
      targetType: 'gate',
      targetId: 'gate.blocked-triage',
      title: 'blocked-path triage gate',
      reason: 'Blocked checkpoints exist without a clear dominant failure category; add a preflight gate or runbook.',
      evidence: `blocked=${summary.status.counts.blocked}`,
      nextCommand: getQualityGateFixCommand(),
      priority: 30,
    }));
  }

  if (summary.signals.retry.average >= 2 || summary.signals.retry.max >= 3) {
    recommendations.push(createRecommendation({
      kind: 'fix',
      targetType: 'runbook',
      targetId: 'runbook.retry-budget-policy',
      title: 'retry budget policy',
      reason: 'Retries are trending high; add retry limits and a standard escalation path.',
      evidence: `avg=${summary.signals.retry.average} max=${summary.signals.retry.max}`,
      nextCommand: getDoctorCommand(),
      priority: 20,
    }));
  }

  const dispatchHindsight = summary.signals.dispatch.hindsight && typeof summary.signals.dispatch.hindsight === 'object'
    ? summary.signals.dispatch.hindsight
    : null;
  const dispatchHindsightPairs = Number.isFinite(dispatchHindsight?.pairsAnalyzed)
    ? Math.max(0, Math.floor(dispatchHindsight.pairsAnalyzed))
    : 0;
  const dispatchHindsightRegressions = Number.isFinite(dispatchHindsight?.regressions)
    ? Math.max(0, Math.floor(dispatchHindsight.regressions))
    : 0;
  const dispatchHindsightRepeatBlocked = Number.isFinite(dispatchHindsight?.repeatedBlockedTurns)
    ? Math.max(0, Math.floor(dispatchHindsight.repeatedBlockedTurns))
    : 0;

  if (dispatchHindsightPairs > 0 && (dispatchHindsightRegressions > 0 || dispatchHindsightRepeatBlocked > 0)) {
    const topRepeatedFailure = Array.isArray(dispatchHindsight?.topRepeatedFailureClasses)
      ? dispatchHindsight.topRepeatedFailureClasses[0]
      : null;
    const topFailureClass = String(topRepeatedFailure?.failureClass || '').trim() || '';
    const action = (dispatchHindsightRepeatBlocked > 0 && topFailureClass && DISPATCH_HINDSIGHT_FAILURE_ACTIONS[topFailureClass])
      ? DISPATCH_HINDSIGHT_FAILURE_ACTIONS[topFailureClass]
      : DISPATCH_HINDSIGHT_FAILURE_ACTIONS.default;
    const alreadyRecommended = recommendations.some((item) => item.kind === 'fix' && item.targetId === action.targetId);
    if (!alreadyRecommended) {
      const evidenceParts = [];
      evidenceParts.push(`pairs=${dispatchHindsightPairs}`);
      if (dispatchHindsightRepeatBlocked > 0) evidenceParts.push(`repeatBlocked=${dispatchHindsightRepeatBlocked}`);
      if (dispatchHindsightRegressions > 0) evidenceParts.push(`regressions=${dispatchHindsightRegressions}`);
      if (topFailureClass) evidenceParts.push(`topFailure=${topFailureClass}`);

      recommendations.push(createRecommendation({
        kind: 'fix',
        targetType: action.targetType,
        targetId: action.targetId,
        reason: action.reason,
        evidence: evidenceParts.join(' '),
        ...(action.targetType === 'runbook'
          ? { nextCommand: getDispatchReplayCommand(summary.session.sessionId) }
          : {}),
        nextArtifact: summary.signals.dispatch.latestArtifactPath || undefined,
        priority: action.priority,
      }));
    }
  }

  recommendations.push(...buildHindsightDraftRecommendations(summary, recommendations));

  if (
    summary.sample.telemetryCheckpoints >= 3
    && summary.signals.verification.knownCount >= 3
    && summary.signals.verification.passRate >= 0.8
    && summary.signals.verification.counts.failed === 0
    && summary.signals.verification.counts.partial === 0
    && summary.status.counts.blocked === 0
    && summary.signals.dispatch.blockedRuns === 0
    && summary.signals.retry.average <= 1
    && dispatchHindsightRegressions === 0
    && dispatchHindsightRepeatBlocked === 0
  ) {
    const blueprint = inferPromotionBlueprint(summary);
    recommendations.push(createRecommendation({
      kind: 'promote',
      targetType: 'blueprint',
      targetId: `blueprint.${blueprint}`,
      title: 'promote workflow blueprint',
      reason: 'This flow is stable enough to capture as a reusable subagent blueprint.',
      evidence: `passRate=${summary.signals.verification.passRate} retries=${summary.signals.retry.average}`,
      nextCommand: buildOrchestrateCommand(blueprint, summary.session.goal, buildPromotionContext(summary, blueprint)),
      priority: 20,
    }));
    recommendations.push(createRecommendation({
      kind: 'promote',
      targetType: 'checklist',
      targetId: 'checklist.verification-standard',
      title: 'promote verification checklist',
      reason: 'Verification is consistent enough to standardize into a reusable quality gate checklist.',
      evidence: `known=${summary.signals.verification.knownCount} passed=${summary.signals.verification.counts.passed}`,
      nextCommand: getQualityGatePromoteCommand(),
      priority: 10,
    }));
  }

  if (summary.signals.dispatch.runs > 0 && summary.signals.dispatch.blockedRuns === 0) {
    recommendations.push(createRecommendation({
      kind: 'observe',
      targetType: 'sample',
      targetId: 'sample.dispatch-evidence-present',
      title: 'dispatch evidence present',
      reason: 'Dry-run orchestration evidence is flowing into ContextDB; keep collecting runs before enabling a real runtime.',
      evidence: `runs=${summary.signals.dispatch.runs} executors=${summary.signals.dispatch.executorUsage.map((item) => `${item.executor}=${item.count}`).join(',') || 'none'}`,
      nextArtifact: summary.signals.dispatch.latestArtifactPath || undefined,
      priority: 15,
    }));
  }

  if (summary.signals.elapsed.average >= 120000 && summary.sample.telemetryCheckpoints >= 3) {
    recommendations.push(createRecommendation({
      kind: 'observe',
      targetType: 'sample',
      targetId: 'sample.latency-watch',
      title: 'slow-path watch',
      reason: 'The workflow is succeeding but remains slow; keep tracking elapsed time before tightening budgets.',
      evidence: `avgElapsedMs=${summary.signals.elapsed.average}`,
      priority: 20,
    }));
  }

  if (recommendations.length === 0) {
    recommendations.push(createRecommendation({
      kind: 'observe',
      targetType: 'sample',
      targetId: 'sample.no-strong-signal',
      title: 'no strong signal yet',
      reason: 'Current telemetry does not yet justify promotion or corrective action.',
      evidence: `telemetry=${summary.sample.telemetryCheckpoints}`,
      priority: 10,
    }));
  }

  return finalizeRecommendations(recommendations);
}

export async function buildLearnEvalReport(rawOptions = {}, { rootDir } = {}) {
  const sessionMeta = rawOptions.sessionId
    ? { sessionId: rawOptions.sessionId }
    : await findLatestSessionMeta(rootDir);

  if (!sessionMeta?.sessionId) {
    throw new Error(`No ContextDB sessions found under ${getSessionsRoot(rootDir)}`);
  }

  const { meta, checkpoints, events } = await loadSessionArtifacts(rootDir, sessionMeta.sessionId);
  const limit = Number.isFinite(rawOptions.limit) ? Math.max(1, Math.floor(rawOptions.limit)) : 10;
  const selected = checkpoints.slice(Math.max(0, checkpoints.length - limit));
  const dispatchEvidenceResult = await collectDispatchEvidence(rootDir, sessionMeta.sessionId, selected, events);
  const dispatchEvidence = Array.isArray(dispatchEvidenceResult?.records) ? dispatchEvidenceResult.records : [];
  const dispatchHindsight = await buildHindsightEval({
    rootDir,
    meta,
    dispatchEvidence,
    artifactCache: dispatchEvidenceResult?.artifactCache,
  });

  const statusCounts = createCountRecord(SESSION_STATUS_NAMES);
  const verificationCounts = createCountRecord(VERIFICATION_RESULT_NAMES);
  const failureCounts = new Map();
  const cost = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    usd: 0,
  };

  let telemetryCheckpoints = 0;
  let knownVerificationCount = 0;
  let retryTotal = 0;
  let retryMax = 0;
  let elapsedTotal = 0;
  let elapsedCount = 0;
  let elapsedMax = 0;

  for (const checkpoint of selected) {
    const status = SESSION_STATUS_NAMES.includes(checkpoint.status) ? checkpoint.status : 'running';
    statusCounts[status] += 1;

    const telemetry = checkpoint.telemetry;
    const verificationResult = VERIFICATION_RESULT_NAMES.includes(telemetry?.verification?.result)
      ? telemetry.verification.result
      : 'unknown';
    verificationCounts[verificationResult] += 1;

    if (!telemetry) {
      continue;
    }

    telemetryCheckpoints += 1;
    if (verificationResult !== 'unknown') {
      knownVerificationCount += 1;
    }

    const retryCount = Number.isFinite(telemetry.retryCount) ? Math.max(0, Math.floor(telemetry.retryCount)) : 0;
    retryTotal += retryCount;
    retryMax = Math.max(retryMax, retryCount);

    if (Number.isFinite(telemetry.elapsedMs) && telemetry.elapsedMs >= 0) {
      const elapsedMs = Math.floor(telemetry.elapsedMs);
      elapsedTotal += elapsedMs;
      elapsedCount += 1;
      elapsedMax = Math.max(elapsedMax, elapsedMs);
    }

    const failureCategory = normalizeFailureCategory(telemetry.failureCategory);
    if (failureCategory) {
      failureCounts.set(failureCategory, (failureCounts.get(failureCategory) ?? 0) + 1);
    }

    if (Number.isFinite(telemetry.cost?.inputTokens)) cost.inputTokens += Math.max(0, Math.floor(telemetry.cost.inputTokens));
    if (Number.isFinite(telemetry.cost?.outputTokens)) cost.outputTokens += Math.max(0, Math.floor(telemetry.cost.outputTokens));
    if (Number.isFinite(telemetry.cost?.totalTokens)) cost.totalTokens += Math.max(0, Math.floor(telemetry.cost.totalTokens));
    if (Number.isFinite(telemetry.cost?.usd)) cost.usd += Math.max(0, Number(telemetry.cost.usd));
  }

  if (cost.totalTokens === 0 && (cost.inputTokens > 0 || cost.outputTokens > 0)) {
    cost.totalTokens = cost.inputTokens + cost.outputTokens;
  }

  const failureTop = Array.from(failureCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));

  const verificationKnownDenominator = Math.max(knownVerificationCount, 1);
  const verificationSampleDenominator = Math.max(selected.length, 1);
  const dispatchExecutorCounts = new Map();
  const dispatchWorkItemTypeCounts = new Map();
  const dispatchWorkItemFailureCounts = new Map();
  const dispatchWorkItemRetryCounts = new Map();
  let dispatchBlockedJobs = 0;
  let dispatchWorkItemTotal = 0;
  let dispatchWorkItemBlocked = 0;
  let dispatchWorkItemDone = 0;

  for (const item of dispatchEvidence) {
    dispatchBlockedJobs += item.blockedJobs;
    for (const executor of item.executors) {
      dispatchExecutorCounts.set(executor, (dispatchExecutorCounts.get(executor) ?? 0) + 1);
    }

    const workItems = item.workItems && typeof item.workItems === 'object' ? item.workItems : {};
    dispatchWorkItemTotal += Number.isFinite(workItems.total) ? Math.max(0, Math.floor(workItems.total)) : 0;
    dispatchWorkItemBlocked += Number.isFinite(workItems.blocked) ? Math.max(0, Math.floor(workItems.blocked)) : 0;
    dispatchWorkItemDone += Number.isFinite(workItems.done) ? Math.max(0, Math.floor(workItems.done)) : 0;

    for (const typeRecord of Array.isArray(workItems.byType) ? workItems.byType : []) {
      const itemType = String(typeRecord?.itemType || '').trim();
      if (!itemType) continue;
      const existing = dispatchWorkItemTypeCounts.get(itemType) || { total: 0, blocked: 0 };
      existing.total += Number.isFinite(typeRecord?.total) ? Math.max(0, Math.floor(typeRecord.total)) : 0;
      existing.blocked += Number.isFinite(typeRecord?.blocked) ? Math.max(0, Math.floor(typeRecord.blocked)) : 0;
      dispatchWorkItemTypeCounts.set(itemType, existing);
    }

    for (const failureRecord of Array.isArray(workItems.failureCounts) ? workItems.failureCounts : []) {
      const failureClass = String(failureRecord?.failureClass || '').trim();
      if (!failureClass) continue;
      const count = Number.isFinite(failureRecord?.count) ? Math.max(0, Math.floor(failureRecord.count)) : 0;
      dispatchWorkItemFailureCounts.set(failureClass, (dispatchWorkItemFailureCounts.get(failureClass) || 0) + count);
    }

    for (const retryRecord of Array.isArray(workItems.retryCounts) ? workItems.retryCounts : []) {
      const retryClass = String(retryRecord?.retryClass || '').trim();
      if (!retryClass) continue;
      const count = Number.isFinite(retryRecord?.count) ? Math.max(0, Math.floor(retryRecord.count)) : 0;
      dispatchWorkItemRetryCounts.set(retryClass, (dispatchWorkItemRetryCounts.get(retryClass) || 0) + count);
    }
  }

  const dispatchWorkItemsByType = Array.from(dispatchWorkItemTypeCounts.entries())
    .map(([itemType, counts]) => ({
      itemType,
      total: counts.total,
      blocked: counts.blocked,
      blockedRate: formatNumber(counts.total > 0 ? counts.blocked / counts.total : 0, 2),
    }))
    .sort((left, right) => right.blockedRate - left.blockedRate || right.blocked - left.blocked || left.itemType.localeCompare(right.itemType));
  const dispatchWorkItemFailureTop = Array.from(dispatchWorkItemFailureCounts.entries())
    .map(([failureClass, count]) => ({ failureClass, count }))
    .sort((left, right) => right.count - left.count || left.failureClass.localeCompare(right.failureClass));
  const dispatchWorkItemRetrySummary = Array.from(dispatchWorkItemRetryCounts.entries())
    .map(([retryClass, count]) => ({ retryClass, count }))
    .sort((left, right) => right.count - left.count || left.retryClass.localeCompare(right.retryClass));

  const summary = {
    session: {
      sessionId: meta.sessionId,
      agent: meta.agent,
      project: meta.project,
      goal: meta.goal,
      updatedAt: meta.updatedAt,
    },
    sample: {
      totalCheckpoints: checkpoints.length,
      analyzedCheckpoints: selected.length,
      telemetryCheckpoints,
      limit,
    },
    status: {
      counts: statusCounts,
    },
    signals: {
      verification: {
        counts: verificationCounts,
        knownCount: knownVerificationCount,
        passRate: formatNumber(verificationCounts.passed / verificationKnownDenominator, 2),
        unknownRate: formatNumber(verificationCounts.unknown / verificationSampleDenominator, 2),
      },
      retry: {
        total: retryTotal,
        average: formatNumber(safeAverage(retryTotal, telemetryCheckpoints), 2),
        max: retryMax,
      },
      elapsed: {
        average: formatNumber(safeAverage(elapsedTotal, elapsedCount), 0),
        max: elapsedMax,
      },
      failures: {
        top: failureTop,
      },
      cost: {
        inputTokens: cost.inputTokens,
        outputTokens: cost.outputTokens,
        totalTokens: cost.totalTokens,
        usd: formatNumber(cost.usd, 4),
      },
      dispatch: {
        runs: dispatchEvidence.length,
        successfulRuns: dispatchEvidence.filter((item) => item.ok).length,
        blockedRuns: dispatchEvidence.filter((item) => item.ok === false).length,
        blockedJobs: dispatchBlockedJobs,
        hindsight: dispatchHindsight,
        executorUsage: Array.from(dispatchExecutorCounts.entries())
          .map(([executor, count]) => ({ executor, count }))
          .sort((left, right) => right.count - left.count || left.executor.localeCompare(right.executor)),
        workItems: {
          total: dispatchWorkItemTotal,
          blocked: dispatchWorkItemBlocked,
          done: dispatchWorkItemDone,
          blockedRate: formatNumber(dispatchWorkItemTotal > 0 ? dispatchWorkItemBlocked / dispatchWorkItemTotal : 0, 2),
          byType: dispatchWorkItemsByType,
          failureClasses: dispatchWorkItemFailureTop,
          retryClasses: dispatchWorkItemRetrySummary,
        },
        latestArtifactPath: dispatchEvidence[0]?.artifactPath || null,
        latestEventId: dispatchEvidence[0]?.eventId || null,
      },
    },
  };

  return {
    ...summary,
    recommendations: buildRecommendations(summary),
  };
}

export function renderLearnEvalReport(report) {
  const failureSummary = report.signals.failures.top.length > 0
    ? report.signals.failures.top.map((item) => `${item.category}=${item.count}`).join(', ')
    : '(none)';
  const dispatchExecutors = report.signals.dispatch.executorUsage.length > 0
    ? report.signals.dispatch.executorUsage.map((item) => `${item.executor}=${item.count}`).join(', ')
    : '(none)';
  const dispatchHindsight = report.signals.dispatch.hindsight && typeof report.signals.dispatch.hindsight === 'object'
    ? report.signals.dispatch.hindsight
    : null;
  const dispatchHindsightTopFailures = dispatchHindsight && Array.isArray(dispatchHindsight.topRepeatedFailureClasses) && dispatchHindsight.topRepeatedFailureClasses.length > 0
    ? dispatchHindsight.topRepeatedFailureClasses.map((item) => `${item.failureClass}=${item.count}`).join(', ')
    : '(none)';
  const dispatchHindsightLessons = dispatchHindsight && Array.isArray(dispatchHindsight.lessons)
    ? dispatchHindsight.lessons.slice(0, 3)
    : [];
  const dispatchHindsightLessonLines = dispatchHindsightLessons.map((lesson) => {
    const kind = String(lesson?.kind || '').trim() || 'unknown';
    const jobId = String(lesson?.jobId || '').trim() || 'unknown';
    const failureClass = String(lesson?.from?.failureClass || '').trim() || 'unknown';
    const workItems = Array.isArray(lesson?.workItemRefs) && lesson.workItemRefs.length > 0
      ? lesson.workItemRefs.join(',')
      : 'none';
    const hint = String(lesson?.hint || '').trim() || '(none)';
    return `- dispatch hindsight ${kind} jobId=${jobId} failure=${failureClass} wi=${workItems} hint=${hint}`;
  });
  const shouldRenderDispatchHindsight = dispatchHindsight
    && ((Number.isFinite(dispatchHindsight.pairsAnalyzed) ? dispatchHindsight.pairsAnalyzed : 0) > 0
      || dispatchHindsightLessonLines.length > 0);
  const dispatchWorkItems = report.signals.dispatch.workItems || {
    total: 0,
    blocked: 0,
    done: 0,
    blockedRate: 0,
    byType: [],
    failureClasses: [],
    retryClasses: [],
  };
  const dispatchWorkItemsByType = Array.isArray(dispatchWorkItems.byType) && dispatchWorkItems.byType.length > 0
    ? dispatchWorkItems.byType.map((item) => `${item.itemType}=${item.blocked}/${item.total}(${item.blockedRate})`).join(', ')
    : '(none)';
  const dispatchWorkItemFailures = Array.isArray(dispatchWorkItems.failureClasses) && dispatchWorkItems.failureClasses.length > 0
    ? dispatchWorkItems.failureClasses.map((item) => `${item.failureClass}=${item.count}`).join(', ')
    : '(none)';
  const dispatchWorkItemRetries = Array.isArray(dispatchWorkItems.retryClasses) && dispatchWorkItems.retryClasses.length > 0
    ? dispatchWorkItems.retryClasses.map((item) => `${item.retryClass}=${item.count}`).join(', ')
    : '(none)';

  const sections = RECOMMENDATION_KIND_ORDER.flatMap((kind) => [
    `${RECOMMENDATION_SECTION_LABELS[kind]}:`,
    formatRecommendations(report.recommendations[kind] || []),
    '',
  ]);

  return [
    'AIOS LEARN-EVAL',
    '---------------',
    `Session: ${report.session.sessionId}`,
    `Agent: ${report.session.agent}`,
    `Project: ${report.session.project}`,
    `Goal: ${report.session.goal}`,
    `Updated: ${report.session.updatedAt}`,
    '',
    'Sample:',
    `- analyzed=${report.sample.analyzedCheckpoints} total=${report.sample.totalCheckpoints} telemetry=${report.sample.telemetryCheckpoints} limit=${report.sample.limit}`,
    '',
    'Signals:',
    `- status running=${report.status.counts.running} blocked=${report.status.counts.blocked} done=${report.status.counts.done}`,
    `- verification passed=${report.signals.verification.counts.passed} failed=${report.signals.verification.counts.failed} partial=${report.signals.verification.counts.partial} unknown=${report.signals.verification.counts.unknown}`,
    `- passRate=${report.signals.verification.passRate} unknownRate=${report.signals.verification.unknownRate}`,
    `- retries avg=${report.signals.retry.average} total=${report.signals.retry.total} max=${report.signals.retry.max}`,
    `- elapsed avgMs=${report.signals.elapsed.average} maxMs=${report.signals.elapsed.max}`,
    `- failures ${failureSummary}`,
    `- cost ${formatCost(report.signals.cost)}`,
    `- dispatch runs=${report.signals.dispatch.runs} ok=${report.signals.dispatch.successfulRuns} blocked=${report.signals.dispatch.blockedRuns} blockedJobs=${report.signals.dispatch.blockedJobs} executors=${dispatchExecutors}`,
    `- dispatch workItems total=${dispatchWorkItems.total} blocked=${dispatchWorkItems.blocked} done=${dispatchWorkItems.done} blockedRate=${dispatchWorkItems.blockedRate} byType=${dispatchWorkItemsByType}`,
    `- dispatch workItemFailures ${dispatchWorkItemFailures}`,
    `- dispatch workItemRetries ${dispatchWorkItemRetries}`,
    ...(shouldRenderDispatchHindsight ? [
      `- dispatch hindsight pairs=${dispatchHindsight.pairsAnalyzed} comparedJobs=${dispatchHindsight.comparedJobs} resolved=${dispatchHindsight.resolvedBlockedTurns} repeatBlocked=${dispatchHindsight.repeatedBlockedTurns} regressions=${dispatchHindsight.regressions} lessons=${Array.isArray(dispatchHindsight.lessons) ? dispatchHindsight.lessons.length : 0}`,
      `- dispatch hindsight topRepeatedFailureClasses ${dispatchHindsightTopFailures}`,
      ...dispatchHindsightLessonLines,
    ] : []),
    ...(report.signals.dispatch.latestArtifactPath ? [`- dispatch latestArtifact=${report.signals.dispatch.latestArtifactPath}`] : []),
    '',
    ...sections,
  ].join('\n');
}
