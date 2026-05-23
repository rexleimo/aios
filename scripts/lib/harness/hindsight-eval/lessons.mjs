import { resolveClientTeamProviders } from '../../clients/registry.mjs';
import { clipText, normalizeStringArray, normalizeText } from './shared.mjs';

const TEAM_PROVIDER_NAMES = new Set(resolveClientTeamProviders('all'));

function buildLessonHint({ kind, failureClass, fromError }) {
  const error = normalizeText(fromError);
  if (kind === 'regression') {
    return 'Regression detected (done -> blocked). Check recent changes or environment drift before continuing parallel execution.';
  }
  if (kind !== 'repeat-blocked') {
    return '';
  }
  if (failureClass === 'ownership-policy') {
    return 'Repeated file policy/ownership blockage. Check phase canEditFiles + ownedPathPrefixes and ensure touched files are within allowed prefixes.';
  }
  if (failureClass === 'contract') {
    return 'Repeated handoff contract blockage. Ensure the subagent outputs a single JSON object conforming to agent-handoff.schema.json (no surrounding text).';
  }
  if (failureClass === 'timeout') {
    return 'Repeated timeout blockage. Split the work-item, reduce scope, or add a timeout budget gate before retries.';
  }
  if (failureClass === 'dependency-blocked') {
    return 'Blocked by dependency. Ensure upstream jobs ran successfully and that retry scope includes required dependencies.';
  }
  if (error) {
    return `Repeated blockage: ${clipText(error, 160)}`;
  }
  return 'Repeated blockage detected. Inspect the dispatch artifact and stabilize the failing job before retrying.';
}

function buildSuggestedCommands({ sessionId, provider, kind } = {}) {
  const commands = [];
  const id = normalizeText(sessionId);
  if (!id) return commands;
  commands.push(`node scripts/aios.mjs hud --session ${id} --preset full`);
  commands.push(`node scripts/aios.mjs orchestrate --session ${id} --dispatch local --execute dry-run --format json`);

  const effectiveProvider = normalizeText(provider);
  if ((kind === 'repeat-blocked' || kind === 'regression') && TEAM_PROVIDER_NAMES.has(effectiveProvider)) {
    commands.push(`node scripts/aios.mjs team --resume ${id} --retry-blocked --provider ${effectiveProvider} --workers 2 --dry-run`);
  }

  return commands;
}

export function buildPairTransitions(fromRecord, toRecord) {
  const comparedJobIds = [];
  const transitions = [];

  for (const [jobId, fromTurn] of fromRecord.byJobId.entries()) {
    const toTurn = toRecord.byJobId.get(jobId);
    if (!toTurn) continue;

    comparedJobIds.push(jobId);
    const fromStatus = fromTurn.normalizedStatus;
    const toStatus = toTurn.normalizedStatus;
    if (fromStatus === 'blocked' && toStatus === 'done') {
      transitions.push({ kind: 'resolved', fromTurn, toTurn });
      continue;
    }
    if (fromStatus === 'blocked' && toStatus === 'blocked') {
      transitions.push({ kind: 'repeat-blocked', fromTurn, toTurn });
      continue;
    }
    if (fromStatus === 'done' && toStatus === 'blocked') {
      transitions.push({ kind: 'regression', fromTurn, toTurn });
      continue;
    }
  }

  return {
    fromArtifactPath: fromRecord.artifactPath,
    toArtifactPath: toRecord.artifactPath,
    comparedJobs: comparedJobIds.length,
    transitions,
  };
}

export function accumulateCounts(summary, transitions = []) {
  for (const transition of transitions) {
    if (transition.kind === 'resolved') summary.resolvedBlockedTurns += 1;
    if (transition.kind === 'repeat-blocked') summary.repeatedBlockedTurns += 1;
    if (transition.kind === 'regression') summary.regressions += 1;
  }
}

export function distillLessons({ pairs = [], sessionId = '', provider = '' } = {}) {
  const lessons = [];
  for (const pair of pairs) {
    for (const transition of pair.transitions) {
      if (transition.kind !== 'repeat-blocked' && transition.kind !== 'regression') continue;
      const fromTurn = transition.fromTurn;
      const toTurn = transition.toTurn;
      const kind = transition.kind;
      lessons.push({
        schemaVersion: 1,
        kind,
        jobId: fromTurn.jobId,
        role: fromTurn.role,
        jobType: fromTurn.jobType,
        workItemRefs: normalizeStringArray(fromTurn.workItemRefs.length > 0 ? fromTurn.workItemRefs : toTurn.workItemRefs),
        from: {
          artifactPath: pair.fromArtifactPath,
          turnId: fromTurn.turnId,
          status: fromTurn.normalizedStatus,
          attempts: fromTurn.attempts,
          failureClass: fromTurn.failureClass,
          retryClass: fromTurn.retryClass,
          error: fromTurn.error,
        },
        to: {
          artifactPath: pair.toArtifactPath,
          turnId: toTurn.turnId,
          status: toTurn.normalizedStatus,
          attempts: toTurn.attempts,
          failureClass: toTurn.failureClass,
          retryClass: toTurn.retryClass,
          error: toTurn.error,
        },
        hint: buildLessonHint({ kind, failureClass: fromTurn.failureClass, fromError: fromTurn.error }),
        suggestedCommands: buildSuggestedCommands({ sessionId, provider, kind }),
      });
    }
  }
  return lessons;
}