import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CheckpointCost, CheckpointTelemetry, EventTurnEnvelope, VerificationResult } from './core.js';

export interface SqliteSessionRow {
  sessionId: string;
  agent: string;
  project: string;
  goal: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SqliteEventRow {
  eventId: string;
  sessionId: string;
  seq: number;
  ts: string;
  tsEpoch: number;
  project: string;
  agent: string;
  role: string;
  kind: string;
  text: string;
  refs: string[];
  turn?: EventTurnEnvelope;
  textHash: string;
  signatureHash: string;
}

export interface SqliteCheckpointRow {
  checkpointId: string;
  sessionId: string;
  seq: number;
  ts: string;
  tsEpoch: number;
  project: string;
  agent: string;
  status: string;
  summary: string;
  nextActions: string[];
  artifacts: string[];
  telemetry?: CheckpointTelemetry;
}

export interface SqliteSearchInput {
  project?: string;
  sessionId?: string;
  role?: string;
  kinds?: string[];
  refs?: string[];
  query?: string;
  limit: number;
}

export interface SqliteTimelineInput {
  project?: string;
  sessionId?: string;
  limit: number;
}

export interface SqliteSessionIndexedSeqs {
  eventSeq: number;
  checkpointSeq: number;
}

export interface SqliteCheckpointSearchInput {
  project?: string;
  sessionId?: string;
  statuses?: string[];
  query?: string;
  limit: number;
}

interface EventSelectRow {
  event_id: string;
  session_id: string;
  seq: number;
  ts: string;
  ts_epoch: number;
  project: string;
  agent: string;
  role: string;
  kind: string;
  text: string;
  refs_json: string;
  turn_json: string | null;
  text_hash: string;
  signature_hash: string;
}

interface SessionSelectRow {
  session_id: string;
  agent: string;
  project: string;
  goal: string;
  tags_json: string;
  created_at: string;
  updated_at: string;
}

interface CheckpointSelectRow {
  checkpoint_id: string;
  session_id: string;
  seq: number;
  ts: string;
  ts_epoch: number;
  project: string;
  agent: string;
  status: string;
  summary: string;
  next_actions_json: string;
  artifacts_json: string;
  verification_result: string | null;
  retry_count: number | null;
  failure_category: string | null;
  elapsed_ms: number | null;
  cost_json: string | null;
  telemetry_json: string | null;
}

type SqliteDatabase = InstanceType<typeof DatabaseSync>;

const dbConnections = new Map<string, SqliteDatabase>();
const WORD_RE = /[\p{L}\p{N}]+/gu;
const CJK_CHAR_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function tokenizeSearchQuery(query: string): string[] {
  const chunks = String(query || '').toLowerCase().match(WORD_RE) ?? [];
  const tokens: string[] = [];

  for (const chunk of chunks) {
    const token = chunk.trim();
    if (!token) continue;

    if (CJK_CHAR_RE.test(token)) {
      const chars = Array.from(token).filter((char) => CJK_CHAR_RE.test(char));
      if (chars.length === 1) {
        tokens.push(chars[0]);
        continue;
      }
      for (let index = 0; index < chars.length - 1; index += 1) {
        tokens.push(`${chars[index]}${chars[index + 1]}`);
      }
      if (token.length <= 8) {
        tokens.push(token);
      }
      continue;
    }

    if (token.length >= 2) {
      tokens.push(token);
    }
  }

  return Array.from(new Set(tokens));
}

function toFtsMatchQuery(tokens: string[]): string {
  return tokens.map((token) => `${token}*`).join(' OR ');
}

function refsToFlat(refs: string[]): string {
  if (refs.length === 0) return '';
  return `|${refs.join('|')}|`;
}

function parseJsonStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}
function parseJsonObject<T>(raw?: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return parsed as T;
  } catch {
    return undefined;
  }
}

function parseCheckpointTelemetry(row: CheckpointSelectRow): CheckpointTelemetry | undefined {
  const parsed = parseJsonObject<CheckpointTelemetry>(row.telemetry_json);
  if (parsed) return parsed;

  const cost = parseJsonObject<CheckpointCost>(row.cost_json);
  const telemetry: CheckpointTelemetry = {};
  if (row.verification_result) {
    telemetry.verification = { result: row.verification_result as VerificationResult };
  }
  if (typeof row.retry_count === 'number' && Number.isFinite(row.retry_count) && row.retry_count >= 0) {
    telemetry.retryCount = row.retry_count;
  }
  if (row.failure_category) {
    telemetry.failureCategory = row.failure_category;
  }
  if (typeof row.elapsed_ms === 'number' && Number.isFinite(row.elapsed_ms) && row.elapsed_ms >= 0) {
    telemetry.elapsedMs = row.elapsed_ms;
  }
  if (cost) {
    telemetry.cost = cost;
  }
  return Object.keys(telemetry).length > 0 ? telemetry : undefined;
}

function getConnection(dbPath: string): SqliteDatabase {
  const cached = dbConnections.get(dbPath);
  if (cached) return cached;

  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  dbConnections.set(dbPath, db);
  return db;
}

function closeConnection(dbPath: string): void {
  const cached = dbConnections.get(dbPath);
  if (!cached) return;
  try {
    cached.close();
  } finally {
    dbConnections.delete(dbPath);
  }
}

let transactionCounter = 0;

function runTransaction(db: SqliteDatabase, fn: () => void): void {
  transactionCounter += 1;
  const savepoint = `aios_tx_${transactionCounter}`;
  db.exec(`SAVEPOINT ${savepoint};`);
  try {
    fn();
    db.exec(`RELEASE ${savepoint};`);
  } catch (error) {
    try {
      db.exec(`ROLLBACK TO ${savepoint};`);
    } finally {
      db.exec(`RELEASE ${savepoint};`);
    }
    throw error;
  }
}
function ensureCheckpointTelemetryColumns(db: SqliteDatabase): void {
  const tableInfo = db.prepare('PRAGMA table_info(checkpoints);').all() as unknown as Array<{ name: string }>;
  const columns = new Set(tableInfo.map((row) => row.name));
  const migrations: Array<[string, string]> = [
    ['verification_result', 'ALTER TABLE checkpoints ADD COLUMN verification_result TEXT;'],
    ['retry_count', 'ALTER TABLE checkpoints ADD COLUMN retry_count INTEGER;'],
    ['failure_category', 'ALTER TABLE checkpoints ADD COLUMN failure_category TEXT;'],
    ['elapsed_ms', 'ALTER TABLE checkpoints ADD COLUMN elapsed_ms INTEGER;'],
    ['cost_json', 'ALTER TABLE checkpoints ADD COLUMN cost_json TEXT;'],
    ['telemetry_json', 'ALTER TABLE checkpoints ADD COLUMN telemetry_json TEXT;'],
  ];

  for (const [column, statement] of migrations) {
    if (columns.has(column)) continue;
    db.exec(statement);
  }
}

function ensureEventTurnColumn(db: SqliteDatabase): void {
  const tableInfo = db.prepare('PRAGMA table_info(events);').all() as unknown as Array<{ name: string }>;
  const columns = new Set(tableInfo.map((row) => row.name));
  if (!columns.has('turn_json')) {
    db.exec('ALTER TABLE events ADD COLUMN turn_json TEXT;');
  }
}

function ensureEventsFtsBackfill(db: SqliteDatabase): void {
  db.exec(`
    INSERT INTO events_fts (event_id, kind, text, refs)
    SELECT e.event_id, e.kind, e.text, e.refs_flat
    FROM events AS e
    WHERE NOT EXISTS (
      SELECT 1 FROM events_fts AS f WHERE f.event_id = e.event_id
    );
  `);
}

function ensureCheckpointsFtsBackfill(db: SqliteDatabase): void {
  db.exec(`
    INSERT INTO checkpoints_fts (checkpoint_id, status, summary, next_actions, artifacts, failure_category)
    SELECT
      c.checkpoint_id,
      c.status,
      c.summary,
      c.next_actions_json,
      c.artifacts_json,
      COALESCE(c.failure_category, '')
    FROM checkpoints AS c
    WHERE NOT EXISTS (
      SELECT 1 FROM checkpoints_fts AS f WHERE f.checkpoint_id = c.checkpoint_id
    );
  `);
}

function ensureEventRefsBackfill(db: SqliteDatabase): void {
  try {
    db.exec(`
      INSERT OR IGNORE INTO event_refs (event_id, ref)
      SELECT e.event_id, TRIM(j.value)
      FROM events AS e, json_each(e.refs_json) AS j
      WHERE json_valid(e.refs_json)
        AND TRIM(j.value) <> '';
    `);
    return;
  } catch {
    // Fallback for SQLite builds without json_each.
  }

  const rows = db.prepare(`
    SELECT event_id, refs_json
    FROM events
    WHERE refs_json IS NOT NULL AND refs_json != '[]';
  `).all() as unknown as Array<{ event_id: string; refs_json: string }>;
  const insert = db.prepare('INSERT OR IGNORE INTO event_refs (event_id, ref) VALUES (?, ?)');

  runTransaction(db, () => {
    for (const row of rows) {
      const refs = parseJsonStringArray(row.refs_json);
      for (const ref of refs) {
        if (!ref.trim()) continue;
        insert.run(row.event_id, ref.trim());
      }
    }
  });
}

export function ensureSqliteSidecar(dbPath: string): void {
  const db = getConnection(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      agent TEXT NOT NULL,
      project TEXT NOT NULL,
      goal TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      ts TEXT NOT NULL,
      ts_epoch INTEGER NOT NULL,
      project TEXT NOT NULL,
      agent TEXT NOT NULL,
      role TEXT NOT NULL,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      refs_json TEXT NOT NULL,
      refs_flat TEXT NOT NULL,
      turn_json TEXT,
      text_hash TEXT NOT NULL,
      signature_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(session_id, seq)
    );

    CREATE TABLE IF NOT EXISTS event_refs (
      event_id TEXT NOT NULL,
      ref TEXT NOT NULL,
      PRIMARY KEY (event_id, ref)
    );

    CREATE TABLE IF NOT EXISTS checkpoints (
      checkpoint_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      ts TEXT NOT NULL,
      ts_epoch INTEGER NOT NULL,
      project TEXT NOT NULL,
      agent TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      next_actions_json TEXT NOT NULL,
      artifacts_json TEXT NOT NULL,
      verification_result TEXT,
      retry_count INTEGER,
      failure_category TEXT,
      elapsed_ms INTEGER,
      cost_json TEXT,
      telemetry_json TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(session_id, seq)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
      event_id UNINDEXED,
      kind,
      text,
      refs,
      tokenize = 'unicode61'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS checkpoints_fts USING fts5(
      checkpoint_id UNINDEXED,
      status,
      summary,
      next_actions,
      artifacts,
      failure_category,
      tokenize = 'unicode61'
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_agent_project_updated
      ON sessions (agent, project, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_events_project_ts
      ON events (project, ts_epoch DESC);
    CREATE INDEX IF NOT EXISTS idx_events_session_ts
      ON events (session_id, ts_epoch DESC);
    CREATE INDEX IF NOT EXISTS idx_events_role_kind_ts
      ON events (role, kind, ts_epoch DESC);
    CREATE INDEX IF NOT EXISTS idx_event_refs_ref
      ON event_refs (ref);
    CREATE INDEX IF NOT EXISTS idx_event_refs_event_id
      ON event_refs (event_id);
    CREATE INDEX IF NOT EXISTS idx_checkpoints_project_ts
      ON checkpoints (project, ts_epoch DESC);
    CREATE INDEX IF NOT EXISTS idx_checkpoints_session_ts
      ON checkpoints (session_id, ts_epoch DESC);
  `);
  ensureCheckpointTelemetryColumns(db);
  ensureEventTurnColumn(db);
  ensureEventsFtsBackfill(db);
  ensureCheckpointsFtsBackfill(db);
  ensureEventRefsBackfill(db);
}

export function recreateSqliteSidecar(dbPath: string): void {
  closeConnection(dbPath);
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${dbPath}${suffix}`;
    if (!existsSync(file)) continue;
    unlinkSync(file);
  }
  ensureSqliteSidecar(dbPath);
}

export function upsertSessionRow(dbPath: string, row: SqliteSessionRow): void {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  db.prepare(`
    INSERT INTO sessions (
      session_id, agent, project, goal, tags_json, created_at, updated_at
    ) VALUES (
      @session_id, @agent, @project, @goal, @tags_json, @created_at, @updated_at
    )
    ON CONFLICT(session_id) DO UPDATE SET
      agent=excluded.agent,
      project=excluded.project,
      goal=excluded.goal,
      tags_json=excluded.tags_json,
      updated_at=excluded.updated_at;
  `).run({
    session_id: row.sessionId,
    agent: row.agent,
    project: row.project,
    goal: row.goal,
    tags_json: JSON.stringify(row.tags),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  });
}

export function findLatestSessionRow(
  dbPath: string,
  input: { agent: string; project?: string }
): SqliteSessionRow | null {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  const clauses: string[] = ['agent = ?'];
  const params: Array<string | number> = [input.agent];

  if (input.project) {
    clauses.push('project = ?');
    params.push(input.project);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const row = db.prepare(`
    SELECT session_id, agent, project, goal, tags_json, created_at, updated_at
    FROM sessions
    ${where}
    ORDER BY updated_at DESC
    LIMIT 1;
  `).get(...params) as unknown as SessionSelectRow | undefined;

  if (!row) return null;
  return {
    sessionId: row.session_id,
    agent: row.agent,
    project: row.project,
    goal: row.goal,
    tags: parseJsonStringArray(row.tags_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function upsertEventRow(dbPath: string, row: SqliteEventRow): void {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  db.prepare(`
    INSERT INTO events (
      event_id, session_id, seq, ts, ts_epoch, project, agent, role, kind, text, refs_json, refs_flat, turn_json, text_hash, signature_hash
    ) VALUES (
      @event_id, @session_id, @seq, @ts, @ts_epoch, @project, @agent, @role, @kind, @text, @refs_json, @refs_flat, @turn_json, @text_hash, @signature_hash
    )
    ON CONFLICT(event_id) DO UPDATE SET
      ts=excluded.ts,
      ts_epoch=excluded.ts_epoch,
      project=excluded.project,
      agent=excluded.agent,
      role=excluded.role,
      kind=excluded.kind,
      text=excluded.text,
      refs_json=excluded.refs_json,
      refs_flat=excluded.refs_flat,
      turn_json=excluded.turn_json,
      text_hash=excluded.text_hash,
      signature_hash=excluded.signature_hash;
  `).run({
    event_id: row.eventId,
    session_id: row.sessionId,
    seq: row.seq,
    ts: row.ts,
    ts_epoch: row.tsEpoch,
    project: row.project,
    agent: row.agent,
    role: row.role,
    kind: row.kind,
    text: row.text,
    refs_json: JSON.stringify(row.refs),
    refs_flat: refsToFlat(row.refs),
    turn_json: row.turn ? JSON.stringify(row.turn) : null,
    text_hash: row.textHash,
    signature_hash: row.signatureHash,
  });
  db.prepare('DELETE FROM event_refs WHERE event_id = ?').run(row.eventId);
  if (row.refs.length > 0) {
    const insertRef = db.prepare('INSERT OR IGNORE INTO event_refs (event_id, ref) VALUES (?, ?)');
    runTransaction(db, () => {
      for (const ref of row.refs) {
        const normalized = ref.trim();
        if (!normalized) continue;
        insertRef.run(row.eventId, normalized);
      }
    });
  }
  db.prepare('DELETE FROM events_fts WHERE event_id = ?').run(row.eventId);
  db.prepare(`
    INSERT INTO events_fts (event_id, kind, text, refs)
    VALUES (?, ?, ?, ?)
  `).run(
    row.eventId,
    row.kind,
    row.text,
    row.refs.join(' ')
  );
}

export function upsertCheckpointRow(dbPath: string, row: SqliteCheckpointRow): void {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  db.prepare(`
    INSERT INTO checkpoints (
      checkpoint_id, session_id, seq, ts, ts_epoch, project, agent, status, summary, next_actions_json, artifacts_json,
      verification_result, retry_count, failure_category, elapsed_ms, cost_json, telemetry_json
    ) VALUES (
      @checkpoint_id, @session_id, @seq, @ts, @ts_epoch, @project, @agent, @status, @summary, @next_actions_json, @artifacts_json,
      @verification_result, @retry_count, @failure_category, @elapsed_ms, @cost_json, @telemetry_json
    )
    ON CONFLICT(checkpoint_id) DO UPDATE SET
      ts=excluded.ts,
      ts_epoch=excluded.ts_epoch,
      project=excluded.project,
      agent=excluded.agent,
      status=excluded.status,
      summary=excluded.summary,
      next_actions_json=excluded.next_actions_json,
      artifacts_json=excluded.artifacts_json,
      verification_result=excluded.verification_result,
      retry_count=excluded.retry_count,
      failure_category=excluded.failure_category,
      elapsed_ms=excluded.elapsed_ms,
      cost_json=excluded.cost_json,
      telemetry_json=excluded.telemetry_json;
  `).run({
    checkpoint_id: row.checkpointId,
    session_id: row.sessionId,
    seq: row.seq,
    ts: row.ts,
    ts_epoch: row.tsEpoch,
    project: row.project,
    agent: row.agent,
    status: row.status,
    summary: row.summary,
    next_actions_json: JSON.stringify(row.nextActions),
    artifacts_json: JSON.stringify(row.artifacts),
    verification_result: row.telemetry?.verification?.result ?? null,
    retry_count: row.telemetry?.retryCount ?? null,
    failure_category: row.telemetry?.failureCategory ?? null,
    elapsed_ms: row.telemetry?.elapsedMs ?? null,
    cost_json: row.telemetry?.cost ? JSON.stringify(row.telemetry.cost) : null,
    telemetry_json: row.telemetry ? JSON.stringify(row.telemetry) : null,
  });
  db.prepare('DELETE FROM checkpoints_fts WHERE checkpoint_id = ?').run(row.checkpointId);
  db.prepare(`
    INSERT INTO checkpoints_fts (checkpoint_id, status, summary, next_actions, artifacts, failure_category)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    row.checkpointId,
    row.status,
    row.summary,
    row.nextActions.join(' '),
    row.artifacts.join(' '),
    row.telemetry?.failureCategory ?? ''
  );
}

export function searchEventRows(dbPath: string, input: SqliteSearchInput): SqliteEventRow[] {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  const alias = 'e';

  if (input.project) {
    clauses.push(`${alias}.project = ?`);
    params.push(input.project);
  }
  if (input.sessionId) {
    clauses.push(`${alias}.session_id = ?`);
    params.push(input.sessionId);
  }
  if (input.role) {
    clauses.push(`${alias}.role = ?`);
    params.push(input.role);
  }
  if (input.kinds && input.kinds.length > 0) {
    clauses.push(`${alias}.kind IN (${input.kinds.map(() => '?').join(', ')})`);
    params.push(...input.kinds);
  }
  if (input.refs && input.refs.length > 0) {
    const refs = input.refs.map((ref) => ref.trim()).filter((ref) => ref.length > 0);
    if (refs.length > 0) {
      clauses.push(`
        EXISTS (
          SELECT 1
          FROM event_refs AS er
          WHERE er.event_id = ${alias}.event_id
            AND er.ref IN (${refs.map(() => '?').join(', ')})
        )
      `.trim());
      params.push(...refs);
    }
  }
  const tokens = input.query && input.query.trim().length > 0
    ? tokenizeSearchQuery(input.query)
    : [];

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.floor(input.limit)) : 20;
  let rows: EventSelectRow[] = [];

  if (tokens.length > 0) {
    try {
      const ftsWhere = clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '';
      const ftsParams: Array<string | number> = [toFtsMatchQuery(tokens), ...params, limit];
      rows = db.prepare(`
        SELECT
          e.event_id, e.session_id, e.seq, e.ts, e.ts_epoch, e.project, e.agent, e.role, e.kind, e.text, e.refs_json, e.turn_json, e.text_hash, e.signature_hash
        FROM events_fts
        INNER JOIN events AS e ON e.event_id = events_fts.event_id
        WHERE events_fts MATCH ?
        ${ftsWhere}
        ORDER BY bm25(events_fts, 4.0, 2.0, 1.0), e.ts_epoch DESC
        LIMIT ?;
      `).all(...ftsParams) as unknown as EventSelectRow[];
    } catch {
      rows = [];
    }

    if (rows.length === 0) {
      const fallbackClauses = [...clauses];
      const fallbackParams = [...params];
      const tokenClauses = tokens.map(
        () => '(LOWER(e.text) LIKE ? OR LOWER(e.kind) LIKE ? OR LOWER(e.refs_flat) LIKE ?)'
      );
      fallbackClauses.push(`(${tokenClauses.join(' OR ')})`);
      for (const token of tokens) {
        const pattern = `%${token}%`;
        fallbackParams.push(pattern, pattern, pattern);
      }
      fallbackParams.push(limit);
      rows = db.prepare(`
        SELECT
          e.event_id, e.session_id, e.seq, e.ts, e.ts_epoch, e.project, e.agent, e.role, e.kind, e.text, e.refs_json, e.turn_json, e.text_hash, e.signature_hash
        FROM events AS e
        WHERE ${fallbackClauses.join(' AND ')}
        ORDER BY e.ts_epoch DESC
        LIMIT ?;
      `).all(...fallbackParams) as unknown as EventSelectRow[];
    }
  } else {
    params.push(limit);
    rows = db.prepare(`
      SELECT
        e.event_id, e.session_id, e.seq, e.ts, e.ts_epoch, e.project, e.agent, e.role, e.kind, e.text, e.refs_json, e.turn_json, e.text_hash, e.signature_hash
      FROM events AS e
      ${where}
      ORDER BY e.ts_epoch DESC
      LIMIT ?;
    `).all(...params) as unknown as EventSelectRow[];
  }

  return rows.map((row) => {
    const turn = parseJsonObject<EventTurnEnvelope>(row.turn_json);
    return {
      eventId: row.event_id,
      sessionId: row.session_id,
      seq: row.seq,
      ts: row.ts,
      tsEpoch: row.ts_epoch,
      project: row.project,
      agent: row.agent,
      role: row.role,
      kind: row.kind,
      text: row.text,
      refs: parseJsonStringArray(row.refs_json),
      ...(turn ? { turn } : {}),
      textHash: row.text_hash,
      signatureHash: row.signature_hash,
    };
  });
}

export function searchCheckpointRows(dbPath: string, input: SqliteCheckpointSearchInput): SqliteCheckpointRow[] {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (input.project) {
    clauses.push('project = ?');
    params.push(input.project);
  }
  if (input.sessionId) {
    clauses.push('session_id = ?');
    params.push(input.sessionId);
  }
  if (input.statuses && input.statuses.length > 0) {
    clauses.push(`status IN (${input.statuses.map(() => '?').join(', ')})`);
    params.push(...input.statuses);
  }

  const tokens = input.query && input.query.trim().length > 0
    ? tokenizeSearchQuery(input.query)
    : [];
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.floor(input.limit)) : 20;
  let rows: CheckpointSelectRow[] = [];

  if (tokens.length > 0) {
    try {
      const ftsWhere = clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '';
      const ftsParams: Array<string | number> = [toFtsMatchQuery(tokens), ...params, limit];
      rows = db.prepare(`
        SELECT
          c.checkpoint_id, c.session_id, c.seq, c.ts, c.ts_epoch, c.project, c.agent, c.status, c.summary, c.next_actions_json, c.artifacts_json,
          c.verification_result, c.retry_count, c.failure_category, c.elapsed_ms, c.cost_json, c.telemetry_json
        FROM checkpoints_fts
        INNER JOIN checkpoints AS c ON c.checkpoint_id = checkpoints_fts.checkpoint_id
        WHERE checkpoints_fts MATCH ?
        ${ftsWhere}
        ORDER BY bm25(checkpoints_fts, 2.5, 4.5, 1.5, 1.0, 1.0), c.ts_epoch DESC
        LIMIT ?;
      `).all(...ftsParams) as unknown as CheckpointSelectRow[];
    } catch {
      rows = [];
    }

    if (rows.length === 0) {
      const fallbackClauses = [...clauses];
      const fallbackParams = [...params];
      const tokenClauses = tokens.map(
        () => '(LOWER(summary) LIKE ? OR LOWER(status) LIKE ? OR LOWER(next_actions_json) LIKE ? OR LOWER(artifacts_json) LIKE ? OR LOWER(COALESCE(failure_category, \'\')) LIKE ?)'
      );
      fallbackClauses.push(`(${tokenClauses.join(' OR ')})`);
      for (const token of tokens) {
        const pattern = `%${token}%`;
        fallbackParams.push(pattern, pattern, pattern, pattern, pattern);
      }
      fallbackParams.push(limit);
      rows = db.prepare(`
        SELECT
          checkpoint_id, session_id, seq, ts, ts_epoch, project, agent, status, summary, next_actions_json, artifacts_json,
          verification_result, retry_count, failure_category, elapsed_ms, cost_json, telemetry_json
        FROM checkpoints
        WHERE ${fallbackClauses.join(' AND ')}
        ORDER BY ts_epoch DESC
        LIMIT ?;
      `).all(...fallbackParams) as unknown as CheckpointSelectRow[];
    }
  } else {
    params.push(limit);
    rows = db.prepare(`
      SELECT
        checkpoint_id, session_id, seq, ts, ts_epoch, project, agent, status, summary, next_actions_json, artifacts_json,
        verification_result, retry_count, failure_category, elapsed_ms, cost_json, telemetry_json
      FROM checkpoints
      ${where}
      ORDER BY ts_epoch DESC
      LIMIT ?;
    `).all(...params) as unknown as CheckpointSelectRow[];
  }

  return rows.map((row) => ({
    checkpointId: row.checkpoint_id,
    sessionId: row.session_id,
    seq: row.seq,
    ts: row.ts,
    tsEpoch: row.ts_epoch,
    project: row.project,
    agent: row.agent,
    status: row.status,
    summary: row.summary,
    nextActions: parseJsonStringArray(row.next_actions_json),
    artifacts: parseJsonStringArray(row.artifacts_json),
    telemetry: parseCheckpointTelemetry(row),
  }));
}

export function getEventRowById(dbPath: string, eventId: string): SqliteEventRow | null {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  const row = db.prepare(`
    SELECT
      event_id, session_id, seq, ts, ts_epoch, project, agent, role, kind, text, refs_json, turn_json, text_hash, signature_hash
    FROM events
    WHERE event_id = ?;
  `).get(eventId) as unknown as EventSelectRow | undefined;

  if (!row) return null;
  const turn = parseJsonObject<EventTurnEnvelope>(row.turn_json);
  return {
    eventId: row.event_id,
    sessionId: row.session_id,
    seq: row.seq,
    ts: row.ts,
    tsEpoch: row.ts_epoch,
    project: row.project,
    agent: row.agent,
    role: row.role,
    kind: row.kind,
    text: row.text,
    refs: parseJsonStringArray(row.refs_json),
    ...(turn ? { turn } : {}),
    textHash: row.text_hash,
    signatureHash: row.signature_hash,
  };
}

export function timelineEventRows(dbPath: string, input: SqliteTimelineInput): SqliteEventRow[] {
  return searchEventRows(dbPath, {
    project: input.project,
    sessionId: input.sessionId,
    limit: input.limit,
  });
}

export function timelineCheckpointRows(dbPath: string, input: SqliteTimelineInput): SqliteCheckpointRow[] {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (input.project) {
    clauses.push('project = ?');
    params.push(input.project);
  }
  if (input.sessionId) {
    clauses.push('session_id = ?');
    params.push(input.sessionId);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.floor(input.limit)) : 50;
  params.push(limit);

  const rows = db.prepare(`
    SELECT
      checkpoint_id, session_id, seq, ts, ts_epoch, project, agent, status, summary, next_actions_json, artifacts_json,
      verification_result, retry_count, failure_category, elapsed_ms, cost_json, telemetry_json
    FROM checkpoints
    ${where}
    ORDER BY ts_epoch DESC
    LIMIT ?;
  `).all(...params) as unknown as CheckpointSelectRow[];

  return rows.map((row) => ({
    checkpointId: row.checkpoint_id,
    sessionId: row.session_id,
    seq: row.seq,
    ts: row.ts,
    tsEpoch: row.ts_epoch,
    project: row.project,
    agent: row.agent,
    status: row.status,
    summary: row.summary,
    nextActions: parseJsonStringArray(row.next_actions_json),
    artifacts: parseJsonStringArray(row.artifacts_json),
    telemetry: parseCheckpointTelemetry(row),
  }));
}

export function countSqliteRows(dbPath: string): { sessions: number; events: number; checkpoints: number } {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  const sessions = db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as unknown as { count: number };
  const events = db.prepare('SELECT COUNT(*) AS count FROM events').get() as unknown as { count: number };
  const checkpoints = db.prepare('SELECT COUNT(*) AS count FROM checkpoints').get() as unknown as { count: number };
  return {
    sessions: sessions.count,
    events: events.count,
    checkpoints: checkpoints.count,
  };
}

export function getSessionIndexedSeqs(dbPath: string, sessionId: string): SqliteSessionIndexedSeqs {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  const eventRow = db.prepare(`
    SELECT COALESCE(MAX(seq), 0) AS max_seq
    FROM events
    WHERE session_id = ?;
  `).get(sessionId) as unknown as { max_seq?: number } | undefined;
  const checkpointRow = db.prepare(`
    SELECT COALESCE(MAX(seq), 0) AS max_seq
    FROM checkpoints
    WHERE session_id = ?;
  `).get(sessionId) as unknown as { max_seq?: number } | undefined;

  return {
    eventSeq: Number.isFinite(eventRow?.max_seq) ? Math.max(0, Math.floor(eventRow?.max_seq ?? 0)) : 0,
    checkpointSeq: Number.isFinite(checkpointRow?.max_seq) ? Math.max(0, Math.floor(checkpointRow?.max_seq ?? 0)) : 0,
  };
}
