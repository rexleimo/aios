// Reading ContextDB sessions from the console.
//
// ContextDB already stores what a session was, in files, one directory per session:
//
//   .aios/context-db/sessions/<id>/
//     meta.json            id, agent, project, goal, status, createdAt, updatedAt
//     l0-summary.md        the digest (may be absent)
//     l1-checkpoints.jsonl one JSON object per line: ts, status, summary, nextActions
//     l2-events.jsonl      one JSON object per line: seq, ts, role, kind, text, refs
//
// So this module is a reader, not a new store: the console shows what the capability
// process already wrote. Two guards matter:
//
//   - the session id comes from a URL, so it is validated against a whitelist and the
//     resolved path must stay inside the sessions directory (no `..`);
//   - `l2-events.jsonl` can be large (793 lines for one session here), so a detail read
//     returns a bounded tail and says how much it left out instead of shipping megabytes.
import fs from 'node:fs';
import path from 'node:path';

export const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
export const EVENT_TAIL = 120;
export const MAX_TEXT = 400;

export class SessionError extends Error {
  constructor(message, { status = 400 } = {}) {
    super(message);
    this.name = 'SessionError';
    this.status = status;
  }
}

export function sessionsDir(root) {
  return path.join(root, '.aios', 'context-db', 'sessions');
}

/** Resolve a session directory, refusing anything that could leave the sessions root. */
export function sessionPath(root, id) {
  if (typeof id !== 'string' || !SESSION_ID_PATTERN.test(id)) {
    throw new SessionError(`invalid session id: ${String(id).slice(0, 40)}`, { status: 400 });
  }
  const base = path.resolve(sessionsDir(root));
  const resolved = path.resolve(base, id);
  if (resolved !== path.join(base, id) || !resolved.startsWith(`${base}${path.sep}`)) {
    throw new SessionError(`session id escapes the sessions directory: ${id}`, { status: 400 });
  }
  return resolved;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function countLines(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

function readJsonl(file, { tail } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return { rows: [], total: 0 };
  }
  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  const total = lines.length;
  const slice = typeof tail === 'number' ? lines.slice(-tail) : lines;
  const rows = [];
  for (const line of slice) {
    try {
      rows.push(JSON.parse(line));
    } catch {
      // A truncated last line is not a reason to hide the rest of the session.
    }
  }
  return { rows, total };
}

/** Every session, newest first. Bounded fields only: the list must stay cheap. */
export function listSessions(root) {
  const dir = sessionsDir(root);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const sessions = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !SESSION_ID_PATTERN.test(entry.name)) continue;
    const sessionDir = path.join(dir, entry.name);
    const meta = readJson(path.join(sessionDir, 'meta.json')) ?? {};
    let summary = '';
    try {
      summary = fs.readFileSync(path.join(sessionDir, 'l0-summary.md'), 'utf8');
    } catch {
      // no digest yet
    }
    const goal = String(meta.goal ?? '').trim();
    sessions.push({
      sessionId: String(meta.sessionId ?? entry.name),
      agent: String(meta.agent ?? ''),
      project: String(meta.project ?? ''),
      goal: goal.length > 160 ? `${goal.slice(0, 160)}…` : goal,
      status: String(meta.status ?? 'unknown'),
      tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
      createdAt: meta.createdAt ?? null,
      updatedAt: meta.updatedAt ?? null,
      events: countLines(path.join(sessionDir, 'l2-events.jsonl')),
      checkpoints: countLines(path.join(sessionDir, 'l1-checkpoints.jsonl')),
      hasSummary: summary.trim().length > 0,
    });
  }
  sessions.sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')));
  return sessions;
}

/** One session: digest, checkpoints, and a bounded tail of events. */
export function readSession(root, id, { eventTail = EVENT_TAIL } = {}) {
  const sessionDir = sessionPath(root, id);
  if (!fs.existsSync(sessionDir)) {
    throw new SessionError(`no such session: ${id}`, { status: 404 });
  }
  const meta = readJson(path.join(sessionDir, 'meta.json')) ?? {};
  let summary = '';
  try {
    summary = fs.readFileSync(path.join(sessionDir, 'l0-summary.md'), 'utf8');
  } catch {
    // no digest yet
  }
  const checkpoints = readJsonl(path.join(sessionDir, 'l1-checkpoints.jsonl'));
  const events = readJsonl(path.join(sessionDir, 'l2-events.jsonl'), { tail: eventTail });

  return {
    sessionId: String(meta.sessionId ?? id),
    meta,
    summary,
    checkpoints: checkpoints.rows.map((row) => ({
      seq: row.seq ?? null,
      ts: row.ts ?? null,
      status: row.status ?? null,
      summary: String(row.summary ?? '').slice(0, MAX_TEXT),
      nextActions: Array.isArray(row.nextActions) ? row.nextActions.map(String).slice(0, 5) : [],
    })),
    checkpointTotal: checkpoints.total,
    events: events.rows.map((row) => ({
      seq: row.seq ?? null,
      ts: row.ts ?? null,
      role: row.role ?? null,
      kind: row.kind ?? null,
      text: String(row.text ?? '').slice(0, MAX_TEXT),
      refs: Array.isArray(row.refs) ? row.refs.map(String).slice(0, 5) : [],
    })),
    eventTotal: events.total,
    eventTail,
  };
}

/** `2026-10-27T01:12:40.670Z` → `2026-10-27 01:12` (the wall clock someone recognises). */
export function shortTime(iso) {
  if (typeof iso !== 'string' || iso.length < 16) return iso ?? '';
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}
/**
 * 删除 = 移到回收站，不 rm。
 *
 * 会话是 ContextDB 的数据，误删不可恢复；所以删除动作把目录移进
 * `<context-db>/sessions-trash/<ISO>-<id>/`，想恢复就移回来。返回移到的位置，
 * 页面把它显示出来——一个不可见的"已删除"不是删除，是丢了。
 */
export function trashSession(root, id, { now = new Date() } = {}) {
  const dir = sessionPath(root, id);
  if (!fs.existsSync(dir)) {
    throw new SessionError(`no such session: ${id}`, { status: 404 });
  }
  const trashRoot = path.join(root, '.aios', 'context-db', 'sessions-trash');
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const target = path.join(trashRoot, `${stamp}-${id}`);
  fs.mkdirSync(trashRoot, { recursive: true });
  fs.renameSync(dir, target);
  return { trashedTo: path.relative(root, target).split(String.fromCharCode(92)).join('/') };
}

/** 导出：一个自包含 JSON，含 meta / 摘要 / 检查点 / 全部事件，用于备份或贴到别处。 */
export function exportSession(root, id) {
  const dir = sessionPath(root, id);
  if (!fs.existsSync(dir)) {
    throw new SessionError(`no such session: ${id}`, { status: 404 });
  }
  const meta = readJson(path.join(dir, 'meta.json')) ?? {};
  let summary = '';
  try {
    summary = fs.readFileSync(path.join(dir, 'l0-summary.md'), 'utf8');
  } catch {
    // no digest
  }
  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    sessionId: String(meta.sessionId ?? id),
    meta,
    summary,
    checkpoints: readJsonl(path.join(dir, 'l1-checkpoints.jsonl')).rows,
    events: readJsonl(path.join(dir, 'l2-events.jsonl')).rows,
  };
}
