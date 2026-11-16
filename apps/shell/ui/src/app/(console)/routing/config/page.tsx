// `/routing/config` — 模型路由的独立配置子页（监控在 /routing）。
// 服务端组件：事实服务端取好再交给客户端界面；与 [section] 同一取数/动态约定。
import { ConsoleWorkspace } from '../../../../components/console/console-workspace';
import { collectForRequest } from '../../../../lib/console-facts-request.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function RoutingConfigPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  const { ws } = await searchParams;
  const { facts, selection } = await collectForRequest({ ws });
  return <ConsoleWorkspace initialView="routingConfig" facts={facts} selection={selection} />;
}