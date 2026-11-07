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
  const view = viewForPath(pathname);
  if (!view) notFound();
  const { facts, selection } = await collectForRequest({ ws });
  return <ConsoleWorkspace initialView={view} facts={facts} selection={selection} />;
}
