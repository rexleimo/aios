import { getActiveMemoStorage } from './config.mjs';
import { cosineSimilarity } from './embedding.mjs';
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

function eventMatchesQuery(event, query, { entityBoost = true } = {}) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return true;
  const entityText = entityBoost ? eventEntityList(event).join(' ') : '';
  const haystack = [
    event.text || '',
    ...(Array.isArray(event.refs) ? event.refs : []),
    entityText,
    event.eventId || '',
  ].join(' ').toLowerCase();
  if (haystack.includes(normalizedQuery)) return true;
  const queryTokens = [...tokenizeForMatch(normalizedQuery)];
  if (queryTokens.length === 0) return false;
  const hits = countTokenHits(haystack, queryTokens);
  return hits / queryTokens.length >= matchThreshold(queryTokens.length);
}

/* BM25 constants aligned with the sqlite FTS5 sibling (mcp-server
 * contextdb/sqlite/events.ts ranks bm25 with text weighted above refs). IDF
 * comes from the query's matched set — the ranking corpus — so the recall hot
 * path needs no global index; the sum is normalized by its best case so
 * scores keep one stable scale next to the exact-match bonuses below.
 * Normalization bounds ≈ 1 but is not a hard ceiling: short documents with
 * repeated terms saturate past it. */
const BM25_K1 = 1.2;
const BM25_B = 0.75;

/* BM25 separates memories by token evidence; document-length noise inside
 * this margin is not evidence, and recency wins there via the ts tie-break —
 * the prior the coverage scorer used to get for free. Feedback deltas
 * (>= 1.5, see applyMemoFeedbackBoost) clear the margin by design. */
const MATCH_SCORE_EPSILON = 0.2;

function eventDocument(event) {
  const text = String(event.text || '').toLowerCase();
  const refs = Array.isArray(event.refs) ? event.refs.join(' ').toLowerCase() : '';
  return { doc: `${text} ${refs}`, length: text.length + refs.length };
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    count += 1;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count;
}

/* Coverage scoring cannot tell a token that discriminates one memory from a
 * token every memory shares; BM25's IDF term can. Returns one normalized,
 * scale-stable score per event. Whether a surfaced memory was useful remains
 * the consumer's call, recorded via recall feedback. */
function scoreEventsWithBm25(events, queryTokens) {
  if (events.length === 0 || queryTokens.length === 0) return events.map(() => 0);
  const docs = events.map(eventDocument);
  const avgLength = docs.reduce((sum, entry) => sum + entry.length, 0) / docs.length || 1;
  const idf = new Map();
  let maxScore = 0;
  for (const token of queryTokens) {
    const docFrequency = docs.filter((entry) => entry.doc.includes(token)).length;
    if (docFrequency === 0) continue;
    const weight = Math.log(1 + (docs.length - docFrequency + 0.5) / (docFrequency + 0.5));
    idf.set(token, weight);
    maxScore += weight;
  }
  if (maxScore <= 0) return docs.map(() => 0);
  return docs.map(({ doc, length }) => {
    let score = 0;
    const lengthRatio = length / avgLength;
    for (const [token, weight] of idf) {
      const termFrequency = countOccurrences(doc, token);
      if (termFrequency === 0) continue;
      score += weight * ((termFrequency * (BM25_K1 + 1))
        / (termFrequency + BM25_K1 * (1 - BM25_B + BM25_B * lengthRatio)));
    }
    return score / maxScore;
  });
}

function scoreEvent(event, query, bm25Score = 0, entityScore = 0) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return 0;
  const text = String(event.text || '').toLowerCase();
  const refs = Array.isArray(event.refs) ? event.refs.join(' ').toLowerCase() : '';
  let score = 0;
  if (text.includes(normalizedQuery)) score += 2;
  if (refs.includes(normalizedQuery)) score += 1;
  score += bm25Score * 4;
  score += entityScore;
  return score;
}

/* A3 independent entity layer (shape only, never semantics).
 *
 * Writes already carry `entities[]` (B1 contract); reads dropped them until
 * normalizers passthrough landed. This layer links memories across events:
 * exact normalized entities form the link edges, token overlap with the
 * query supplies direct evidence, and one-hop sharing spreads attenuated
 * evidence to linked neighbours.
 *
 * - No word lists: matching reuses `tokenizeForMatch` (ICU + bigram
 *   fallback) and exact lowercased entity equality for links.
 * - Bounded: one hop, per-event max over shared entities, capped.
 * - Scale: direct <= 1.0, spread <= 0.5. Zero when no entities exist, so
 *   pre-entity corpora rank exactly as before (A1 recency discipline holds).
 * - CPU, not IO: like BM25, this costs scan time per recall; the A2 parse
 *   cache does not absorb it. */
export const ENTITY_DIRECT_BOOST = 1.0;
export const ENTITY_SPREAD_BOOST = 0.5;
export const ENTITY_SPREAD_ATTENUATION = 0.5;

export function normalizeEntity(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function eventEntityList(event) {
  if (!event || !Array.isArray(event.entities)) return [];
  const seen = new Set();
  const output = [];
  for (const raw of event.entities) {
    const normalized = normalizeEntity(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

export function scoreEventsWithEntity(events, queryTokens) {
  if (events.length === 0 || queryTokens.length === 0) return events.map(() => 0);
  const querySet = new Set(queryTokens.map((token) => String(token || '').toLowerCase()).filter(Boolean));
  if (querySet.size === 0) return events.map(() => 0);
  const entityTokenSets = events.map((event) => tokenizeForMatch(eventEntityList(event).join(' ')));
  const direct = events.map((_, index) => {
    const entityTokens = entityTokenSets[index];
    if (entityTokens.size === 0) return 0;
    let hits = 0;
    for (const token of querySet) {
      if (entityTokens.has(token)) hits += 1;
    }
    if (hits === 0) return 0;
    return (hits / querySet.size) * ENTITY_DIRECT_BOOST;
  });
  const hasDirect = direct.some((score) => score > 0);
  if (!hasDirect) return direct;
  const entityToIndices = new Map();
  events.forEach((event, index) => {
    for (const entity of eventEntityList(event)) {
      if (!entityToIndices.has(entity)) entityToIndices.set(entity, []);
      entityToIndices.get(entity).push(index);
    }
  });
  return events.map((event, index) => {
    if (direct[index] > 0) return direct[index];
    let spread = 0;
    for (const entity of eventEntityList(event)) {
      const sharers = entityToIndices.get(entity) || [];
      for (const other of sharers) {
        if (other === index || direct[other] <= 0) continue;
        const candidate = direct[other] * ENTITY_SPREAD_ATTENUATION;
        if (candidate > spread) spread = candidate;
      }
    }
    return Math.min(spread, ENTITY_SPREAD_BOOST);
  });
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

export async function searchMemoEvents(workspaceRoot, { storage, space = 'default', query = '', limit = 20, scope = '', agent = '', asOf = '', includeInvalid = false, includeCandidates = false, includeArchived = false, maxCharsPerMemory = Infinity, maxTotalChars = Infinity, feedbackScores = null, entityBoost = true, embedder = null, embeddingCandidates = 40 } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const { events } = await collectEvents(workspaceRoot, { storage: resolvedStorage, space });
  const boundedLimit = normalizeLimit(limit);
  const archivedIds = includeArchived ? new Set() : await readDreamArchivedEventIds({ rootDir: workspaceRoot });
  const scores = feedbackScores instanceof Map ? feedbackScores : await readMemoFeedbackScores({ workspaceRoot });
  const enableEntity = entityBoost !== false;
  const visiblePool = sortEventsDescending(selectVisibleEvents(
    events.filter((event) => !archivedIds.has(event.eventId)),
    { scope, agent, asOf, includeInvalid, includeCandidates },
  ));
  let visible = visiblePool.filter((event) => eventMatchesQuery(event, query, { entityBoost: enableEntity }));
  // A4 coarse stage: an optional local embedder widens the candidate pool
  // with its nearest neighbours. Union-only — it can add candidates to the
  // token-matched set but never remove one — so enabling it cannot lose a
  // result the token path would have returned.
  if (embedder && typeof embedder.embedText === 'function' && String(query || '').trim()) {
    const wanted = Math.max(0, Math.floor(Number(embeddingCandidates) || 0));
    if (wanted > 0) {
      const matchedIds = new Set(visible.map((event) => event.eventId));
      const queryVector = await embedder.embedText(query);
      const neighbours = [];
      for (const event of visiblePool) {
        if (matchedIds.has(event.eventId)) continue;
        const similarity = cosineSimilarity(queryVector, await embedder.embedText(event.text || ''));
        if (similarity > 0) neighbours.push({ event, similarity });
      }
      neighbours.sort((a, b) => b.similarity - a.similarity
        || String(b.event.ts || '').localeCompare(String(a.event.ts || '')));
      visible = visible.concat(neighbours.slice(0, wanted).map((entry) => entry.event));
    }
  }
  const queryTokens = [...tokenizeForMatch(String(query || '').trim().toLowerCase())];
  const bm25Scores = scoreEventsWithBm25(visible, queryTokens);
  const entityScores = enableEntity ? scoreEventsWithEntity(visible, queryTokens) : visible.map(() => 0);
  const scored = visible
    .map((event, index) => ({
      ...event,
      matchScore: applyMemoFeedbackBoost(scoreEvent(event, query, bm25Scores[index], entityScores[index]), scores.get(event.eventId)),
    }))
    .sort((a, b) => {
      const scoreCompare = Number(b.matchScore || 0) - Number(a.matchScore || 0);
      if (Math.abs(scoreCompare) >= MATCH_SCORE_EPSILON) return scoreCompare;
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
