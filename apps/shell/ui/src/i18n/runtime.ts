import { setupI18n, type I18n } from '@lingui/core';

import en from './catalogs/en.json';
import ja from './catalogs/ja.json';
import zhCN from './catalogs/zh-CN.json';
import { interpolate } from './interpolate.mjs';
import { resolveLocale } from './locales.mjs';

export const MESSAGES: Record<string, Record<string, string>> = {
  'zh-CN': zhCN,
  en,
  ja,
};

/** Create an isolated Lingui instance; no global activation, safe on server and client. */
export function createI18n(locale: string): I18n {
  return setupI18n({ locale: resolveLocale({ choice: locale }), messages: MESSAGES });
}

export function translate(locale: string, key: string, values?: Record<string, unknown>): string {
  return interpolate(createI18n(locale)._(key, values), values);
}
