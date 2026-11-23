// Locale facts for the Console. Kept framework-free so proxy, server metadata
// and the browser provider all resolve a locale through the same contract.
export const LOCALES = Object.freeze(['zh-CN', 'en', 'ja']);
export const DEFAULT_LOCALE = 'zh-CN';
export const LOCALE_COOKIE = 'aios-locale';
export const LOCALE_HEADER = 'x-aios-locale';

const ALIASES = Object.freeze({
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-tw': 'zh-CN',
  'zh-hk': 'zh-CN',
  en: 'en',
  ja: 'ja',
});

function normalize(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (!key) return null;
  if (ALIASES[key]) return ALIASES[key];
  const base = key.split('-')[0];
  return ALIASES[base] ?? null;
}

/** Resolve one locale from an explicit choice, a cookie, or Accept-Language. */
export function resolveLocale({ choice, cookie, acceptLanguage } = {}) {
  const chosen = normalize(choice);
  if (chosen) return chosen;
  const fromCookie = normalize(cookie);
  if (fromCookie) return fromCookie;
  const header = String(acceptLanguage ?? '');
  // Accept-Language is ordered by preference; q-values are ignored, which is
  // enough for a three-locale desktop console.
  for (const part of header.split(',')) {
    const candidate = normalize(part.split(';')[0]);
    if (candidate) return candidate;
  }
  return DEFAULT_LOCALE;
}

export function isLocale(value) {
  return LOCALES.includes(value);
}
