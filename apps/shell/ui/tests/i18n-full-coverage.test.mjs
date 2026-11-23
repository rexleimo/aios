import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Public data seam: the catalogs consumed by src/i18n/runtime.ts translate().
// These three keys represent domains left untranslated by the accepted
// shell/navigation/home slice (see 2026-11-23-console-i18n-review.md §25).
const here = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.resolve(here, '../src/i18n/catalogs');
const catalogs = Object.fromEntries(
  ['zh-CN', 'en', 'ja'].map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(catalogDir, `${locale}.json`), 'utf8')),
  ]),
);

const CASES = [
  ['gateway.workspace.title', {
    'zh-CN': '模型网关',
    en: 'Model Gateway',
    ja: 'モデルゲートウェイ',
  }],
  ['routing.config.title', {
    'zh-CN': '模型分配',
    en: 'Model Assignment',
    ja: 'モデル割り当て',
  }],
  ['resources.skills.title', {
    'zh-CN': '技能',
    en: 'Skills',
    ja: 'スキル',
  }],
];

test('secondary panels resolve translated copy for every supported locale', () => {
  for (const [key, expected] of CASES) {
    for (const [locale, text] of Object.entries(expected)) {
      assert.equal(catalogs[locale][key], text, `${locale}:${key}`);
    }
  }
});
