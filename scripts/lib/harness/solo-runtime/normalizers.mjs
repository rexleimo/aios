import {
  SOLO_FAILURE_CLASSES,
  SOLO_OUTCOMES,
  SOLO_STAGES,
} from './constants.mjs';

// 纯函数：统一 solo harness 文本归一化，并保留兜底值。
export function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

// 纯函数：规整字符串数组，供 evidence/keyChanges 等字段复用。
export function normalizeStringArray(value) {
  const raw = Array.isArray(value) ? value : [];
  return Array.from(new Set(raw.map((item) => String(item ?? '').trim()).filter(Boolean)));
}

function normalizeStage(value) {
  const normalized = normalizeText(value).toLowerCase();
  return SOLO_STAGES.has(normalized) ? normalized : 'development';
}

function deriveEvidence(input = {}) {
  const explicit = normalizeStringArray(input.evidence);
  if (explicit.length > 0) return explicit;

  const keyChanges = normalizeStringArray(input.keyChanges).map((item) => `changed: ${item}`);
  if (keyChanges.length > 0) return keyChanges;

  const nextAction = normalizeText(input.nextAction);
  if (nextAction) return [`next: ${nextAction}`];

  const summary = normalizeText(input.summary);
  if (summary) return [`summary: ${summary}`];

  return [`outcome: ${normalizeText(input.outcome, 'unknown')}`];
}

function inferFailureClass(input = {}) {
  const normalized = normalizeText(input.failureClass);
  if (SOLO_FAILURE_CLASSES.has(normalized)) {
    return normalized;
  }

  const outcome = normalizeText(input.outcome, 'failed');
  if (outcome === 'success' || outcome === 'noop') return 'none';
  if (outcome === 'blocked') return 'no-progress';
  if (outcome === 'infra-retry') return 'runtime-error';
  if (outcome === 'human-gate') return 'safety-gate';
  if (outcome === 'stopped') return 'stop-requested';
  return 'runtime-error';
}

function inferBackoffAction(outcome = '', failureClass = '') {
  const normalizedOutcome = normalizeText(outcome);
  const normalizedFailure = normalizeText(failureClass);
  if (normalizedOutcome === 'infra-retry' && (normalizedFailure === 'runtime-error' || normalizedFailure === 'tool-error')) {
    return 'retry-with-backoff';
  }
  if (normalizedOutcome === 'human-gate') return 'human-gate';
  if (normalizedOutcome === 'blocked') return 'shrink-scope';
  return 'none';
}

function inferCheckpointStatus(outcome = '', shouldStop = false) {
  const normalizedOutcome = normalizeText(outcome);
  if (normalizedOutcome === 'success' || normalizedOutcome === 'noop') {
    return shouldStop ? 'done' : 'running';
  }
  if (normalizedOutcome === 'stopped') return 'done';
  return 'blocked';
}

export function normalizeSoloIterationOutcome(input = {}) {
  const sessionId = normalizeText(input.sessionId);
  if (!sessionId) {
    throw new Error('solo iteration outcome requires sessionId');
  }

  const iteration = Number.isFinite(input.iteration) ? Math.max(1, Math.floor(input.iteration)) : 1;
  const outcome = SOLO_OUTCOMES.has(normalizeText(input.outcome))
    ? normalizeText(input.outcome)
    : 'failed';
  const failureClass = inferFailureClass({
    failureClass: input.failureClass,
    outcome,
  });
  const shouldStopDefault = outcome === 'human-gate'
    || outcome === 'stopped'
    || outcome === 'failed';
  const shouldStop = input.shouldStop === true || shouldStopDefault;

  return {
    schemaVersion: 1,
    kind: 'solo-harness.iteration',
    sessionId,
    iteration,
    outcome,
    summary: normalizeText(input.summary, 'No summary recorded.'),
    stage: normalizeStage(input.stage),
    evidence: deriveEvidence(input),
    keyChanges: normalizeStringArray(input.keyChanges),
    keyLearnings: normalizeStringArray(input.keyLearnings),
    nextAction: normalizeText(input.nextAction),
    shouldStop,
    failureClass,
    backoffAction: normalizeText(input.backoffAction, inferBackoffAction(outcome, failureClass)),
    checkpointStatus: normalizeText(input.checkpointStatus, inferCheckpointStatus(outcome, shouldStop)),
    createdAt: normalizeText(input.createdAt, new Date().toISOString()),
  };
}

export function classifySoloFailure(value = {}) {
  const detail = typeof value === 'string'
    ? value
    : value instanceof Error
      ? `${value.name}: ${value.message}`
      : normalizeText(value?.message || value?.summary || value?.stderr || value?.stdout);
  const normalized = detail.toLowerCase();

  if (normalized.includes('ownership') || normalized.includes('ownedpath')) return 'ownership-gate';
  if (normalized.includes('safety') || normalized.includes('human gate')) return 'safety-gate';
  if (normalized.includes('timeout') || normalized.includes('rate limit') || normalized.includes('econnreset')) return 'runtime-error';
  if (normalized.includes('tool')) return 'tool-error';
  if (normalized.includes('workspace') || normalized.includes('git')) return 'workspace-mutation';
  return 'runtime-error';
}

export function summarizeIterationForContinuity(outcome = {}) {
  const normalized = normalizeSoloIterationOutcome({
    sessionId: normalizeText(outcome.sessionId, 'continuity-session'),
    iteration: Number.isFinite(outcome.iteration) ? outcome.iteration : 1,
    ...outcome,
  });
  return {
    summary: normalized.summary,
    touchedFiles: normalized.keyChanges,
    nextActions: normalizeStringArray([normalized.nextAction]),
  };
}
