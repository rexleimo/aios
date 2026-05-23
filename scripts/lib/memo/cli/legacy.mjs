import fs from 'node:fs';
import path from 'node:path';
import { ensureParentDir, readTextIfExists, writeText } from '../../platform/fs.mjs';
import {
  workspaceMemoryEventsPath,
  workspaceMemorySessionId,
} from '../workspace-memory.mjs';
import { DEFAULT_LIST_LIMIT } from './constants.mjs';
import { createMemoTurnId } from './records.mjs';
import {
  ensureWorkspaceMemorySession,
  sessionDir,
  writePinned,
} from './workspace-state.mjs';

function legacyStateFilePath(workspaceRoot, sessionId) {
  return path.join(sessionDir(workspaceRoot, sessionId), 'state.json');
}

export function readLegacyMemoEvents(workspaceRoot, sessionId) {
  const raw = readTextIfExists(workspaceMemoryEventsPath(workspaceRoot, sessionId));
  if (!raw.trim()) return [];
  const events = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = String(line || '').trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // 兼容旧 JSONL 日志的半写入状态，坏行不应阻断 memo 查询。
    }
  }
  return events;
}

export function legacyMemoRows(workspaceRoot, space, { query = '', limit = DEFAULT_LIST_LIMIT } = {}) {
  const sessionId = workspaceMemorySessionId(space);
  if (!fs.existsSync(workspaceMemoryEventsPath(workspaceRoot, sessionId))) return [];
  const normalizedQuery = String(query || '').trim().toLowerCase();
  return readLegacyMemoEvents(workspaceRoot, sessionId)
    .filter((event) => event?.kind === 'memo')
    .filter((event) => !event?.role || String(event.role) === 'user')
    .filter((event) => !normalizedQuery || String(event?.text || '').toLowerCase().includes(normalizedQuery))
    .slice(-limit)
    .reverse();
}

function readLegacyLastEventSeq(workspaceRoot, sessionId) {
  const stateRaw = readTextIfExists(legacyStateFilePath(workspaceRoot, sessionId)).trim();
  if (stateRaw) {
    try {
      const parsed = JSON.parse(stateRaw);
      const seq = Number(parsed?.lastEventSeq);
      if (Number.isFinite(seq) && seq >= 0) return seq;
    } catch {
      // state.json 损坏时回退扫描 JSONL。
    }
  }
  return readLegacyMemoEvents(workspaceRoot, sessionId).reduce((max, event) => {
    const seq = Number(event?.seq);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);
}

function updateLegacyStateAfterMemo(workspaceRoot, sessionId, seq, ts) {
  const stateFile = legacyStateFilePath(workspaceRoot, sessionId);
  let state = {};
  const raw = readTextIfExists(stateFile).trim();
  if (raw) {
    try {
      state = JSON.parse(raw);
    } catch {
      state = {};
    }
  }
  writeText(stateFile, `${JSON.stringify({
    sessionId,
    lastEventAt: ts,
    lastEventSeq: seq,
    lastCheckpointAt: state.lastCheckpointAt ?? null,
    lastCheckpointSeq: state.lastCheckpointSeq ?? 0,
    status: state.status || 'running',
    nextActions: Array.isArray(state.nextActions) ? state.nextActions : [],
  }, null, 2)}\n`);
}

export function mirrorMemoEventToLegacy(workspaceRoot, { space, text, refs = [], turnId = '', record = {} } = {}) {
  const { sessionId } = ensureWorkspaceMemorySession(workspaceRoot, space);
  const seq = readLegacyLastEventSeq(workspaceRoot, sessionId) + 1;
  const ts = String(record?.ts || record?.timestamp || new Date().toISOString());
  const legacyEvent = {
    ts,
    seq,
    role: 'user',
    kind: 'memo',
    text: String(record?.text || text || ''),
    refs: Array.isArray(record?.refs) ? record.refs : refs,
    turn: {
      turnId: turnId || createMemoTurnId(space),
      turnType: 'side',
      environment: 'memo',
      hindsightStatus: 'na',
      outcome: 'success',
    },
  };
  const eventsPath = workspaceMemoryEventsPath(workspaceRoot, sessionId);
  ensureParentDir(eventsPath);
  fs.appendFileSync(eventsPath, `${JSON.stringify(legacyEvent)}\n`, 'utf8');
  updateLegacyStateAfterMemo(workspaceRoot, sessionId, seq, ts);
  return { sessionId, seq, eventId: `${sessionId}#${seq}`, event: legacyEvent };
}

export function mirrorPinnedMemoToLegacy(workspaceRoot, { space, content }) {
  const sessionId = workspaceMemorySessionId(space);
  ensureWorkspaceMemorySession(workspaceRoot, space);
  writePinned(workspaceRoot, sessionId, content);
}
