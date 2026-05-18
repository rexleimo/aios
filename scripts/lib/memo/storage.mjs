import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveMemoRoot } from '../aios/state-root.mjs';

export const SUPPORTED_MEMO_STORAGES = Object.freeze(['split', 'file']);
export const DEFAULT_MEMO_STORAGE = 'file';

const CONFIG_FILE = 'config.json';
const FILE_EVENTS_SEGMENTS = ['file', 'events.jsonl'];
const WORKSPACE_MEMORY_SESSION_PREFIX = 'workspace-memory--';
const JSONL_PARSE_ERROR_CODE = 'AIOS_MEMO_STORAGE_JSONL_PARSE';
const JSON_PARSE_ERROR_CODE = 'AIOS_MEMO_STORAGE_JSON_PARSE';

function workspacePath(workspaceRoot, ...segments) {
  return path.join(path.resolve(workspaceRoot || process.cwd()), ...segments);
}

function memoRoot(workspaceRoot) {
  return resolveMemoRoot(workspaceRoot);
}

function configPath(workspaceRoot) {
  return path.join(memoRoot(workspaceRoot), CONFIG_FILE);
}

function fileEventsPath(workspaceRoot) {
  return path.join(memoRoot(workspaceRoot), ...FILE_EVENTS_SEGMENTS);
}

function filePinnedPath(workspaceRoot, safeSpace) {
  return path.join(memoRoot(workspaceRoot), 'file', 'pinned', `${safeSpace}.md`);
}

function splitEventsRoot(workspaceRoot) {
  return path.join(memoRoot(workspaceRoot), 'split', 'events');
}

function splitEventDir(workspaceRoot, safeSpace) {
  return path.join(splitEventsRoot(workspaceRoot), safeSpace);
}

function splitPinnedPath(workspaceRoot, safeSpace) {
  return path.join(memoRoot(workspaceRoot), 'split', 'pinned', `${safeSpace}.md`);
}

function derivedDir(workspaceRoot, storage) {
  return path.join(memoRoot(workspaceRoot), 'derived', storage);
}

function derivedManifestPath(workspaceRoot, storage) {
  return path.join(derivedDir(workspaceRoot, storage), 'manifest.json');
}

function derivedDocsPath(workspaceRoot, storage) {
  return path.join(derivedDir(workspaceRoot, storage), 'docs.jsonl');
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeText(filePath, content) {
  await ensureParentDir(filePath);
  await fs.writeFile(filePath, content, 'utf8');
}

async function atomicWriteText(filePath, content) {
  await ensureParentDir(filePath);
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rename(tempPath, filePath);
}

async function appendText(filePath, content) {
  await ensureParentDir(filePath);
  await fs.appendFile(filePath, content, 'utf8');
}

function sha256Hex(content) {
  return createHash('sha256').update(content).digest('hex');
}

function hashParts(parts) {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(String(part.relativePath || ''), 'utf8');
    hash.update('\0');
    hash.update(part.content || '');
    hash.update('\0');
  }
  return hash.digest('hex');
}

function normalizeSpaceName(raw) {
  const value = String(raw || '').trim();
  return value || 'default';
}

function sanitizeSpace(raw) {
  const original = normalizeSpaceName(raw);
  const normalized = original
    .toLowerCase()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (normalized) return normalized;
  return `space-${sha256Hex(original).slice(0, 10)}`;
}

function normalizeLimit(raw, fallback = 20) {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function toRefs(refs = []) {
  if (!Array.isArray(refs)) return [];
  const output = [];
  const seen = new Set();
  for (const ref of refs) {
    const value = String(ref || '').replace(/^#+/u, '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

function createParseError(message, code, details = {}) {
  const error = new Error(message);
  const { message: parseMessage, ...rest } = details;
  error.code = code;
  Object.assign(error, rest);
  if (parseMessage) {
    error.parseMessage = parseMessage;
  }
  return error;
}

export function normalizeMemoStorageName(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'stream' || value === 'file-stream') return 'file';
  if (SUPPORTED_MEMO_STORAGES.includes(value)) return value;
  throw new Error(`storage must be one of: ${SUPPORTED_MEMO_STORAGES.join(', ')}`);
}

async function readConfig(workspaceRoot) {
  const filePath = configPath(workspaceRoot);
  const raw = await readTextIfExists(filePath);
  if (!raw.trim()) return { exists: false, active: DEFAULT_MEMO_STORAGE, path: filePath };
  try {
    const parsed = JSON.parse(raw);
    const active = normalizeMemoStorageName(parsed?.active || parsed?.storage || '');
    return { exists: true, active, path: filePath, parsed };
  } catch (error) {
    error.message = `Invalid memo storage config at ${filePath}: ${error.message}`;
    throw error;
  }
}

export async function getActiveMemoStorage(workspaceRoot) {
  const config = await readConfig(workspaceRoot);
  return config.active || DEFAULT_MEMO_STORAGE;
}

export async function setActiveMemoStorage(workspaceRoot, storage) {
  const active = normalizeMemoStorageName(storage);
  await atomicWriteText(
    configPath(workspaceRoot),
    `${JSON.stringify({
      schemaVersion: 1,
      active,
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`
  );
  return active;
}

async function collectRecursiveFiles(rootDir, predicate = () => true) {
  const output = [];
  async function visit(currentDir) {
    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && predicate(entryPath, entry)) {
        output.push(entryPath);
      }
    }
  }
  await visit(rootDir);
  return output;
}

async function readJsonlEvents(filePath, { tolerateMalformed = false } = {}) {
  const raw = await readTextIfExists(filePath);
  if (!raw.trim()) {
    return { events: [], malformed: [], raw };
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
          detail
        );
      }
    }
  }
  return { events, malformed, raw };
}

async function readSplitEvents(workspaceRoot, { space, tolerateMalformed = false } = {}) {
  const requestedSpace = space ? sanitizeSpace(space) : '';
  const roots = [];
  if (requestedSpace) {
    roots.push({ safeSpace: requestedSpace, dir: splitEventDir(workspaceRoot, requestedSpace) });
  } else {
    let entries = [];
    try {
      entries = await fs.readdir(splitEventsRoot(workspaceRoot), { withFileTypes: true });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        roots.push({ safeSpace: entry.name, dir: path.join(splitEventsRoot(workspaceRoot), entry.name) });
      }
    }
  }

  roots.sort((a, b) => a.safeSpace.localeCompare(b.safeSpace));
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
            detail
          );
        }
      }
    }
  }
  return { events, malformed };
}

async function collectEvents(workspaceRoot, { storage, space, tolerateMalformed = false } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  if (resolvedStorage === 'file') {
    const { events, malformed } = await readJsonlEvents(fileEventsPath(workspaceRoot), { tolerateMalformed });
    return {
      events: normalizeEventRows(events, { fallbackStorage: resolvedStorage }).filter((event) => !space || event.spaceKey === sanitizeSpace(space)),
      malformed,
    };
  }
  const { events, malformed } = await readSplitEvents(workspaceRoot, { space, tolerateMalformed });
  return {
    events: normalizeEventRows(events, { fallbackStorage: resolvedStorage }),
    malformed,
  };
}

function normalizeEventRows(events, { fallbackStorage = DEFAULT_MEMO_STORAGE } = {}) {
  return events
    .filter((event) => event && typeof event === 'object')
    .map((event) => {
      const space = normalizeSpaceName(event.space || event.spaceName || 'default');
      const spaceKey = event.spaceKey || sanitizeSpace(space);
      return {
        schemaVersion: Number.isFinite(event.schemaVersion) ? event.schemaVersion : 1,
        eventId: String(event.eventId || ''),
        storage: event.storage ? String(event.storage) : fallbackStorage,
        space,
        spaceKey,
        seq: Number.isFinite(event.seq) ? event.seq : undefined,
        ts: event.ts ? String(event.ts) : '',
        role: event.role ? String(event.role) : 'user',
        kind: event.kind ? String(event.kind) : 'memo',
        text: event.text ? String(event.text) : '',
        refs: toRefs(event.refs || []),
        turn: event.turn && typeof event.turn === 'object' ? event.turn : undefined,
        legacy: event.legacy && typeof event.legacy === 'object' ? event.legacy : undefined,
      };
    })
    .filter((event) => event.kind === 'memo' && event.text.trim());
}

function sortEventsAscending(events) {
  return [...events].sort((a, b) => {
    const tsCompare = String(a.ts || '').localeCompare(String(b.ts || ''));
    if (tsCompare !== 0) return tsCompare;
    const seqCompare = Number(a.seq || 0) - Number(b.seq || 0);
    if (seqCompare !== 0) return seqCompare;
    return String(a.eventId || '').localeCompare(String(b.eventId || ''));
  });
}

function sortEventsDescending(events) {
  return sortEventsAscending(events).reverse();
}

async function nextFileSeq(workspaceRoot) {
  const { events } = await readJsonlEvents(fileEventsPath(workspaceRoot), { tolerateMalformed: false });
  const maxSeq = events.reduce((max, event) => Math.max(max, Number.isFinite(event?.seq) ? event.seq : 0), 0);
  return maxSeq + 1;
}

async function nextSplitSeq(workspaceRoot, safeSpace) {
  const files = await collectRecursiveFiles(splitEventDir(workspaceRoot, safeSpace), (filePath) => /^\d+\.json$/u.test(path.basename(filePath)));
  const maxSeq = files.reduce((max, filePath) => {
    const parsed = Number.parseInt(path.basename(filePath, '.json'), 10);
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 0);
  return maxSeq + 1;
}

function paddedSeq(seq) {
  return String(seq).padStart(12, '0');
}

function createMemoEvent({ storage, space, text, refs, turn, seq, eventId, ts, legacy }) {
  const normalizedSpace = normalizeSpaceName(space);
  const safeSpace = sanitizeSpace(normalizedSpace);
  const timestamp = ts ? String(ts) : new Date().toISOString();
  const id = eventId || `memo:${safeSpace}:${timestamp.replace(/[-:.TZ]/gu, '')}-${randomUUID().slice(0, 8)}`;
  return {
    schemaVersion: 1,
    eventId: id,
    storage,
    space: normalizedSpace,
    spaceKey: safeSpace,
    seq,
    ts: timestamp,
    role: 'user',
    kind: 'memo',
    text: String(text ?? '').trim(),
    refs: toRefs(refs),
    ...(turn && typeof turn === 'object' ? { turn } : {}),
    ...(legacy && typeof legacy === 'object' ? { legacy } : {}),
  };
}

async function writeEventToFile(workspaceRoot, event) {
  await appendText(fileEventsPath(workspaceRoot), `${JSON.stringify(event)}\n`);
}

async function writeEventToSplit(workspaceRoot, event) {
  const safeSpace = event.spaceKey || sanitizeSpace(event.space);
  const seq = Number.isFinite(event.seq) && event.seq > 0 ? event.seq : await nextSplitSeq(workspaceRoot, safeSpace);
  const filePath = path.join(splitEventDir(workspaceRoot, safeSpace), `${paddedSeq(seq)}.json`);
  const normalized = { ...event, seq };
  await atomicWriteText(filePath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

async function writeExistingEvents(workspaceRoot, storage, events) {
  const normalizedStorage = normalizeMemoStorageName(storage);
  const sorted = sortEventsAscending(events);
  if (normalizedStorage === 'file') {
    for (let index = 0; index < sorted.length; index += 1) {
      const event = createMemoEvent({
        ...sorted[index],
        storage: normalizedStorage,
        seq: index + 1,
        eventId: sorted[index].eventId,
      });
      await writeEventToFile(workspaceRoot, event);
    }
    return;
  }

  const nextBySpace = new Map();
  for (const sourceEvent of sorted) {
    const safeSpace = sourceEvent.spaceKey || sanitizeSpace(sourceEvent.space);
    if (!nextBySpace.has(safeSpace)) {
      nextBySpace.set(safeSpace, await nextSplitSeq(workspaceRoot, safeSpace));
    }
    const seq = nextBySpace.get(safeSpace);
    nextBySpace.set(safeSpace, seq + 1);
    const event = createMemoEvent({
      ...sourceEvent,
      storage: normalizedStorage,
      seq,
      eventId: sourceEvent.eventId,
    });
    await writeEventToSplit(workspaceRoot, event);
  }
}

export async function appendMemoEvent({ workspaceRoot, storage, space = 'default', text, refs = [], turn = undefined } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const content = String(text ?? '').trim();
  if (!content) {
    throw new Error('memo text is required');
  }

  const safeSpace = sanitizeSpace(space);
  const seq = resolvedStorage === 'file'
    ? await nextFileSeq(workspaceRoot)
    : await nextSplitSeq(workspaceRoot, safeSpace);
  const event = createMemoEvent({
    storage: resolvedStorage,
    space,
    text: content,
    refs,
    turn,
    seq,
  });

  if (resolvedStorage === 'file') {
    await writeEventToFile(workspaceRoot, event);
    return event;
  }
  return await writeEventToSplit(workspaceRoot, event);
}

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

function pinnedFilePath(workspaceRoot, storage, space) {
  const resolvedStorage = normalizeMemoStorageName(storage);
  const safeSpace = sanitizeSpace(space);
  return resolvedStorage === 'file'
    ? filePinnedPath(workspaceRoot, safeSpace)
    : splitPinnedPath(workspaceRoot, safeSpace);
}

export async function readPinnedMemo(workspaceRoot, { storage, space = 'default' } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  return await readTextIfExists(pinnedFilePath(workspaceRoot, resolvedStorage, space));
}

export async function writePinnedMemo(workspaceRoot, { storage, space = 'default', content = '' } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const normalized = String(content ?? '').trimEnd();
  const next = normalized ? `${normalized}\n` : '';
  await writeText(pinnedFilePath(workspaceRoot, resolvedStorage, space), next);
  return next;
}

export async function appendPinnedMemo(workspaceRoot, { storage, space = 'default', content = '' } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const addition = String(content ?? '').trim();
  if (!addition) return await readPinnedMemo(workspaceRoot, { storage: resolvedStorage, space });
  const existing = (await readPinnedMemo(workspaceRoot, { storage: resolvedStorage, space })).trimEnd();
  const next = existing ? `${existing}\n\n${addition}\n` : `${addition}\n`;
  await writeText(pinnedFilePath(workspaceRoot, resolvedStorage, space), next);
  return next;
}

async function canonicalSourceFiles(workspaceRoot, storage) {
  const resolvedStorage = normalizeMemoStorageName(storage);
  const root = memoRoot(workspaceRoot);
  if (resolvedStorage === 'file') {
    const files = [];
    if (await pathExists(fileEventsPath(workspaceRoot))) {
      files.push(fileEventsPath(workspaceRoot));
    }
    files.push(...await collectRecursiveFiles(path.join(root, 'file', 'pinned'), (filePath) => filePath.endsWith('.md')));
    return files;
  }

  const files = [
    ...await collectRecursiveFiles(path.join(root, 'split', 'events'), (filePath) => filePath.endsWith('.json')),
    ...await collectRecursiveFiles(path.join(root, 'split', 'pinned'), (filePath) => filePath.endsWith('.md')),
  ];
  return files.sort((a, b) => a.localeCompare(b));
}

async function sourceDigest(workspaceRoot, storage) {
  const root = memoRoot(workspaceRoot);
  const files = await canonicalSourceFiles(workspaceRoot, storage);
  const parts = [];
  let bytes = 0;
  for (const filePath of files) {
    const content = await fs.readFile(filePath);
    bytes += content.length;
    parts.push({
      relativePath: path.relative(root, filePath).split(path.sep).join('/'),
      content,
    });
  }
  return {
    digest: hashParts(parts),
    files: parts.map((part) => part.relativePath),
    bytes,
  };
}

function eventToDerivedDoc(event) {
  return {
    id: event.eventId,
    eventId: event.eventId,
    storage: event.storage,
    space: event.space,
    spaceKey: event.spaceKey,
    ts: event.ts,
    text: event.text,
    refs: event.refs || [],
  };
}

export async function rebuildMemoStorage(workspaceRoot, { storage } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const { events } = await collectEvents(workspaceRoot, { storage: resolvedStorage });
  const source = await sourceDigest(workspaceRoot, resolvedStorage);
  const docs = sortEventsAscending(events).map(eventToDerivedDoc);
  const docsText = docs.map((doc) => JSON.stringify(doc)).join('\n');
  const manifest = {
    schemaVersion: 1,
    storage: resolvedStorage,
    builtAt: new Date().toISOString(),
    source,
    records: docs.length,
    docs: 'docs.jsonl',
  };

  await fs.rm(derivedDir(workspaceRoot, resolvedStorage), { recursive: true, force: true });
  await writeText(derivedDocsPath(workspaceRoot, resolvedStorage), docsText ? `${docsText}\n` : '');
  await atomicWriteText(derivedManifestPath(workspaceRoot, resolvedStorage), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function readPinnedByStorage(workspaceRoot, storage) {
  const resolvedStorage = normalizeMemoStorageName(storage);
  const pinnedRoot = path.join(memoRoot(workspaceRoot), resolvedStorage, 'pinned');
  const files = await collectRecursiveFiles(pinnedRoot, (filePath) => filePath.endsWith('.md'));
  const output = [];
  for (const filePath of files) {
    const safeSpace = path.basename(filePath, '.md');
    const content = await readTextIfExists(filePath);
    if (content) output.push({ safeSpace, content });
  }
  return output;
}

async function writePinnedByStorage(workspaceRoot, storage, pinned) {
  const resolvedStorage = normalizeMemoStorageName(storage);
  for (const entry of pinned) {
    const targetPath = resolvedStorage === 'file'
      ? filePinnedPath(workspaceRoot, entry.safeSpace)
      : splitPinnedPath(workspaceRoot, entry.safeSpace);
    await writeText(targetPath, entry.content || '');
  }
}

async function hasStorageData(workspaceRoot, storage) {
  const resolvedStorage = normalizeMemoStorageName(storage);
  const { events } = await collectEvents(workspaceRoot, { storage: resolvedStorage, tolerateMalformed: true });
  if (events.length > 0) return true;
  const pinned = await readPinnedByStorage(workspaceRoot, resolvedStorage);
  return pinned.some((entry) => String(entry.content || '').trim());
}

async function convertStorage(workspaceRoot, { source, target }) {
  const sourceStorage = normalizeMemoStorageName(source);
  const targetStorage = normalizeMemoStorageName(target);
  const { events } = await collectEvents(workspaceRoot, { storage: sourceStorage });
  const pinned = await readPinnedByStorage(workspaceRoot, sourceStorage);
  await writeExistingEvents(workspaceRoot, targetStorage, events);
  await writePinnedByStorage(workspaceRoot, targetStorage, pinned);
  return { events: events.length, pinned: pinned.length };
}

async function legacySessionRoots(workspaceRoot) {
  const roots = [
    workspacePath(workspaceRoot, '.aios', 'context-db', 'sessions'),
    workspacePath(workspaceRoot, 'memory', 'context-db', 'sessions'),
  ];
  const output = [];
  for (const root of roots) {
    let entries = [];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(WORKSPACE_MEMORY_SESSION_PREFIX)) {
        output.push({
          sessionId: entry.name,
          dir: path.join(root, entry.name),
          space: entry.name.slice(WORKSPACE_MEMORY_SESSION_PREFIX.length) || 'default',
        });
      }
    }
  }
  output.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  return output;
}

async function importLegacyWorkspaceMemoEvents(workspaceRoot, targetStorage) {
  const sessions = await legacySessionRoots(workspaceRoot);
  const events = [];
  const pinned = [];
  for (const session of sessions) {
    const pinnedContent = await readTextIfExists(path.join(session.dir, 'pinned.md'));
    if (pinnedContent) {
      pinned.push({ safeSpace: sanitizeSpace(session.space), content: pinnedContent });
    }

    const { events: rawEvents } = await readJsonlEvents(path.join(session.dir, 'l2-events.jsonl'));
    for (const raw of rawEvents) {
      if (!raw || raw.kind !== 'memo') continue;
      const legacySeq = Number.isFinite(raw.seq) ? raw.seq : events.length + 1;
      events.push(createMemoEvent({
        storage: targetStorage,
        space: session.space,
        text: raw.text,
        refs: raw.refs || [],
        turn: raw.turn,
        ts: raw.ts,
        eventId: raw.eventId || `legacy:${session.sessionId}#${legacySeq}`,
        legacy: {
          sessionId: session.sessionId,
          seq: legacySeq,
        },
      }));
    }
  }

  await writeExistingEvents(workspaceRoot, targetStorage, events);
  await writePinnedByStorage(workspaceRoot, targetStorage, pinned);
  return { events: events.length, pinned: pinned.length };
}

export async function switchMemoStorage(workspaceRoot, { target } = {}) {
  const targetStorage = normalizeMemoStorageName(target);
  const activeStorage = await getActiveMemoStorage(workspaceRoot);
  let migrated = { events: 0, pinned: 0, source: 'none' };

  if (!await hasStorageData(workspaceRoot, targetStorage)) {
    if (activeStorage !== targetStorage && await hasStorageData(workspaceRoot, activeStorage)) {
      const result = await convertStorage(workspaceRoot, { source: activeStorage, target: targetStorage });
      migrated = { ...result, source: activeStorage };
    } else {
      const result = await importLegacyWorkspaceMemoEvents(workspaceRoot, targetStorage);
      migrated = { ...result, source: 'legacy' };
    }
  }

  const manifest = await rebuildMemoStorage(workspaceRoot, { storage: targetStorage });
  await setActiveMemoStorage(workspaceRoot, targetStorage);
  return {
    active: targetStorage,
    previous: activeStorage,
    migrated,
    manifest,
  };
}

async function countFileRecords(workspaceRoot) {
  const { events, malformed } = await readJsonlEvents(fileEventsPath(workspaceRoot), { tolerateMalformed: true });
  return { records: normalizeEventRows(events, { fallbackStorage: 'file' }).length, malformed: malformed.length };
}

async function countSplitRecords(workspaceRoot) {
  const { events, malformed } = await readSplitEvents(workspaceRoot, { tolerateMalformed: true });
  return { records: normalizeEventRows(events, { fallbackStorage: 'split' }).length, malformed: malformed.length };
}

export async function getMemoStorageStatus(workspaceRoot) {
  let active = DEFAULT_MEMO_STORAGE;
  let config = { exists: false, path: configPath(workspaceRoot) };
  try {
    const parsed = await readConfig(workspaceRoot);
    active = parsed.active;
    config = { exists: parsed.exists, path: parsed.path };
  } catch (error) {
    config = { exists: await pathExists(configPath(workspaceRoot)), path: configPath(workspaceRoot), error: error.message };
  }

  const fileExists = await pathExists(fileEventsPath(workspaceRoot));
  const splitEventsExist = await pathExists(splitEventsRoot(workspaceRoot));
  const fileCounts = await countFileRecords(workspaceRoot);
  const splitCounts = await countSplitRecords(workspaceRoot);

  return {
    active,
    supported: [...SUPPORTED_MEMO_STORAGES],
    config,
    available: {
      split: {
        exists: splitEventsExist,
        records: splitCounts.records,
        malformed: splitCounts.malformed,
        path: path.join(memoRoot(workspaceRoot), 'split'),
      },
      file: {
        exists: fileExists,
        records: fileCounts.records,
        malformed: fileCounts.malformed,
        path: path.join(memoRoot(workspaceRoot), 'file'),
      },
    },
    derived: {
      split: {
        exists: await pathExists(derivedManifestPath(workspaceRoot, 'split')),
        path: derivedDir(workspaceRoot, 'split'),
      },
      file: {
        exists: await pathExists(derivedManifestPath(workspaceRoot, 'file')),
        path: derivedDir(workspaceRoot, 'file'),
      },
    },
  };
}

function check(id, status, detail = '') {
  return { id, status, ...(detail ? { detail } : {}) };
}

async function readDerivedManifest(workspaceRoot, storage) {
  const manifestPath = derivedManifestPath(workspaceRoot, storage);
  const raw = await readTextIfExists(manifestPath);
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

export async function runMemoStorageDoctor(workspaceRoot, { storage } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const checks = [];
  const config = await readConfig(workspaceRoot).catch((error) => ({ error }));
  if (config.error) {
    checks.push(check('config', 'error', config.error.message));
  } else {
    checks.push(check('config', 'ok'));
  }

  let eventCount = 0;
  if (resolvedStorage === 'file') {
    const result = await readJsonlEvents(fileEventsPath(workspaceRoot), { tolerateMalformed: true });
    eventCount = normalizeEventRows(result.events, { fallbackStorage: resolvedStorage }).length;
    checks.push(result.malformed.length > 0
      ? check('file-jsonl', 'error', `${result.malformed.length} malformed record(s)`)
      : check('file-jsonl', 'ok'));
  } else {
    const result = await readSplitEvents(workspaceRoot, { tolerateMalformed: true });
    eventCount = normalizeEventRows(result.events, { fallbackStorage: resolvedStorage }).length;
    checks.push(result.malformed.length > 0
      ? check('split-json', 'error', `${result.malformed.length} malformed record(s)`)
      : check('split-json', 'ok'));
  }

  try {
    const manifest = await readDerivedManifest(workspaceRoot, resolvedStorage);
    const docsExists = await pathExists(derivedDocsPath(workspaceRoot, resolvedStorage));
    if (!manifest) {
      checks.push(check('derived-manifest', 'warning', 'derived docs have not been built'));
    } else if (!docsExists) {
      checks.push(check('derived-manifest', 'error', 'derived docs file is missing'));
    } else {
      const currentSource = await sourceDigest(workspaceRoot, resolvedStorage);
      if (manifest?.source?.digest !== currentSource.digest) {
        checks.push(check('derived-manifest', 'error', 'derived docs are stale'));
      } else if (manifest?.records !== eventCount) {
        checks.push(check('derived-manifest', 'error', 'derived record count does not match canonical records'));
      } else {
        checks.push(check('derived-manifest', 'ok'));
      }
    }
  } catch (error) {
    checks.push(check('derived-manifest', 'error', error.message));
  }

  return {
    ok: checks.every((item) => item.status !== 'error'),
    storage: resolvedStorage,
    checks,
  };
}
