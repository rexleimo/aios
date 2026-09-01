import { textSimilarity } from '../../lifecycle/dream/dedup.mjs';
import { normalizeClaimStatus } from './provenance.mjs';

// Bi-temporal fact lifecycle for memo events.
//
// Memo storage is append-only, so an outdated fact is never rewritten in
// place. Instead the replacement event carries `supersedes: [eventId...]`,
// and the invalidation is folded in at read time. That keeps `file` (single
// append-only JSONL) and `split` (one immutable file per seq) identical in
// behaviour, and keeps history recoverable via `--include-invalid`.
//
// Authored fields:  validAt, supersedes
// Derived at read:  invalidAt, supersededBy

export const DEFAULT_SUPERSEDE_THRESHOLD = 0.82;

export function normalizeIsoTimestamp(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

export function toSupersedes(raw = []) {
  if (!Array.isArray(raw)) return [];
  const output = [];
  const seen = new Set();
  for (const entry of raw) {
    const value = String(entry || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

export function toSupersedeDenials(raw = []) {
  if (!Array.isArray(raw)) return [];
  const output = [];
  const seen = new Set();
  for (const entry of raw) {
    const eventId = String(entry?.eventId || '').trim();
    if (!eventId || seen.has(eventId)) continue;
    seen.add(eventId);
    output.push({
      eventId,
      reason: String(entry?.reason || 'scope_or_principal_mismatch').trim() || 'scope_or_principal_mismatch',
    });
  }
  return output;
}

function eventScope(event = {}) {
  const value = String(event.scope || 'project_shared').trim().toLowerCase().replace(/[-\s]+/gu, '_');
  if (value === 'shared' || value === 'project' || value === 'global') return 'project_shared';
  if (value === 'private' || value === 'agent') return 'agent_private';
  return value;
}

function eventAgent(event = {}) {
  return String(event.agent || event.agentNamespace || '').trim().toLowerCase();
}

function eventSpace(event = {}) {
  return String(event.spaceKey || event.space || 'default').trim().toLowerCase();
}

export function canSupersedeEvent(source = {}, target = {}) {
  if (eventSpace(source) !== eventSpace(target)) return false;
  const sourceScope = eventScope(source);
  const targetScope = eventScope(target);
  if (sourceScope === 'project_shared') {
    // Governed promotion may retire the agent_private draft it publishes:
    // only a verified shared event that carries `promotionOf` (produced by an
    // authorized candidate promotion) qualifies. Arbitrary shared events can
    // never hide private memories from their owner.
    if (targetScope === 'agent_private') {
      return String(source.promotionOf || '').trim().length > 0
        && normalizeClaimStatus(source.claimStatus, source.provenance) === 'verified';
    }
    return true;
  }
  if (sourceScope !== targetScope) return false;
  if (!['agent_private', 'agent_ephemeral'].includes(sourceScope)) return false;
  const sourceAgent = eventAgent(source);
  return Boolean(sourceAgent) && sourceAgent === eventAgent(target);
}

export function partitionSupersedes(source = {}, events = []) {
  const byId = new Map(events.filter(Boolean).map((event) => [event.eventId, event]));
  const allowed = [];
  const denied = [];
  for (const eventId of toSupersedes(source.supersedes)) {
    const target = byId.get(eventId);
    if (!target || canSupersedeEvent(source, target)) {
      allowed.push(eventId);
    } else {
      denied.push({ eventId, reason: 'scope_or_principal_mismatch' });
    }
  }
  return { allowed, denied };
}

// Applies every supersede link across the set. Returns fresh objects so the
// caller never mutates rows that may still be cached upstream.
export function foldTemporalLinks(events = []) {
  const rows = events.map((event) => ({ ...event }));
  const byId = new Map();
  for (const row of rows) {
    if (row.eventId) byId.set(row.eventId, row);
  }

  for (const row of rows) {
    if (row.claimStatus === 'candidate') continue;
    const targets = toSupersedes(row.supersedes);
    if (targets.length === 0) continue;
    const supersedeAt = normalizeIsoTimestamp(row.validAt || row.ts);
    if (!supersedeAt) continue;

    for (const targetId of targets) {
      if (targetId === row.eventId) continue; // self-supersede is a no-op
      const target = byId.get(targetId);
      if (!target) continue; // dangling link: the target lives in another space
      if (!canSupersedeEvent(row, target)) continue;
      // Earliest supersede wins, so a later duplicate cannot resurrect a fact.
      if (target.invalidAt && target.invalidAt <= supersedeAt) continue;
      target.invalidAt = supersedeAt;
      target.supersededBy = row.eventId;
    }
  }

  return rows;
}

export function isEventLiveAt(event, asOf) {
  const at = normalizeIsoTimestamp(asOf) || new Date().toISOString();
  const validAt = normalizeIsoTimestamp(event?.validAt || event?.ts);
  if (validAt && validAt > at) return false; // not true yet at `asOf`
  const invalidAt = normalizeIsoTimestamp(event?.invalidAt);
  if (invalidAt && invalidAt <= at) return false; // already superseded at `asOf`
  return true;
}

export function filterTemporal(events = [], { asOf = '', includeInvalid = false } = {}) {
  const folded = foldTemporalLinks(events);
  if (includeInvalid) return folded;
  const at = normalizeIsoTimestamp(asOf) || new Date().toISOString();
  return folded.filter((event) => isEventLiveAt(event, at));
}

// Suggests supersede links without writing anything. Threshold is deliberately
// stricter than dream dedup (0.7): dedup drops a redundant copy, while a
// supersede changes which fact recall returns, so a false positive is worse.
export function proposeSupersedes(events = [], { threshold = DEFAULT_SUPERSEDE_THRESHOLD } = {}) {
  const live = filterTemporal(events).filter((event) => String(event?.text || '').trim());
  const bySpace = new Map();
  for (const event of live) {
    const key = event.spaceKey || event.space || 'default';
    if (!bySpace.has(key)) bySpace.set(key, []);
    bySpace.get(key).push(event);
  }

  const proposals = [];
  for (const [space, rows] of bySpace) {
    const ordered = [...rows].sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')));
    const claimed = new Set();
    // Walk newest first so each stale fact is attributed to the newest
    // replacement rather than chaining through every intermediate revision.
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const candidate = ordered[i];
      if (claimed.has(candidate.eventId)) continue;
      const targets = [];
      for (let j = i - 1; j >= 0; j -= 1) {
        const older = ordered[j];
        if (claimed.has(older.eventId)) continue;
        if (!canSupersedeEvent(candidate, older)) continue;
        const score = textSimilarity(candidate.text, older.text);
        if (score < threshold) continue;
        claimed.add(older.eventId);
        targets.push({ eventId: older.eventId, ts: older.ts, text: older.text, similarity: score });
      }
      if (targets.length > 0) {
        proposals.push({ space, keep: { eventId: candidate.eventId, ts: candidate.ts, text: candidate.text }, supersedes: targets });
      }
    }
  }

  return proposals;
}

// Observation mode for `memo add`: report which live facts look like earlier
// revisions of the text being written, without linking anything. The threshold
// is deliberately looser than the one that writes links — a hint that turns out
// to be wrong costs a line of output, so recall matters more than precision
// while we are still measuring whether the signal is trustworthy.
export const DEFAULT_HINT_THRESHOLD = 0.7;

export function findSupersedeCandidates(events = [], text = '', { threshold = DEFAULT_HINT_THRESHOLD, limit = 3, excludeEventId = '' } = {}) {
  const subject = String(text || '').trim();
  if (!subject) return [];

  return filterTemporal(events)
    .filter((event) => event?.eventId !== excludeEventId)
    .filter((event) => String(event?.text || '').trim())
    .map((event) => ({
      eventId: event.eventId,
      ts: event.ts,
      text: event.text,
      similarity: textSimilarity(subject, event.text),
    }))
    .filter((candidate) => candidate.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity || String(a.ts || '').localeCompare(String(b.ts || '')))
    .slice(0, Math.max(1, limit));
}
