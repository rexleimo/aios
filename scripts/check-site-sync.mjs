import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');

function formatPath(relPath) {
  return relPath.split(path.sep).join('/');
}

async function readUtf8(relPath) {
  const absPath = path.join(rootDir, relPath);
  return fs.readFile(absPath, 'utf8');
}

async function fileExists(relPath) {
  const absPath = path.join(rootDir, relPath);
  try {
    const stat = await fs.stat(absPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function listMarkdownFilesUnder(relDir) {
  const absRoot = path.join(rootDir, relDir);
  const out = [];

  async function walk(absDir) {
    const entries = await fs.readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const absEntry = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absEntry);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(path.relative(absRoot, absEntry).split(path.sep).join('/'));
      }
    }
  }

  await walk(absRoot);
  return out;
}


function splitMarkdownDestination(destination) {
  if (!destination) return '';
  return destination.split('#')[0].split('?')[0];
}

function isExternalOrRootLink(target) {
  if (!target) return true;
  if (target.startsWith('#')) return true;
  if (target.startsWith('/')) return true;
  if (target.startsWith('//')) return true;
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(target);
}

function parseLocaleScopedPath(relPath) {
  const match = relPath.match(/^(docs-site|blog-site)\/(zh|ja|ko)\//);
  if (!match) return null;
  return { site: match[1], locale: match[2] };
}

function isLocaleDriftLink(sourceRelPath, target) {
  const scoped = parseLocaleScopedPath(sourceRelPath);
  if (!scoped || !target) return false;

  const { locale } = scoped;
  if (target.startsWith(`/blog/${locale}/`) || target.startsWith(`/${locale}/`)) {
    return false;
  }
  if (target.startsWith('/blog/')) return true;
  if (target.startsWith('/') && !target.startsWith('//')) {
    if (sourceRelPath.startsWith('docs-site/') && target.startsWith('/assets/')) return false;
    if (sourceRelPath.startsWith('blog-site/') && target.startsWith('/assets/')) return false;
    return true;
  }

  const siteUrl = 'https://cli.rexai.top/';
  if (target.startsWith(`${siteUrl}blog/`)) {
    return !target.startsWith(`${siteUrl}blog/${locale}/`);
  }
  if (target.startsWith(siteUrl)) {
    return !target.startsWith(`${siteUrl}${locale}/`);
  }

  return false;
}

function extractMdNavTargets(mkdocsText) {
  const lines = mkdocsText.split(/\r?\n/);
  const targets = [];
  let inNav = false;

  for (const line of lines) {
    if (!inNav) {
      if (/^nav:\s*$/.test(line)) {
        inNav = true;
      }
      continue;
    }

    if (/^[^\s#][^:]*:\s*/.test(line)) {
      break;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const keyed = trimmed.match(/^-\s+[^:]+:\s+(.+)$/);
    const bare = trimmed.match(/^-\s+(.+)$/);
    const rawValue = keyed?.[1] ?? bare?.[1] ?? '';
    const value = rawValue.trim().replace(/^['"]|['"]$/g, '');
    if (value.endsWith('.md')) {
      targets.push(value);
    }
  }

  return targets;
}

function stripFencedCodeBlocks(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '');
}

function extractMarkdownLinkTargets(markdown) {
  const sanitized = stripFencedCodeBlocks(markdown);
  const re = /!?\[[^\]]*\]\(([^)\n]+)\)/g;
  const out = [];

  for (const match of sanitized.matchAll(re)) {
    let raw = (match[1] ?? '').trim();
    if (!raw) continue;

    const isAngleWrapped = raw.startsWith('<') && raw.endsWith('>');
    if (isAngleWrapped) {
      raw = raw.slice(1, -1).trim();
    }

    const firstWhitespace = raw.search(/\s/);
    const target = (isAngleWrapped || firstWhitespace === -1 ? raw : raw.slice(0, firstWhitespace)).trim();
    if (target) {
      out.push(target);
    }
  }

  return out;
}

function extractHtmlHrefTargets(markdown) {
  const sanitized = stripFencedCodeBlocks(markdown);
  const re = /<a\s+[^>]*href=["']([^"']+)["']/gi;
  return [...sanitized.matchAll(re)].map((match) => match[1].trim()).filter(Boolean);
}

function extractLinkTargets(markdown) {
  return [...extractMarkdownLinkTargets(markdown), ...extractHtmlHrefTargets(markdown)];
}

function slugifyHeading(headingText) {
  return headingText
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '');
}

function extractExplicitHeadingId(rawHeading) {
  const match = rawHeading.match(/\s+\{#([A-Za-z0-9_-]+)\}\s*$/);
  return match?.[1] ?? null;
}

function extractHeadingIds(markdown) {
  const sanitized = stripFencedCodeBlocks(markdown);
  const ids = new Set();

  for (const match of sanitized.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const rawHeading = match[1].trim();
    const explicit = extractExplicitHeadingId(rawHeading);
    if (explicit) {
      ids.add(explicit);
      continue;
    }

    const withoutAttrs = rawHeading.replace(/\s+\{#[A-Za-z0-9_-]+\}\s*$/, '');
    const slug = slugifyHeading(withoutAttrs);
    if (slug) ids.add(slug);
  }

  return ids;
}

function extractNavLabels(mkdocsText) {
  const lines = mkdocsText.split(/\r?\n/);
  const labels = new Set();
  let inNav = false;

  for (const line of lines) {
    if (!inNav) {
      if (/^nav:\s*$/.test(line)) inNav = true;
      continue;
    }
    if (/^[^\s#][^:]*:\s*/.test(line)) break;

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const keyed = trimmed.match(/^-\s+([^:]+):(?:\s+.*)?$/);
    if (keyed) labels.add(keyed[1].trim().replace(/^['"]|['"]$/g, ''));
  }

  return labels;
}

function extractLocaleNavTranslationKeys(mkdocsText, locale) {
  const lines = mkdocsText.split(/\r?\n/);
  const keys = new Set();
  let inLocale = false;
  let inTranslations = false;
  let translationIndent = null;

  for (const line of lines) {
    const localeMatch = line.match(/^\s*-\s+locale:\s+(\w+)/);
    if (localeMatch) {
      inLocale = localeMatch[1] === locale;
      inTranslations = false;
      translationIndent = null;
      continue;
    }

    if (!inLocale) continue;

    const navTranslationMatch = line.match(/^(\s*)nav_translations:\s*$/);
    if (navTranslationMatch) {
      inTranslations = true;
      translationIndent = navTranslationMatch[1].length + 2;
      continue;
    }

    if (!inTranslations) continue;

    const indent = line.match(/^\s*/)[0].length;
    if (line.trim() && indent < translationIndent) break;

    const entry = line.slice(translationIndent).match(/^([^:#][^:]*):\s*/);
    if (entry) keys.add(entry[1].trim().replace(/^['"]|['"]$/g, ''));
  }

  return keys;
}

function resolveRelativeDocTarget(fromDocRelPath, target) {
  const fromDir = path.posix.dirname(fromDocRelPath);
  return path.posix.normalize(path.posix.join(fromDir, target));
}

async function localSiteTargetExists(siteFileSet, siteRoot, resolvedTarget) {
  const normalized = path.posix.normalize(resolvedTarget);
  const cleanPageTarget = normalized.endsWith('/') ? `${normalized.slice(0, -1)}.md` : null;
  const extensionlessPageTarget = !path.posix.extname(normalized) && !normalized.endsWith('/')
    ? `${normalized}.md`
    : null;

  return Boolean(
    siteFileSet.has(normalized)
      || (cleanPageTarget && siteFileSet.has(cleanPageTarget))
      || (extensionlessPageTarget && siteFileSet.has(extensionlessPageTarget))
      || (await fileExists(path.posix.join(siteRoot, normalized)))
      || (cleanPageTarget && (await fileExists(path.posix.join(siteRoot, cleanPageTarget))))
      || (extensionlessPageTarget && (await fileExists(path.posix.join(siteRoot, extensionlessPageTarget))))
  );
}

function assertIncludes(errors, { relPath, expected }) {
  if (!expected) return;
  errors.push(`missing expected content in ${formatPath(relPath)}: ${JSON.stringify(expected)}`);
}

async function checkFileContains(errors, relPath, needles = []) {
  const text = await readUtf8(relPath);
  for (const needle of needles) {
    if (!text.includes(needle)) {
      assertIncludes(errors, { relPath, expected: needle });
    }
  }
}

async function main() {
  const errors = [];

  const mkdocsText = await readUtf8('mkdocs.yml');
  const docsMarkdownFiles = await listMarkdownFilesUnder('docs-site');
  const blogMarkdownFiles = await listMarkdownFilesUnder('blog-site');
  const allSiteMarkdownFiles = [
    ...docsMarkdownFiles.map((file) => `docs-site/${file}`),
    ...blogMarkdownFiles.map((file) => `blog-site/${file}`),
  ];
  const docsFileSet = new Set(docsMarkdownFiles);
  const blogFileSet = new Set(blogMarkdownFiles);
  const navLabels = extractNavLabels(mkdocsText);

  // mkdocs nav entries pointing to markdown files must exist under docs-site.
  for (const navTarget of extractMdNavTargets(mkdocsText)) {
    const normalized = path.posix.normalize(navTarget);
    if (!docsFileSet.has(normalized)) {
      errors.push(`missing mkdocs nav target: mkdocs.yml -> docs-site/${normalized}`);
    }
  }

  for (const locale of ['zh', 'ja', 'ko']) {
    const translated = extractLocaleNavTranslationKeys(mkdocsText, locale);
    for (const label of navLabels) {
      if (!translated.has(label)) {
        errors.push(`missing ${locale} nav translation for: ${label}`);
      }
    }
  }

  // Local relative markdown/html links inside docs and blog must resolve to existing files.
  for (const [siteRoot, siteFiles, siteFileSet] of [
    ['docs-site', docsMarkdownFiles, docsFileSet],
    ['blog-site', blogMarkdownFiles, blogFileSet],
  ]) {
    for (const siteRelPath of siteFiles) {
      const markdown = await readUtf8(path.join(siteRoot, siteRelPath));
      const links = extractLinkTargets(markdown);
      for (const linkTarget of links) {
        if (isExternalOrRootLink(linkTarget)) continue;
        const withoutFragmentOrQuery = splitMarkdownDestination(linkTarget);
        if (!withoutFragmentOrQuery) continue;

        const resolved = resolveRelativeDocTarget(siteRelPath, withoutFragmentOrQuery);
        if (!(await localSiteTargetExists(siteFileSet, siteRoot, resolved))) {
          errors.push(`broken local relative link in ${siteRoot}/${siteRelPath}: ${linkTarget} -> ${siteRoot}/${resolved}`);
        }
      }
    }
  }


  // Locale pages must not jump back to English docs/blog roots.
  for (const relPath of allSiteMarkdownFiles) {
    const markdown = await readUtf8(relPath);
    for (const linkTarget of extractLinkTargets(markdown)) {
      if (isLocaleDriftLink(relPath, linkTarget)) {
        errors.push(`locale link drops language in ${relPath}: ${linkTarget}`);
      }
    }
  }

  // Same-page anchors must have a matching heading id, including explicit CJK ids.
  for (const relPath of allSiteMarkdownFiles) {
    const markdown = await readUtf8(relPath);
    const headingIds = extractHeadingIds(markdown);
    for (const linkTarget of extractLinkTargets(markdown)) {
      if (!linkTarget.startsWith('#')) continue;
      const anchor = linkTarget.slice(1);
      if (anchor && !headingIds.has(anchor)) {
        errors.push(`broken same-page anchor in ${relPath}: ${linkTarget}`);
      }
    }
  }

  const coreBlogEn = [
    'rl-training-system.md',
    'contextdb-fts-bm25-search.md',
    'windows-cli-startup-stability.md',
    'orchestrate-live.md',
  ];

  const locales = ['zh', 'ja', 'ko'];

  // Blog: core posts exist for EN + locales.
  for (const fileName of coreBlogEn) {
    if (!(await fileExists(path.join('blog-site', fileName)))) {
      errors.push(`missing blog canonical: ${formatPath(path.join('blog-site', fileName))}`);
    }
    for (const locale of locales) {
      const localized = path.join('blog-site', locale, fileName);
      if (!(await fileExists(localized))) {
        errors.push(`missing blog translation (${locale}): ${formatPath(localized)}`);
      }
    }
  }

  // Docs home: English links to canonical posts; locale homes keep users in-language.
  const coreBlogLinks = [
    '/blog/rl-training-system/',
    '/blog/contextdb-fts-bm25-search/',
    '/blog/windows-cli-startup-stability/',
    '/blog/orchestrate-live/',
  ];
  await checkFileContains(errors, 'docs-site/index.md', coreBlogLinks);
  for (const locale of locales) {
    const localizedCoreBlogLinks = coreBlogLinks.map((link) => link.replace('/blog/', `/blog/${locale}/`));
    await checkFileContains(errors, path.join('docs-site', locale, 'index.md'), localizedCoreBlogLinks);
  }

  // Blog index: all locales list core posts (relative links inside the blog build).
  const coreBlogIndexLinks = [
    '(rl-training-system.md)',
    '(contextdb-fts-bm25-search.md)',
    '(windows-cli-startup-stability.md)',
    '(orchestrate-live.md)',
  ];
  await checkFileContains(errors, 'blog-site/index.md', coreBlogIndexLinks);
  for (const locale of locales) {
    await checkFileContains(errors, path.join('blog-site', locale, 'index.md'), coreBlogIndexLinks);
  }

  // Blog nav includes the core set explicitly for discoverability.
  await checkFileContains(errors, 'mkdocs.blog.yml', [
    'AIOS RL Training System: rl-training-system.md',
    'ContextDB Search Upgrade: contextdb-fts-bm25-search.md',
    'Windows CLI Startup Stability: windows-cli-startup-stability.md',
    'Orchestrate Live: orchestrate-live.md',
  ]);

  if (errors.length > 0) {
    console.error('[check-site-sync] FAILED');
    for (const line of errors) {
      console.error(`- ${line}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('[check-site-sync] OK');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

export {
  extractMarkdownLinkTargets,
  extractHtmlHrefTargets,
  extractLinkTargets,
  extractMdNavTargets,
  resolveRelativeDocTarget,
  splitMarkdownDestination,
  isExternalOrRootLink,
  isLocaleDriftLink,
  extractHeadingIds,
  extractNavLabels,
  extractLocaleNavTranslationKeys,
  localSiteTargetExists,
};
