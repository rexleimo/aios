import { getActiveMemoStorage } from './config.mjs';
import { collectEvents } from './events-read.mjs';
import {
  normalizeLimit,
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

export async function searchMemoEvents(workspaceRoot, { storage, space = 'default', query = '', limit = 20 } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const { events } = await collectEvents(workspaceRoot, { storage: resolvedStorage, space });
  const boundedLimit = normalizeLimit(limit);
  return sortEventsDescending(events)
    .filter((event) => eventMatchesQuery(event, query))
    .map((event) => ({ ...event, matchScore: scoreEvent(event, query) }))
    .sort((a, b) => {
      const scoreCompare = Number(b.matchScore || 0) - Number(a.matchScore || 0);
      if (scoreCompare !== 0) return scoreCompare;
      return String(b.ts || '').localeCompare(String(a.ts || ''));
    })
    .slice(0, boundedLimit);
}

export async function listMemoEvents(workspaceRoot, { storage, space = 'default', limit = 20 } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const { events } = await collectEvents(workspaceRoot, { storage: resolvedStorage, space });
  return sortEventsDescending(events).slice(0, normalizeLimit(limit));
}
