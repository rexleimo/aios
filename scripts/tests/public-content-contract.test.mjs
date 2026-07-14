import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rootDir = path.resolve(new URL('../..', import.meta.url).pathname);

const read = (relPath) => fs.readFileSync(path.join(rootDir, relPath), 'utf8');
const exists = (relPath) => fs.existsSync(path.join(rootDir, relPath));

const p0Docs = [
  'index.md',
  'getting-started.md',
  'windows-guide.md',
  'contextdb.md',
  'architecture.md',
  'workflow-policy.md',
  'token-compression.md',
  'team-ops.md',
  'hud-guide.md',
  'solo-harness.md',
  'use-cases.md',
  'troubleshooting.md',
  'case-library.md',
];

const locales = ['', 'zh', 'ja', 'ko'];
const promotedBlogPosts = ['2026-07-v400-adaptive-workflow-policy.md'];

function frontMatterHas(markdown, key) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  return Boolean(match && new RegExp(`^${key}:\\s*.+$`, 'm').test(match[1]));
}

test('every P0 documentation page has title and description metadata in every locale', () => {
  for (const locale of locales) {
    for (const fileName of p0Docs) {
      const relPath = path.posix.join('docs-site', locale, fileName);
      assert.equal(exists(relPath), true, `missing P0 page: ${relPath}`);
      const markdown = read(relPath);
      assert.equal(frontMatterHas(markdown, 'title'), true, `missing title: ${relPath}`);
      assert.equal(frontMatterHas(markdown, 'description'), true, `missing description: ${relPath}`);
    }
  }
});

test('Workflow Policy is available in every documentation locale', () => {
  for (const locale of locales) {
    const relPath = path.posix.join('docs-site', locale, 'workflow-policy.md');
    assert.equal(exists(relPath), true, `missing Workflow Policy page: ${relPath}`);
  }
});

test('promoted blog posts exist before localized indexes link to them', () => {
  for (const fileName of promotedBlogPosts) {
    for (const locale of locales) {
      const relPath = path.posix.join('blog-site', locale, fileName);
      assert.equal(exists(relPath), true, `missing promoted blog post: ${relPath}`);
    }
  }
});

test('the home page does not make an unsupported speed claim', () => {
  assert.doesNotMatch(read('docs-site/index.md'), /10x faster|10× faster/i);
});

test('public onboarding uses the current init, doctor, and token-intelligence boundaries', () => {
  for (const relPath of ['README.md', 'README-zh.md']) {
    const markdown = read(relPath);
    assert.doesNotMatch(markdown, /Native Token Compression|原生 Token 压缩|self-contained input\/output token reduction|自研输入\/输出 token 压缩/i);
    assert.match(markdown, /RTK/);
    assert.match(markdown, /Caveman/);
    assert.match(markdown, /Headroom/);
    assert.match(markdown, /ContextDB/);
  }

  for (const locale of locales) {
    const prefix = path.posix.join('docs-site', locale);
    const home = read(path.posix.join(prefix, 'index.md'));
    const quickStart = read(path.posix.join(prefix, 'getting-started.md'));
    const windows = read(path.posix.join(prefix, 'windows-guide.md'));
    assert.match(home, /getting-started/);
    assert.match(home, /use-cases/);
    assert.match(home, /workflow-policy/);
    assert.match(quickStart, /aios init/);
    assert.match(quickStart, /aios doctor/);
    assert.match(windows, /aios doctor/);
  }
});

test('docs shells read the current VERSION through the shared MkDocs hook', () => {
  const version = read('VERSION').trim();
  assert.match(version, /^\d+\.\d+\.\d+$/);

  for (const relPath of [
    'docs-site/overrides/partials/rex/docs-sidebar.html',
    'docs-site/overrides/partials/rex/docs-page.html',
  ]) {
    const template = read(relPath);
    assert.match(template, /config\.extra\.aios_version/);
    assert.doesNotMatch(template, /aios v3\.3\.2/);
  }

  assert.match(read('mkdocs.yml'), /hooks:\s*\n\s+- scripts\/mkdocs_version\.py/);
  assert.match(read('mkdocs.blog.yml'), /scripts\/mkdocs_version\.py/);
});

test('localized docs changelogs expose the current 4.0 release records', () => {
  const rootChangelog = read('CHANGELOG.md');
  assert.ok(rootChangelog.indexOf('## [4.0.1]') < rootChangelog.indexOf('## [3.6.0]'));

  for (const locale of locales) {
    const relPath = path.posix.join('docs-site', locale, 'changelog.md');
    const changelog = read(relPath);
    assert.match(changelog, /v4\.0\.1/);
    assert.match(changelog, /v4\.0\.0/);
  }
});
