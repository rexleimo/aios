/**
 * Dream taxonomy — 5-class classification of memo events with TTL rules.
 * Pure deterministic rules, no LLM calls.
 */

import { normalizeMemoScope } from '../../memo/storage/normalizers.mjs';

export const TAXONOMY_CLASSES = {
  STABLE_PREFERENCE: 'STABLE_PREFERENCE',
  DURABLE_CONTEXT: 'DURABLE_CONTEXT',
  RECENT_SNAPSHOT: 'RECENT_SNAPSHOT',
  SENSITIVE: 'SENSITIVE',
  OPERATIONAL: 'OPERATIONAL',
};

/** TTL in days for each class; -1 means never expire. */
export const TTL_DAYS = {
  STABLE_PREFERENCE: -1,
  DURABLE_CONTEXT: 90,
  RECENT_SNAPSHOT: 7,
  SENSITIVE: -1,       // never touched, skip entirely
  OPERATIONAL: 3,
};

/** How many milliseconds per day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Check if an event is pinned by examining if its eventId appears
 * in the pinned memo file content. Pinned memos are stored separately
 * in .aios/memo/<storage>/pinned/<space>.md.
 * For classification purposes, we check if the event has refs that
 * include "pinned" tag, or if scope=project_shared and the event
 * text appears in pinned content. Since pinned state is determined
 * by separate storage, we use a simpler heuristic: events with
 * scope=project_shared that have a "pinned" ref are treated as pinned.
 */
function isPinned(event) {
  const refs = Array.isArray(event.refs) ? event.refs : [];
  return refs.includes('pinned');
}

/**
 * Check if an event is operational: text starts with "[ops]" or refs include "ops".
 */
function isOperational(event) {
  const text = String(event.text || '');
  if (text.startsWith('[ops]')) return true;
  const refs = Array.isArray(event.refs) ? event.refs : [];
  return refs.includes('ops');
}

/**
 * Check if event scope is agent_private (SENSITIVE).
 */
function isSensitive(event) {
  const scope = normalizeMemoScope(event.scope || 'project_shared');
  return scope === 'agent_private';
}

/**
 * Check if event was created within the last 24 hours.
 */
function isRecent(event, now = Date.now()) {
  const ts = event.ts ? new Date(event.ts).getTime() : 0;
  if (!Number.isFinite(ts)) return false;
  return (now - ts) < MS_PER_DAY;
}

/**
 * Classify a single memo event into one of the 5 taxonomy classes.
 * Returns { class, ttlDays, event }.
 */
export function classifyEvent(event, now = Date.now()) {
  // SENSITIVE first — never touch agent_private events
  if (isSensitive(event)) {
    return { class: TAXONOMY_CLASSES.SENSITIVE, ttlDays: TTL_DAYS.SENSITIVE, event };
  }

  // OPERATIONAL — short TTL, always takes priority
  if (isOperational(event)) {
    return { class: TAXONOMY_CLASSES.OPERATIONAL, ttlDays: TTL_DAYS.OPERATIONAL, event };
  }

  const scope = normalizeMemoScope(event.scope || 'project_shared');

  // STABLE_PREFERENCE — project_shared AND pinned → never expire
  if (scope === 'project_shared' && isPinned(event)) {
    return { class: TAXONOMY_CLASSES.STABLE_PREFERENCE, ttlDays: TTL_DAYS.STABLE_PREFERENCE, event };
  }

  // RECENT_SNAPSHOT — created within last 24h
  if (isRecent(event, now)) {
    return { class: TAXONOMY_CLASSES.RECENT_SNAPSHOT, ttlDays: TTL_DAYS.RECENT_SNAPSHOT, event };
  }

  // DURABLE_CONTEXT — project_shared, not pinned, not recent → 90-day TTL
  if (scope === 'project_shared') {
    return { class: TAXONOMY_CLASSES.DURABLE_CONTEXT, ttlDays: TTL_DAYS.DURABLE_CONTEXT, event };
  }

  // Everything else (agent_ephemeral, etc.) falls into RECENT_SNAPSHOT with short TTL
  return { class: TAXONOMY_CLASSES.RECENT_SNAPSHOT, ttlDays: TTL_DAYS.RECENT_SNAPSHOT, event };
}

/**
 * Check whether a classified event has expired based on its TTL and age.
 * Returns true if the event should be expired.
 * Events with ttlDays === -1 never expire.
 */
export function isExpired(classified, now = Date.now()) {
  if (classified.ttlDays === -1) return false;
  const ts = classified.event.ts ? new Date(classified.event.ts).getTime() : 0;
  if (!Number.isFinite(ts)) return false;
  const ageMs = now - ts;
  const ttlMs = classified.ttlDays * MS_PER_DAY;
  return ageMs > ttlMs;
}
