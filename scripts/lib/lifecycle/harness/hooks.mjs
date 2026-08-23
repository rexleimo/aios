import { normalizeSoloIterationOutcome } from '../../harness/solo-runtime.mjs';
import { normalizeText } from './shared.mjs';
import { finalizeSession } from '../session-hooks/finalize.mjs';

export function createLifecycleHooks({ enabled = true, rootDir = process.cwd() } = {}) {
  if (enabled !== true) {
    return {};
  }
  return {
    onTurnStart: ({ iteration }) => `iteration ${iteration} started`,
    onTurnComplete: ({ outcome }) => {
      const result = normalizeSoloIterationOutcome({
        sessionId: normalizeText(outcome?.sessionId, 'hook-session'),
        iteration: Number.isFinite(outcome?.iteration) ? outcome.iteration : 1,
        ...(outcome && typeof outcome === 'object' ? outcome : {}),
      });
      return `outcome=${result.outcome} failureClass=${result.failureClass}`;
    },
    onBeforeContinuityCommit: ({ outcome }) => {
      const status = normalizeText(outcome?.checkpointStatus, 'running');
      return `checkpointStatus=${status}`;
    },
    onSessionEnd: async ({ summary, reason = '' }) => {
      const finalStatus = normalizeText(summary?.status, 'running');
      const normalizedReason = normalizeText(reason, 'completed');
      const sessionId = normalizeText(summary?.sessionId, '');

      // Session finalization is awaited here so the candidate is durable before
      // the harness reports the session-end hook as complete.
      if (sessionId && rootDir) {
        const candidate = await finalizeSession({
          rootDir,
          sessionId,
          reason: normalizedReason,
          status: finalStatus,
        });
        return `finalStatus=${finalStatus} reason=${normalizedReason} candidate=${candidate?.candidateId || 'none'}`;
      }

      return `finalStatus=${finalStatus} reason=${normalizedReason}`;
    },
  };
}
