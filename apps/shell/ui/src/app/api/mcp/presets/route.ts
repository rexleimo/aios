import { searchMcpPreset } from '../../../../lib/data/mcp-presets.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const result = searchMcpPreset();
  return Response.json(result, { status: result.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
