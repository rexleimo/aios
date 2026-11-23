import { headers } from 'next/headers';

import { LOCALE_COOKIE, resolveLocale } from './locales.mjs';
import { translate } from './runtime';

function cookieValue(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function getServerLocale(): Promise<string> {
  const incoming = await headers();
  return resolveLocale({
    cookie: cookieValue(incoming.get('cookie') ?? '', LOCALE_COOKIE),
    acceptLanguage: incoming.get('accept-language'),
  });
}

export async function getServerTranslate() {
  const locale = await getServerLocale();
  return (key: string, values?: Record<string, unknown>) => translate(locale, key, values);
}
