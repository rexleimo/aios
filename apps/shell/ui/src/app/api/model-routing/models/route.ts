// 模型来源端点——magpie 式动态发现的后端。
// GET  /api/model-routing/models        → `aios model-router models --json`（可用模型目录：curated+discovered+custom，只读）
// POST /api/model-routing/models        → { confirm: true } → `aios model-router models --refresh --json`（拉 provider 模型列表并入注册表）
//
// 纪律照抄 gateway 路由：HTTP body 永不进 shell；刷新会写注册表（副作用）→ 缺 confirm:true 409；execFile 数组 argv。
// 发现/合并的单一事实源在 scripts/lib/.../routing/discovery.mjs，本路由只经 CLI 调它。发现是只读上游元数据，零生成扣费。
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);

function repoRoot(): string {
  return process.env.AIOS_PROJECT_ROOT ?? path.resolve(process.cwd(), '..', '..', '..');
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const parseCliJson = (stdout: string): unknown => {
  const text = String(stdout ?? '').trim();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text.slice(0, 4000) };
  }
};

async function runModelsCli(root: string, argv: string[]): Promise<unknown> {
  const script = path.join(root, 'scripts', 'aios.mjs');
  const { stdout } = await execFileAsync(process.execPath, [script, 'model-router', ...argv], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, AIOS_PROJECT_ROOT: root },
  });
  return parseCliJson(stdout);
}

export async function GET(): Promise<Response> {
  try {
    const result = await runModelsCli(repoRoot(), ['models', '--json']);
    return json(200, { ok: true, ...(result as Record<string, unknown>) });
  } catch (error) {
    return json(502, { error: 'models-list-failed', detail: error instanceof Error ? error.message : String(error) });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: 'invalid-body', detail: 'expected a JSON object' });
  }
  if (body.confirm !== true) {
    return json(409, { error: 'confirmation-required', detail: 'refreshing discovers provider models and writes the registry; send {"confirm": true}' });
  }
  try {
    const result = await runModelsCli(repoRoot(), ['models', '--refresh', '--json']);
    return json(200, { ok: true, result });
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string; message?: string };
    return json(200, {
      ok: false,
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
      result: parseCliJson(failure.stdout ?? ''),
      stderr: String(failure.stderr ?? failure.message ?? '').trim(),
    });
  }
}