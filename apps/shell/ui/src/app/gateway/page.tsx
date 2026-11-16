import { redirect } from 'next/navigation';

export default async function GatewayPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  const { ws } = await searchParams;
  redirect(`/routing${ws ? `?ws=${encodeURIComponent(ws)}` : ''}`);
}
