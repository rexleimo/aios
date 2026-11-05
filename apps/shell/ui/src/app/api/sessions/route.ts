// The session list and one session's content, read straight from ContextDB's files.
//
// GET /api/sessions?q=<text>        → { sessions: [...] }
// GET /api/sessions/<id>?events=<n> → { session: {...} }
//
// Read-only by construction: there is no write path here, because a console that can
// rewrite history is a different product decision.
import path from 'node:path';

import type { NextRequest } from 'next/server';

import { listSessions } from '../../../lib/data/sessions.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function repoRoot(): string {
  return process.env.AIOS_PROJECT_ROOT ?? path.resolve(process.cwd(), '..', '..', '..');
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const query = (request.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();
  const sessions = listSessions(repoRoot());
  const filtered =
    query.length === 0
      ? sessions
      : sessions.filter((session) =>
          [session.sessionId, session.agent, session.project, session.goal, session.status]
            .join(' ')
            .toLowerCase()
            .includes(query),
        );
  return json(200, { sessions: filtered, total: sessions.length });
}
