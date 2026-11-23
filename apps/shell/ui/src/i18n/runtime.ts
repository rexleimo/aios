import { setupI18n, type I18n } from '@lingui/core';

import { resolveLocale } from './locales.mjs';
import { MESSAGES } from './t.mjs';

export { MESSAGES, translate, t, setCurrentLocale, getLocale } from './t.mjs';

/** Create an isolated Lingui instance; no global activation, safe on server and client. */
export function createI18n(locale: string): I18n {
  return setupI18n({ locale: resolveLocale({ choice: locale }), messages: MESSAGES });
}

/** Lingui-backed variant kept for consumers that need an I18n instance. */
export function translateWithLingui(locale: string, key: string, values?: Record<string, unknown>): string {
  return createI18n(locale)._(key, values);
}
