import { getConnection } from './connection.js';
import { ensureSqliteSidecar } from './schema.js';
import { parseJsonStringArray } from './serde.js';
import type { SessionSelectRow, SqliteSessionRow } from './types.js';

export function upsertSessionRow(dbPath: string, row: SqliteSessionRow): void {
  ensureSqliteSidecar(dbPath);
  const db = getConnection(dbPath);
  db.prepare(`
    INSERT INTO sessions (session_id, agent, project, goal, tags_json, created_at, updated_at)
    VALUES (@session_id, @agent, @project, @goal, @tags_json, @created_at, @updated_at)
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

  const row = db.prepare(`
    SELECT session_id, agent, project, goal, tags_json, created_at, updated_at
    FROM sessions
    WHERE ${clauses.join(' AND ')}
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
