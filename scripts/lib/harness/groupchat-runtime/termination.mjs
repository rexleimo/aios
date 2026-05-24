import { BLOCKED_STATUSES } from './constants.mjs';

export function checkTermination({ history, currentRound, maxRounds, blueprintRounds }) {
  if (currentRound > maxRounds) {
    return {
      terminated: true,
      status: 'blocked',
      reason: `Reached max rounds (${maxRounds})`,
    };
  }

  const lastRound = history.lastRound;
  if (lastRound <= 0) {
    return { terminated: false, status: 'running', reason: '' };
  }

  const lastEntries = history.getEntriesByRound(lastRound);
  if (lastEntries.length === 0) {
    return { terminated: false, status: 'running', reason: '' };
  }

  const allCompleted = lastEntries.every((entry) => entry.handoff.status === 'completed');
  const hasBlocked = lastEntries.some((entry) => BLOCKED_STATUSES.has(entry.handoff.status));
  const maxBlueprintRounds = Array.isArray(blueprintRounds) ? blueprintRounds.length : 0;

  if (maxBlueprintRounds === 0) {
    return { terminated: false, status: 'running', reason: '' };
  }
  if (allCompleted && lastRound >= maxBlueprintRounds) {
    return { terminated: true, status: 'completed', reason: 'All phases completed' };
  }
  if (hasBlocked && lastRound >= maxBlueprintRounds) {
    return { terminated: false, status: 'blocked', reason: 'Blocked entries need re-plan' };
  }
  return { terminated: false, status: 'running', reason: '' };
}
