import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const publicMemoDocs = [
  'README.md',
  'README-zh.md',
  'docs-site/contextdb.md',
  'docs-site/zh/contextdb.md',
  'docs-site/ja/contextdb.md',
  'docs-site/ko/contextdb.md',
  'docs-site/getting-started.md',
  'docs-site/zh/getting-started.md',
  'docs-site/ja/getting-started.md',
  'docs-site/ko/getting-started.md',
  'docs-site/use-cases.md',
  'docs-site/zh/use-cases.md',
  'docs-site/ja/use-cases.md',
  'docs-site/ko/use-cases.md',
  'docs-site/changelog.md',
  'docs-site/zh/changelog.md',
  'docs-site/ja/changelog.md',
  'docs-site/ko/changelog.md',
];

const localizedMemoCommandDocs = [
  'docs-site/contextdb.md',
  'docs-site/zh/contextdb.md',
  'docs-site/ja/contextdb.md',
  'docs-site/ko/contextdb.md',
  'docs-site/changelog.md',
  'docs-site/zh/changelog.md',
  'docs-site/ja/changelog.md',
  'docs-site/ko/changelog.md',
];

const requiredStorageCommands = [
  'aios memo storage status',
  'aios memo storage use split',
  'aios memo storage use file',
  'aios memo storage rebuild',
  'aios memo storage doctor',
];

function readRepoFile(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('public memo docs avoid stale storage concepts and hidden compatibility commands', () => {
  const forbidden = [
    /\baios memory\b/i,
    /\baios memo share\b/i,
    /\bmemo share\b/i,
    /\baios memo driver\b/i,
    /\bmemo driver\b/i,
    /\bfile-stream\b/i,
    /\bspace list\b/i,
    /\bmemo list\b/i,
    /\baios memo storage refresh\b/i,
    /\bmemo storage refresh\b/i,
  ];

  for (const relativePath of publicMemoDocs) {
    const text = readRepoFile(relativePath);
    for (const pattern of forbidden) {
      assert.doesNotMatch(text, pattern, `${relativePath} leaked ${pattern}`);
    }
  }
});

test('localized context and changelog docs list the exact public memo storage commands', () => {
  for (const relativePath of localizedMemoCommandDocs) {
    const text = readRepoFile(relativePath);
    for (const command of requiredStorageCommands) {
      assert.match(text, new RegExp(command.replaceAll(' ', '\\s+'), 'u'), `${relativePath} missing ${command}`);
    }
  }
});

test('public memo docs keep file and split as the only documented storage implementations', () => {
  for (const relativePath of localizedMemoCommandDocs) {
    const text = readRepoFile(relativePath);
    assert.match(text, /\bfile\b/u, `${relativePath} missing file storage`);
    assert.match(text, /\bsplit\b/u, `${relativePath} missing split storage`);
    assert.match(text, /\.aios\/memo/u, `${relativePath} missing canonical .aios/memo root`);
  }
});
