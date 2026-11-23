'use client';

import { useLocale, useT } from './provider';

const LABELS: Record<string, string> = Object.freeze({
  'zh-CN': '简体中文',
  en: 'English',
  ja: '日本語',
});

export function LocaleSwitcher() {
  const { locale, setLocale, locales } = useLocale();
  const t = useT();
  return (
    <label className="inline-flex items-center gap-1.5 text-rex-text-muted">
      <span className="sr-only">{t('shell.language')}</span>
      <select
        aria-label={t('shell.language')}
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
        className="rounded-md border border-rex-border bg-rex-panel px-2 py-1 text-[11px] text-rex-text focus-visible:outline-2 focus-visible:outline-rex-cyan"
      >
        {locales.map((item) => (
          <option key={item} value={item}>{LABELS[item] ?? item}</option>
        ))}
      </select>
    </label>
  );
}
