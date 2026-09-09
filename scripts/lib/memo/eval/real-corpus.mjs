import { collectEvents } from '../storage/events-read.mjs';
import { searchMemoEvents, tokenizeForMatch } from '../storage/query.mjs';

/* G1 real-corpus eval: the AB harness measures synthetic chains; this harness
 * measures the live project corpus instead, so retrieval changes are judged
 * against real precision rather than self-built fixtures. Same-runner
 * discipline: run this before and after a retrieval change and compare.
 * Derivation is runtime-only — no memo text is copied into the repo; only
 * the measured numbers land in records. Queries are the rarest tokens of
 * each active fact (document-frequency filtered), so each query points at
 * one identifiable live event. */

export function buildRealCorpusQueries(events, { maxQueries = 50, queryTokens = 3 } = {}) {
  const superseded = new Set();
  for (const event of events) {
    for (const id of (Array.isArray(event.supersedes) ? event.supersedes : [])) {
      if (id) superseded.add(id);
    }
  }
  const active = events.filter((event) => event.text && event.eventId && !superseded.has(event.eventId));
  const documentFrequency = new Map();
  for (const event of active) {
    for (const token of new Set(tokenizeForMatch(event.text))) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }
  const queries = [];
  for (const event of active) {
    const tokens = [...new Set(tokenizeForMatch(event.text))]
      .map((token) => [token, documentFrequency.get(token) || 1])
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .slice(0, queryTokens)
      .map(([token]) => token);
    if (tokens.length === 0) continue;
    queries.push({ eventId: event.eventId, spaceKey: event.spaceKey, query: tokens.join(' ') });
    if (queries.length >= maxQueries) break;
  }
  return queries;
}

export async function measureRealCorpus(workspaceRoot, {
  storage = '',
  limit = 5,
  maxQueries = 50,
  env = process.env,
} = {}) {
  const { events } = await collectEvents(workspaceRoot, { storage, space: '', tolerateMalformed: true, env });
  if (events.length === 0) {
    return { empty: true, corpusEvents: 0, queries: 0, top1Accuracy: null, top5Accuracy: null, avgReturned: 0 };
  }
  const queries = buildRealCorpusQueries(events, { maxQueries });
  let top1 = 0;
  let top5 = 0;
  let returned = 0;
  for (const { eventId, spaceKey, query } of queries) {
    const rows = await searchMemoEvents(workspaceRoot, {
      storage,
      space: spaceKey,
      query,
      limit,
      scope: '',
      agent: '',
      asOf: '',
      includeInvalid: false,
    });
    const ids = (Array.isArray(rows) ? rows : []).map((row) => row.eventId);
    returned += ids.length;
    if (ids[0] === eventId) top1 += 1;
    if (ids.includes(eventId)) top5 += 1;
  }
  const count = queries.length;
  return {
    empty: false,
    corpusEvents: events.length,
    queries: count,
    top1Accuracy: count > 0 ? top1 / count : null,
    top5Accuracy: count > 0 ? top5 / count : null,
    avgReturned: count > 0 ? returned / count : 0,
  };
}
