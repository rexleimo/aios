import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  extractHeadingIds,
  extractLocaleNavTranslationKeys,
  extractMarkdownLinkTargets,
  extractMdNavTargets,
  extractNavLabels,
  findBlogLocaleParityErrors,
  findCurrentReleaseBlogErrors,
  isExternalOrRootLink,
  isLocaleDriftLink,
  localSiteTargetExists,
  resolveRelativeDocTarget,
  splitMarkdownDestination,
} from '../check-site-sync.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('blog locale parity reports every missing translation', () => {
  const files = [
    'post-a.md',
    'post-b.md',
    'zh/post-a.md',
    'zh/post-b.md',
    'ja/post-a.md',
    'ja/post-b.md',
    'ko/post-a.md',
    'ja/post-c.md',
  ];

  assert.deepEqual(findBlogLocaleParityErrors(files), [
    'missing blog translation (ko): blog-site/ko/post-b.md',
    'missing blog canonical: blog-site/post-c.md (found ja/post-c.md)',
  ]);
});

test('current release blog coverage requires a tagged post in every locale', () => {
  const posts = new Map([
    ['release.md', '---\ntitle: v5.6.0 release\ntags: ["v5.6.0"]\n---\n'],
    ['zh/release.md', '---\ntitle: v5.6.0 release\ntags: ["v5.6.0"]\n---\n'],
    ['ja/release.md', '---\ntitle: v5.6.0 release\ntags: ["v5.6.0"]\n---\n'],
    ['ko/older.md', '---\ntitle: v5.5.0 release\ntags: ["v5.5.0"]\n---\n'],
  ]);

  assert.deepEqual(findCurrentReleaseBlogErrors('5.6.0', posts), [
    'missing current release blog post (ko): v5.6.0',
  ]);
});

test('extractMdNavTargets returns only markdown file nav targets', () => {
  const mkdocs = `site_name: demo
nav:
  - Home: index.md
  - Blog: https://example.com/blog/
  - Guides:
      - Getting Started: getting-started.md
      - Troubleshooting: troubleshooting.md
extra:
  links:
    docs: https://example.com
`;

  assert.deepEqual(extractMdNavTargets(mkdocs), [
    'index.md',
    'getting-started.md',
    'troubleshooting.md',
  ]);
});

test('extractMarkdownLinkTargets ignores fenced code blocks and returns markdown/image links', () => {
  const markdown = `# Demo

[Doc](getting-started.md)
![Logo](assets/logo.svg)
[External](https://example.com)
[Angle](<path/with spaces.md>)

\`\`\`md
[Ignored](missing.md)
\`\`\`
`;

  assert.deepEqual(extractMarkdownLinkTargets(markdown), [
    'getting-started.md',
    'assets/logo.svg',
    'https://example.com',
    'path/with spaces.md',
  ]);
});

test('link helpers normalize relative paths and classify root/external links', () => {
  assert.equal(splitMarkdownDestination('team-ops.md#faq?ignored'), 'team-ops.md');
  assert.equal(splitMarkdownDestination('guide.md?x=1#toc'), 'guide.md');

  assert.equal(isExternalOrRootLink('https://example.com/doc'), true);
  assert.equal(isExternalOrRootLink('/blog/post/'), true);
  assert.equal(isExternalOrRootLink('#local-heading'), true);
  assert.equal(isExternalOrRootLink('team-ops.md'), false);

  assert.equal(resolveRelativeDocTarget('zh/index.md', '../assets/logo.svg'), 'assets/logo.svg');
  assert.equal(resolveRelativeDocTarget('zh/guides/intro.md', '../../team-ops.md'), 'team-ops.md');
});

test('site targets resolve extensionless pages and trailing-slash routes', async () => {
  const files = new Set(['getting-started.md', 'use-cases.md', 'contextdb.md']);

  for (const target of ['getting-started', 'getting-started/', 'use-cases', 'contextdb/']) {
    assert.equal(await localSiteTargetExists(files, 'docs-site', target), true, target);
  }

  for (const target of ['/getting-started/', '/use-cases/', '/contextdb/']) {
    assert.equal(isExternalOrRootLink(target), true, target);
  }
});

test('locale drift helper catches localized pages linking to English roots', () => {
  assert.equal(isLocaleDriftLink('docs-site/zh/index.md', '/blog/rl-training-system/'), true);
  assert.equal(isLocaleDriftLink('docs-site/zh/index.md', '/blog/zh/rl-training-system/'), false);
  assert.equal(isLocaleDriftLink('blog-site/ja/post.md', '/architecture/'), true);
  assert.equal(isLocaleDriftLink('blog-site/ja/post.md', '/ja/architecture/'), false);
  assert.equal(isLocaleDriftLink('blog-site/ko/post.md', 'https://cli.rexai.top/windows-guide/'), true);
  assert.equal(isLocaleDriftLink('blog-site/ko/post.md', 'https://cli.rexai.top/ko/windows-guide/'), false);
});

test('extractHeadingIds supports explicit localized anchors', () => {
  const ids = extractHeadingIds(`# Title\n\n## 快速开始 {#quick-start}\n\n## Plain Heading!`);
  assert.equal(ids.has('quick-start'), true);
  assert.equal(ids.has('plain-heading'), true);
});

test('nav translation helpers expose missing locale labels', () => {
  const mkdocs = `nav:
  - Home: index.md
  - Core Features:
      - ContextDB: contextdb.md
      - HUD Guide: hud-guide.md
plugins:
  - i18n:
      languages:
        - locale: zh
          nav_translations:
            Home: 首页
            Core Features: 功能核心
            ContextDB: ContextDB
`;

  assert.deepEqual([...extractNavLabels(mkdocs)], ['Home', 'Core Features', 'ContextDB', 'HUD Guide']);
  assert.deepEqual([...extractLocaleNavTranslationKeys(mkdocs, 'zh')], ['Home', 'Core Features', 'ContextDB']);
});

test('the docs nav exposes Workflow Policy in every locale', () => {
  const mkdocs = fs.readFileSync(path.join(rootDir, 'mkdocs.yml'), 'utf8');

  assert.equal(extractNavLabels(mkdocs).has('Workflow Policy'), true);
  for (const locale of ['zh', 'ja', 'ko']) {
    assert.equal(extractLocaleNavTranslationKeys(mkdocs, locale).has('Workflow Policy'), true, locale);
  }
});
