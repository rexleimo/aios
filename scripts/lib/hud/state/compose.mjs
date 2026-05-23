import path from 'node:path';
import { buildHindsightEval } from '../../harness/hindsight-eval.mjs';
import { readSoloControl, readSoloRunSummary } from '../../harness/solo-journal.mjs';
import { buildTeamWatchdogState } from '../../lifecycle/watchdog.mjs';
import {
  collectRecentDispatchEvidence,
  collectRecentSkillCandidates,
  findLatestDispatchArtifact,
  findLatestSkillCandidateArtifact,
} from './artifacts.mjs';
import {
  buildDispatchFixHint,
  buildHarnessSuggestedCommands,
  buildSuggestedCommands,
  formatDispatchHindsightError,
} from './commands.mjs';
import {
  inferProviderFromAgent,
  normalizeProvider,
} from './providers.mjs';
import { getSessionsRoot, selectHudSessionId } from './sessions.mjs';
import {
  normalizeText,
  nowIso,
} from './shared.mjs';
import {
  readLastJsonLine,
  readLatestQualityGateEvent,
  safeReadJsonCached,
} from './io.mjs';

export async function readHudState({
  rootDir,
  sessionId = '',
  provider = '',
  fast = false,
  skillCandidateLimit = 0,
  watchdog = false,
  nowMs = null,
} = {}) {
  const selection = await selectHudSessionId({ rootDir, sessionId, provider });
  const generatedAt = nowIso();
  const fastMode = fast === true;
  const includeWatchdog = watchdog === true;
  const watchdogNowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const resolvedSkillCandidateLimit = Number.isFinite(skillCandidateLimit)
    ? Math.max(0, Math.floor(skillCandidateLimit))
    : 0;

  if (!selection.sessionId) {
    return {
      schemaVersion: 1,
      generatedAt,
      selection,
      session: null,
      sessionState: null,
      latestCheckpoint: null,
      latestDispatch: null,
      latestHarnessRun: null,
      harnessControl: null,
      harnessSuggestedCommands: [],
      latestSkillCandidate: null,
      recentSkillCandidates: [],
      latestQualityGate: null,
      suggestedCommands: [],
      warnings: ['No ContextDB sessions found in this repo.'],
      ...(includeWatchdog ? { watchdog: null } : {}),
    };
  }

  const sessionsRoot = getSessionsRoot(rootDir);
  const sessionDir = path.join(sessionsRoot, selection.sessionId);
  const metaPath = path.join(sessionDir, 'meta.json');
  const statePath = path.join(sessionDir, 'state.json');
  const checkpointPath = path.join(sessionDir, 'l1-checkpoints.jsonl');
  const eventsPath = path.join(sessionDir, 'l2-events.jsonl');

  let meta = null;
  let state = null;
  let checkpoint = null;
  let dispatch = null;
  let harnessRun = null;
  let harnessControl = null;
  let skillCandidate = null;
  let recentSkillCandidates = [];
  let qualityGateEvent = null;
  let dispatchEvidence = [];
  if (fastMode) {
    [meta, dispatch, harnessRun, harnessControl, skillCandidate, recentSkillCandidates, qualityGateEvent] = await Promise.all([
      safeReadJsonCached(metaPath),
      findLatestDispatchArtifact(rootDir, selection.sessionId),
      readSoloRunSummary({ rootDir, sessionId: selection.sessionId }),
      readSoloControl({ rootDir, sessionId: selection.sessionId }),
      findLatestSkillCandidateArtifact(rootDir, selection.sessionId),
      collectRecentSkillCandidates(rootDir, selection.sessionId, { limit: resolvedSkillCandidateLimit }),
      readLatestQualityGateEvent(eventsPath),
    ]);
  } else {
    [meta, state, checkpoint, dispatch, harnessRun, harnessControl, skillCandidate, recentSkillCandidates, qualityGateEvent, dispatchEvidence] = await Promise.all([
      safeReadJsonCached(metaPath),
      safeReadJsonCached(statePath),
      readLastJsonLine(checkpointPath),
      findLatestDispatchArtifact(rootDir, selection.sessionId),
      readSoloRunSummary({ rootDir, sessionId: selection.sessionId }),
      readSoloControl({ rootDir, sessionId: selection.sessionId }),
      findLatestSkillCandidateArtifact(rootDir, selection.sessionId),
      collectRecentSkillCandidates(rootDir, selection.sessionId, { limit: resolvedSkillCandidateLimit }),
      readLatestQualityGateEvent(eventsPath),
      collectRecentDispatchEvidence(rootDir, selection.sessionId),
    ]);
  }

  const agent = normalizeText(meta?.agent) || normalizeText(selection.agent);
  const providerInferred = selection.provider || inferProviderFromAgent(agent);
  const effectiveSelection = {
    ...selection,
    agent,
    provider: providerInferred,
  };

  const warnings = [];
  if (!meta) warnings.push('Session meta.json missing or unreadable.');
  if (!fastMode && !checkpoint) warnings.push('No checkpoints found for this session yet.');
  if (!dispatch && !harnessRun) warnings.push('No dispatch artifact found for this session yet.');

  const latestDispatch = dispatch
    ? {
      ...dispatch,
      provider: providerInferred,
    }
    : null;
  const watchdogState = includeWatchdog
    ? await buildTeamWatchdogState(
      { sessionId: effectiveSelection.sessionId, provider: providerInferred },
      { rootDir, nowMs: watchdogNowMs }
    )
    : null;

  if (fastMode) {
    return {
      schemaVersion: 1,
      generatedAt,
      selection: effectiveSelection,
      session: meta,
      sessionState: null,
      latestCheckpoint: null,
      latestDispatch,
      latestHarnessRun: harnessRun,
      harnessControl,
      harnessSuggestedCommands: buildHarnessSuggestedCommands({
        sessionId: effectiveSelection.sessionId,
        latestHarnessRun: harnessRun,
      }),
      latestSkillCandidate: skillCandidate,
      recentSkillCandidates,
      latestQualityGate: qualityGateEvent,
      dispatchHindsight: null,
      dispatchFixHint: null,
      suggestedCommands: [],
      warnings,
      ...(includeWatchdog ? { watchdog: watchdogState } : {}),
    };
  }

  const artifactCache = {};
  if (latestDispatch?.artifactPath && latestDispatch.raw && typeof latestDispatch.raw === 'object') {
    artifactCache[latestDispatch.artifactPath] = latestDispatch.raw;
  }

  let dispatchHindsight = null;
  try {
    dispatchHindsight = await buildHindsightEval({
      rootDir,
      meta,
      dispatchEvidence,
      artifactCache,
    });
  } catch (error) {
    warnings.push(`Dispatch hindsight eval failed: ${formatDispatchHindsightError(error)}`);
    dispatchHindsight = null;
  }

  const suggestedCommands = buildSuggestedCommands({
    sessionId: effectiveSelection.sessionId,
    provider: providerInferred,
    latestDispatch,
    latestSkillCandidate: skillCandidate,
    dispatchHindsight,
  });
  const harnessSuggestedCommands = buildHarnessSuggestedCommands({
    sessionId: effectiveSelection.sessionId,
    latestHarnessRun: harnessRun,
  });
  const dispatchFixHint = buildDispatchFixHint({
    sessionId: effectiveSelection.sessionId,
    dispatchHindsight,
    latestDispatchArtifactPath: latestDispatch?.artifactPath,
  });

  return {
    schemaVersion: 1,
    generatedAt,
    selection: effectiveSelection,
    session: meta,
    sessionState: state,
    latestCheckpoint: checkpoint,
    latestDispatch,
    latestHarnessRun: harnessRun,
    harnessControl,
    harnessSuggestedCommands,
    latestSkillCandidate: skillCandidate,
    recentSkillCandidates,
    latestQualityGate: qualityGateEvent,
    dispatchHindsight,
    dispatchFixHint,
    suggestedCommands,
    warnings,
    ...(includeWatchdog ? { watchdog: watchdogState } : {}),
  };
}

export async function readHudDispatchSummary({
  rootDir,
  sessionId = '',
  provider = '',
  meta = null,
  limit = 6,
  includeHindsight = true,
} = {}) {
  const normalizedSessionId = normalizeText(sessionId || meta?.sessionId);
  const warnings = [];
  if (!normalizedSessionId) {
    return {
      schemaVersion: 1,
      generatedAt: nowIso(),
      sessionId: null,
      provider: normalizeProvider(provider) || null,
      latestDispatch: null,
      latestSkillCandidate: null,
      latestQualityGate: null,
      dispatchHindsight: null,
      dispatchFixHint: null,
      warnings: ['Missing sessionId for dispatch summary.'],
    };
  }

  const sessionMeta = meta && typeof meta === 'object'
    ? meta
    : await safeReadJsonCached(path.join(getSessionsRoot(rootDir), normalizedSessionId, 'meta.json'));
  if (!sessionMeta) {
    warnings.push('Session meta.json missing or unreadable.');
  }

  const providerInferred = normalizeProvider(provider) || inferProviderFromAgent(sessionMeta?.agent || '');
  const eventsPath = path.join(getSessionsRoot(rootDir), normalizedSessionId, 'l2-events.jsonl');

  const [dispatch, latestSkillCandidate, latestQualityGate, dispatchEvidence] = await Promise.all([
    findLatestDispatchArtifact(rootDir, normalizedSessionId),
    findLatestSkillCandidateArtifact(rootDir, normalizedSessionId),
    readLatestQualityGateEvent(eventsPath),
    collectRecentDispatchEvidence(rootDir, normalizedSessionId, { limit }),
  ]);

  const latestDispatch = dispatch
    ? {
      ...dispatch,
      provider: providerInferred,
    }
    : null;

  let dispatchHindsight = null;
  if (includeHindsight) {
    const artifactCache = {};
    if (latestDispatch?.artifactPath && latestDispatch.raw && typeof latestDispatch.raw === 'object') {
      artifactCache[latestDispatch.artifactPath] = latestDispatch.raw;
    }

    try {
      dispatchHindsight = await buildHindsightEval({
        rootDir,
        meta: sessionMeta,
        dispatchEvidence,
        artifactCache,
      });
    } catch (error) {
      warnings.push(`Dispatch hindsight eval failed: ${formatDispatchHindsightError(error)}`);
      dispatchHindsight = null;
    }
  }

  const dispatchFixHint = buildDispatchFixHint({
    sessionId: normalizedSessionId,
    dispatchHindsight,
    latestDispatchArtifactPath: latestDispatch?.artifactPath,
  });

  return {
    schemaVersion: 1,
    generatedAt: nowIso(),
    sessionId: normalizedSessionId,
    provider: providerInferred || null,
    latestDispatch,
    latestSkillCandidate,
    latestQualityGate,
    dispatchHindsight,
    dispatchFixHint,
    warnings,
  };
}
