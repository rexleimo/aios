import { existsSync, unlinkSync } from 'node:fs';
import { closeConnection, getConnection, runTransaction, type SqliteDatabase } from './connection.js';
import { parseJsonStringArray } from './serde.js';

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
    if (!columns.has(column)) db.exec(statement);
  }
}

function ensureEventTurnColumn(db: SqliteDatabase): void {
  const tableInfo = db.prepare('PRAGMA table_info(events);').all() as unknown as Array<{ name: string }>;
  const columns = new Set(tableInfo.map((row) => row.name));
  if (!columns.has('turn_json')) db.exec('ALTER TABLE events ADD COLUMN turn_json TEXT;');
}

function ensureEventsFtsBackfill(db: SqliteDatabase): void {
  db.exec(`
    INSERT INTO events_fts (event_id, kind, text, refs)
    SELECT e.event_id, e.kind, e.text, e.refs_flat
    FROM events AS e
    WHERE NOT EXISTS (SELECT 1 FROM events_fts AS f WHERE f.event_id = e.event_id);
  `);
}

function ensureCheckpointsFtsBackfill(db: SqliteDatabase): void {
  db.exec(`
    INSERT INTO checkpoints_fts (checkpoint_id, status, summary, next_actions, artifacts, failure_category)
    SELECT c.checkpoint_id, c.status, c.summary, c.next_actions_json, c.artifacts_json, COALESCE(c.failure_category, '')
    FROM checkpoints AS c
    WHERE NOT EXISTS (SELECT 1 FROM checkpoints_fts AS f WHERE f.checkpoint_id = c.checkpoint_id);
  `);
}

function ensureEventRefsBackfill(db: SqliteDatabase): void {
  try {
    db.exec(`
      INSERT OR IGNORE INTO event_refs (event_id, ref)
      SELECT e.event_id, TRIM(j.value)
      FROM events AS e, json_each(e.refs_json) AS j
      WHERE json_valid(e.refs_json) AND TRIM(j.value) <> '';
    `);
    return;
  } catch {
    // SQLite 运行时缺少 json_each 时降级为 JS 回填。
  }

  const rows = db.prepare(`
    SELECT event_id, refs_json
    FROM events
    WHERE refs_json IS NOT NULL AND refs_json != '[]';
  `).all() as unknown as Array<{ event_id: string; refs_json: string }>;
  const insert = db.prepare('INSERT OR IGNORE INTO event_refs (event_id, ref) VALUES (?, ?)');

  runTransaction(db, () => {
    for (const row of rows) {
      for (const ref of parseJsonStringArray(row.refs_json)) {
        if (ref.trim()) insert.run(row.event_id, ref.trim());
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

    CREATE TABLE IF NOT EXISTS event_refs (event_id TEXT NOT NULL, ref TEXT NOT NULL, PRIMARY KEY (event_id, ref));

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

    CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(event_id UNINDEXED, kind, text, refs, tokenize = 'unicode61');
    CREATE VIRTUAL TABLE IF NOT EXISTS checkpoints_fts USING fts5(checkpoint_id UNINDEXED, status, summary, next_actions, artifacts, failure_category, tokenize = 'unicode61');

    CREATE INDEX IF NOT EXISTS idx_sessions_agent_project_updated ON sessions (agent, project, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_events_project_ts ON events (project, ts_epoch DESC);
    CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events (session_id, ts_epoch DESC);
    CREATE INDEX IF NOT EXISTS idx_events_role_kind_ts ON events (role, kind, ts_epoch DESC);
    CREATE INDEX IF NOT EXISTS idx_event_refs_ref ON event_refs (ref);
    CREATE INDEX IF NOT EXISTS idx_event_refs_event_id ON event_refs (event_id);
    CREATE INDEX IF NOT EXISTS idx_checkpoints_project_ts ON checkpoints (project, ts_epoch DESC);
    CREATE INDEX IF NOT EXISTS idx_checkpoints_session_ts ON checkpoints (session_id, ts_epoch DESC);
  `);
  ensureCheckpointTelemetryColumns(db);
  ensureEventTurnColumn(db);
  ensureEventsFtsBackfill(db);
  ensureCheckpointsFtsBackfill(db);
  ensureEventRefsBackfill(db);
}

export function recreateSqliteSidecar(dbPath: string): void {
  closeConnection(dbPath);
  if (existsSync(dbPath)) {
    try {
      const db = getConnection(dbPath);
      db.exec(`
        PRAGMA foreign_keys = OFF;
        DROP TABLE IF EXISTS events_fts;
        DROP TABLE IF EXISTS checkpoints_fts;
        DROP TABLE IF EXISTS event_refs;
        DROP TABLE IF EXISTS checkpoints;
        DROP TABLE IF EXISTS events;
        DROP TABLE IF EXISTS sessions;
        PRAGMA foreign_keys = ON;
      `);
      ensureSqliteSidecar(dbPath);
      return;
    } catch {
      closeConnection(dbPath);
    }
  }

  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${dbPath}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
  ensureSqliteSidecar(dbPath);
}
