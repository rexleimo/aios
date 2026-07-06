import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const exists = (path) => existsSync(new URL(`../../${path}`, import.meta.url));

test('docs mkdocs config loads decoupled redesign assets and home animation entrypoint', () => {
  const config = read('mkdocs.yml');

  assert.match(config, /assets\/custom\.css/);
  assert.match(config, /assets\/home\.css/);
  assert.match(config, /assets\/pages\.css/);
  assert.match(config, /assets\/home-animation\.js/);
});

test('home markdown exposes animation canvas hooks required by the Pencil design', () => {
  const home = read('docs-site/index.md');

  for (const id of ['hero-canvas', 'grid-canvas', 'hud-canvas', 'cta-canvas']) {
    assert.match(home, new RegExp(`id="${id}"`));
  }
});

test('override template installs stable page classification hooks', () => {
  const template = read('docs-site/overrides/main.html');

  for (const className of ['rex-home', 'rex-blog', 'rex-blog-post', 'rex-doc-page']) {
    assert.match(template, new RegExp(className));
  }
});

test('override template replaces Material layout blocks with Pencil shell routing', () => {
  const template = read('docs-site/overrides/main.html');

  for (const blockName of ['header', 'tabs', 'site_nav', 'container', 'footer']) {
    assert.match(template, new RegExp(`{% block ${blockName} %}`));
  }

  for (const partial of [
    'partials/rex/docs-page.html',
    'partials/rex/blog-index.html',
    'partials/rex/blog-post.html',
  ]) {
    assert.match(template, new RegExp(partial));
  }
});

test('docs shell partials expose the Pencil application layout contract', () => {
  assert.equal(exists('docs-site/overrides/partials/rex/docs-sidebar.html'), true);
  assert.equal(exists('docs-site/overrides/partials/rex/docs-page.html'), true);

  const sidebar = read('docs-site/overrides/partials/rex/docs-sidebar.html');
  for (const marker of [
    'rex-doc-sidebar',
    'HARNESS CLI',
    'Getting Started',
    'Core Systems',
    'Collaboration',
    'Reference',
    'Local Machine',
    'aios v',
  ]) {
    assert.match(sidebar, new RegExp(marker));
  }

  const page = read('docs-site/overrides/partials/rex/docs-page.html');
  for (const marker of [
    'rex-doc-layout',
    'rex-doc-outline',
    'On This Page',
    '{% include "partials/content.html" %}',
  ]) {
    assert.match(page, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('blog shell partials expose index and article layout contracts', () => {
  for (const path of [
    'docs-site/overrides/partials/rex/blog-header.html',
    'docs-site/overrides/partials/rex/blog-index.html',
    'docs-site/overrides/partials/rex/blog-post.html',
    'docs-site/overrides/partials/rex/blog-footer.html',
  ]) {
    assert.equal(exists(path), true);
  }

  const index = read('docs-site/overrides/partials/rex/blog-index.html');
  assert.match(index, /rex-blog-featured/);
  assert.match(index, /rex-blog-card-grid/);

  const post = read('docs-site/overrides/partials/rex/blog-post.html');
  assert.match(post, /rex-blog-article-header/);
  assert.match(post, /rex-related-reading/);
  assert.match(post, /{% include "partials\/content.html" %}/);
});

test('docs css manifest imports focused redesign layers', () => {
  const css = read('docs-site/assets/custom.css');

  for (const layer of [
    'redesign/tokens.css',
    'redesign/shell.css',
    'redesign/components.css',
  ]) {
    assert.match(css, new RegExp(`@import url\\("${layer}"\\);`));
  }
});

test('blog css manifest imports focused blog redesign layers', () => {
  const css = read('blog-site/assets/custom.css');

  assert.match(css, /@import url\("redesign\/blog-tokens\.css"\);/);
  for (const layer of [
    'blog-shell.css',
    'blog-index.css',
    'blog-post.css',
    'blog-cards.css',
  ]) {
    assert.match(css, new RegExp(`@import url\\("redesign/${layer}"\\);`));
  }
  assert.match(css, /--rex-blog-accent: #FF8400;/);
});
