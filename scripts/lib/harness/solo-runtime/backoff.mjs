/**
 * Solo backoff resolution — stable defaults for solo harness retry decisions.
 *
 * Increases: 30 s × 2ⁿ, capped at 5 min.
 * Blocked:    consecutive failures ≥ MAX_CONSECUTIVE_FAILURES → abort instead.
 *
 * 竞品参考:
 *   gnhf orchestrator.ts:57 — consecutiveFailures + consecutiveErrors 双计数器
 *   gnhf orchestrator.ts:361-368 — maxConsecutiveFailures abort
 *   gnhf orchestrator.ts:372 — 60_000 * Math.pow(2, n-1) 退避（无 cap，我们用 300s cap）
 */

import { normalizeText } from './normalizers.mjs';

const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 300_000;
const MAX_CONSECUTIVE_FAILURES = 5;

// ---------------------------------------------------------------------------
// Sleep
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Abort threshold check
// ---------------------------------------------------------------------------

/**
 * 检查是否应该因连续失败而 abort。
 * 所有非成功 outcome 都计入 consecutiveFailures（blocked/failed/infra-retry/human-gate）。
 * 退避计数器 consecutiveInfraFailures 只在 infra-retry + runtime-error/tool-error 时递增。
 */
export function shouldAbortForConsecutiveFailures(backoffState) {
  if (!backoffState || typeof backoffState !== 'object') return false;
  const count = Number.isFinite(backoffState.consecutiveFailures)
    ? Math.max(0, Math.floor(backoffState.consecutiveFailures))
    : 0;
  return count >= MAX_CONSECUTIVE_FAILURES;
}

export function maxConsecutiveFailures() {
  return MAX_CONSECUTIVE_FAILURES;
}

// ---------------------------------------------------------------------------
// Backoff state resolution
// ---------------------------------------------------------------------------

export function resolveSoloBackoffState({ previous = null, outcome = {}, nowIso = new Date().toISOString() } = {}) {
  const current = previous && typeof previous === 'object'
    ? previous
    : { consecutiveInfraFailures: 0, consecutiveFailures: 0, nextDelayMs: 0, until: null };
  const normalizedOutcome = normalizeText(outcome?.outcome);
  const failureClass = normalizeText(outcome?.failureClass);

  // 成功/noop 重置所有计数器
  if (normalizedOutcome === 'success' || normalizedOutcome === 'noop') {
    return {
      consecutiveInfraFailures: 0,
      consecutiveFailures: 0,
      nextDelayMs: 0,
      until: null,
    };
  }

  // 所有非成功 outcome 都计入 consecutiveFailures
  const prevConsecutiveFailures = Number.isFinite(current.consecutiveFailures)
    ? Math.max(0, Math.floor(current.consecutiveFailures))
    : 0;
  const nextConsecutiveFailures = prevConsecutiveFailures + 1;

  // 只有 infra-retry + runtime-error/tool-error 才走退避
  if (normalizedOutcome === 'infra-retry' && (failureClass === 'runtime-error' || failureClass === 'tool-error')) {
    const previousDelay = Number.isFinite(current.nextDelayMs) ? Math.max(0, Math.floor(current.nextDelayMs)) : 0;
    const nextDelayMs = previousDelay > 0 ? Math.min(previousDelay * 2, BACKOFF_CAP_MS) : BACKOFF_BASE_MS;
    return {
      consecutiveInfraFailures: Number.isFinite(current.consecutiveInfraFailures)
        ? Math.max(0, Math.floor(current.consecutiveInfraFailures)) + 1
        : 1,
      consecutiveFailures: nextConsecutiveFailures,
      nextDelayMs,
      until: addDelay(nowIso, nextDelayMs),
    };
  }

  // 非 infra-retry 的失败（blocked/failed/human-gate/stopped）不退避，但计入 consecutiveFailures
  return {
    consecutiveInfraFailures: 0,
    consecutiveFailures: nextConsecutiveFailures,
    nextDelayMs: 0,
    until: null,
  };
}
