import type { Metadata } from 'next';

import { I18nAppProvider } from '../i18n/provider';
import { getServerLocale, getServerTranslate } from '../i18n/server';
import { setCurrentLocale } from '../i18n/t.mjs';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerTranslate();
  return {
    title: t('meta.title'),
    description: t('meta.description'),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getServerLocale();
  setCurrentLocale(locale);
  return (
    <html lang={locale} data-rex-theme="light">
      <body>
        <I18nAppProvider initialLocale={locale}>{children}</I18nAppProvider>
      </body>
    </html>
  );
}
