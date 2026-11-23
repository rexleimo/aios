import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_LOCALE, resolveLocale } from '../src/i18n/locales.mjs';

test('explicit choice wins over cookie and header', () => {
  assert.equal(resolveLocale({ choice: 'ja', cookie: 'en', acceptLanguage: 'en-US' }), 'ja');
});

test('cookie wins over Accept-Language', () => {
  assert.equal(resolveLocale({ cookie: 'zh-CN', acceptLanguage: 'ja-JP,ja;q=0.9' }), 'zh-CN');
});

test('Accept-Language regional variants map to supported locales', () => {
  assert.equal(resolveLocale({ acceptLanguage: 'en-US,en;q=0.9' }), 'en');
  assert.equal(resolveLocale({ acceptLanguage: 'ja-JP' }), 'ja');
  assert.equal(resolveLocale({ acceptLanguage: 'zh-TW' }), 'zh-CN');
});

test('unknown or absent input falls back to the default locale', () => {
  assert.equal(resolveLocale(), DEFAULT_LOCALE);
  assert.equal(resolveLocale({ choice: 'fr', cookie: 'ko', acceptLanguage: 'de-DE' }), DEFAULT_LOCALE);
});
