/**
 * Graceful process signal handling for a running solo session.
 *
 * SIGINT/SIGTERM request a durable harness stop instead of terminating
 * immediately. The current turn is allowed to settle, then the normal
 * checkpoint + session-end path runs.
 */

import { requestSoloHarnessStop } from './control.mjs';

export function installSessionSignalHandlers({ rootDir, sessionId, logger = console } = {}) {
  if (!rootDir || !sessionId) return { stop() {} };
  let requested = false;
  const request = (signal) => {
    if (requested) return;
    requested = true;
    requestSoloHarnessStop({ rootDir, sessionId, reason: `signal:${signal}` }).catch((error) => {
      logger?.error?.(`[session-signal] failed to persist ${signal}:`, error);
    });
  };
  const onSigint = () => request('SIGINT');
  const onSigterm = () => request('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  return {
    stop() {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
    },
  };
}
