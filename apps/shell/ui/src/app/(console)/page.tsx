// `/` — 本机 AI 工具管理的首屏。
//
// 这里是**服务端组件**：事实由 `lib/data/console-facts.mjs` 在服务端取好，再以 props 交给
// 客户端界面。客户端不 import 取数代码（README 约定 3），也不自带任何示例状态。
//
// 实测整包取数 273ms，且**不调用** `aios status`——那个 2.7s 的证据审计与首屏无关
// （docs/plans/2026-11-07-stage0-real-data-measurement.md）。
import { ConsoleWorkspace } from '../../components/console/console-workspace';
import { collectForRequest } from '../../lib/console-facts-request.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ConsoleHomePage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  const { ws } = await searchParams;
  const { facts, selection } = await collectForRequest({ ws });
  return <ConsoleWorkspace initialView="home" facts={facts} selection={selection} />;
}
