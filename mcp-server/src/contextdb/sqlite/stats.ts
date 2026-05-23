import { getConnection } from './connection.js';
import { ensureSqliteSidecar } from './schema.js';
import type { SqliteSessionIndexedSeqs } from './types.js';

export function countSqliteRows(dbPath: string): { sessions: number; events: number; checkpoints: number } {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  const sessions = db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as unknown as { count: number };
  const events = db.prepare('SELECT COUNT(*) AS count FROM events').get() as unknown as { count: number };
  const checkpoints = db.prepare('SELECT COUNT(*) AS count FROM checkpoints').get() as unknown as { count: number };
  return { sessions: sessions.count, events: events.count, checkpoints: checkpoints.count };
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
