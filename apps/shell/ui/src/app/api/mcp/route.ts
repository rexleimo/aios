// GET  /api/mcp  → `aios mcp list --json` 的视图侧封装（行 + 页头数字）
// POST /api/mcp  → 四个动作 add / remove / adopt / doctor
//
// 为什么单独一条路由而不是复用 `/api/actions/<id>`：那个白名单只支持「固定 argv + 一个 client」，
// 而 MCP 动作要带 (name, scope, entry)。但两条路有一条共同纪律，这里照抄：
//   **HTTP 请求体永远不进 shell**。action 必须是闭合集合里的一员，其余字段全部经过
//   `buildMcpArgv` 的校验（client/scope 必须真的出现在刚取回的落点表里），最后 spawn 的是
//   一个**字符串数组**，没有 shell、没有插值。
//
// 状态码是可区分的（“按钮没反应”正是这层要消灭的东西）：
//   400 字段不合法 / 未知 action / 未知 client 或落点
//   409 会写盘的动作缺少 `confirm: true`
//   502 取不到 `aios mcp list`（连事实都读不到时不允许写）
//   200 命令跑完；`ok` 由 CLI 自己的 payload 决定（拒绝也是一种正常结果）
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import type { NextRequest } from 'next/server';

import { actionWrites, buildMcpArgv, loadMcpList } from '../../../lib/data/mcp.mjs';

/** `mcp.list.v1` 里本路由用到的两列（其余字段只透传给页面）。 */
interface McpListPayload {
  landings?: Array<{ clientId?: string; scope?: string; writable?: boolean }>;
  drift?: unknown;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);

function repoRoot(): string {
  return process.env.AIOS_PROJECT_ROOT ?? path.resolve(process.cwd(), '..', '..', '..');
}

// 单行是有意的：另外四条路由各自抄了同一个 6 行 helper，`duplicateLines` 会把它记成新副本。
// 把响应构造压成一行，既没有第五份拷贝，读起来也不比多行版本差。
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export async function GET(): Promise<Response> {
  const result = await loadMcpList({ rootDir: repoRoot() });
  if (!result.ok) return json(502, { error: 'mcp-list-failed', detail: result.error });
  const data = result.data as McpListPayload | undefined;
  return json(200, { ok: true, rows: result.rows, summary: result.summary, drift: data?.drift ?? [] });
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: 'invalid-body', detail: 'expected a JSON object' });
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const root = repoRoot();

  // 先取一次事实：client / scope 的合法性来自落点表，不来自本文件的常量。
  const listed = await loadMcpList({ rootDir: root });
  if (!listed.ok) return json(502, { error: 'mcp-list-failed', detail: listed.error });
  const payload = listed.data as McpListPayload | undefined;
  const landings = Array.isArray(payload?.landings) ? payload.landings : [];

  const built = buildMcpArgv(action, body, { landings });
  if ('error' in built) return json(400, { error: 'invalid-action-arguments', action, detail: built.error });

  if (actionWrites(action) && body.confirm !== true) {
    return json(409, {
      error: 'confirmation-required',
      action,
      detail: 'this action writes a client config file; send {"confirm": true}',
    });
  }

  // 命令执行：与 `/api/actions/<id>` 同一形态，但 argv 来自 buildMcpArgv（闭合集合 + 校验字段）。
  const argv = built.argv as string[];
  const script = path.join(root, 'scripts', 'aios.mjs');
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [script, ...argv], {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, AIOS_PROJECT_ROOT: root },
    });
    return json(200, { ok: true, action, argv, exitCode: 0, result: parseOrText(stdout), stderr: String(stderr ?? '').trim() });
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string; message?: string };
    // 非零退出不是路由失败：拒绝（conflict / external / not-found）是产品在正常工作，
    // payload 里的状态才是结论。这里把两者都原样交出去。
    return json(200, {
      ok: false,
      action,
      argv,
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
      result: parseOrText(failure.stdout ?? ''),
      stderr: String(failure.stderr ?? failure.message ?? '').trim(),
    });
  }
}

function parseOrText(stdout: string): unknown {
  const text = String(stdout ?? '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 4000);
  }
}