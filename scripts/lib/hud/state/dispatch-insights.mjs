import { normalizeText } from './shared.mjs';

function normalizeDispatchInsightStatus(value = '') {
  const status = normalizeText(value).toLowerCase();
  if (status === 'clear' || status === 'attention' || status === 'blocked') return status;
  return '';
}

function normalizeDispatchInsightSeverity(value = '') {
  const severity = normalizeText(value).toLowerCase();
  if (severity === 'block' || severity === 'warn' || severity === 'info') return severity;
  return '';
}

function normalizeDispatchInsightSignal(rawSignal = null) {
  if (!rawSignal || typeof rawSignal !== 'object') return null;
  const id = normalizeText(rawSignal.id);
  const severity = normalizeDispatchInsightSeverity(rawSignal.severity);
  if (!id || !severity) return null;

  const signal = {
    id,
    severity,
    message: normalizeText(rawSignal.message),
  };
  if (Number.isFinite(rawSignal.count)) {
    signal.count = Math.max(0, Math.floor(rawSignal.count));
  }
  const evidence = normalizeText(rawSignal.evidence);
  if (evidence) {
    signal.evidence = evidence;
  }
  return signal;
}

function normalizeDispatchInsightAction(rawAction = null) {
  if (!rawAction || typeof rawAction !== 'object') return null;
  const id = normalizeText(rawAction.id);
  if (!id) return null;

  const action = {
    id,
    label: normalizeText(rawAction.label),
  };
  const command = normalizeText(rawAction.command);
  if (command) {
    action.command = command;
  }
  return action;
}

export function normalizeDispatchInsightsArtifact(rawInsights = null) {
  if (!rawInsights || typeof rawInsights !== 'object') return null;

  const status = normalizeDispatchInsightStatus(rawInsights.status);
  const score = Number.isFinite(rawInsights.score) ? Math.max(0, Math.floor(rawInsights.score)) : null;
  if (!status || score === null) return null;

  const signals = Array.isArray(rawInsights.signals)
    ? rawInsights.signals
      .map((signal) => normalizeDispatchInsightSignal(signal))
      .filter(Boolean)
      .slice(0, 3)
    : [];
  const suggestedActions = Array.isArray(rawInsights.suggestedActions)
    ? rawInsights.suggestedActions
      .map((action) => normalizeDispatchInsightAction(action))
      .filter(Boolean)
      .slice(0, 3)
    : [];

  return {
    status,
    score,
    signals,
    suggestedActions,
  };
}
