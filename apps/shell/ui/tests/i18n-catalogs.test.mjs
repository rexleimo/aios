import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.resolve(here, '../src/i18n/catalogs');
const locales = ['zh-CN', 'en', 'ja'];

function readCatalog(locale) {
  return JSON.parse(fs.readFileSync(path.join(catalogDir, `${locale}.json`), 'utf8'));
}

test('every supported locale has a non-empty catalog with identical keys', () => {
  const catalogs = Object.fromEntries(locales.map((locale) => [locale, readCatalog(locale)]));
  const sourceKeys = Object.keys(catalogs['zh-CN']).sort();
  assert.ok(sourceKeys.length > 0, 'zh-CN source catalog must contain messages');
  for (const locale of locales.slice(1)) {
    assert.deepEqual(Object.keys(catalogs[locale]).sort(), sourceKeys, `${locale} key set must match zh-CN`);
    for (const [key, value] of Object.entries(catalogs[locale])) {
      assert.equal(typeof value, 'string', `${locale}.${key} must be a string`);
      assert.ok(value.trim().length > 0, `${locale}.${key} must not be empty`);
    }
  }
});
