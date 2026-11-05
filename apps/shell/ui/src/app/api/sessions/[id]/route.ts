// One session: digest + checkpoints + a bounded tail of events.
//
// The id arrives from a URL, so `readSession` validates it against a whitelist and refuses
// anything that would resolve outside the sessions directory. A 404 and a 400 stay distinct
// on purpose: "this session is gone" and "that is not a session id" are different facts.
import path from 'node:path';

import type { NextRequest } from 'next/server';

import { SessionError, readSession } from '../../../../lib/data/sessions.mjs';

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const requested = Number(request.nextUrl.searchParams.get('events') ?? 0);
  const eventTail = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 500) : undefined;
  try {
    const session = readSession(repoRoot(), id, eventTail ? { eventTail } : undefined);
    return json(200, { session });
  } catch (error) {
    if (error instanceof SessionError) {
      return json(error.status, { error: 'session', detail: error.message, id });
    }
    return json(
      500,
      { error: 'read-failed', detail: error instanceof Error ? error.message : String(error) },
    );
  }
}
