'use client';

import { I18nProvider, useLingui } from '@lingui/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { interpolate } from './interpolate.mjs';
import { LOCALES, LOCALE_COOKIE, resolveLocale } from './locales.mjs';
import { createI18n } from './runtime';
import { setCurrentLocale } from './t.mjs';

type LocaleContextValue = {
  locale: string;
  setLocale: (next: string) => void;
  locales: readonly string[];
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function I18nAppProvider({ initialLocale, children }: { initialLocale: string; children: ReactNode }) {
  const [locale, setLocaleState] = useState(() => resolveLocale({ choice: initialLocale }));
  setCurrentLocale(locale);
  const i18n = useMemo(() => createI18n(locale), [locale]);

  const setLocale = useCallback((next: string) => {
    const resolved = resolveLocale({ choice: next });
    if (!resolved) return;
    // Cookie is the single source of truth. Some labels are module-level
    // constants evaluated at import, so reloading after writing the cookie is
    // what makes every surface — including those constants — switch language.
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(resolved)}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nProvider i18n={i18n}>
      <LocaleContext.Provider value={{ locale, setLocale, locales: LOCALES }}>
        {children}
      </LocaleContext.Provider>
    </I18nProvider>
  );
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale requires I18nAppProvider');
  return value;
}

export function useT(): (key: string, values?: Record<string, unknown>) => string {
  const { i18n } = useLingui();
  return useCallback((key: string, values?: Record<string, unknown>) => interpolate(i18n._(key, values), values), [i18n]);
}
