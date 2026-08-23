/**
 * Unified session finalizer that generates memory candidates on session end.
 *
 * This module provides an idempotent, error-isolated way to create
 * session-close memory candidates across all exit paths:
 * - Normal completion
 * - User abort/cancel
 * - Timeout
 * - Exception/crash
 *
 * The finalizer writes a candidate but does NOT publish to active memory.
 * Candidates require review/promotion before they become active.
 */
import { autoMemoSessionClose } from './close.mjs';

const finalizeRegistry = new Map();

/**
 * Finalize a session by generating a memory candidate.
 *
 * This is idempotent: calling it multiple times for the same sessionId
 * will only generate one candidate (the first call wins).
 *
 * Errors are caught and logged but never throw, so this can be safely
 * called from exit handlers without blocking the main flow.
 *
 * @param {Object} params
 * @param {string} params.rootDir - Workspace root directory
 * @param {string} params.sessionId - Session identifier
 * @param {string} [params.reason] - Exit reason (completed, aborted, timeout, etc.)
 * @param {string} [params.status] - Final status (done, error, cancelled, etc.)
 * @param {Console} [params.logger] - Logger for errors (default: console)
 * @returns {Promise<Object|null>} The generated candidate, or null if already finalized or failed
 */
export async function finalizeSession({
  rootDir,
  sessionId,
  reason = 'completed',
  status = 'done',
  logger = console,
} = {}) {
  if (!rootDir || !sessionId) {
    return null;
  }

  // Idempotency check: only finalize once per session
  const key = `${rootDir}::${sessionId}`;
  if (finalizeRegistry.has(key)) {
    return finalizeRegistry.get(key);
  }

  // Mark as in-progress to prevent concurrent calls
  finalizeRegistry.set(key, null);

  let candidate = null;
  try {
    candidate = await autoMemoSessionClose({
      rootDir,
      sessionId,
    });

    // Store the result for idempotency
    finalizeRegistry.set(key, candidate);

    if (logger && typeof logger.log === 'function') {
      logger.log(`[session-finalizer] candidate generated: ${candidate.candidateId}`);
    }
  } catch (error) {
    // Log but never throw - finalizer must not block exit
    if (logger && typeof logger.error === 'function') {
      logger.error(`[session-finalizer] failed to generate candidate:`, error);
    }
  }

  return candidate;
}

/**
 * Reset the finalize registry. Only use for testing.
 * @internal
 */
export function resetFinalizeRegistry() {
  finalizeRegistry.clear();
}
