import { notFound, redirect } from 'next/navigation';
import { ConsoleWorkspace } from '../../../components/console/console-workspace';
import { legacyDestination, viewForPath } from '../../../lib/console-navigation';

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const pathname = `/${section}`;
  const destination = legacyDestination(pathname);
  if (destination) redirect(destination);
  const view = viewForPath(pathname);
  if (!view) notFound();
  return <ConsoleWorkspace initialView={view} />;
}
