import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolveContextDbRoot } from '../../aios/state-root.mjs';
import { runContextDbCli } from '../../contextdb-cli.mjs';
import { normalizeStringArray, normalizeText } from './normalizers.mjs';

function sessionMetaPath(rootDir, sessionId) {
  return path.join(resolveContextDbRoot(rootDir, { preferLegacyExisting: true }), 'sessions', sessionId, 'meta.json');
}

function mapOutcomeToVerificationResult(outcome = {}) {
  const normalizedOutcome = normalizeText(outcome.outcome);
  if (normalizedOutcome === 'success' || normalizedOutcome === 'noop') return 'passed';
  if (normalizedOutcome === 'failed' || normalizedOutcome === 'infra-retry') return 'failed';
  if (normalizedOutcome === 'blocked' || normalizedOutcome === 'human-gate' || normalizedOutcome === 'stopped') return 'partial';
  return 'unknown';
}

function buildCheckpointEvidence(outcome = {}) {
  const evidence = normalizeStringArray(outcome.evidence);
  const suffix = evidence.length > 0 ? ` evidence=${evidence.join('; ')}` : '';
  return `stage=${normalizeText(outcome.stage, 'development')} outcome=${normalizeText(outcome.outcome, 'unknown')}${suffix}`;
}

function buildCheckpointArtifacts(outcome = {}) {
  return normalizeStringArray([
    ...normalizeStringArray(outcome.evidence),
    ...normalizeStringArray(outcome.keyChanges),
  ]);
}

export function buildCheckpointLogEntry(result = {}, outcome = {}) {
  return {
    ts: new Date().toISOString(),
    kind: 'checkpoint',
    stage: normalizeText(outcome.stage, 'development'),
    status: result.persisted === true ? 'persisted' : 'skipped',
    checkpointId: normalizeText(result.checkpointId),
    reason: normalizeText(result.reason || result.error),
  };
}

export async function writeSoloIterationCheckpoint({ rootDir, sessionId, summary = {}, outcome = {} } = {}) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) {
    return { persisted: false, reason: 'missing-session-id' };
  }
  if (!existsSync(sessionMetaPath(rootDir, normalizedSessionId))) {
    return { persisted: false, reason: 'missing-session-meta' };
  }

  const args = [
    'checkpoint',
    '--workspace',
    rootDir,
    '--session',
    normalizedSessionId,
    '--summary',
    `[${normalizeText(outcome.stage, 'development')}] ${normalizeText(outcome.summary, 'No summary recorded.')}`,
    '--status',
    normalizeText(outcome.checkpointStatus, 'running'),
    '--verify-result',
    mapOutcomeToVerificationResult(outcome),
    '--verify-evidence',
    buildCheckpointEvidence(outcome),
  ];
  if (normalizeText(outcome.nextAction)) {
    args.push('--next', outcome.nextAction);
  }
  const artifacts = buildCheckpointArtifacts(outcome);
  if (artifacts.length > 0) {
    args.push('--artifacts', artifacts.join('|'));
  }
  if (normalizeText(outcome.failureClass, 'none') !== 'none') {
    args.push('--failure-category', outcome.failureClass);
  }

  try {
    const checkpoint = runContextDbCli(args, { cwd: rootDir });
    return {
      persisted: true,
      checkpointId: `${normalizedSessionId}#C${checkpoint.seq}`,
      checkpoint,
    };
  } catch (error) {
    return {
      persisted: false,
      reason: 'checkpoint-write-failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
