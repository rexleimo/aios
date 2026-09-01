/**
 * Budgeted memory and CCRG orientation for every meaningful turn.
 *
 * Recall is fail-open: missing indexes, a graph, or a client hook never blocks
 * the user turn. The returned block is intentionally explicit so clients and
 * users can tell whether recall was attempted, hit, skipped, or failed.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { searchAiosProject } from '../search/unified-search.mjs';
import { segmentWords, tokenizeForMatch } from '../memo/storage/query.mjs';
import { recordMemoRecallFeedback } from '../memo/storage/feedback.mjs';
import { parseMemoryDeclaration } from '../memo/declaration.mjs';

const MAX_HITS = 6;
const MAX_TOTAL_CHARS = 2_000;
const MAX_LINE = 260;
const RECALL_SOURCES = Object.freeze(['memory', 'contextdb', 'plans']);

function clip(value, max = MAX_LINE) {
  const text = String(value || '').replace(/\s+/gu, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

/**
 * Recall is useful for direct and guarded work too. Only an explicit noop or
 * an absent policy decision skips it.
 */
export function shouldCollectTurnRecall(decision = null) {
  if (!decision || typeof decision !== 'object') return false;
  if (decision.disposition === 'noop') return false;
  return Boolean(decision.disposition || decision.continuation);
}

function formatHits(results = []) {
  return results.slice(0, MAX_HITS).map((hit) => {
    const source = hit.source || hit.kind || 'hit';
    const title = hit.title || hit.eventId || hit.ref || source;
    const location = hit.path || hit.eventId || '';
    const suffix = location && location !== title ? ` (${clip(location, 100)})` : '';
    return `- [${source}] ${clip(title)}${suffix}: ${clip(hit.text || hit.excerpt || '')}`;
  });
}

function formatCcrgHits(hits = []) {
  return hits.slice(0, MAX_HITS).map((hit) => {
    const name = hit.qualifiedName || hit.qualified_name || hit.title || 'node';
    const filePath = hit.filePath || hit.file_path || '';
    const kind = hit.kind || 'node';
    return `- [${kind}] ${clip(name)}: ${clip(filePath)}`;
  });
}

export async function queryCcrgGraph(rootDir, {
  query = '',
  queryCcrg = null,
} = {}) {
  if (typeof queryCcrg === 'function') {
    return queryCcrg({ rootDir, query });
  }
  const graphDir = path.join(rootDir, '.code-review-graph');
  const dbPath = path.join(graphDir, 'graph.db');
  if (!existsSync(graphDir) || !existsSync(dbPath)) {
    return { status: 'unavailable', reason: 'graph-not-installed', hits: [] };
  }
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      let metadata = {};
      try {
        metadata = Object.fromEntries(db.prepare('SELECT key, value FROM metadata').all()
          .map((row) => [String(row.key), String(row.value)]));
      } catch {
        metadata = {};
      }
      let nodeCount = 0;
      try {
        nodeCount = Number(db.prepare('SELECT COUNT(*) AS n FROM nodes').get()?.n || 0);
      } catch {
        nodeCount = 0;
      }
      const tokens = String(query || '')
        .toLowerCase()
        .split(/[^\p{L}\p{N}_]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length > 2)
        .slice(0, 4);
      let hits = [];
      if (tokens.length > 0) {
        const clause = tokens.map(() => '(LOWER(qualified_name) LIKE ? OR LOWER(file_path) LIKE ?)').join(' OR ');
        const params = tokens.flatMap((token) => [`%${token}%`, `%${token}%`]);
        hits = db.prepare(
          `SELECT qualified_name, file_path, kind FROM nodes WHERE ${clause} LIMIT ${MAX_HITS}`,
        ).all(...params);
      }
      return {
        status: 'queried',
        nodeCount,
        updatedAt: metadata.last_updated || '',
        hits: hits.map((hit) => ({
          qualifiedName: hit.qualified_name,
          filePath: hit.file_path,
          kind: hit.kind,
        })),
      };
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      status: 'skipped',
      reason: clip(error?.message || error, 120),
      hits: [],
    };
  }
}

function formatCcrgBlock(result = {}) {
  const status = result.status || 'skipped';
  const lines = [`ccrg: ${status}`];
  if (result.reason) lines.push(`- reason: ${clip(result.reason, 120)}`);
  if (result.nodeCount || result.updatedAt) {
    lines.push(`- nodes=${result.nodeCount ?? '?'} updated=${result.updatedAt || '?'}`);
  }
  if (Array.isArray(result.hits) && result.hits.length > 0) {
    lines.push(...formatCcrgHits(result.hits));
  }
  return lines;
}

function normalizeSearchResults(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

/* Build a recall-first query ladder: the verbatim prompt first (precision),
 * then progressively looser content-token fallbacks so natural-language
 * prompts still recall memos that only share keywords.
 *
 * This is deterministic bookkeeping only — no hand-typed stop-word / function
 * char / synonym table. Word boundaries come from the standard library
 * (Intl.Segmenter); content-word and bigram rungs fall back so unspaced-script
 * prompts (Chinese) can still hit. Whether a recall is actually useful is the
 * LLM's decision (declaration block), never a program guess.
 */
export function buildRecallQueries(query) {
  const raw = String(query || '').replace(/\s+/gu, ' ').trim();
  if (!raw) return [];
  const ladders = [raw];
  const lower = raw.toLowerCase();

  // Content-word rung: ICU-segmented words, both Latin and CJK.
  const words = [...new Set(segmentWords(lower).filter((word) => word.length >= 2))];
  if (words.length > 0) ladders.push(words.join(' '));

  // Tokenizer rung: adds the CJK bigram fallback for a looser net.
  const tokens = [...new Set(tokenizeForMatch(lower))];
  if (tokens.length > 0 && tokens.join(' ') !== words.join(' ')) {
    ladders.push(tokens.join(' '));
  }

  return [...new Set(ladders)].filter(Boolean);
}

/* Which recalled memos did the agent actually use? The agent knows best, so
 * it declares them in its memory declaration block (declaration.mjs). We parse
 * that block and keep only the eventIds that were actually recalled this turn —
 * an agent can't usefully adopt a memory it was never shown. No token-overlap
 * guessing: a false useful inflates a noisy memory's rank, and prose overlap is
 * a weak proxy the agent can state directly. Memo events only: contextdb/file
 * hits have no feedback channel. */
export function inferUsefulRecallEventIds({ results = [], response = '' } = {}) {
  const decl = parseMemoryDeclaration(response);
  if (!decl.found || decl.useful.length === 0) return [];
  const recalled = new Set(
    (Array.isArray(results) ? results : [])
      .filter((hit) => String(hit?.source || hit?.kind || '') === 'memory' && String(hit?.eventId || '').startsWith('memo:'))
      .map((hit) => String(hit.eventId)),
  );
  return [...new Set(decl.useful.map(String))].filter((id) => recalled.has(id));
}

export async function collectTurnRecallResult({
  rootDir,
  message = '',
  decision = null,
  queryCcrg = null,
  sessionId = '',
  agent = '',
} = {}) {
  if (!rootDir || !shouldCollectTurnRecall(decision)) {
    return {
      text: '',
      status: 'skipped',
      reason: !rootDir ? 'missing-root' : 'policy-noop',
      hits: 0,
      sources: [],
      ccrg: { status: 'skipped', reason: 'policy-noop', hits: [] },
    };
  }

  const query = String(message || '').replace(/\s+/gu, ' ').trim();
  const lines = ['## AIOS RECALL'];
  let results = [];
  let status = 'completed';
  let reason = '';
  let sources = [...RECALL_SOURCES];

  if (!query) {
    status = 'skipped';
    reason = 'empty-query';
  } else {
    try {
      const recallQueries = buildRecallQueries(query);
      let payload = null;
      for (const candidateQuery of recallQueries) {
        payload = await searchAiosProject(rootDir, {
          query: candidateQuery,
          limit: MAX_HITS,
          sources: RECALL_SOURCES,
          agent,
          excludeSessionId: sessionId,
          maxCharsPerMemory: 320,
          maxTotalChars: MAX_TOTAL_CHARS,
        });
        results = normalizeSearchResults(payload);
        sources = Array.isArray(payload?.sources) && payload.sources.length > 0
          ? payload.sources
          : sources;
        if (results.length > 0) break;
        // Keep the last attempt's payload for status reporting, then degrade
        // the query (natural-language prompts rarely appear verbatim in memos).
      }
      if (results.length === 0 && recallQueries.length > 1) {
        reason = `no-hit-after-${recallQueries.length}-queries`;
      }
    } catch (error) {
      status = 'error';
      reason = clip(error?.message || error, 160);
    }
  }

  lines.push(`status: ${status}`);
  if (reason) lines.push(`reason: ${reason}`);
  lines.push(`sources: ${sources.join(', ')}`);
  lines.push(`hits: ${results.length}`);
  if (results.length > 0) {
    lines.push('contextdb: searched');
    lines.push(...formatHits(results));
  } else if (status === 'error') {
    lines.push(`contextdb: skipped (${reason})`);
  } else if (status === 'skipped') {
    lines.push(`contextdb: skipped (${reason})`);
  } else {
    lines.push('contextdb: no hits under current budget');
  }

  let ccrg = { status: 'skipped', reason: 'not-run', hits: [] };
  try {
    ccrg = await queryCcrgGraph(rootDir, { query, queryCcrg });
  } catch (error) {
    ccrg = { status: 'skipped', reason: clip(error?.message || error, 120), hits: [] };
  }
  lines.push(...formatCcrgBlock(ccrg));

  // Hit-only injection: a no-hit/error/skipped recall block must not prepend
  // boilerplate to the user prompt. The status block itself stays available for
  // observability consumers that explicitly ask for it.
  const block = `${lines.join('\n')}\n`;
  const text = results.length > 0 ? block : '';

  // Recall feedback, impression side: every injected memo event counts as an
  // impression so search can decay memories that keep surfacing but are never
  // adopted. Best-effort — feedback failures must never break recall.
  if (results.length > 0) {
    const memoEventIds = results
      .filter((hit) => String(hit.source || hit.kind || '') === 'memory' && String(hit.eventId || '').startsWith('memo:'))
      .map((hit) => hit.eventId);
    if (memoEventIds.length > 0) {
      await recordMemoRecallFeedback({
        workspaceRoot: rootDir,
        eventIds: memoEventIds,
        query,
        sessionId,
        agent,
        signal: 'impression',
      }).catch(() => {});
    }
  }

  return {
    text,
    status,
    reason,
    hits: results.length,
    sources,
    results,
    ccrg,
    block,
  };
}

export async function collectTurnRecall(options = {}) {
  const result = await collectTurnRecallResult(options);
  // Hook consumers (UserPromptSubmit additionalContext) always get the explicit
  // status block: attempted / hit / no-hit / skipped / error must stay observable
  // even when nothing is worth injecting into the prompt.
  return result.block;
}
