// 实时路由图数据端点：读网关决策日志（JSONL），返回计数器 + client→model 边 + 最近决策。
// 只读；日志由网关进程写入（session/decision-log.mjs）。空日志 = 合法空状态（exists:false），不是错误。
import type { NextRequest } from 'next/server';

import {
  decisionLogPath,
  defaultStateDir,
  parseLimit,
  readDecisions,
  summarizeDecisions,
} from '../../../../lib/config/routing-decisions.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export async function GET(request: NextRequest): Promise<Response> {
  const limit = parseLimit(new URL(request.url).searchParams.get('limit'));
  const filePath = decisionLogPath(defaultStateDir());
  let exists: boolean;
  let entries: Record<string, unknown>[];
  try {
    ({ exists, entries } = readDecisions(filePath));
  } catch (error) {
    return json(423, { error: 'decisions-unreadable', detail: error instanceof Error ? error.message : String(error) });
  }
  const summary = summarizeDecisions(entries);
  return json(200, {
    exists,
    path: filePath,
    counters: { requests: summary.requests, errors: summary.errors, autoRouted: summary.autoRouted },
    byModel: summary.byModel,
    byClient: summary.byClient,
    edges: summary.edges,
    recent: entries.slice(-limit).reverse(),
  });
}