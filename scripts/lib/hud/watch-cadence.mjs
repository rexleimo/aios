export const AUTO_WATCH_MIN_INTERVAL_MS = 250;
export const AUTO_WATCH_MAX_INTERVAL_MS = 2000;
const AUTO_WATCH_BACKOFF_MULTIPLIER = 2;

import { normalizeText } from '../../../src/shared/normalize.mjs';

function normalizeFixedIntervalMs(value, fallback = 1000) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(250, parsed) : fallback;
}

export function resolveWatchCadence(value, { fallbackMs = 1000 } = {}) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'auto') {
    return {
      renderIntervalMs: AUTO_WATCH_MIN_INTERVAL_MS,
      renderIntervalLabel: `auto(${AUTO_WATCH_MIN_INTERVAL_MS}-${AUTO_WATCH_MAX_INTERVAL_MS}ms)`,
      adaptiveInterval: {
        minIntervalMs: AUTO_WATCH_MIN_INTERVAL_MS,
        maxIntervalMs: AUTO_WATCH_MAX_INTERVAL_MS,
        backoffMultiplier: AUTO_WATCH_BACKOFF_MULTIPLIER,
      },
    };
  }

  const renderIntervalMs = normalizeFixedIntervalMs(value, fallbackMs);
  return {
    renderIntervalMs,
    renderIntervalLabel: `${renderIntervalMs}ms`,
    adaptiveInterval: null,
  };
}
