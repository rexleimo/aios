import { getConnection } from './connection.js';
import { ensureSqliteSidecar } from './schema.js';
import { toFtsMatchQuery, tokenizeSearchQuery } from './search-query.js';
import { mapCheckpointRow } from './serde.js';
import type {
  CheckpointSelectRow,
  SqliteCheckpointRow,
  SqliteCheckpointSearchInput,
  SqliteTimelineInput,
} from './types.js';

const CHECKPOINT_SELECT_COLUMNS = 'checkpoint_id, session_id, seq, ts, ts_epoch, project, agent, status, summary, next_actions_json, artifacts_json, verification_result, retry_count, failure_category, elapsed_ms, cost_json, telemetry_json';
const CHECKPOINT_SELECT_COLUMNS_WITH_ALIAS = 'c.checkpoint_id, c.session_id, c.seq, c.ts, c.ts_epoch, c.project, c.agent, c.status, c.summary, c.next_actions_json, c.artifacts_json, c.verification_result, c.retry_count, c.failure_category, c.elapsed_ms, c.cost_json, c.telemetry_json';

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

function buildCheckpointClauses(input: SqliteCheckpointSearchInput): { clauses: string[]; params: Array<string | number> } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (input.project) { clauses.push('project = ?'); params.push(input.project); }
  if (input.sessionId) { clauses.push('session_id = ?'); params.push(input.sessionId); }
  if (input.statuses && input.statuses.length > 0) {
    clauses.push(`status IN (${input.statuses.map(() => '?').join(', ')})`);
    params.push(...input.statuses);
  }
  return { clauses, params };
}

export function searchCheckpointRows(dbPath: string, input: SqliteCheckpointSearchInput): SqliteCheckpointRow[] {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  const { clauses, params } = buildCheckpointClauses(input);
  const tokens = input.query && input.query.trim().length > 0 ? tokenizeSearchQuery(input.query) : [];
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.floor(input.limit)) : 20;
  let rows: CheckpointSelectRow[] = [];

  if (tokens.length > 0) {
    try {
      const ftsWhere = clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '';
      rows = db.prepare(`
        SELECT ${CHECKPOINT_SELECT_COLUMNS_WITH_ALIAS}
        FROM checkpoints_fts
        INNER JOIN checkpoints AS c ON c.checkpoint_id = checkpoints_fts.checkpoint_id
        WHERE checkpoints_fts MATCH ? ${ftsWhere}
        ORDER BY bm25(checkpoints_fts, 2.5, 4.5, 1.5, 1.0, 1.0), c.ts_epoch DESC
        LIMIT ?;
      `).all(toFtsMatchQuery(tokens), ...params, limit) as unknown as CheckpointSelectRow[];
    } catch {
      rows = [];
    }
    if (rows.length === 0) rows = searchCheckpointRowsByLike(db, clauses, params, tokens, limit);
  } else {
    rows = db.prepare(`
      SELECT ${CHECKPOINT_SELECT_COLUMNS}
      FROM checkpoints
      ${where}
      ORDER BY ts_epoch DESC
      LIMIT ?;
    `).all(...params, limit) as unknown as CheckpointSelectRow[];
  }

  return rows.map(mapCheckpointRow);
}

function searchCheckpointRowsByLike(
  db: ReturnType<typeof getConnection>,
  clauses: string[],
  params: Array<string | number>,
  tokens: string[],
  limit: number
): CheckpointSelectRow[] {
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
  return db.prepare(`
    SELECT ${CHECKPOINT_SELECT_COLUMNS}
    FROM checkpoints
    WHERE ${fallbackClauses.join(' AND ')}
    ORDER BY ts_epoch DESC
    LIMIT ?;
  `).all(...fallbackParams, limit) as unknown as CheckpointSelectRow[];
}

export function timelineCheckpointRows(dbPath: string, input: SqliteTimelineInput): SqliteCheckpointRow[] {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (input.project) { clauses.push('project = ?'); params.push(input.project); }
  if (input.sessionId) { clauses.push('session_id = ?'); params.push(input.sessionId); }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.floor(input.limit)) : 50;
  const rows = db.prepare(`
    SELECT ${CHECKPOINT_SELECT_COLUMNS}
    FROM checkpoints
    ${where}
    ORDER BY ts_epoch DESC
    LIMIT ?;
  `).all(...params, limit) as unknown as CheckpointSelectRow[];

  return rows.map(mapCheckpointRow);
}
