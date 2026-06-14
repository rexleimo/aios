import { promises as fs } from 'node:fs';
import path from 'node:path';

function sessionDir(rootDir, sessionId) {
  return path.join(rootDir, '.aios', 'sessions', sessionId || 'default');
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
  const normalized = normalizePath(filePath);
  if (!normalized) throw new Error('changed-files requires a file path');
  const row = {
    schemaVersion: 1,
    sessionId,
    path: normalized,
    changeType,
    at,
  };
  await fs.mkdir(sessionDir(rootDir, sessionId), { recursive: true });
  await fs.appendFile(ledgerPath(rootDir, sessionId), `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

export async function readSessionChangedFiles({ rootDir = process.cwd(), sessionId = 'default' } = {}) {
  let rows = [];
  try {
    const raw = await fs.readFile(ledgerPath(rootDir, sessionId), 'utf8');
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
    sessionId,
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
