// Memory: the content, not only the counts.
//
// The page previously showed "572 events / 1 space" — numbers about a store you could not
// read, which is exactly the complaint that produced this route. Memory is text, so the
// route returns text: the pinned facts, and whatever a search matched.
//
// GET /api/memory?q=<query>&limit=<n>
//   200 { pinned, query, results, truncated }
//   423 the capability process is unreachable
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { NextRequest } from 'next/server';

import { buildMemoryArgv } from '../../../lib/data/memory-actions.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function repoRoot(): string {
  return process.env.AIOS_PROJECT_ROOT ?? path.resolve(process.cwd(), '..', '..', '..');
}

function run(args: string[], root: string): Promise<{ ok: boolean; out: string; error: string }> {
  return new Promise((resolve) => {
    const cli = path.join(root, 'scripts', 'aios.mjs');
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: root,
      env: { ...process.env, AIOS_PROJECT_ROOT: root },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      out += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      err += chunk;
    });
    child.on('error', (error) => resolve({ ok: false, out, error: error.message }));
    child.on('close', (code) => resolve({ ok: code === 0, out, error: err }));
  });
}

/**
 * 写路径：页面唯一能改记忆的地方。
 *
 * 只有白名单里的动作、只有合法的 event id、只有带 `confirm: true` 的请求会执行；
 * 参数以 argv 数组传给子进程（`shell: false`），页面无法把它拼成命令。
 */
export async function POST(request: NextRequest): Promise<Response> {
  const root = repoRoot();
  let body: { action?: unknown; id?: unknown; text?: unknown; confirm?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { error: 'invalid-body' });
  }
  if (body.confirm !== true) {
    return json(409, { error: 'confirmation-required', detail: '写记忆需要显式确认' });
  }
  const action = typeof body.action === 'string' ? body.action : '';
  const id = typeof body.id === 'string' ? body.id : '';
  const text = typeof body.text === 'string' ? body.text : '';
  const argv = buildMemoryArgv(action, {
    cli: path.join(root, 'scripts', 'aios.mjs'),
    id,
    text,
  });
  if (!argv) {
    return json(422, { error: 'invalid-action', action, id });
  }
  const [cli, ...args] = argv;
  const result = await new Promise<{ ok: boolean; out: string; error: string }>((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: root,
      env: { ...process.env, AIOS_PROJECT_ROOT: root },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      out += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      err += chunk;
    });
    child.on('error', (error) => resolve({ ok: false, out, error: error.message }));
    child.on('close', (code) => resolve({ ok: code === 0, out, error: err }));
  });
  return json(result.ok ? 200 : 500, {
    ok: result.ok,
    action,
    id,
    output: result.out.trim().slice(0, 800),
    error: result.ok ? null : result.error.trim().slice(0, 400),
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const root = repoRoot();
  if (!fs.existsSync(path.join(root, 'scripts', 'aios.mjs'))) {
    return new Response(JSON.stringify({ error: 'capability-process-absent' }), {
      status: 423,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const query = (request.nextUrl.searchParams.get('q') ?? '').trim();
  const requested = Number(request.nextUrl.searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT;

  const pinned = await run(['memo', 'pin', 'show'], root);
  const search = query
    ? await run(['memo', 'search', query, '--limit', String(limit), '--level', 'full'], root)
    : { ok: true, out: '', error: '' };

  return new Response(
    JSON.stringify({
      pinned: pinned.out.trim(),
      query,
      results: query ? search.out.trim() : '',
      truncated: query ? search.out.split('\n').filter((line) => line.startsWith('- [')).length >= limit : false,
      error: query && !search.ok ? search.error.trim().slice(0, 300) : null,
    }),
    { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } },
  );
}