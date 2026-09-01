import { getActiveMemoStorage } from './config.mjs';
import { collectEvents } from './events-read.mjs';
import {
  normalizeLimit,
  normalizeMemoAgent,
  normalizeMemoScope,
  normalizeMemoStorageName,
  sortEventsDescending,
} from './normalizers.mjs';
import { filterTemporal, normalizeIsoTimestamp } from './temporal.mjs';
import { readDreamArchivedEventIds } from '../../lifecycle/dream/governance.mjs';
import { applyMemoFeedbackBoost, readMemoFeedbackScores } from './feedback.mjs';

/* CJK and other unspaced scripts have no word boundaries; Intl.Segmenter (the
 * standard library's ICU word segmenter) supplies them dictionary-backed. We
 * keep ONLY this generic CJK-range regex for the bigram fallback below — it is
 * a script-range test, not a hand-typed word/stop-word table. Semantic judgment
 * (is a memory verified / useful) is the LLM's job via the declaration block,
 * never a hand-maintained table. */
const CJK_RUN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff]+/gu;
const WORD_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'word' });

/* Word segmentation backed by the standard library. Returns the lowercased,
 * word-like segments of a string. No hand-written language tables — ICU decides
 * what counts as a word for every script. */
export function segmentWords(value) {
  const words = [];
  for (const part of WORD_SEGMENTER.segment(String(value || ''))) {
    if (part.isWordLike) words.push(part.segment.toLowerCase());
  }
  return words;
}

/* Read-time TTL for private memories. Dream organization skips agent_private
 * rows entirely (treated as sensitive), so nothing ever expires them and they
 * accumulate forever in recall. This stopgap hides private events older than
 * the TTL from recall without deleting anything — the append-only log stays
 * intact and `--include-invalid`-style reads still see history. Set
 * AIOS_AGENT_PRIVATE_TTL_DAYS=0 to disable. */
const AGENT_PRIVATE_TTL_DAYS = 30;
const AGENT_PRIVATE_TTL_ENV = 'AIOS_AGENT_PRIVATE_TTL_DAYS';

function agentPrivateTtlCutoff(asOf, env = process.env) {
  const parsed = Number.parseInt(String(env[AGENT_PRIVATE_TTL_ENV] ?? ''), 10);
  const days = Number.isFinite(parsed) && parsed >= 0 ? parsed : AGENT_PRIVATE_TTL_DAYS;
  if (days === 0) return '';
  const base = normalizeIsoTimestamp(asOf) || new Date().toISOString();
  return new Date(new Date(base).getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function applyAgentPrivateTtl(events, asOf, env = process.env) {
  const cutoff = agentPrivateTtlCutoff(asOf, env);
  if (!cutoff) return events;
  return events.filter((event) => {
    if (normalizeMemoScope(event.scope || 'project_shared') === 'project_shared') return true;
    const ts = normalizeIsoTimestamp(event.validAt || event.ts);
    return !ts || ts >= cutoff;
  });
}

/* Recall is tokenizer-backed, not substring-backed. A verbatim substring test
 * only fires when the prompt repeats the memo word for word, which is why
 * natural-language recall silently returned nothing.
 *
 * Tokenization is bookkeeping, not judgment:
 *  - latin/digit/underscore/hyphen runs stay whole so paths and identifiers
 *    (CLIENT_ORDER, order-service) are not shredded;
 *  - unspaced scripts (Chinese, Japanese) get ICU word segmentation, plus a
 *    generic character-bigram fallback so a segmenter vocabulary gap cannot
 *    silently zero a recall.
 * No hand-typed stop-word / function-char / synonym table lives here. Whether a
 * surfaced memory was actually useful is the LLM's call (declaration block). */
export function tokenizeForMatch(value) {
  const text = String(value || '').toLowerCase();
  const tokens = new Set();
  for (const latin of text.match(/[\p{L}\p{N}_.-]+/gu) || []) {
    if (!CJK_RUN.test(latin) && latin.length >= 2) tokens.add(latin);
  }
  for (const run of text.match(CJK_RUN) || []) {
    for (const word of segmentWords(run)) {
      if (word.length >= 2) tokens.add(word);
    }
    const chars = [...run];
    if (chars.length === 1) {
      tokens.add(chars[0]);
      continue;
    }
    for (let i = 0; i < chars.length - 1; i += 1) tokens.add(chars[i] + chars[i + 1]);
  }
  return tokens;
}

function matchThreshold(tokenCount) {
  if (tokenCount <= 2) return 1;
  if (tokenCount <= 6) return 0.5;
  return 0.34;
}

function countTokenHits(haystack, tokens) {
  let hits = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) hits += 1;
  }
  return hits;
}

function eventMatchesQuery(event, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return true;
  const haystack = [
    event.text || '',
    ...(Array.isArray(event.refs) ? event.refs : []),
    event.eventId || '',
  ].join(' ').toLowerCase();
  if (haystack.includes(normalizedQuery)) return true;
  const queryTokens = [...tokenizeForMatch(normalizedQuery)];
  if (queryTokens.length === 0) return false;
  const hits = countTokenHits(haystack, queryTokens);
  return hits / queryTokens.length >= matchThreshold(queryTokens.length);
}

function scoreEvent(event, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return 0;
  const text = String(event.text || '').toLowerCase();
  const refs = Array.isArray(event.refs) ? event.refs.join(' ').toLowerCase() : '';
  let score = 0;
  if (text.includes(normalizedQuery)) score += 2;
  if (refs.includes(normalizedQuery)) score += 1;
  const queryTokens = [...tokenizeForMatch(normalizedQuery)];
  if (queryTokens.length > 0) {
    score += (countTokenHits(text, queryTokens) / queryTokens.length) * 4;
    score += (countTokenHits(refs, queryTokens) / queryTokens.length) * 2;
  }
  return score;
}

function eventVisibleForAgent(event, agent) {
  const scope = normalizeMemoScope(event.scope || 'project_shared');
  if (scope === 'project_shared') return true;
  const normalizedAgent = normalizeMemoAgent(agent);
  if (!normalizedAgent) return false;
  return normalizeMemoAgent(event.agent) === normalizedAgent;
}

function filterMemoIdentity(events, { scope = '', agent = '', includeCandidates = false } = {}) {
  const normalizedScope = scope ? normalizeMemoScope(scope) : '';
  return events
    .filter((event) => includeCandidates || event.claimStatus !== 'candidate')
    .filter((event) => !normalizedScope || normalizeMemoScope(event.scope || 'project_shared') === normalizedScope)
    .filter((event) => eventVisibleForAgent(event, agent));
}

// Temporal links are resolved across the whole space before scope filtering;
// temporal policy itself ignores unauthorized and unpromoted candidate links.
function selectVisibleEvents(events, { scope, agent, asOf, includeInvalid, includeCandidates, env }) {
  const temporal = filterTemporal(events, { asOf, includeInvalid });
  if (includeInvalid) return filterMemoIdentity(temporal, { scope, agent, includeCandidates });
  return applyAgentPrivateTtl(
    filterMemoIdentity(temporal, { scope, agent, includeCandidates }),
    asOf,
    env,
  );
}

export async function searchMemoEvents(workspaceRoot, { storage, space = 'default', query = '', limit = 20, scope = '', agent = '', asOf = '', includeInvalid = false, includeCandidates = false, includeArchived = false, maxCharsPerMemory = Infinity, maxTotalChars = Infinity, feedbackScores = null } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const { events } = await collectEvents(workspaceRoot, { storage: resolvedStorage, space });
  const boundedLimit = normalizeLimit(limit);
  const archivedIds = includeArchived ? new Set() : await readDreamArchivedEventIds({ rootDir: workspaceRoot });
  const scores = feedbackScores instanceof Map ? feedbackScores : await readMemoFeedbackScores({ workspaceRoot });
  const scored = sortEventsDescending(selectVisibleEvents(
    events.filter((event) => !archivedIds.has(event.eventId)),
    { scope, agent, asOf, includeInvalid, includeCandidates },
  ))
    .filter((event) => eventMatchesQuery(event, query))
    .map((event) => ({
      ...event,
      matchScore: applyMemoFeedbackBoost(scoreEvent(event, query), scores.get(event.eventId)),
    }))
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

export async function listMemoEvents(workspaceRoot, { storage, space = 'default', limit = 20, scope = '', agent = '', asOf = '', includeInvalid = false, includeCandidates = false, includeArchived = false } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const { events } = await collectEvents(workspaceRoot, { storage: resolvedStorage, space });
  const archivedIds = includeArchived ? new Set() : await readDreamArchivedEventIds({ rootDir: workspaceRoot });
  return sortEventsDescending(selectVisibleEvents(
    events.filter((event) => !archivedIds.has(event.eventId)),
    { scope, agent, asOf, includeInvalid, includeCandidates },
  )).slice(0, normalizeLimit(limit));
}
