import { notFound, redirect } from 'next/navigation';
import { ConsoleWorkspace } from '../../../components/console/console-workspace';
import { legacyDestination, viewForPath } from '../../../lib/console-navigation';
import { collectForRequest } from '../../../lib/console-facts-request.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ ws?: string }>;
}) {
  const [{ section }, { ws }] = await Promise.all([params, searchParams]);
  const pathname = `/${section}`;
  const destination = legacyDestination(pathname);
  if (destination) redirect(destination);
  const { facts, selection } = await collectForRequest({ ws });
  const builtinView = viewForPath(pathname);
  // 内置视图用 ViewId；插件贡献的 panel 用 `plugin:<id>`，由 facts.pluginViews 的 href 匹配。
  // 旧缓存/降级路径可能没有该字段，防御为空数组（fail-open，不让首屏 500）。
  const pluginViews = facts.pluginViews ?? [];
  const pluginView = pluginViews.find((item: { href: string; id: string }) => item.href === pathname);
  const initialView = builtinView ?? (pluginView ? pluginView.id : null);
  if (!initialView) notFound();
  return <ConsoleWorkspace initialView={initialView} facts={facts} selection={selection} />;
}
