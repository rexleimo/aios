// 会话的写动作：目前只有"移到回收站"。
//
// 删除是数据丢失动作，所以：必须带 confirm、只做 rename（不 rm）、返回目标路径。
// 恢复就是把 sessions-trash/<stamp>-<id>/ 移回 sessions/<id>/，页面把路径显示出来。
import path from 'node:path';

import type { NextRequest } from 'next/server';

import { SessionError, trashSession } from '../../../../lib/data/sessions.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const root = process.env.AIOS_PROJECT_ROOT ?? path.resolve(process.cwd(), '..', '..', '..');
  let body: { action?: unknown; confirm?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid-body' }), { status: 400 });
  }
  if (body.action !== 'trash') {
    return new Response(JSON.stringify({ error: 'unknown-action', action: body.action }), { status: 422 });
  }
  if (body.confirm !== true) {
    return new Response(JSON.stringify({ error: 'confirmation-required' }), { status: 409 });
  }
  try {
    const result = trashSession(root, id);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    const status = error instanceof SessionError ? error.status : 500;
    return new Response(
      JSON.stringify({ error: 'trash-failed', detail: error instanceof Error ? error.message : String(error) }),
      { status, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
}
