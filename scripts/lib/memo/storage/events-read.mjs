import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_MEMO_STORAGE,
  JSONL_PARSE_ERROR_CODE,
  JSON_PARSE_ERROR_CODE,
} from './constants.mjs';
import { getActiveMemoStorage } from './config.mjs';
import {
  collectRecursiveFiles,
  createParseError,
  readTextIfExists,
} from './fs-io.mjs';
import {
  normalizeEventRows,
  normalizeMemoStorageName,
  sanitizeSpace,
} from './normalizers.mjs';
import {
  fileEventsPath,
  splitEventDir,
  splitEventsRoot,
} from './paths.mjs';

/* A2 recall-hot-path bound: process-local mtime+size parse cache.
 *
 * Every recall (`searchMemoEvents`/`listMemoEvents`) re-read and re-parsed the
 * whole event stream plus the feedback telemetry file. This cache memoizes the
 * *parse* behind a stat signature (size+mtimeMs+ctimeMs) so repeat recalls in
 * a long-lived process (MCP server, harness loop, turn-recall) pay one stat
 * per file instead of a full read+parse. Writes (append/rewrite) change
 * size/mtime/ctime, so the next lookup restats, misses, and reparses — there
 * is no cross-process shared state to keep coherent, and no lock domain to
 * join (that is the deferred scheme ②, which needs D4). Entries are bounded
 * (FIFO eviction) and hits return structured clones so callers can never
 * mutate the cached rows. */

const PARSE_CACHE_MAX_ENTRIES = 50;
const parseCache = new Map();
const parseCacheStats = { hits: 0, misses: 0, evictions: 0 };

function cacheLookup(key, signature) {
  const entry = parseCache.get(key);
  if (!entry || JSON.stringify(entry.signature) !== JSON.stringify(signature)) return null;
  parseCacheStats.hits += 1;
  return entry;
}

function cacheStore(key, signature, value) {
  if (!parseCache.has(key) && parseCache.size >= PARSE_CACHE_MAX_ENTRIES) {
    parseCache.delete(parseCache.keys().next().value);
    parseCacheStats.evictions += 1;
  }
  parseCacheStats.misses += 1;
  parseCache.set(key, { signature, value });
  return value;
}

export function memoEventsCacheStats() {
  return { ...parseCacheStats, size: parseCache.size, maxEntries: PARSE_CACHE_MAX_ENTRIES };
}

export function clearMemoEventsCache() {
  parseCache.clear();
  parseCacheStats.hits = 0;
  parseCacheStats.misses = 0;
  parseCacheStats.evictions = 0;
}

async function statSignature(filePath) {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) return { exists: false, size: 0, mtimeMs: 0, ctimeMs: 0 };
    return { exists: true, size: stats.size, mtimeMs: stats.mtimeMs, ctimeMs: stats.ctimeMs };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, size: 0, mtimeMs: 0, ctimeMs: 0 };
    throw error;
  }
}

function cloneJsonlValue(value) {
  return { events: structuredClone(value.events), malformed: value.malformed.map((item) => ({ ...item })), raw: value.raw };
}

// cacheStore keeps the canonical copy; callers always receive a clone so the
// first reader cannot mutate the cached rows through the returned reference.
function storeAndClone(key, signature, value) {
  return cloneJsonlValue(cacheStore(key, signature, value));
}

function throwFirstJsonlError(filePath, malformed) {
  const first = malformed[0];
  throw createParseError(
    `Malformed memo JSONL at ${filePath}:${first.line}: ${first.message}`,
    JSONL_PARSE_ERROR_CODE,
    { path: filePath, line: first.line, message: first.message },
  );
}

async function snapshotSplitFiles(rootDir) {
  const files = await collectRecursiveFiles(rootDir, (filePath) => filePath.endsWith('.json'));
  const snapshots = await Promise.all(files.map(async (filePath) => {
    const signature = await statSignature(filePath);
    return {
      relativePath: path.relative(rootDir, filePath).split(path.sep).join('/'),
      ...signature,
    };
  }));
  snapshots.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return snapshots;
}

function throwFirstJsonError(malformed) {
  const first = malformed[0];
  throw createParseError(
    `Malformed memo JSON at ${first.path}: ${first.message}`,
    JSON_PARSE_ERROR_CODE,
    { path: first.path, message: first.message },
  );
}

export async function readJsonlEvents(filePath, { tolerateMalformed = false } = {}) {
  // One entry per file regardless of the tolerate flag: the cached parse is
  // always the full tolerant pass, and strict callers re-raise from the first
  // malformed row — byte-identical to a fresh strict read, which throws at the
  // first malformed line without parsing the rest.
  const absolutePath = path.resolve(filePath);
  const cacheKey = `jsonl:${absolutePath}`;
  const signature = await statSignature(absolutePath);
  const hit = cacheLookup(cacheKey, signature);
  if (hit) {
    if (hit.value.malformed.length > 0 && !tolerateMalformed) throwFirstJsonlError(filePath, hit.value.malformed);
    return cloneJsonlValue(hit.value);
  }
  const raw = await readTextIfExists(absolutePath);
  if (!raw.trim()) {
    return storeAndClone(cacheKey, signature, { events: [], malformed: [], raw });
  }
  const events = [];
  const malformed = [];
  const lines = raw.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      events.push(parsed);
    } catch (error) {
      const detail = {
        path: filePath,
        line: index + 1,
        message: error.message,
      };
      malformed.push(detail);
      if (!tolerateMalformed) {
        throw createParseError(
          `Malformed memo JSONL at ${filePath}:${index + 1}: ${error.message}`,
          JSONL_PARSE_ERROR_CODE,
          detail,
        );
      }
    }
  }
  return storeAndClone(cacheKey, signature, { events, malformed, raw });
}

export async function readSplitEvents(workspaceRoot, { space, tolerateMalformed = false, env = process.env } = {}) {
  const requestedSpace = space ? sanitizeSpace(space) : '';
  const roots = [];
  if (requestedSpace) {
    roots.push({ safeSpace: requestedSpace, dir: splitEventDir(workspaceRoot, requestedSpace, { env }) });
  } else {
    let entries = [];
    try {
      entries = await fs.readdir(splitEventsRoot(workspaceRoot, { env }), { withFileTypes: true });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        roots.push({ safeSpace: entry.name, dir: path.join(splitEventsRoot(workspaceRoot, { env }), entry.name) });
      }
    }
  }

  roots.sort((a, b) => a.safeSpace.localeCompare(b.safeSpace));
  const cacheKey = `split:${path.resolve(splitEventsRoot(workspaceRoot, { env }))}:${requestedSpace || ''}`;
  const signature = [];
  for (const root of roots) signature.push({ dir: path.relative(workspaceRoot, root.dir).split(path.sep).join('/'), files: await snapshotSplitFiles(root.dir) });
  const hit = cacheLookup(cacheKey, signature);
  if (hit) {
    if (hit.value.malformed.length > 0 && !tolerateMalformed) throwFirstJsonError(hit.value.malformed);
    return cloneJsonlValue(hit.value);
  }
  const events = [];
  const malformed = [];
  for (const root of roots) {
    const files = await collectRecursiveFiles(root.dir, (filePath) => filePath.endsWith('.json'));
    for (const filePath of files) {
      const raw = await readTextIfExists(filePath);
      try {
        events.push(JSON.parse(raw));
      } catch (error) {
        const detail = { path: filePath, message: error.message };
        malformed.push(detail);
        if (!tolerateMalformed) {
          throw createParseError(
            `Malformed memo JSON at ${filePath}: ${error.message}`,
            JSON_PARSE_ERROR_CODE,
            detail,
          );
        }
      }
    }
  }
  return storeAndClone(cacheKey, signature, { events, malformed, raw: '' });
}

export async function collectEvents(workspaceRoot, { storage, space, tolerateMalformed = false, env = process.env } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot, { env });
  if (resolvedStorage === 'file') {
    const { events, malformed } = await readJsonlEvents(fileEventsPath(workspaceRoot, { env }), { tolerateMalformed });
    return {
      events: normalizeEventRows(events, { fallbackStorage: resolvedStorage }).filter((event) => !space || event.spaceKey === sanitizeSpace(space)),
      malformed,
    };
  }
  const { events, malformed } = await readSplitEvents(workspaceRoot, { space, tolerateMalformed, env });
  return {
    events: normalizeEventRows(events, { fallbackStorage: resolvedStorage || DEFAULT_MEMO_STORAGE }),
    malformed,
  };
}
