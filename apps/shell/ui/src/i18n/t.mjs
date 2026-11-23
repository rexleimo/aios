// Shared translation seam for every Console module, including non-React data
// helpers. The current locale is set by the client provider and by the server
// layout before children render, so t() always reflects the active language.
import en from './catalogs/en.json';
import ja from './catalogs/ja.json';
import zhCN from './catalogs/zh-CN.json';
import { interpolate } from './interpolate.mjs';
import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale } from './locales.mjs';

export const MESSAGES = Object.freeze({
  'zh-CN': zhCN,
  en,
  ja,
});

function initialLocale() {
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
    if (match) return resolveLocale({ choice: decodeURIComponent(match[1]) });
    const htmlLang = document.documentElement?.lang;
    if (htmlLang) return resolveLocale({ choice: htmlLang });
  }
  return DEFAULT_LOCALE;
}

let currentLocale = initialLocale();

export function setCurrentLocale(locale) {
  currentLocale = resolveLocale({ choice: locale }) || DEFAULT_LOCALE;
}

export function getLocale() {
  return currentLocale;
}

export function translate(locale, key, values) {
  const catalog = MESSAGES[resolveLocale({ choice: locale }) || DEFAULT_LOCALE] || zhCN;
  return interpolate(catalog[key] ?? key, values);
}

export function t(key, values) {
  return translate(currentLocale, key, values);
}
