import { promises as fs } from 'node:fs';
import path from 'node:path';
import { contextDbRelativePath, resolveContextDbRoot } from '../aios/state-root.mjs';

import { runContextDbCli } from '../contextdb-cli.mjs';

export const LEARN_EVAL_HINDSIGHT_EVENT_KIND = 'orchestration.hindsight-eval';

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeStringArray(raw = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const results = [];
  for (const item of raw) {
    const text = normalizeText(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    results.push(text);
  }
  return results;
}

function formatRefsCsv(refs = []) {
  return normalizeStringArray(refs).join(',');
}

function parseNonNegativeInteger(value, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function extractDispatchStamp(artifactPath = '') {
  const match = /dispatch-run-([^/]+)\.json$/i.exec(normalizeText(artifactPath).replace(/\\/g, '/'));
  return match ? normalizeText(match[1]) : '';
}

function sanitizeStamp(value = '') {
  const text = normalizeText(value);
  return text.replace(/[^a-zA-Z0-9._:-]/g, '') || nowIso().replace(/[^a-zA-Z0-9]/g, '');
}

function getLatestDispatchArtifactPath(report = {}) {
  const latest = normalizeText(report?.signals?.dispatch?.latestArtifactPath);
  if (latest) return latest;
  const artifacts = Array.isArray(report?.signals?.dispatch?.hindsight?.artifacts)
    ? report.signals.dispatch.hindsight.artifacts
    : [];
  return normalizeText(artifacts[0]?.artifactPath);
}

function getHindsightOutcome(hindsight = {}) {
  const repeatedBlockedTurns = parseNonNegativeInteger(hindsight.repeatedBlockedTurns);
  const regressions = parseNonNegativeInteger(hindsight.regressions);
  const pairsAnalyzed = parseNonNegativeInteger(hindsight.pairsAnalyzed);
  if (repeatedBlockedTurns > 0 || regressions > 0) return 'correction';
  if (pairsAnalyzed > 0) return 'success';
  return 'unknown';
}

function collectLessonWorkItemRefs(hindsight = {}, limit = 12) {
  const lessons = Array.isArray(hindsight.lessons) ? hindsight.lessons : [];
  const refs = [];
  for (const lesson of lessons) {
    const lessonRefs = Array.isArray(lesson?.workItemRefs) ? lesson.workItemRefs : [];
    for (const item of lessonRefs) {
      refs.push(item);
      if (refs.length >= limit) return normalizeStringArray(refs);
    }
  }
  return normalizeStringArray(refs);
}

function collectNextStateRefs(report = {}, limit = 8) {
  const refs = [];
  const recommendations = report?.recommendations?.all;
  if (Array.isArray(recommendations)) {
    for (const item of recommendations) {
      const targetId = normalizeText(item?.targetId);
      if (!targetId) continue;
      refs.push(`target:${targetId}`);
      if (refs.length >= limit) break;
    }
  }
  return normalizeStringArray(refs);
}

function collectEventRefs(report = {}, summaryRef = '') {
  const hindsight = report?.signals?.dispatch?.hindsight;
  const artifactRefs = Array.isArray(hindsight?.artifacts)
    ? hindsight.artifacts
      .map((item) => normalizeText(item?.artifactPath))
      .filter(Boolean)
      .slice(0, 4)
    : [];
  return normalizeStringArray([
    'env:learn-eval',
    summaryRef,
    getLatestDispatchArtifactPath(report),
    ...artifactRefs,
  ]);
}

function buildEventText(report = {}, hindsight = {}) {
  const pairsAnalyzed = parseNonNegativeInteger(hindsight.pairsAnalyzed);
  const comparedJobs = parseNonNegativeInteger(hindsight.comparedJobs);
  const resolvedBlockedTurns = parseNonNegativeInteger(hindsight.resolvedBlockedTurns);
  const repeatedBlockedTurns = parseNonNegativeInteger(hindsight.repeatedBlockedTurns);
  const regressions = parseNonNegativeInteger(hindsight.regressions);
  const lessonCount = Array.isArray(hindsight.lessons) ? hindsight.lessons.length : 0;
  const topFailure = Array.isArray(hindsight.topRepeatedFailureClasses) ? hindsight.topRepeatedFailureClasses[0] : null;
  const topFailureLabel = normalizeText(topFailure?.failureClass)
    ? ` topFailure=${normalizeText(topFailure.failureClass)}`
    : '';

  return `dispatch hindsight evaluated: session=${normalizeText(report?.session?.sessionId)} pairs=${pairsAnalyzed} comparedJobs=${comparedJobs} resolved=${resolvedBlockedTurns} repeatBlocked=${repeatedBlockedTurns} regressions=${regressions} lessons=${lessonCount}${topFailureLabel}`;
}

async function readLastJsonLine(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return null;
    return JSON.parse(lines[lines.length - 1]);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function ensureSessionStateForEventAppend(rootDir, sessionId) {
  const sessionDir = path.join(resolveContextDbRoot(rootDir, { preferLegacyExisting: true }), 'sessions', sessionId);
  const eventsPath = path.join(sessionDir, 'l2-events.jsonl');
  const checkpointsPath = path.join(sessionDir, 'l1-checkpoints.jsonl');
  const statePath = path.join(sessionDir, 'state.json');

  await fs.mkdir(sessionDir, { recursive: true });
  try {
    await fs.access(eventsPath);
  } catch {
    await fs.writeFile(eventsPath, '', 'utf8');
  }

  try {
    await fs.access(statePath);
    return;
  } catch {
    // Create a minimal compatible state file when tests or legacy fixtures omit it.
  }

  const lastEvent = await readLastJsonLine(eventsPath);
  const lastCheckpoint = await readLastJsonLine(checkpointsPath);
  const state = {
    lastEventSeq: parseNonNegativeInteger(lastEvent?.seq),
    lastEventAt: normalizeText(lastEvent?.ts),
    lastCheckpointSeq: parseNonNegativeInteger(lastCheckpoint?.seq),
    lastCheckpointAt: normalizeText(lastCheckpoint?.ts),
    updatedAt: nowIso(),
  };
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function getExistingHindsightEventId(searchPayload = {}) {
  const results = Array.isArray(searchPayload?.results) ? searchPayload.results : [];
  const first = results[0];
  return normalizeText(first?.eventId);
}

export async function persistLearnEvalHindsightEvidence({
  rootDir,
  report,
} = {}) {
  const sessionId = normalizeText(report?.session?.sessionId);
  const hindsight = report?.signals?.dispatch?.hindsight;
  if (!sessionId) {
    return { persisted: false, reason: 'session-required' };
  }
  if (!hindsight || typeof hindsight !== 'object') {
    return { persisted: false, reason: 'hindsight-missing' };
  }

  const pairsAnalyzed = parseNonNegativeInteger(hindsight.pairsAnalyzed);
  if (pairsAnalyzed === 0) {
    return { persisted: false, reason: 'hindsight-empty' };
  }

  const latestArtifactPath = getLatestDispatchArtifactPath(report);
  const stamp = sanitizeStamp(extractDispatchStamp(latestArtifactPath) || hindsight.generatedAt);
  const summaryRef = `hindsight-summary:${stamp}`;
  try {
    const existing = runContextDbCli([
      'search',
      '--workspace',
      rootDir,
      '--session',
      sessionId,
      '--scope',
      'events',
      '--refs',
      summaryRef,
      '--limit',
      '1',
    ]);
    const existingEventId = getExistingHindsightEventId(existing);
    if (existingEventId) {
      return {
        persisted: false,
        reason: 'already-recorded',
        mode: 'contextdb',
        eventId: existingEventId,
        summaryRef,
      };
    }
  } catch {
    // Best-effort duplicate check; continue to append if search is unavailable.
  }

  try {
    await ensureSessionStateForEventAppend(rootDir, sessionId);
    const turnId = `hindsight:${stamp}:summary`;
    const parentTurnId = extractDispatchStamp(latestArtifactPath)
      ? `dispatch:${extractDispatchStamp(latestArtifactPath)}:summary`
      : '';
    const workItemRefs = collectLessonWorkItemRefs(hindsight);
    const nextStateRefs = collectNextStateRefs(report);
    const eventArgs = [
      'event:add',
      '--workspace',
      rootDir,
      '--session',
      sessionId,
      '--role',
      'assistant',
      '--kind',
      LEARN_EVAL_HINDSIGHT_EVENT_KIND,
      '--text',
      buildEventText(report, hindsight),
      '--turn-id',
      turnId,
      '--turn-type',
      'verification',
      '--environment',
      'learn-eval',
      '--hindsight-status',
      'evaluated',
      '--outcome',
      getHindsightOutcome(hindsight),
      '--refs',
      formatRefsCsv(collectEventRefs(report, summaryRef)),
    ];
    if (parentTurnId) {
      eventArgs.push('--parent-turn-id', parentTurnId);
    }
    if (workItemRefs.length > 0) {
      eventArgs.push('--work-item-refs', workItemRefs.join(','));
    }
    if (nextStateRefs.length > 0) {
      eventArgs.push('--next-state-refs', nextStateRefs.join(','));
    }

    const event = runContextDbCli(eventArgs);
    return {
      persisted: true,
      mode: 'contextdb',
      eventKind: LEARN_EVAL_HINDSIGHT_EVENT_KIND,
      eventId: `${sessionId}#${event.seq}`,
      turnId,
      parentTurnId: parentTurnId || null,
      summaryRef,
      artifactPath: latestArtifactPath || null,
    };
  } catch (error) {
    return {
      persisted: false,
      mode: 'contextdb',
      reason: 'append-failed',
      summaryRef,
      artifactPath: latestArtifactPath || null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
