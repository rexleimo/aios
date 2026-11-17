import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { NextRequest } from 'next/server';
import { loadMcpList } from '../../../lib/data/mcp.mjs';
import { repoRoot, resolveCapabilityCli } from '../../../lib/data/capability.mjs';
import { createMcpActionService } from './action-service.mjs';
import { createPreviewStore } from './preview-store.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const execFileAsync = promisify(execFile);
const previews = createPreviewStore();
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function service() {
  const root = repoRoot();
  const runtime = resolveCapabilityCli(root);
  return createMcpActionService({
    context: [root, runtime.ok ? runtime.script : ''], previews,
    list: () => loadMcpList({ rootDir: root }),
    run: async (argv: string[], revision: string) => {
      if (!runtime.ok) throw new Error('runtime-unavailable');
      const env = { ...process.env, AIOS_PROJECT_ROOT: root, AIOS_MCP_EXPECTED_REVISION: revision };
      try {
        const { stdout } = await execFileAsync(process.execPath, [runtime.script, ...argv], {
          cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024, env,
        });
        return { exitCode: 0, stdout };
      } catch (error) {
        const failure = error as { code?: number; stdout?: string };
        return { exitCode: typeof failure.code === 'number' ? failure.code : 1, stdout: failure.stdout || '' };
      }
    },
  });
}

export async function GET(): Promise<Response> {
  const result = await loadMcpList({ rootDir: repoRoot() });
  if (!result.ok) return json(502, { ok: false, error: 'mcp-list-failed' });
  const data = result.data as { drift?: unknown };
  return json(200, { ok: true, rows: result.rows, summary: result.summary, drift: data?.drift ?? [] });
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const response = await service().post(await request.json());
    return json(response.status, response.body);
  } catch {
    return json(400, { ok: false, error: 'invalid-body' });
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();
    if (!body || typeof body.previewId !== 'string') return json(400, { ok: false, error: 'invalid-preview-id' });
    previews.revoke(body.previewId);
    return json(200, { ok: true });
  } catch { return json(400, { ok: false, error: 'invalid-body' }); }
}
