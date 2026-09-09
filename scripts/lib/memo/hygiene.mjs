import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveContextDbRoot } from '../aios/state-root.mjs';
import {
  SUPPORTED_MEMO_STORAGES,
  WORKSPACE_MEMORY_SESSION_PREFIX,
} from './storage/constants.mjs';
import { readTextIfExists } from './storage/fs-io.mjs';
import {
  PINNED_DEFAULT_MAX_CHARS,
  normalizePinnedContent,
  readPinnedByStorage,
  renderPinnedBlock,
} from './storage/pinned.mjs';

/* E2 hygiene: the survey report feeds the approval queue from
 * docs/reports/2026-08-01-memory-hygiene-survey.md (identify → confirm →
 * approve → apply with dry-run + auditable diff). Every mutating action is
 * explicit, archival, and loss-accounted; nothing here deletes. Space-level
 * sessions (`workspace-memory--*`) are per-space live infrastructure — their
 * meta can be months old while still serving `pin show` fallback and the
 * legacy mirror — so they are never stale and never archived. Sessions whose
 * meta is missing or unreadable are listed as `unknown` and also never
 * archived: hygiene only moves what it can classify. */

export const HYGIENE_DEFAULT_MIN_AGE_DAYS = 7;
export const ROTATE_DEFAULT_MAX_EVENTS = 500;

function listDirNames(dir) {
  if (!existsSync(dir)) return Promise.resolve([]);
  return readdir(dir, { withFileTypes: true }).then((entries) => entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort());
}

function toWorkspaceRelative(workspaceRoot, targetPath) {
  return path.relative(workspaceRoot, targetPath).replaceAll('\\', '/');
}

function sha256Hex(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function parseEventTs(line) {
  if (!line) return null;
  try {
    const parsed = JSON.parse(line);
    const ts = String(parsed?.ts || parsed?.timestamp || '');
    return Number.isFinite(Date.parse(ts)) ? ts : null;
  } catch {
    return null;
  }
}

async function readSessionMeta(sessionDir) {
  const raw = await readTextIfExists(path.join(sessionDir, 'meta.json'));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sessionAgeDays(meta, now) {
  const raw = String(meta?.updatedAt || meta?.createdAt || '');
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (now.getTime() - parsed) / 86400000);
}

async function describeEventLog(eventsPath, sessionId, workspaceRoot) {
  const text = await readTextIfExists(eventsPath);
  if (text === null) return null;
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  let oldestTs = null;
  let newestTs = null;
  for (const line of lines) {
    const ts = parseEventTs(line);
    if (!ts) continue;
    if (!oldestTs || ts < oldestTs) oldestTs = ts;
    if (!newestTs || ts > newestTs) newestTs = ts;
  }
  return {
    file: toWorkspaceRelative(workspaceRoot, eventsPath),
    sessionId,
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: lines.length,
    oldestTs,
    newestTs,
  };
}

function pinnedEntry(source, space, content) {
  const rendered = renderPinnedBlock(content, { maxChars: PINNED_DEFAULT_MAX_CHARS });
  const chars = normalizePinnedContent(content).length;
  return {
    source,
    space,
    chars,
    maxChars: rendered.maxChars,
    remaining: Math.max(0, rendered.maxChars - chars),
    truncated: rendered.truncated,
  };
}

async function surveyPinned(workspaceRoot, { env }) {
  const entries = [];
  for (const storage of SUPPORTED_MEMO_STORAGES) {
    const blocks = await readPinnedByStorage(workspaceRoot, storage, { env });
    for (const block of blocks) {
      entries.push(pinnedEntry(`memo:${storage}:${block.safeSpace}`, block.safeSpace, block.content));
    }
  }
  const sessionsDir = path.join(resolveContextDbRoot(workspaceRoot, { env }), 'sessions');
  for (const sessionId of await listDirNames(sessionsDir)) {
    const content = await readTextIfExists(path.join(sessionsDir, sessionId, 'pinned.md'));
    if (!content) continue;
    entries.push(pinnedEntry(
      `session:${sessionId}`,
      sessionId.replace(WORKSPACE_MEMORY_SESSION_PREFIX, ''),
      content,
    ));
  }
  return entries;
}

export async function surveyWorkspaceMemoryHygiene(workspaceRoot, {
  minAgeDays = HYGIENE_DEFAULT_MIN_AGE_DAYS,
  now = new Date(),
  env = process.env,
} = {}) {
  const sessionsDir = path.join(resolveContextDbRoot(workspaceRoot, { env }), 'sessions');
  const sessions = [];
  const eventsRetention = [];
  for (const sessionId of await listDirNames(sessionsDir)) {
    const sessionDir = path.join(sessionsDir, sessionId);
    const meta = await readSessionMeta(sessionDir);
    const status = meta?.status ? String(meta.status) : 'unknown';
    const ageDays = meta ? sessionAgeDays(meta, now) : null;
    const spaceLevel = sessionId.startsWith(WORKSPACE_MEMORY_SESSION_PREFIX);
    const stale = status === 'running'
      && !spaceLevel
      && Number.isFinite(ageDays)
      && ageDays >= minAgeDays;
    const retention = await describeEventLog(
      path.join(sessionDir, 'l2-events.jsonl'),
      sessionId,
      workspaceRoot,
    );
    sessions.push({
      sessionId,
      status,
      updatedAt: String(meta?.updatedAt || ''),
      ageDays,
      spaceLevel,
      stale,
      archivable: stale,
      eventsBytes: retention?.bytes ?? 0,
      eventsLines: retention?.lines ?? 0,
    });
    if (retention) eventsRetention.push(retention);
  }
  eventsRetention.sort((a, b) => a.file.localeCompare(b.file));

  const pinned = await surveyPinned(workspaceRoot, { env });

  const proposals = [];
  for (const session of sessions) {
    if (session.archivable) {
      proposals.push(`archive stale session ${session.sessionId} (running, age ${formatAge(session.ageDays)}): memo hygiene --archive-stale-sessions`);
    }
  }
  for (const entry of pinned) {
    if (entry.truncated) {
      proposals.push(`pinned block over budget needs an explicit tidy: ${entry.source} ${entry.chars}/${entry.maxChars} chars — review, then rewrite with 'memo pin set'`);
    }
  }
  for (const entry of eventsRetention) {
    if (entry.lines > ROTATE_DEFAULT_MAX_EVENTS) {
      proposals.push(`event log above the keep threshold: ${entry.file} (${entry.lines} lines, ${formatBytes(entry.bytes)}): memo hygiene --rotate-events`);
    }
  }

  return {
    generatedAt: now.toISOString(),
    minAgeDays,
    sessions,
    pinned,
    eventsRetention,
    proposals,
  };
}

function formatAge(ageDays) {
  return Number.isFinite(ageDays) ? `${Math.round(ageDays)}d` : 'unknown';
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return 'unknown';
  if (value < 1024) return `${value} bytes`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function renderHygieneReport(report) {
  const lines = [];
  lines.push(`Hygiene survey (min-age ${report.minAgeDays}d, generated ${report.generatedAt})`);
  lines.push('Sessions:');
  if (report.sessions.length === 0) lines.push('  (none)');
  for (const session of report.sessions) {
    const tag = session.archivable ? '[stale]' : session.status === 'unknown' ? '[unknown]' : '[ok]';
    lines.push(`  ${tag} ${session.sessionId} status=${session.status} age=${formatAge(session.ageDays)} events=${session.eventsLines} lines/${formatBytes(session.eventsBytes)}${session.spaceLevel ? ' space-level' : ''}`);
  }
  lines.push('Pinned blocks:');
  if (report.pinned.length === 0) lines.push('  (none)');
  for (const entry of report.pinned) {
    lines.push(`  ${entry.truncated ? '[over-budget]' : '[ok]'} ${entry.source} ${entry.chars}/${entry.maxChars} chars, remaining ${entry.remaining}${entry.truncated ? ', truncated' : ''}`);
  }
  lines.push('Event retention (l2-events.jsonl):');
  if (report.eventsRetention.length === 0) lines.push('  (none)');
  for (const entry of report.eventsRetention) {
    const span = entry.oldestTs && entry.newestTs ? `, ${entry.oldestTs} -> ${entry.newestTs}` : '';
    lines.push(`  ${entry.file}: ${entry.lines} lines, ${formatBytes(entry.bytes)}${span}`);
  }
  lines.push('Proposals (nothing was changed):');
  if (report.proposals.length === 0) lines.push('  (none)');
  for (const proposal of report.proposals) {
    lines.push(`  - ${proposal}`);
  }
  return lines.join('\n');
}

function conflictError(targetPath) {
  const error = new Error(`hygiene archive target already exists; resolve it manually: ${targetPath}`);
  error.code = 'AIOS_MEMO_HYGIENE_CONFLICT';
  error.target = targetPath;
  return error;
}

export async function archiveStaleSessions(workspaceRoot, {
  minAgeDays = HYGIENE_DEFAULT_MIN_AGE_DAYS,
  now = new Date(),
  env = process.env,
} = {}) {
  const report = await surveyWorkspaceMemoryHygiene(workspaceRoot, { minAgeDays, now, env });
  const dbRoot = resolveContextDbRoot(workspaceRoot, { env });
  const sessionsDir = path.join(dbRoot, 'sessions');
  const archiveDir = path.join(dbRoot, 'archive', 'sessions');
  const moved = [];
  let skipped = 0;
  for (const session of report.sessions) {
    if (!session.archivable) {
      skipped += 1;
      continue;
    }
    const from = path.join(sessionsDir, session.sessionId);
    const to = path.join(archiveDir, session.sessionId);
    if (existsSync(to)) throw conflictError(to);
    await mkdir(archiveDir, { recursive: true });
    await rename(from, to);
    moved.push({
      sessionId: session.sessionId,
      from: toWorkspaceRelative(workspaceRoot, from),
      to: toWorkspaceRelative(workspaceRoot, to),
    });
  }
  return { moved, skipped };
}

export async function rotateSessionEvents(workspaceRoot, {
  maxEvents = ROTATE_DEFAULT_MAX_EVENTS,
  now = new Date(),
  env = process.env,
} = {}) {
  const keep = Math.floor(Number(maxEvents));
  if (!Number.isFinite(keep) || keep < 1) {
    throw new Error('maxEvents must be a positive integer');
  }
  const sessionsDir = path.join(resolveContextDbRoot(workspaceRoot, { env }), 'sessions');
  const stamp = `${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`;
  const rotated = [];
  let untouched = 0;
  for (const sessionId of await listDirNames(sessionsDir)) {
    const eventsPath = path.join(sessionsDir, sessionId, 'l2-events.jsonl');
    const text = await readTextIfExists(eventsPath);
    if (!text) {
      untouched += 1;
      continue;
    }
    const lines = text.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    if (lines.length <= keep) {
      untouched += 1;
      continue;
    }
    const movedLines = lines.slice(0, lines.length - keep);
    const keptLines = lines.slice(lines.length - keep);
    const archivePath = path.join(path.dirname(eventsPath), `l2-events.archive-${stamp}.jsonl`);
    const sha256Before = sha256Hex(text);
    await appendFile(archivePath, `${movedLines.join('\n')}\n`, 'utf8');
    await writeFile(eventsPath, `${keptLines.join('\n')}\n`, 'utf8');
    const afterText = await readTextIfExists(eventsPath) || '';
    rotated.push({
      file: toWorkspaceRelative(workspaceRoot, eventsPath),
      archiveFile: toWorkspaceRelative(workspaceRoot, archivePath),
      movedLines: movedLines.length,
      keptLines: keptLines.length,
      bytesBefore: Buffer.byteLength(text, 'utf8'),
      bytesAfter: Buffer.byteLength(afterText, 'utf8'),
      sha256Before,
      sha256After: sha256Hex(afterText),
    });
  }
  return { rotated, untouched };
}
