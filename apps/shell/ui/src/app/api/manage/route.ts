import type { NextRequest } from 'next/server';
import { executeManagement, loadManagementResource } from '../../../lib/data/management.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (status: number, body: unknown) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export async function GET(request: NextRequest): Promise<Response> {
  const resource = request.nextUrl.searchParams.get('resource') || 'skills';
  const result = await loadManagementResource(resource);
  if (!result) return json(400, { error: 'unknown resource' });
  return json(result.ok ? 200 : 502, result);
}

export async function POST(request: NextRequest): Promise<Response> {
  let body;
  try {
    body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid object');
  } catch { return json(400, { error: 'expected a JSON object' }); }
  const result = await executeManagement(body);
  return json(result.status, result.body);
}
