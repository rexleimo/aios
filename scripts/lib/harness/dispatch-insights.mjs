import { normalizeText } from '../../../src/shared/normalize.mjs';

const CAPABILITY_KEYS = ['read', 'write', 'network', 'browser', 'sideEffect'];
const DEFAULT_COST_TOKEN_WARNING_THRESHOLD = 200000;

function normalizeStatus(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'clear' || normalized === 'attention' || normalized === 'blocked') {
    return normalized;
  }
  return 'attention';
}

function normalizeSeverity(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'block' || normalized === 'warn' || normalized === 'info') {
    return normalized;
  }
  return 'info';
}

function normalizePositiveInteger(raw, fallback) {
  const value = Number.parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeCost(raw = {}) {
  const inputTokens = Number.isFinite(raw?.inputTokens) ? Math.max(0, Math.floor(raw.inputTokens)) : 0;
  const outputTokens = Number.isFinite(raw?.outputTokens) ? Math.max(0, Math.floor(raw.outputTokens)) : 0;
  let totalTokens = Number.isFinite(raw?.totalTokens) ? Math.max(0, Math.floor(raw.totalTokens)) : 0;
  const usd = Number.isFinite(raw?.usd) ? Math.max(0, Number(raw.usd)) : 0;
  if (totalTokens === 0 && (inputTokens > 0 || outputTokens > 0)) {
    totalTokens = inputTokens + outputTokens;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    usd: Number(usd.toFixed(4)),
  };
}

function normalizeRuntime({ dispatchRun = null, executorCapabilityManifest = null } = {}) {
  const runtime = dispatchRun?.runtime && typeof dispatchRun.runtime === 'object' ? dispatchRun.runtime : {};
  const manifest = executorCapabilityManifest && typeof executorCapabilityManifest === 'object'
    ? executorCapabilityManifest
    : {};
  return {
    id: normalizeText(runtime.id) || normalizeText(manifest.runtimeId) || 'unknown',
    executionMode: normalizeText(runtime.executionMode) || normalizeText(manifest.executionMode) || normalizeText(dispatchRun?.mode) || 'none',
    mode: normalizeText(dispatchRun?.mode) || normalizeText(manifest.executionMode) || 'none',
  };
}

function normalizeSignals(rawSignals = []) {
  return rawSignals
    .map((signal) => {
      const id = normalizeText(signal?.id);
      if (!id) return null;
      return {
        id,
        severity: normalizeSeverity(signal?.severity),
        message: normalizeText(signal?.message),
        ...(Number.isFinite(signal?.count) ? { count: Math.max(0, Math.floor(signal.count)) } : {}),
        ...(normalizeText(signal?.evidence) ? { evidence: normalizeText(signal.evidence) } : {}),
      };
    })
    .filter(Boolean);
}

function normalizeActions(rawActions = []) {
  const seen = new Set();
  const actions = [];
  for (const action of rawActions) {
    const id = normalizeText(action?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    actions.push({
      id,
      label: normalizeText(action?.label),
      ...(normalizeText(action?.command) ? { command: normalizeText(action.command) } : {}),
    });
  }
  return actions;
}

function getWorkItems(workItemTelemetry = null) {
  return Array.isArray(workItemTelemetry?.items) ? workItemTelemetry.items : [];
}

function getPlannedJobCount(dispatchPlan = null) {
  return Array.isArray(dispatchPlan?.jobs) ? dispatchPlan.jobs.length : 0;
}

function collectUnknownCapabilities(executorCapabilityManifest = null) {
  const summary = executorCapabilityManifest?.summary && typeof executorCapabilityManifest.summary === 'object'
    ? executorCapabilityManifest.summary
    : {};
  return CAPABILITY_KEYS.filter((key) => normalizeText(summary[key]).toLowerCase() === 'unknown');
}

function computeStatus(signals = []) {
  if (signals.some((signal) => signal.severity === 'block')) {
    return 'blocked';
  }
  if (signals.some((signal) => signal.severity === 'warn')) {
    return 'attention';
  }
  return 'clear';
}

function computeScore(signals = []) {
  const penalty = signals.reduce((total, signal) => {
    if (signal.severity === 'block') return total + 40;
    if (signal.severity === 'warn') return total + 15;
    return total;
  }, 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function addSignal(signals, signal) {
  signals.push(signal);
}

function addAction(actions, action) {
  actions.push(action);
}

export function buildDispatchInsights(
  {
    dispatchRun = null,
    dispatchPlan = null,
    workItemTelemetry = null,
    executorCapabilityManifest = null,
    clarityGate = null,
  } = {},
  {
    now = new Date(),
    costTokenWarningThreshold = DEFAULT_COST_TOKEN_WARNING_THRESHOLD,
  } = {}
) {
  const signals = [];
  const actions = [];
  const runtime = normalizeRuntime({ dispatchRun, executorCapabilityManifest });
  const workItems = getWorkItems(workItemTelemetry);
  const blockedItems = workItems.filter((item) => normalizeText(item?.status).toLowerCase() === 'blocked');
  const sameHypothesisRetries = workItems.filter((item) => normalizeText(item?.retryClass).toLowerCase() === 'same-hypothesis');
  const unknownCapabilities = collectUnknownCapabilities(executorCapabilityManifest);
  const cost = normalizeCost(dispatchRun?.cost || {});
  const threshold = normalizePositiveInteger(costTokenWarningThreshold, DEFAULT_COST_TOKEN_WARNING_THRESHOLD);

  if (!dispatchRun && getPlannedJobCount(dispatchPlan) > 0) {
    addSignal(signals, {
      id: 'dispatch.not-executed',
      severity: 'warn',
      message: 'Dispatch plan exists but has not been executed yet.',
      count: getPlannedJobCount(dispatchPlan),
    });
    addAction(actions, {
      id: 'execute-dispatch',
      label: 'Run orchestrate with --execute dry-run or --execute live.',
    });
  }

  if (blockedItems.length > 0 || dispatchRun?.ok === false) {
    addSignal(signals, {
      id: 'work.blocked',
      severity: 'block',
      message: `Blocked dispatch work detected (${Math.max(blockedItems.length, 1)} item${Math.max(blockedItems.length, 1) === 1 ? '' : 's'}).`,
      count: Math.max(blockedItems.length, 1),
      evidence: blockedItems.slice(0, 3).map((item) => normalizeText(item?.itemId)).filter(Boolean).join(', '),
    });
    addAction(actions, {
      id: 'inspect-blockers',
      label: 'Inspect blocked handoffs and resolve the first concrete blocker before rerunning.',
    });
  }

  if (sameHypothesisRetries.length > 0) {
    addSignal(signals, {
      id: 'retry.same-hypothesis',
      severity: 'warn',
      message: 'Retry attempts repeated the same hypothesis.',
      count: sameHypothesisRetries.length,
      evidence: sameHypothesisRetries.slice(0, 3).map((item) => normalizeText(item?.itemId)).filter(Boolean).join(', '),
    });
    addAction(actions, {
      id: 'revise-before-retry',
      label: 'Change the hypothesis or execution plan before retrying blocked jobs.',
    });
  }

  if (unknownCapabilities.length > 0) {
    addSignal(signals, {
      id: 'capability.unknown',
      severity: 'warn',
      message: `Executor capability manifest has unknown surfaces: ${unknownCapabilities.join(', ')}.`,
      count: unknownCapabilities.length,
    });
    addAction(actions, {
      id: 'resolve-capabilities',
      label: 'Run dry-run first or declare capability risk acceptance before live execution.',
    });
  }

  if (clarityGate?.needsHuman === true) {
    const reasons = Array.isArray(clarityGate?.reasons)
      ? clarityGate.reasons.map((item) => normalizeText(item)).filter(Boolean)
      : [];
    const question = normalizeText(clarityGate?.question);
    const nextActions = Array.isArray(clarityGate?.nextActions)
      ? clarityGate.nextActions.map((item) => normalizeText(item)).filter(Boolean)
      : [];
    addSignal(signals, {
      id: 'clarity.human-gate',
      severity: 'block',
      message: question || 'Clarity gate requires human review.',
      ...(reasons.length > 0 ? { evidence: reasons.slice(0, 3).join('; ') } : {}),
    });
    addAction(actions, {
      id: 'review-clarity-gate',
      label: nextActions[0] || 'Review clarity-gate reasons and decide whether automation may continue.',
      ...(normalizeText(clarityGate?.resumeCommand) ? { command: normalizeText(clarityGate.resumeCommand) } : {}),
    });
  }

  if (cost.totalTokens >= threshold) {
    addSignal(signals, {
      id: 'cost.high',
      severity: 'warn',
      message: `Dispatch token usage is high (${cost.totalTokens} tokens).`,
      count: cost.totalTokens,
    });
    addAction(actions, {
      id: 'review-cost',
      label: 'Review dispatch cost and consider smaller work-item batches.',
    });
  }

  if (dispatchRun?.ok === true && signals.length === 0) {
    addSignal(signals, {
      id: 'dispatch.clear',
      severity: 'info',
      message: 'Dispatch completed without blocking harness signals.',
    });
    addAction(actions, {
      id: 'run-learn-eval',
      label: 'Run learn-eval to convert this dispatch evidence into trend recommendations.',
    });
  }

  const normalizedSignals = normalizeSignals(signals);
  const status = normalizeStatus(computeStatus(normalizedSignals));

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    status,
    score: computeScore(normalizedSignals),
    runtime,
    signals: normalizedSignals,
    suggestedActions: normalizeActions(actions),
  };
}
