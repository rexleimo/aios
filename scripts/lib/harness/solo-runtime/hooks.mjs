import { appendSoloHookEvent } from '../solo-journal.mjs';
import { normalizeText } from './normalizers.mjs';

function buildHookDetail(value = '') {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  return normalized.length > 280 ? `${normalized.slice(0, 280).trimEnd()}...` : normalized;
}

function buildHookLogEntry({ hook = '', phase = '', iteration = 0, status = 'ok', detail = '' } = {}) {
  return {
    ts: new Date().toISOString(),
    kind: 'hook',
    hook: normalizeText(hook),
    phase: normalizeText(phase),
    iteration: Number.isFinite(iteration) ? Math.max(0, Math.floor(iteration)) : 0,
    status: normalizeText(status, 'ok'),
    detail: buildHookDetail(detail),
  };
}

export async function invokeLifecycleHook({
  rootDir,
  sessionId,
  hook = '',
  phase = '',
  iteration = 0,
  callback = null,
  payload = {},
} = {}) {
  if (typeof callback !== 'function') {
    return null;
  }

  const baseEvent = {
    kind: 'lifecycle-hook',
    hook,
    phase,
    iteration,
  };

  try {
    await appendSoloHookEvent({
      rootDir,
      sessionId,
      event: {
        ...baseEvent,
        status: 'start',
      },
    });
  } catch {
    // Best-effort audit trail only.
  }

  try {
    const result = await callback(payload);
    const detail = typeof result === 'string'
      ? result
      : normalizeText(result?.detail || result?.summary || '');
    const logEntry = buildHookLogEntry({
      hook,
      phase,
      iteration,
      status: 'ok',
      detail,
    });
    try {
      await appendSoloHookEvent({
        rootDir,
        sessionId,
        event: {
          ...baseEvent,
          status: 'ok',
          detail: logEntry.detail,
        },
      });
    } catch {
      // Best-effort audit trail only.
    }
    return { ok: true, logEntry, result };
  } catch (error) {
    const detail = buildHookDetail(error instanceof Error ? error.message : String(error));
    const logEntry = buildHookLogEntry({
      hook,
      phase,
      iteration,
      status: 'error',
      detail,
    });
    try {
      await appendSoloHookEvent({
        rootDir,
        sessionId,
        event: {
          ...baseEvent,
          status: 'error',
          detail: logEntry.detail,
        },
      });
    } catch {
      // Best-effort audit trail only.
    }
    return { ok: false, logEntry, error };
  }
}
