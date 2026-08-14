/**
 * Budgeted ContextDB + CCRG orientation for planned / resume turns.
 * Fail-open: missing memory or graph never blocks the user turn.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { searchAiosProject } from '../search/unified-search.mjs';

const MAX_HITS = 4;
const MAX_TOTAL_CHARS = 1_600;
const MAX_LINE = 220;

function clip(value, max = MAX_LINE) {
  const text = String(value || '').replace(/\s+/gu, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function shouldCollectTurnRecall(decision = null) {
  if (!decision || typeof decision !== 'object') return false;
  if (decision.disposition === 'planned') return true;
  return ['explicit-resume', 'same-session-ack'].includes(decision.continuation);
}

function formatHits(results = []) {
  return results.slice(0, MAX_HITS).map((hit) => {
    const source = hit.source || hit.kind || 'hit';
    const title = hit.title || hit.eventId || hit.ref || source;
    return `- [${source}] ${clip(title)}: ${clip(hit.text || hit.excerpt || '')}`;
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

export async function collectTurnRecall({
  rootDir,
  message = '',
  decision = null,
  queryCcrg = null,
} = {}) {
  if (!rootDir || !shouldCollectTurnRecall(decision)) return '';
  const query = String(message || '').replace(/\s+/gu, ' ').trim();
  const lines = ['## AIOS RECALL', `query: ${clip(query, 160)}`];

  try {
    const hits = query
      ? await searchAiosProject(rootDir, {
        query,
        limit: MAX_HITS,
        sources: ['memory', 'plans'],
        maxCharsPerMemory: 280,
        maxTotalChars: MAX_TOTAL_CHARS,
      })
      : [];
    if (hits.length > 0) {
      lines.push('contextdb:');
      lines.push(...formatHits(hits));
    } else {
      lines.push('contextdb: no hits under current budget');
    }
  } catch (error) {
    lines.push(`contextdb: skipped (${clip(error?.message || error, 120)})`);
  }

  const ccrg = await queryCcrgGraph(rootDir, { query, queryCcrg });
  lines.push(...formatCcrgBlock(ccrg));
  return `${lines.join('\n')}\n`;
}
