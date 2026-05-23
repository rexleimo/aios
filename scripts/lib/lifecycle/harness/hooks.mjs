import { normalizeSoloIterationOutcome } from '../../harness/solo-runtime.mjs';
import { normalizeText } from './shared.mjs';

export function createLifecycleHooks({ enabled = true } = {}) {
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
    onSessionEnd: ({ summary, reason = '' }) => {
      const finalStatus = normalizeText(summary?.status, 'running');
      const normalizedReason = normalizeText(reason, 'completed');
      return `finalStatus=${finalStatus} reason=${normalizedReason}`;
    },
  };
}
