import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

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
  assert.match(css, /@import url\("redesign\/blog-layout\.css"\);/);
  assert.match(css, /--rex-blog-accent: #FF8400;/);
});
