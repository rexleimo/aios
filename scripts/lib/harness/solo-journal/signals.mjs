/**
 * Graceful process signal handling for a running solo session.
 *
 * SIGINT/SIGTERM request a durable harness stop instead of terminating
 * immediately. The onSignal callback aborts the active turn tree so an
 * operator interrupt cannot leave a detached provider agent running as an
 * orphan; the normal checkpoint + session-end path then runs.
 */

import { requestSoloHarnessStop } from './control.mjs';

export function installSessionSignalHandlers({ rootDir, sessionId, logger = console, onSignal } = {}) {
  if (!rootDir || !sessionId) return { stop() {} };
  let requested = false;
  const request = (signal) => {
    if (requested) return;
    requested = true;
    try {
      onSignal?.(signal);
    } catch (error) {
      logger?.error?.('[session-signal] active turn abort failed:', error);
    }
    requestSoloHarnessStop({ rootDir, sessionId, reason: `signal:${signal}` }).catch((error) => {
      logger?.error?.(`[session-signal] failed to persist ${signal}:`, error);
    });
  };
  const onSigint = () => request('SIGINT');
  const onSigterm = () => request('SIGTERM');
  /* 中文注释：保持监听（而非 once）——重复 Ctrl-C 不再触发 Node 默认终止，
     避免脱离进程组的 turn 树失去唯一的生命周期管理者。 */
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  return {
    stop() {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
    },
  };
}
