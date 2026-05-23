import { getHarnessTarget } from '../../harness/targets.mjs';
import {
  clipText,
  DISPATCH_HINDSIGHT_FIX_HINT_ACTIONS,
  normalizeStringArray,
  normalizeText,
  nowIso,
} from './shared.mjs';
import {
  inferProviderFromAgent,
  TEAM_PROVIDER_NAMES,
} from './providers.mjs';

export function formatErrorMessage(error) {
  if (!error) return '';
  if (error instanceof Error) return error.message || error.stack || String(error);
  return String(error);
}

export function buildDispatchFixHint({ sessionId, dispatchHindsight, latestDispatchArtifactPath }) {
  if (!dispatchHindsight || typeof dispatchHindsight !== 'object') return null;

  const pairsAnalyzed = Number.isFinite(dispatchHindsight.pairsAnalyzed) ? Math.max(0, Math.floor(dispatchHindsight.pairsAnalyzed)) : 0;
  if (pairsAnalyzed <= 0) return null;

  const regressions = Number.isFinite(dispatchHindsight.regressions) ? Math.max(0, Math.floor(dispatchHindsight.regressions)) : 0;
  const repeatBlockedTurns = Number.isFinite(dispatchHindsight.repeatedBlockedTurns) ? Math.max(0, Math.floor(dispatchHindsight.repeatedBlockedTurns)) : 0;
  if (regressions === 0 && repeatBlockedTurns === 0) return null;

  const topRepeatedFailure = repeatBlockedTurns > 0 && Array.isArray(dispatchHindsight.topRepeatedFailureClasses)
    ? dispatchHindsight.topRepeatedFailureClasses[0]
    : null;
  const topFailureClass = normalizeText(topRepeatedFailure?.failureClass);
  const targetId = normalizeText(
    (repeatBlockedTurns > 0 && topFailureClass && DISPATCH_HINDSIGHT_FIX_HINT_ACTIONS[topFailureClass])
      ? DISPATCH_HINDSIGHT_FIX_HINT_ACTIONS[topFailureClass]
      : DISPATCH_HINDSIGHT_FIX_HINT_ACTIONS.default
  );
  if (!targetId) return null;

  const target = getHarnessTarget(targetId);
  const evidenceParts = [];
  evidenceParts.push(`pairs=${pairsAnalyzed}`);
  if (repeatBlockedTurns > 0) evidenceParts.push(`repeatBlocked=${repeatBlockedTurns}`);
  if (regressions > 0) evidenceParts.push(`regressions=${regressions}`);
  if (topFailureClass) evidenceParts.push(`topFailure=${topFailureClass}`);

  return {
    schemaVersion: 1,
    generatedAt: nowIso(),
    sessionId: normalizeText(sessionId) || null,
    targetId,
    targetType: target?.targetType || null,
    title: target?.title || targetId,
    evidence: evidenceParts.join(' '),
    nextCommand: sessionId
      ? `node scripts/aios.mjs orchestrate --session ${normalizeText(sessionId)} --dispatch local --execute dry-run --format json`
      : target?.nextCommand || null,
    nextArtifact: normalizeText(latestDispatchArtifactPath) || null,
  };
}

export function buildSuggestedCommands({ sessionId, provider, latestDispatch, latestSkillCandidate = null, dispatchHindsight = null }) {
  const commands = [];
  if (!sessionId) return commands;

  commands.push(`node scripts/aios.mjs orchestrate --session ${sessionId} --dispatch local --execute dry-run`);
  commands.push(`node scripts/aios.mjs learn-eval --session ${sessionId}`);

  const regressions = Number.isFinite(dispatchHindsight?.regressions) ? Math.max(0, Math.floor(dispatchHindsight.regressions)) : 0;
  const repeatBlockedTurns = Number.isFinite(dispatchHindsight?.repeatedBlockedTurns) ? Math.max(0, Math.floor(dispatchHindsight.repeatedBlockedTurns)) : 0;
  if (regressions > 0 || repeatBlockedTurns > 0) {
    commands.push('node scripts/aios.mjs doctor');
  }

  const effectiveProvider = provider || inferProviderFromAgent(latestDispatch?.raw?.dispatchEvidence?.agent) || '';
  if (latestDispatch?.blockedJobs > 0 && TEAM_PROVIDER_NAMES.has(effectiveProvider)) {
    commands.push(
      `node scripts/aios.mjs team --resume ${sessionId} --retry-blocked --provider ${effectiveProvider} --workers 2 --dry-run`
    );
  }

  const candidate = latestSkillCandidate && typeof latestSkillCandidate === 'object'
    ? latestSkillCandidate
    : null;
  const draftTargetId = normalizeText(candidate?.sourceDraftTargetId);
  if (draftTargetId) {
    commands.push(
      `node scripts/aios.mjs learn-eval --session ${sessionId} --apply-draft ${draftTargetId} --apply-dry-run`
    );
  }

  return normalizeStringArray(commands);
}

export function buildHarnessSuggestedCommands({ sessionId, latestHarnessRun = null } = {}) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId || !latestHarnessRun || typeof latestHarnessRun !== 'object') {
    return [];
  }

  const commands = [
    `node scripts/aios.mjs harness status --session ${normalizedSessionId} --json`,
  ];
  if (normalizeText(latestHarnessRun.status) !== 'done') {
    commands.push(`node scripts/aios.mjs harness resume --session ${normalizedSessionId}`);
    commands.push(`node scripts/aios.mjs harness stop --session ${normalizedSessionId}`);
  }
  return normalizeStringArray(commands);
}

export function formatDispatchHindsightError(error) {
  return clipText(formatErrorMessage(error), 160);
}
