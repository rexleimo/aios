import { normalizeText } from './normalizers.mjs';

export function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Math.floor(delayMs || 0)));
  });
}

function addDelay(iso, delayMs) {
  const base = Date.parse(iso);
  const ts = Number.isFinite(base) ? base : Date.now();
  return new Date(ts + Math.max(0, Math.floor(delayMs))).toISOString();
}

export function resolveSoloBackoffState({ previous = null, outcome = {}, nowIso = new Date().toISOString() } = {}) {
  const current = previous && typeof previous === 'object'
    ? previous
    : { consecutiveInfraFailures: 0, nextDelayMs: 0, until: null };
  const normalizedOutcome = normalizeText(outcome?.outcome);
  const failureClass = normalizeText(outcome?.failureClass);

  if (normalizedOutcome === 'infra-retry' && (failureClass === 'runtime-error' || failureClass === 'tool-error')) {
    const previousDelay = Number.isFinite(current.nextDelayMs) ? Math.max(0, Math.floor(current.nextDelayMs)) : 0;
    const nextDelayMs = previousDelay > 0 ? Math.min(previousDelay * 2, 300000) : 30000;
    return {
      consecutiveInfraFailures: Number.isFinite(current.consecutiveInfraFailures)
        ? Math.max(0, Math.floor(current.consecutiveInfraFailures)) + 1
        : 1,
      nextDelayMs,
      until: addDelay(nowIso, nextDelayMs),
    };
  }

  return {
    consecutiveInfraFailures: 0,
    nextDelayMs: 0,
    until: null,
  };
}
