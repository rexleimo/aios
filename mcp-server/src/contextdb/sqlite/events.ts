import { getConnection, runTransaction } from './connection.js';
import { ensureSqliteSidecar } from './schema.js';
import { toFtsMatchQuery, tokenizeSearchQuery } from './search-query.js';
import { mapEventRow, refsToFlat } from './serde.js';
import type { EventSelectRow, SqliteEventRow, SqliteSearchInput, SqliteTimelineInput } from './types.js';

const EVENT_SELECT_COLUMNS = 'e.event_id, e.session_id, e.seq, e.ts, e.ts_epoch, e.project, e.agent, e.role, e.kind, e.text, e.refs_json, e.turn_json, e.text_hash, e.signature_hash';

export function upsertEventRow(dbPath: string, row: SqliteEventRow): void {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  db.prepare(`
    INSERT INTO events (event_id, session_id, seq, ts, ts_epoch, project, agent, role, kind, text, refs_json, refs_flat, turn_json, text_hash, signature_hash)
    VALUES (@event_id, @session_id, @seq, @ts, @ts_epoch, @project, @agent, @role, @kind, @text, @refs_json, @refs_flat, @turn_json, @text_hash, @signature_hash)
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
        if (normalized) insertRef.run(row.eventId, normalized);
      }
    });
  }
  db.prepare('DELETE FROM events_fts WHERE event_id = ?').run(row.eventId);
  db.prepare('INSERT INTO events_fts (event_id, kind, text, refs) VALUES (?, ?, ?, ?)')
    .run(row.eventId, row.kind, row.text, row.refs.join(' '));
}

function buildEventClauses(input: SqliteSearchInput): { clauses: string[]; params: Array<string | number> } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (input.project) { clauses.push('e.project = ?'); params.push(input.project); }
  if (input.sessionId) { clauses.push('e.session_id = ?'); params.push(input.sessionId); }
  if (input.role) { clauses.push('e.role = ?'); params.push(input.role); }
  if (input.kinds && input.kinds.length > 0) {
    clauses.push(`e.kind IN (${input.kinds.map(() => '?').join(', ')})`);
    params.push(...input.kinds);
  }
  if (input.refs && input.refs.length > 0) {
    const refs = input.refs.map((ref) => ref.trim()).filter(Boolean);
    if (refs.length > 0) {
      clauses.push(`EXISTS (SELECT 1 FROM event_refs AS er WHERE er.event_id = e.event_id AND er.ref IN (${refs.map(() => '?').join(', ')}))`);
      params.push(...refs);
    }
  }
  return { clauses, params };
}

export function searchEventRows(dbPath: string, input: SqliteSearchInput): SqliteEventRow[] {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  const { clauses, params } = buildEventClauses(input);
  const tokens = input.query && input.query.trim().length > 0 ? tokenizeSearchQuery(input.query) : [];
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.floor(input.limit)) : 20;
  let rows: EventSelectRow[] = [];

  if (tokens.length > 0) {
    try {
      const ftsWhere = clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '';
      rows = db.prepare(`
        SELECT ${EVENT_SELECT_COLUMNS}
        FROM events_fts
        INNER JOIN events AS e ON e.event_id = events_fts.event_id
        WHERE events_fts MATCH ? ${ftsWhere}
        ORDER BY bm25(events_fts, 4.0, 2.0, 1.0), e.ts_epoch DESC
        LIMIT ?;
      `).all(toFtsMatchQuery(tokens), ...params, limit) as unknown as EventSelectRow[];
    } catch {
      rows = [];
    }
    if (rows.length === 0) rows = searchEventRowsByLike(db, clauses, params, tokens, limit);
  } else {
    rows = db.prepare(`
      SELECT ${EVENT_SELECT_COLUMNS}
      FROM events AS e
      ${where}
      ORDER BY e.ts_epoch DESC
      LIMIT ?;
    `).all(...params, limit) as unknown as EventSelectRow[];
  }

  return rows.map(mapEventRow);
}

function searchEventRowsByLike(
  db: ReturnType<typeof getConnection>,
  clauses: string[],
  params: Array<string | number>,
  tokens: string[],
  limit: number
): EventSelectRow[] {
  const fallbackClauses = [...clauses];
  const fallbackParams = [...params];
  const tokenClauses = tokens.map(() => '(LOWER(e.text) LIKE ? OR LOWER(e.kind) LIKE ? OR LOWER(e.refs_flat) LIKE ?)');
  fallbackClauses.push(`(${tokenClauses.join(' OR ')})`);
  for (const token of tokens) {
    const pattern = `%${token}%`;
    fallbackParams.push(pattern, pattern, pattern);
  }
  return db.prepare(`
    SELECT ${EVENT_SELECT_COLUMNS}
    FROM events AS e
    WHERE ${fallbackClauses.join(' AND ')}
    ORDER BY e.ts_epoch DESC
    LIMIT ?;
  `).all(...fallbackParams, limit) as unknown as EventSelectRow[];
}

export function getEventRowById(dbPath: string, eventId: string): SqliteEventRow | null {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  const row = db.prepare(`
    SELECT ${EVENT_SELECT_COLUMNS}
    FROM events AS e
    WHERE e.event_id = ?;
  `).get(eventId) as unknown as EventSelectRow | undefined;
  return row ? mapEventRow(row) : null;
}

export function timelineEventRows(dbPath: string, input: SqliteTimelineInput): SqliteEventRow[] {
  return searchEventRows(dbPath, { project: input.project, sessionId: input.sessionId, limit: input.limit });
}
