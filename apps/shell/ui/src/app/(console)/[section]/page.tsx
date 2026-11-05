// `/memory`, `/usage`, `/matrix`, ... — one route, eight pages.
//
// The navigation is a registry (`lib/sections.ts`); this file maps its ids to components.
// Keeping the route dynamic means a new page is one registry entry plus one component, not
// a new directory — and the sidebar and the router cannot disagree about what exists.
import { notFound } from 'next/navigation';

import { sectionById, SECTIONS } from '../../../lib/sections';
import { OverviewSection } from '../../../components/sections/overview';
import { ToolsSection } from '../../../components/sections/tools';
import { MemorySection, UsageSection } from '../../../components/sections/data-pages';
import { SessionsSection } from '../../../components/sections/sessions';
import { SettingsSection } from '../../../components/sections/observability';

export const dynamic = 'force-dynamic';

const PAGES = {
  overview: OverviewSection,
  sessions: SessionsSection,
  memory: MemorySection,
  usage: UsageSection,
  tools: ToolsSection,
  settings: SettingsSection,
} as const;

export function generateStaticParams() {
  return SECTIONS.filter((section) => section.id !== 'overview').map((section) => ({
    section: section.id,
  }));
}

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  const meta = sectionById(section);
  const Page = meta ? PAGES[meta.id] : undefined;
  if (!Page || !meta) notFound();
  // 会话页用 ?session=<id> 选择条目，所以搜索参数要传下去；其余页面忽略它。
  if (meta.id === 'sessions') {
    const query = await searchParams;
    const session = typeof query.session === 'string' ? query.session : undefined;
    return <SessionsSection searchParams={{ session }} />;
  }
  return <Page />;
}
