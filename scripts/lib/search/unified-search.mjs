import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  getActiveMemoStorage,
  readPinnedMemo,
  searchMemoEvents,
} from '../memo/storage.mjs';
import { resolveContextDbRoot } from '../aios/state-root.mjs';

const DEFAULT_SOURCES = Object.freeze(['memory', 'contextdb', 'docs', 'plans', 'code']);
const SOURCE_WEIGHTS = Object.freeze({
  memory: 5,
  contextdb: 4,
  plans: 4,
  docs: 3,
  code: 2,
});
const MAX_FILE_BYTES = 256 * 1024;
const MAX_CONTEXT_DB_BYTES = 16 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.txt',
  '.json',
  '.jsonl',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.py',
  '.sh',
  '.yml',
  '.yaml',
  '.toml',
]);
const SKIP_DIRS = new Set([
  '.git',
  '.aios',
  '.cache',
  '.next',
  'dist',
  'node_modules',
  'coverage',
  '__pycache__',
]);

function normalizeLimit(raw, fallback = 20) {
  const value = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, 100);
}

function normalizeSources(raw = DEFAULT_SOURCES) {
  const values = Array.isArray(raw)
    ? raw
    : String(raw || '').split(',');
  const normalized = values
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .flatMap((item) => item === 'all' ? DEFAULT_SOURCES : [item])
    .map((item) => item === 'memo' ? 'memory' : item);
  const selected = normalized.length > 0 ? normalized : DEFAULT_SOURCES;
  const unique = Array.from(new Set(selected));
  const invalid = unique.filter((item) => !DEFAULT_SOURCES.includes(item));
  if (invalid.length > 0) {
    throw new Error(`--source must contain only: ${DEFAULT_SOURCES.join(', ')}`);
  }
  return unique;
}

function queryTokens(query) {
  return String(query || '').toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [];
}

function scoreText(text, query, source) {
  const normalizedText = String(text || '').toLowerCase();
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const tokens = queryTokens(query);
  let score = SOURCE_WEIGHTS[source] || 1;
  if (normalizedQuery && normalizedText.includes(normalizedQuery)) score += 10;
  if (tokens.length > 0) {
    const hits = tokens.filter((token) => normalizedText.includes(token)).length;
    score += (hits / tokens.length) * 8;
  }
  return Number(score.toFixed(4));
}

function textMatches(text, query) {
  const normalizedText = String(text || '').toLowerCase();
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return true;
  if (normalizedText.includes(normalizedQuery)) return true;
  const tokens = queryTokens(query);
  return tokens.length > 0 && tokens.every((token) => normalizedText.includes(token));
}

function compactText(text, maxChars = 280) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

function excerptForQuery(text, query, maxChars = 280) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return compactText(normalized, maxChars);
  const index = normalized.toLowerCase().indexOf(needle);
  if (index < 0) return compactText(normalized, maxChars);
  const start = Math.max(0, index - 80);
  const end = Math.min(normalized.length, start + maxChars);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < normalized.length ? '...' : '';
  return `${prefix}${normalized.slice(start, end).trim()}${suffix}`;
}

function relPath(workspaceRoot, absPath) {
  return path.relative(workspaceRoot, absPath).split(path.sep).join('/');
}

function isWithinRoot(workspaceRoot, absPath) {
  const relative = path.relative(workspaceRoot, absPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function pathExists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(root, workspaceRoot, output = []) {
  if (!await pathExists(root)) return output;
  const rootStat = await fs.stat(root);
  if (rootStat.isFile()) {
    if (rootStat.size <= MAX_FILE_BYTES && TEXT_EXTENSIONS.has(path.extname(root).toLowerCase())) {
      output.push(root);
    }
    return output;
  }
  if (!rootStat.isDirectory()) return output;
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const absPath = path.join(root, entry.name);
    if (!isWithinRoot(workspaceRoot, absPath)) continue;
    if (entry.isDirectory()) {
      await listFiles(absPath, workspaceRoot, output);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const stat = await fs.stat(absPath);
    if (stat.size > MAX_FILE_BYTES) continue;
    output.push(absPath);
  }
  return output;
}

function classifyReferenceSource(relativePath, requestedSource) {
  if (requestedSource === 'plans') return 'plans';
  if (requestedSource === 'code') return 'code';
  if (/^(docs\/plans|docs\/superpowers\/plans)\//u.test(relativePath)) return 'plans';
  return 'docs';
}

async function searchReferenceFiles(workspaceRoot, { query, source, roots, limit }) {
  const files = [];
  for (const root of roots) {
    await listFiles(path.join(workspaceRoot, root), workspaceRoot, files);
  }
  const uniqueFiles = Array.from(new Set(files));
  const results = [];
  for (const absPath of uniqueFiles) {
    const relativePath = relPath(workspaceRoot, absPath);
    if (source === 'docs' && /^(docs\/plans|docs\/superpowers\/plans)\//u.test(relativePath)) continue;
    const text = await fs.readFile(absPath, 'utf8');
    if (!textMatches(`${relativePath}\n${text}`, query)) continue;
    const actualSource = classifyReferenceSource(relativePath, source);
    results.push({
      source: actualSource,
      kind: 'file',
      path: relativePath,
      title: relativePath,
      text: excerptForQuery(text, query),
      score: scoreText(`${relativePath}\n${text}`, query, actualSource),
    });
  }
  return results
    .sort(compareResults)
    .slice(0, limit);
}

async function searchMemory(workspaceRoot, { query, limit, scope, agent, space, maxCharsPerMemory = Infinity, maxTotalChars = Infinity }) {
  const storage = await getActiveMemoStorage(workspaceRoot);
  const rows = await searchMemoEvents(workspaceRoot, {
    storage,
    space,
    query,
    limit,
    scope,
    agent,
    maxCharsPerMemory,
    maxTotalChars,
  });
  const results = rows.map((row) => ({
    source: 'memory',
    kind: 'memo',
    eventId: row.eventId || '',
    title: row.eventId || 'memo',
    text: compactText(row.text),
    score: scoreText(`${row.text || ''} ${(row.refs || []).join(' ')}`, query, 'memory') + Number(row.matchScore || 0),
    ts: row.ts || '',
    refs: Array.isArray(row.refs) ? row.refs : [],
    scope: row.scope || 'project_shared',
    agent: row.agent || '',
  }));

  if (String(scope || '').trim().toLowerCase() !== 'agent_private') {
    const pinned = await readPinnedMemo(workspaceRoot, { storage, space });
    if (pinned && textMatches(pinned, query)) {
      results.push({
        source: 'memory',
        kind: 'pinned',
        title: `pinned:${space}`,
        text: excerptForQuery(pinned, query),
        score: scoreText(pinned, query, 'memory') + 1,
        scope: 'project_shared',
        agent: '',
      });
    }
  }

  return results.sort(compareResults).slice(0, limit);
}

async function readContextDbIndexRows(filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_CONTEXT_DB_BYTES) return [];
    const raw = await fs.readFile(filePath, 'utf8');
    return raw.split(/\r?\n/u)
      .filter((line) => line.trim())
      .flatMap((line) => {
        try {
          const row = JSON.parse(line);
          return row && typeof row === 'object' ? [row] : [];
        } catch {
          return [];
        }
      });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function contextDbRowMatches(row, { query, project = '', sessionId = '', excludeSessionId = '', agent = '' } = {}) {
  if (project && String(row.project || '') !== String(project)) return false;
  if (sessionId && String(row.sessionId || '') !== String(sessionId)) return false;
  if (excludeSessionId && String(row.sessionId || '') === String(excludeSessionId)) return false;
  if (agent && String(row.agent || '') !== String(agent)) return false;
  const text = [
    row.text || '',
    row.summary || '',
    row.project || '',
    row.agent || '',
    row.sessionId || '',
    row.kind || '',
    row.status || '',
    ...(Array.isArray(row.refs) ? row.refs : []),
    ...(Array.isArray(row.artifacts) ? row.artifacts : []),
  ].join(' ');
  return textMatches(text, query);
}

function toContextDbSearchResult(row, itemType, query) {
  const text = itemType === 'checkpoint' ? row.summary || '' : row.text || '';
  const id = row.eventId || row.checkpointId || `${row.sessionId || 'session'}#${row.seq || '?'}`;
  const kind = itemType === 'checkpoint'
    ? `checkpoint:${row.status || 'unknown'}`
    : `event:${row.role || 'unknown'}:${row.kind || 'message'}`;
  const refs = itemType === 'checkpoint'
    ? [...(Array.isArray(row.artifacts) ? row.artifacts : []), ...(Array.isArray(row.refs) ? row.refs : [])]
    : Array.isArray(row.refs) ? row.refs : [];
  return {
    source: 'contextdb',
    kind,
    eventId: id,
    title: `${row.sessionId || 'session'} ${kind}`,
    text: excerptForQuery(text, query),
    score: scoreText(`${text} ${refs.join(' ')}`, query, 'contextdb'),
    ts: row.ts || '',
    refs,
    sessionId: row.sessionId || '',
    project: row.project || '',
    agent: row.agent || '',
  };
}

async function searchContextDb(workspaceRoot, { query, limit, project = '', sessionId = '', excludeSessionId = '', agent = '' }) {
  const contextDbRoot = resolveContextDbRoot(workspaceRoot, { preferLegacyExisting: true });
  const indexRoot = path.join(contextDbRoot, 'index');
  const [events, checkpoints] = await Promise.all([
    readContextDbIndexRows(path.join(indexRoot, 'events.jsonl')),
    readContextDbIndexRows(path.join(indexRoot, 'checkpoints.jsonl')),
  ]);
  const results = [
    ...events
      .filter((row) => contextDbRowMatches(row, { query, project, sessionId, excludeSessionId, agent }))
      .map((row) => toContextDbSearchResult(row, 'event', query)),
    ...checkpoints
      .filter((row) => contextDbRowMatches(row, { query, project, sessionId, excludeSessionId, agent }))
      .map((row) => toContextDbSearchResult(row, 'checkpoint', query)),
  ];
  return results.sort(compareResults).slice(0, limit);
}

function compareResults(a, b) {
  const scoreCompare = Number(b.score || 0) - Number(a.score || 0);
  if (scoreCompare !== 0) return scoreCompare;
  const tsCompare = String(b.ts || '').localeCompare(String(a.ts || ''));
  if (tsCompare !== 0) return tsCompare;
  return String(a.path || a.eventId || a.title || '').localeCompare(String(b.path || b.eventId || b.title || ''));
}

export async function searchAiosProject(workspaceRoot, options = {}) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const query = String(options.query || '').trim();
  if (!query) throw new Error('search requires query text');

  const limit = normalizeLimit(options.limit);
  const sources = normalizeSources(options.sources || options.source);
  const perSourceLimit = Math.max(limit, 10);
  const results = [];

  // Resolve budget from options, falling back to config defaults
  const maxCharsPerMemory = Number.isFinite(Number(options.maxCharsPerMemory))
    ? Number(options.maxCharsPerMemory)
    : Infinity;
  const maxTotalChars = Number.isFinite(Number(options.maxTotalChars))
    ? Number(options.maxTotalChars)
    : Infinity;

  // --mode flag: currently a no-op marker (both modes do the same thing
  // since there is no vector backend yet), but documents intent for
  // future sqlite-vec integration.
  const searchMode = String(options.mode || 'hybrid').trim().toLowerCase();

  if (sources.includes('memory')) {
    results.push(...await searchMemory(root, {
      query,
      limit: perSourceLimit,
      scope: options.scope || '',
      agent: options.agent || '',
      space: options.space || 'default',
      maxCharsPerMemory,
      maxTotalChars,
    }));
  }
  if (sources.includes('contextdb')) {
    results.push(...await searchContextDb(root, {
      query,
      limit: perSourceLimit,
      project: options.project || '',
      sessionId: options.sessionId || '',
      excludeSessionId: options.excludeSessionId || '',
      agent: options.agent || '',
    }));
  }
  if (sources.includes('plans')) {
    results.push(...await searchReferenceFiles(root, {
      query,
      source: 'plans',
      roots: ['docs/plans', 'docs/superpowers/plans'],
      limit: perSourceLimit,
    }));
  }
  if (sources.includes('docs')) {
    results.push(...await searchReferenceFiles(root, {
      query,
      source: 'docs',
      roots: ['README.md', 'README-zh.md', 'AGENTS.md', 'docs', 'docs-site', 'mcp-server/README.md'],
      limit: perSourceLimit,
    }));
  }
  if (sources.includes('code')) {
    results.push(...await searchReferenceFiles(root, {
      query,
      source: 'code',
      roots: ['scripts', 'mcp-server/src', 'mcp-server/tests', 'packages', 'config'],
      limit: perSourceLimit,
    }));
  }

  return {
    query,
    workspaceRoot: root,
    sources,
    limit,
    results: results.sort(compareResults).slice(0, limit),
  };
}
