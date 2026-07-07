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
