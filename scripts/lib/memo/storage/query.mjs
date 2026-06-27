import { getActiveMemoStorage } from './config.mjs';
import { collectEvents } from './events-read.mjs';
import {
  normalizeLimit,
  normalizeMemoAgent,
  normalizeMemoScope,
  normalizeMemoStorageName,
  sortEventsDescending,
} from './normalizers.mjs';

function eventMatchesQuery(event, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return true;
  const haystack = [
    event.text || '',
    ...(Array.isArray(event.refs) ? event.refs : []),
    event.eventId || '',
  ].join(' ').toLowerCase();
  return haystack.includes(normalizedQuery);
}

function scoreEvent(event, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return 0;
  const text = String(event.text || '').toLowerCase();
  const refs = Array.isArray(event.refs) ? event.refs.join(' ').toLowerCase() : '';
  let score = 0;
  if (text.includes(normalizedQuery)) score += 2;
  if (refs.includes(normalizedQuery)) score += 1;
  return score;
}

function eventVisibleForAgent(event, agent) {
  const scope = normalizeMemoScope(event.scope || 'project_shared');
  if (scope === 'project_shared') return true;
  const normalizedAgent = normalizeMemoAgent(agent);
  if (!normalizedAgent) return false;
  return normalizeMemoAgent(event.agent) === normalizedAgent;
}

function filterMemoIdentity(events, { scope = '', agent = '' } = {}) {
  const normalizedScope = scope ? normalizeMemoScope(scope) : '';
  return events
    .filter((event) => !normalizedScope || normalizeMemoScope(event.scope || 'project_shared') === normalizedScope)
    .filter((event) => eventVisibleForAgent(event, agent));
}

export async function searchMemoEvents(workspaceRoot, { storage, space = 'default', query = '', limit = 20, scope = '', agent = '', maxCharsPerMemory = Infinity, maxTotalChars = Infinity } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const { events } = await collectEvents(workspaceRoot, { storage: resolvedStorage, space });
  const boundedLimit = normalizeLimit(limit);
  const scored = sortEventsDescending(filterMemoIdentity(events, { scope, agent }))
    .filter((event) => eventMatchesQuery(event, query))
    .map((event) => ({ ...event, matchScore: scoreEvent(event, query) }))
    .sort((a, b) => {
      const scoreCompare = Number(b.matchScore || 0) - Number(a.matchScore || 0);
      if (scoreCompare !== 0) return scoreCompare;
      return String(b.ts || '').localeCompare(String(a.ts || ''));
    })
    .slice(0, boundedLimit);

  // Apply recall budget if non-default values are provided
  const hasBudget = Number.isFinite(maxCharsPerMemory) || Number.isFinite(maxTotalChars);
  if (hasBudget) {
    const { applyRecallBudget } = await import('../../search/budget.mjs');
    return applyRecallBudget(scored, { maxCharsPerMemory, maxTotalChars });
  }
  return scored;
}

export async function listMemoEvents(workspaceRoot, { storage, space = 'default', limit = 20, scope = '', agent = '' } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const { events } = await collectEvents(workspaceRoot, { storage: resolvedStorage, space });
  return sortEventsDescending(filterMemoIdentity(events, { scope, agent })).slice(0, normalizeLimit(limit));
}
