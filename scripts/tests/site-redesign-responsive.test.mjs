import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('home responsive contract uses real reflow instead of scale-based shrinking', () => {
  const homeCss = read('docs-site/assets/redesign/home.css');
  const animation = read('docs-site/assets/home-animation.js');

  assert.doesNotMatch(homeCss, /--rex-home-scale/);
  assert.doesNotMatch(homeCss, /scale\(var\(--rex-home-scale\)\)/);
  assert.doesNotMatch(animation, /syncHomeDesignScale/);
  assert.doesNotMatch(animation, /--rex-home-scale/);

  assert.match(
    homeCss,
    /@media \(max-width: 1180px\)[\s\S]*\.hero-layout\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 420px;/
  );
  assert.match(
    homeCss,
    /@media \(max-width: 860px\)[\s\S]*\.hero-layout\s*\{[\s\S]*grid-template-columns: 1fr;/
  );
});

test('home responsive contract progressively reflows capability demo and cta sections', () => {
  const homeCss = read('docs-site/assets/redesign/home.css');

  assert.match(
    homeCss,
    /@media \(max-width: 1180px\)[\s\S]*\.capabilities-cards\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
  );
  assert.match(
    homeCss,
    /@media \(max-width: 720px\)[\s\S]*\.capabilities-cards\s*\{[\s\S]*grid-template-columns: 1fr;/
  );
  assert.match(
    homeCss,
    /@media \(max-width: 1080px\)[\s\S]*\.demo-row\s*\{[\s\S]*grid-template-columns: 1fr;/
  );
  assert.match(
    homeCss,
    /@media \(max-width: 1180px\)[\s\S]*\.cta-section \.home-section__stage\s*\{[\s\S]*grid-template-columns: 1fr;/
  );
});

test('home shell and hero narrow-screen contract match the approved tablet and mobile states', () => {
  const homeCss = read('docs-site/assets/redesign/home.css');
  const shellCss = read('docs-site/assets/redesign/shell.css');

  assert.match(
    shellCss,
    /@media \(max-width: 1023px\)[\s\S]*\.rex-topbar__inner\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/
  );
  assert.match(
    shellCss,
    /@media \(max-width: 1023px\)[\s\S]*\.rex-topbar__nav\s*\{[\s\S]*display: none;/
  );
  assert.match(
    shellCss,
    /@media \(max-width: 767px\)[\s\S]*\.rex-topbar__actions\s*\{[\s\S]*gap: 0\.5rem;/
  );
  assert.match(
    homeCss,
    /@media \(max-width: 860px\)[\s\S]*\.hero-abstract\s*\{[\s\S]*width: min\(100%, 360px\);[\s\S]*height: 392px;/
  );
  assert.match(
    homeCss,
    /@media \(max-width: 720px\)[\s\S]*\.hero-abstract\s*\{[\s\S]*width: min\(100%, 280px\);[\s\S]*height: 308px;/
  );
});

test('blog responsive contract adds a tablet grid before collapsing to one column', () => {
  const blogIndexCss = read('blog-site/assets/redesign/blog-index.css');
  const blogCardsCss = read('blog-site/assets/redesign/blog-cards.css');

  assert.match(
    blogCardsCss,
    /@media \(max-width: 1120px\)[\s\S]*\.rex-blog-card-grid,\s*[\s\S]*\.rex-related-reading__grid\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
  );
  assert.match(
    blogCardsCss,
    /@media \(max-width: 720px\)[\s\S]*\.rex-blog-card-grid,\s*[\s\S]*\.rex-related-reading__grid\s*\{[\s\S]*grid-template-columns: 1fr;/
  );
  assert.match(
    blogIndexCss,
    /@media \(max-width: 980px\)[\s\S]*\.rex-blog-featured\s*\{[\s\S]*grid-template-columns: 1fr;/
  );
  assert.match(
    blogIndexCss,
    /@media \(max-width: 720px\)[\s\S]*\.rex-blog-posts__header\s*\{[\s\S]*flex-direction: column;/
  );
});

test('docs responsive contract switches between desktop sidebar, tablet header, and mobile header states', () => {
  const shellCss = read('docs-site/assets/redesign/shell.css');
  const pagesCss = read('docs-site/assets/redesign/pages.css');

  assert.match(
    shellCss,
    /\.rex-doc-layout\s*\{[\s\S]*grid-template-columns: 220px minmax\(0, 1fr\);/
  );
  assert.match(
    shellCss,
    /@media \(max-width: 1023px\)[\s\S]*\.rex-doc-sidebar\s*\{[\s\S]*display: none;/
  );
  assert.match(
    shellCss,
    /@media \(max-width: 1023px\)[\s\S]*\.rex-doc-device-nav--tablet\s*\{[\s\S]*display: block;/
  );
  assert.match(
    shellCss,
    /@media \(max-width: 1023px\)[\s\S]*\.rex-doc-device-bar--tablet\s*\{[\s\S]*min-height: 64px;/
  );
  assert.match(
    shellCss,
    /@media \(max-width: 767px\)[\s\S]*\.rex-doc-device-nav--tablet\s*\{[\s\S]*display: none;/
  );
  assert.match(
    shellCss,
    /@media \(max-width: 767px\)[\s\S]*\.rex-doc-device-nav--mobile\s*\{[\s\S]*display: block;/
  );
  assert.match(
    shellCss,
    /@media \(max-width: 767px\)[\s\S]*\.rex-doc-device-bar--mobile\s*\{[\s\S]*min-height: 56px;/
  );

  assert.match(
    pagesCss,
    /\.rex-doc-hero h1\s*\{[\s\S]*font-family: var\(--rex-font-mono\);[\s\S]*font-size: 2rem;/
  );
  assert.match(
    pagesCss,
    /@media \(max-width: 1023px\)[\s\S]*\.rex-doc-main\s*\{[\s\S]*padding: 24px 20px 3rem;/
  );
  assert.match(
    pagesCss,
    /@media \(max-width: 1023px\)[\s\S]*\.rex-doc-hero h1\s*\{[\s\S]*font-size: 1\.75rem;/
  );
  assert.match(
    pagesCss,
    /@media \(max-width: 767px\)[\s\S]*\.rex-doc-main\s*\{[\s\S]*padding: 16px 16px 2\.5rem;/
  );
  assert.match(
    pagesCss,
    /@media \(max-width: 767px\)[\s\S]*\.rex-doc-hero h1\s*\{[\s\S]*font-size: 1\.5rem;/
  );
});
