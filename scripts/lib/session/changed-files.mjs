import { promises as fs } from 'node:fs';
import path from 'node:path';

const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]+$/u;

function normalizeSessionId(sessionId) {
  const normalized = String(sessionId || 'default').trim() || 'default';
  if (!SAFE_ID_PATTERN.test(normalized)) {
    throw new Error('unsafe sessionId: use only letters, numbers, dot, underscore, or dash');
  }
  return normalized;
}

function sessionDir(rootDir, sessionId) {
  return path.join(rootDir, '.aios', 'sessions', normalizeSessionId(sessionId));
}

function ledgerPath(rootDir, sessionId) {
  return path.join(sessionDir(rootDir, sessionId), 'changed-files.jsonl');
}

function normalizePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\/+/u, '').trim();
}

export async function recordSessionChangedFile({
  rootDir = process.cwd(),
  sessionId = 'default',
  filePath,
  changeType = 'modified',
  at = new Date().toISOString(),
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
  await fs.mkdir(sessionDir(rootDir, safeSessionId), { recursive: true });
  await fs.appendFile(ledgerPath(rootDir, safeSessionId), `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

export async function readSessionChangedFiles({ rootDir = process.cwd(), sessionId = 'default' } = {}) {
  const safeSessionId = normalizeSessionId(sessionId);
  let rows = [];
  try {
    const raw = await fs.readFile(ledgerPath(rootDir, safeSessionId), 'utf8');
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

export async function runSessionChangedFiles(options = {}, { rootDir = process.cwd(), stdout = process.stdout } = {}) {
  const report = await readSessionChangedFiles({ rootDir, sessionId: options.session || 'default' });
  stdout.write(options.json || options.format === 'json'
    ? `${JSON.stringify(report, null, 2)}\n`
    : `${report.files.map((file) => `${file.changeType}\t${file.path}\t${file.count}`).join('\n')}\n`);
  return { exitCode: 0, report };
}
