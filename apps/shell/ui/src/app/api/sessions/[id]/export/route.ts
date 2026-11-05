// 导出会话为单个 JSON 文件（浏览器直接下载）。
import path from 'node:path';

import type { NextRequest } from 'next/server';

import { SessionError, exportSession } from '../../../../../lib/data/sessions.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const root = process.env.AIOS_PROJECT_ROOT ?? path.resolve(process.cwd(), '..', '..', '..');
  try {
    const bundle = exportSession(root, id);
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${id}.json"`,
      },
    });
  } catch (error) {
    const status = error instanceof SessionError ? error.status : 500;
    return new Response(JSON.stringify({ error: 'export-failed', detail: error instanceof Error ? error.message : String(error) }), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}
