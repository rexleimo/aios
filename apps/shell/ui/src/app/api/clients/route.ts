import { clientManagementStatus, loadClients, runClientManagement } from '../../../lib/data/clients.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function GET(): Promise<Response> {
  const result = await loadClients();
  return json(clientManagementStatus(result), result);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    // Bound untrusted input before parsing; accepted requests are a few hundred bytes.
    const contentLength = request.headers.get('content-length');
    if (contentLength && Number(contentLength) > 4096) throw new Error('size');
    const reader = request.body?.getReader();
    if (!reader) throw new Error('body');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 4096) throw new Error('size');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return json(400, { ok: false, error: { code: 'INVALID_REQUEST', message: 'Expected a JSON client action no larger than 4096 bytes.' } });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || !['preview-update', 'update'].includes((body as { action?: string }).action ?? '')) {
    return json(400, { ok: false, error: { code: 'INVALID_REQUEST', message: 'Expected preview-update or update.' } });
  }
  const result = await runClientManagement(body);
  return json(clientManagementStatus(result), result);
}
