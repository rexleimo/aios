import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveAiosStateRoot } from '../aios/state-root.mjs';

const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]+$/u;
const SNAPSHOT_EXCLUDED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'temp',
  'coverage',
  '.venv',
]);
export const DEFAULT_SESSION_WORKSPACE_SNAPSHOT_MAX_ENTRIES = 20_000;
export const SESSION_WORKSPACE_SNAPSHOT_LIMIT_CODE = 'AIOS_SESSION_WORKSPACE_SNAPSHOT_LIMIT';

export function normalizeSessionId(sessionId) {
  const normalized = String(sessionId || 'default').trim() || 'default';
  if (!SAFE_ID_PATTERN.test(normalized)) {
    throw new Error('unsafe sessionId: use only letters, numbers, dot, underscore, or dash');
  }
  return normalized;
}

function sessionDir(rootDir, sessionId, env = process.env) {
  return path.join(resolveAiosStateRoot(rootDir, { env }), 'sessions', normalizeSessionId(sessionId));
}

function ledgerPath(rootDir, sessionId, env = process.env) {
  return path.join(sessionDir(rootDir, sessionId, env), 'changed-files.jsonl');
}

function normalizePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\/+/u, '').trim();
}

function isContainedPath(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function snapshotExcludedPrefixes(rootDir, env) {
  const root = path.resolve(rootDir);
  const stateRoot = path.resolve(resolveAiosStateRoot(root, { env }));
  if (!isContainedPath(root, stateRoot)) return [];
  const relative = normalizePath(path.relative(root, stateRoot));
  return relative ? [relative] : [];
}

function snapshotPathExcluded(relativePath, entryName, excludedPrefixes) {
  if (SNAPSHOT_EXCLUDED_DIRECTORIES.has(entryName)) return true;
  return excludedPrefixes.some((prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`));
}

function normalizeSnapshotMaxEntries(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_WORKSPACE_SNAPSHOT_MAX_ENTRIES;
}

function consumeSnapshotBudget(budget) {
  if (budget.visitedEntries >= budget.maxEntries) {
    const error = new Error(`workspace snapshot exceeded ${budget.maxEntries} filesystem entries`);
    error.code = SESSION_WORKSPACE_SNAPSHOT_LIMIT_CODE;
    error.maxEntries = budget.maxEntries;
    error.visitedEntries = budget.visitedEntries;
    throw error;
  }
  budget.visitedEntries += 1;
}

async function collectWorkspaceSnapshotEntries(rootDir, currentDir, excludedPrefixes, entries, budget) {
  consumeSnapshotBudget(budget);
  const directoryEntries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of directoryEntries) {
    consumeSnapshotBudget(budget);
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = normalizePath(path.relative(rootDir, absolutePath));
    if (!relativePath || snapshotPathExcluded(relativePath, entry.name, excludedPrefixes)) continue;
    if (entry.isDirectory()) {
      await collectWorkspaceSnapshotEntries(rootDir, absolutePath, excludedPrefixes, entries, budget);
      continue;
    }
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    const stats = await fs.lstat(absolutePath);
    entries.set(relativePath, `${stats.mode}:${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}`);
  }
}

/**
 * Capture a runtime-owned, content-free workspace state for post-dispatch
 * reconciliation. Derived AIOS state and expensive dependency trees are omitted.
 */
export async function captureSessionWorkspaceSnapshot({
  rootDir = process.cwd(),
  env = process.env,
  maxEntries = env.AIOS_SESSION_WORKSPACE_SNAPSHOT_MAX_ENTRIES,
} = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const entries = new Map();
  const budget = {
    maxEntries: normalizeSnapshotMaxEntries(maxEntries),
    visitedEntries: 0,
  };
  try {
    await collectWorkspaceSnapshotEntries(
      resolvedRoot,
      resolvedRoot,
      snapshotExcludedPrefixes(resolvedRoot, env),
      entries,
      budget,
    );
    return {
      schemaVersion: 1,
      kind: 'session.workspace-snapshot',
      available: true,
      rootDir: resolvedRoot,
      entries,
      maxEntries: budget.maxEntries,
      visitedEntries: budget.visitedEntries,
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      kind: 'session.workspace-snapshot',
      available: false,
      rootDir: resolvedRoot,
      entries,
      error: String(error?.message || error),
      reasonCode: String(error?.code || ''),
      maxEntries: budget.maxEntries,
      visitedEntries: budget.visitedEntries,
    };
  }
}

export async function recordSessionWorkspaceChanges({
  rootDir = process.cwd(),
  sessionId = 'default',
  before,
  after,
  env = process.env,
} = {}) {
  if (!before?.available || !after?.available) {
    return {
      schemaVersion: 1,
      kind: 'session.workspace-mutation-observation',
      available: false,
      files: [],
      reason: before?.error || after?.error || 'workspace_snapshot_unavailable',
    };
  }

  const beforeEntries = before.entries instanceof Map ? before.entries : new Map();
  const afterEntries = after.entries instanceof Map ? after.entries : new Map();
  const paths = [...new Set([...beforeEntries.keys(), ...afterEntries.keys()])].sort((left, right) => left.localeCompare(right));
  const files = [];
  for (const filePath of paths) {
    const previous = beforeEntries.get(filePath);
    const current = afterEntries.get(filePath);
    if (previous === current) continue;
    const changeType = previous === undefined ? 'created' : current === undefined ? 'deleted' : 'modified';
    await recordSessionChangedFile({ rootDir, sessionId, filePath, changeType, env });
    files.push({ path: filePath, changeType });
  }
  return {
    schemaVersion: 1,
    kind: 'session.workspace-mutation-observation',
    available: true,
    files,
  };
}

export async function recordSessionChangedFile({
  rootDir = process.cwd(),
  sessionId = 'default',
  filePath,
  changeType = 'modified',
  at = new Date().toISOString(),
  env = process.env,
} = {}) {
  const safeSessionId = normalizeSessionId(sessionId);
  const normalized = normalizePath(filePath);
  if (!normalized) throw new Error('changed-files requires a file path');
  const row = {
    schemaVersion: 1,
    sessionId: safeSessionId,
    path: normalized,
    changeType,
    at,
  };
  await fs.mkdir(sessionDir(rootDir, safeSessionId, env), { recursive: true });
  await fs.appendFile(ledgerPath(rootDir, safeSessionId, env), `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

export async function readSessionChangedFiles({ rootDir = process.cwd(), sessionId = 'default', env = process.env } = {}) {
  const safeSessionId = normalizeSessionId(sessionId);
  let rows = [];
  try {
    const raw = await fs.readFile(ledgerPath(rootDir, safeSessionId, env), 'utf8');
    rows = raw.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const byPath = new Map();
  for (const row of rows) {
    const previous = byPath.get(row.path);
    byPath.set(row.path, {
      path: row.path,
      changeType: row.changeType,
      firstSeenAt: previous?.firstSeenAt || row.at,
      lastSeenAt: row.at,
      count: (previous?.count || 0) + 1,
    });
  }
  return {
    schemaVersion: 1,
    kind: 'session.changed-files',
    sessionId: safeSessionId,
    files: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export async function runSessionChangedFiles(options = {}, { rootDir = process.cwd(), stdout = process.stdout, env = process.env } = {}) {
  const report = await readSessionChangedFiles({ rootDir, sessionId: options.session || 'default', env });
  stdout.write(options.json || options.format === 'json'
    ? `${JSON.stringify(report, null, 2)}\n`
    : `${report.files.map((file) => `${file.changeType}\t${file.path}\t${file.count}`).join('\n')}\n`);
  return { exitCode: 0, report };
}
