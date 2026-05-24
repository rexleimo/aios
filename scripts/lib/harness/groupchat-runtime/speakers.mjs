import { BLOCKED_STATUSES, RE_PLAN_ROLES } from './constants.mjs';
import { normalizeText } from './shared.mjs';

function shouldReplan(history, blueprintRounds) {
  if (history.length === 0) return false;

  const lastRound = history.lastRound;
  const lastRoundEntries = history.getEntriesByRound(lastRound);
  const blockedEntries = lastRoundEntries.filter((entry) => BLOCKED_STATUSES.has(entry.handoff.status));
  if (blockedEntries.length === 0) return false;

  const lastSpeakers = new Set(lastRoundEntries.map((entry) => entry.role));
  if (lastSpeakers.size === 1 && RE_PLAN_ROLES.has([...lastSpeakers][0])) return false;

  const completeRounds = blueprintRounds.length;
  if (lastRound >= completeRounds) return true;
  return true;
}

function extractWorkItemsFromHistory(history) {
  const plannerEntries = history.lastEntriesByRole('planner');
  if (plannerEntries.length === 0) return [];

  const lastPlanner = plannerEntries[plannerEntries.length - 1];
  const combined = [
    ...(lastPlanner.handoff.findings || []),
    ...(lastPlanner.handoff.recommendations || []),
  ];
  const items = [];

  for (const item of combined) {
    const text = normalizeText(item);
    if (!text) continue;
    items.push({
      itemId: `wi.${items.length + 1}`,
      summary: text,
      type: /test|testing|qa|verify/i.test(text) ? 'testing' : 'general',
      source: 'planner-findings',
      status: 'queued',
      dependsOn: [],
      ownedPathHints: [],
    });
  }

  return items;
}

export function selectNextRoundSpeakers({ history, blueprintRounds, roundNumber }) {
  const maxBlueprintRounds = blueprintRounds.length;
  if (history.length === 0) {
    const first = blueprintRounds[0];
    if (!first) return [];
    return first.roles.map((role) => ({ role, speaker: role }));
  }

  if (shouldReplan(history, blueprintRounds)) {
    return [{ role: 'planner', speaker: 'planner-replan' }];
  }

  if (roundNumber > maxBlueprintRounds) {
    const lastEntries = history.getEntriesByRound(history.lastRound);
    const hasBlocked = lastEntries.some((entry) => BLOCKED_STATUSES.has(entry.handoff.status));
    return hasBlocked ? [{ role: 'planner', speaker: 'planner-replan' }] : [];
  }

  const blueprintRound = blueprintRounds[roundNumber - 1];
  if (!blueprintRound) return [];

  if (blueprintRound.roles.length === 1 && blueprintRound.roles[0] === 'implementer') {
    const workItems = extractWorkItemsFromHistory(history);
    if (workItems.length > 1) {
      return workItems.map((item, idx) => ({
        role: 'implementer',
        speaker: `implementer-wi-${idx + 1}`,
        workItem: item,
      }));
    }
  }

  return blueprintRound.roles.map((role) => ({ role, speaker: role }));
}
