import { appendSoloIteration, writeSoloRunSummary } from '../solo-journal.mjs';
import { writeContinuitySummary } from '../../contextdb/continuity.mjs';
import { resolveSoloBackoffState } from './backoff.mjs';
import {
  normalizeSoloIterationOutcome,
  normalizeStringArray,
  normalizeText,
  summarizeIterationForContinuity,
} from './normalizers.mjs';
import { buildCheckpointLogEntry, writeSoloIterationCheckpoint } from './checkpoint.mjs';

function deriveRunStatus(outcome = {}) {
  const normalizedOutcome = normalizeText(outcome.outcome);
  const failureClass = normalizeText(outcome.failureClass);
  if (normalizedOutcome === 'infra-retry') return 'backoff';
  if (normalizedOutcome === 'human-gate' || failureClass === 'ownership-gate' || failureClass === 'safety-gate') {
    return 'human-gate';
  }
  if (normalizedOutcome === 'stopped') return 'stopped';
  if (normalizedOutcome === 'failed') return 'failed';
  if (normalizedOutcome === 'blocked') return outcome.shouldStop === true ? 'blocked' : 'running';
  if (outcome.shouldStop === true) return 'done';
  return 'running';
}

export function buildStopOutcome({ sessionId, iteration } = {}) {
  return normalizeSoloIterationOutcome({
    sessionId,
    iteration,
    outcome: 'stopped',
    summary: 'Stop requested by operator.',
    stage: 'handoff',
    evidence: ['operator stop requested'],
    keyChanges: [],
    keyLearnings: [],
    nextAction: 'Inspect harness status and resume when ready.',
    shouldStop: true,
    failureClass: 'stop-requested',
  });
}

function buildLogEntries({ prompt = '', rawOutput = '', extra = [] } = {}) {
  const entries = [];
  if (normalizeText(prompt)) {
    entries.push({
      ts: new Date().toISOString(),
      kind: 'prompt',
      text: String(prompt),
    });
  }
  if (normalizeText(rawOutput)) {
    entries.push({
      ts: new Date().toISOString(),
      kind: 'response',
      text: String(rawOutput),
    });
  }
  if (Array.isArray(extra)) {
    for (const item of extra) {
      if (item && typeof item === 'object') {
        entries.push(item);
      }
    }
  }
  return entries;
}

export async function persistIterationState({
  rootDir,
  sessionId,
  summary,
  outcome,
  prompt = '',
  rawOutput = '',
  extraLogEntries = [],
  checkpointWriter = writeSoloIterationCheckpoint,
} = {}) {
  const checkpointResult = typeof checkpointWriter === 'function'
    ? await checkpointWriter({ rootDir, sessionId, summary, outcome })
    : { persisted: false, reason: 'checkpoint-writer-disabled' };
  await appendSoloIteration({
    rootDir,
    sessionId,
    iteration: outcome.iteration,
    outcome,
    logEntries: buildLogEntries({
      prompt,
      rawOutput,
      extra: [...extraLogEntries, buildCheckpointLogEntry(checkpointResult, outcome)],
    }),
  });

  const continuity = summarizeIterationForContinuity(outcome);
  await writeContinuitySummary({
    workspaceRoot: rootDir,
    sessionId,
    intent: summary.objective,
    summary: continuity.summary,
    touchedFiles: continuity.touchedFiles,
    nextActions: continuity.nextActions,
  });

  const nextBackoff = resolveSoloBackoffState({
    previous: summary.backoff,
    outcome,
    nowIso: outcome.createdAt,
  });
  const nextStatus = deriveRunStatus(outcome);

  return await writeSoloRunSummary({
    rootDir,
    ...summary,
    status: nextStatus,
    iterationCount: outcome.iteration,
    lastIteration: outcome.iteration,
    lastOutcome: outcome.outcome,
    lastFailureClass: outcome.failureClass,
    lastStage: outcome.stage,
    latestEvidence: outcome.evidence,
    stopRequested: false,
    backoff: nextBackoff,
    updatedAt: outcome.createdAt,
  });
}
