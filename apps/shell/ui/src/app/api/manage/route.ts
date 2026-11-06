import type { NextRequest } from 'next/server';
import { buildManagementArgv, loadManagement } from '../../../lib/data/management.mjs';
import { runCapabilityJson } from '../../../lib/data/capability.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (status: number, body: unknown) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export async function GET(request: NextRequest): Promise<Response> {
  const resource = request.nextUrl.searchParams.get('resource') || 'skills';
  const commands: Record<string, string[]> = { integrations: ['integration', 'list', '--json'], agents: ['agents', 'list', '--json'] };
  const result = resource === 'skills' ? await loadManagement() : commands[resource] ? await runCapabilityJson(commands[resource]) : null;
  if (!result) return json(400, { error: 'unknown resource' });
  return json(result.ok ? 200 : 502, result);
}

export async function POST(request: NextRequest): Promise<Response> {
  let body;
  try {
    body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid object');
  } catch { return json(400, { error: 'expected a JSON object' }); }
  const listed = await loadManagement();
  if (!listed.ok) return json(502, listed);
  const built = buildManagementArgv(body, listed.data);
  if ('error' in built) return json(400, built);
  if (built.writes && body.confirm !== true) return json(409, { error: 'confirmation-required' });
  if (built.writes && body.resource === 'skills' && !body.expectedRevision) return json(409, { error: 'preview-required' });
  const result = await runCapabilityJson(built.argv);
  return json(result.ok ? 200 : 502, result);
}
