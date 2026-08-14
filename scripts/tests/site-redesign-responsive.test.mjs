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
    /@media \(max-width: 1440px\)[\s\S]*\.hero-layout\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 420px;/
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
    /@media \(max-width: 1440px\)[\s\S]*\.capabilities-cards\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
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
    /@media \(max-width: 1440px\)[\s\S]*\.cta-section \.home-section__stage\s*\{[\s\S]*grid-template-columns: 1fr;/
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

test('home desktop hero contract stays readable on short-height PC viewports', () => {
  const homeCss = read('docs-site/assets/redesign/home.css');

  assert.match(
    homeCss,
    /@media \(max-height: 700px\) and \(min-width: 861px\)[\s\S]*\.hero-section\s*\{[\s\S]*height: auto;[\s\S]*min-height: 0;/
  );
  assert.match(
    homeCss,
    /@media \(max-height: 700px\) and \(min-width: 861px\)[\s\S]*\.hero-layout\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 420px;[\s\S]*align-items: start;[\s\S]*padding: 88px 64px 32px 88px;/
  );
  assert.match(
    homeCss,
    /@media \(max-height: 700px\) and \(min-width: 861px\)[\s\S]*\.hero-headline\s*\{[\s\S]*font-size: 50px;/
  );
  assert.match(
    homeCss,
    /@media \(max-height: 700px\) and \(min-width: 861px\)[\s\S]*\.hero-abstract\s*\{[\s\S]*width: 420px;[\s\S]*height: 460px;/
  );
  assert.match(
    homeCss,
    /@media \(max-height: 620px\) and \(min-width: 861px\)[\s\S]*\.hero-layout\s*\{[\s\S]*gap: 40px;[\s\S]*padding: 72px 56px 20px 72px;/
  );
  assert.match(
    homeCss,
    /@media \(max-height: 620px\) and \(min-width: 861px\)[\s\S]*\.hero-headline\s*\{[\s\S]*font-size: 46px;/
  );
  assert.match(
    homeCss,
    /@media \(max-height: 620px\) and \(min-width: 861px\)[\s\S]*\.hero-abstract\s*\{[\s\S]*width: 380px;[\s\S]*height: 416px;/
  );
  assert.match(
    homeCss,
    /@media \(max-height: 620px\) and \(min-width: 861px\)[\s\S]*\.zone-label\s*\{[\s\S]*display: none;/
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

test('blog shell responsive contract switches to a dropdown menu on tablet and mobile', () => {
  const headerTemplate = read('docs-site/overrides/partials/rex/blog-header.html');
  const shellCss = read('blog-site/assets/redesign/blog-shell.css');
  const runtime = read('blog-site/assets/blog-runtime.js');

  assert.match(
    headerTemplate,
    /data-rex-blog-menu-toggle/
  );
  assert.match(
    headerTemplate,
    /aria-expanded="false"[\s\S]*aria-controls="rex-blog-header-panel"/
  );
  assert.match(
    headerTemplate,
    /class="rex-blog-header__panel"[\s\S]*id="rex-blog-header-panel"[\s\S]*data-rex-blog-menu-panel/
  );

  assert.match(shellCss, /\.rex-blog-header__menu\s*\{[\s\S]*display: none;/);
  assert.match(
    shellCss,
    /@media \(max-width: 1023px\)[\s\S]*\.rex-blog-header\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/
  );
  assert.match(
    shellCss,
    /@media \(max-width: 1023px\)[\s\S]*\.rex-blog-header__menu\s*\{[\s\S]*display: inline-flex;/
  );
  assert.match(
    shellCss,
    /@media \(max-width: 1023px\)[\s\S]*\.rex-blog-header__panel\s*\{[\s\S]*position: absolute;[\s\S]*opacity: 0;[\s\S]*pointer-events: none;/
  );
  assert.match(
    shellCss,
    /\.rex-blog-header\.is-open \.rex-blog-header__panel\s*\{[\s\S]*opacity: 1;[\s\S]*pointer-events: auto;/
  );
  assert.match(
    shellCss,
    /@media \(max-width: 767px\)[\s\S]*\.rex-blog-header__actions\s*\{[\s\S]*flex-direction: column;[\s\S]*align-items: stretch;/
  );
  assert.match(
    shellCss,
    /@media \(max-width: 767px\)[\s\S]*\.rex-blog-header__actions \.rex-lang-switcher\s*\{[\s\S]*width: 100%;/
  );
  assert.match(
    shellCss,
    /@media \(max-width: 767px\)[\s\S]*\.rex-blog-header__actions \.rex-lang-switcher__menu\s*\{[\s\S]*position: static;[\s\S]*width: 100%;/
  );
  assert.match(
    shellCss,
    /@media \(max-width: 767px\)[\s\S]*\.rex-blog-header__actions \.rex-lang-switcher__option\s*\{[\s\S]*min-height: 0;[\s\S]*border: 0;/
  );

  assert.match(runtime, /\[data-rex-shell="blog-header"\]/);
  assert.match(runtime, /data-rex-blog-menu-toggle/);
  assert.match(runtime, /classList\.toggle\('is-open'/);
  assert.match(runtime, /setAttribute\('aria-expanded'/);
  assert.match(runtime, /event\.key === 'Escape'/);
  assert.match(runtime, /!header\.contains\(event\.target\)/);
});

test('blog article responsive contract keeps post layouts readable on tablet and mobile', () => {
  const blogPostCss = read('blog-site/assets/redesign/blog-post.css');
  const blogCardsCss = read('blog-site/assets/redesign/blog-cards.css');

  assert.match(
    blogPostCss,
    /@media \(max-width: 1023px\)[\s\S]*\.rex-blog-article__inner\s*\{[\s\S]*width: min\(100%, calc\(100vw - 2rem\)\);/
  );
  assert.match(
    blogPostCss,
    /@media \(max-width: 1023px\)[\s\S]*\.rex-blog-article-hero\s*\{[\s\S]*height: 240px;/
  );
  assert.match(
    blogPostCss,
    /@media \(max-width: 767px\)[\s\S]*\.rex-blog-article\s*\{[\s\S]*padding: 2\.25rem 0 3rem;/
  );
  assert.match(
    blogPostCss,
    /@media \(max-width: 767px\)[\s\S]*\.rex-blog-article__inner\s*\{[\s\S]*width: min\(100%, calc\(100vw - 1rem\)\);/
  );
  assert.match(
    blogPostCss,
    /@media \(max-width: 767px\)[\s\S]*\.rex-blog-article-header h1\s*\{[\s\S]*font-size: clamp\(2rem, 11vw, 2\.65rem\);/
  );
  assert.match(
    blogCardsCss,
    /@media \(max-width: 767px\)[\s\S]*\.rex-related-reading\s*\{[\s\S]*padding: 3rem 1rem;/
  );
});

test('docs responsive contract switches between desktop sidebar, tablet header, and mobile header states', () => {
  const shellCss = read('docs-site/assets/redesign/shell.css');
  const pagesCss = read('docs-site/assets/redesign/pages.css');

  // csK3H three-column body: sidebar | content | toc
  assert.match(
    shellCss,
    /\.rex-doc-layout__body\s*\{[\s\S]*grid-template-columns: 256px minmax\(0, 1fr\) 240px;/
  );
  assert.match(
    shellCss,
    /@media \(min-width: 1280px\)[\s\S]*\.rex-doc-layout__body\s*\{[\s\S]*grid-template-columns: 288px 776px minmax\(0, 1fr\);/
  );
  assert.match(
    shellCss,
    /@media \(min-width: 1024px\)[\s\S]*\.rex-doc-shell\s*\{[\s\S]*display: contents;/
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

  // Hero title uses the display face; csK3H sets the exact 40px reading size.
  assert.match(
    pagesCss,
    /\.rex-doc-hero h1\s*\{[\s\S]*font-family: var\(--rex-font-display\);[\s\S]*font-size: 40px;/
  );
  assert.match(
    pagesCss,
    /@media \(max-width: 1023px\)[\s\S]*\.rex-doc-main\s*\{[\s\S]*padding-bottom: 3\.5rem;/
  );
  assert.match(
    pagesCss,
    /@media \(max-width: 767px\)[\s\S]*\.rex-doc-main\s*\{[\s\S]*padding: 1\.25rem 1rem 3rem;/
  );
  assert.match(
    pagesCss,
    /@media \(max-width: 767px\)[\s\S]*\.rex-doc-hero h1\s*\{[\s\S]*font-size: clamp\(1\.8rem, 9vw, 2\.15rem\);/
  );
});
