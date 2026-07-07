import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const exists = (path) => existsSync(new URL(`../../${path}`, import.meta.url));
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const cssRule = (css, selector) => {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(',').map((value) => value.trim());
    if (selectors.length === 1 && selectors[0] === selector) {
      return match[2];
    }
  }

  assert.fail(`Expected CSS rule for ${selector}`);
};

const assertRuleIncludes = (css, selector, declarations) => {
  const rule = cssRule(css, selector);

  for (const declaration of declarations) {
    assert.match(rule, new RegExp(escapeRegExp(declaration)));
  }
};

test('docs mkdocs config loads decoupled redesign assets and home animation entrypoint', () => {
  const config = read('mkdocs.yml');

  assert.match(config, /assets\/custom\.css/);
  assert.match(config, /assets\/home\.css/);
  assert.match(config, /assets\/pages\.css/);
  assert.match(config, /assets\/home-animation\.js/);
});

test('site override preserves Material header hooks required by the bundle runtime', () => {
  const main = read('docs-site/overrides/main.html');
  const bridgePath = 'docs-site/overrides/partials/rex/material-header-bridge.html';

  assert.match(main, /partials\/rex\/material-header-bridge\.html/);
  assert.equal(exists(bridgePath), true);

  const bridge = read(bridgePath);
  for (const marker of [
    'data-md-component="header"',
    'data-md-component="logo"',
    'data-md-component="header-topic"',
  ]) {
    assert.match(bridge, new RegExp(escapeRegExp(marker)));
  }
});

test('home markdown exposes animation canvas hooks required by the Pencil design', () => {
  const home = read('docs-site/index.md');

  for (const id of ['hero-canvas', 'grid-canvas', 'hud-canvas', 'cta-canvas']) {
    assert.match(home, new RegExp(`id="${id}"`));
  }
});

test('home HUD markup preserves the Pencil telemetry title row structure', () => {
  const home = read('docs-site/index.md');

  assert.match(home, /class="hud-panel__title-row"/);
  assert.match(home, /class="hud-panel__title">SYSTEM TELEMETRY<\/div>/);
  assert.match(home, /class="hud-panel__status"/);
  assert.match(home, /aria-label="Telemetry activity"/);
  assert.match(home, /class="hud-panel__sub">live agent throughput<\/div>/);
  assert.match(home, /class="zone-label zone-label--inline"/);
  assert.match(home, /WEBGL · radar sweep \+ throughput/);
});

test('home animation entrypoint delegates to a decoupled Pencil WebGL runtime', () => {
  const animation = read('docs-site/assets/home-animation.js');
  const runtimePath = 'docs-site/assets/redesign/home-webgl-runtime.js';

  assert.match(animation, /home-webgl-runtime\.js/);
  assert.equal(exists(runtimePath), true);
});

test('home WebGL runtime implements the Pencil Three.js animation contract', () => {
  const animation = read('docs-site/assets/redesign/home-webgl-runtime.js');

  for (const marker of [
    'loadThree',
    'THREE.WebGLRenderer',
    'THREE.BufferGeometry',
    'THREE.Points',
    'THREE.ShaderMaterial',
    'THREE.AdditiveBlending',
    'IntersectionObserver',
    'prefers-reduced-motion: reduce',
  ]) {
    assert.match(animation, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const factory of [
    'createHeroNebula',
    'createInteractiveGrid',
    'createHudRadar',
    'createCtaNebula',
  ]) {
    assert.match(animation, new RegExp(`function ${factory}\\b`));
  }
});

test('home WebGL runtime preserves localized flow light and hover ring controls', () => {
  const animation = read('docs-site/assets/redesign/home-webgl-runtime.js');

  for (const marker of [
    'uRibbonContrast',
    'uDarkMatter',
    'uRingSharpness',
    'cursorHalo',
    'cursorCoreRing',
    'gridSparkCross',
  ]) {
    assert.match(animation, new RegExp(marker));
  }
});

test('home WebGL runtime uses source-derived Pencil shaders with selected-only playback rings', () => {
  const runtime = read('docs-site/assets/redesign/home-webgl-runtime.js');

  for (const marker of [
    'THREE.NormalBlending',
    'const HERO_FLOW_FRAGMENT',
    'const CTA_NEBULA_FRAGMENT',
    'sourceHeroFlowField',
    'sourceFlowRibbons',
    'sourceFlowFilaments',
    'heroFlowVfall',
    'heroFlowAlpha',
    'sourceCtaNebula',
    'ctaNebulaAlpha',
    'cursorHotspotLens',
    'selectedPlaybackHalo',
  ]) {
    assert.match(runtime, new RegExp(marker));
  }

  assert.match(runtime, /createHeroNebula[\s\S]*HERO_FLOW_FRAGMENT/);
  assert.match(runtime, /createCtaNebula[\s\S]*CTA_NEBULA_FRAGMENT/);
  assert.match(runtime, /gl_FragColor = vec4\(col, heroFlowAlpha\);/);
  assert.match(runtime, /gl_FragColor = vec4\(col, ctaNebulaAlpha\);/);
  assert.match(runtime, /float selectedPlaybackHalo = uPlaybackSelected/);
  assert.doesNotMatch(runtime, /float selectedPlaybackHalo = uPointerActive/);
});

test('home WebGL shader keeps Pencil full-frame opacity instead of alpha-masking smoke into a stretched wash', () => {
  const runtime = read('docs-site/assets/redesign/home-webgl-runtime.js');

  assert.match(runtime, /float heroFlowAlpha = clamp\(uIntensity, 0\.0, 1\.0\);/);
  assert.match(runtime, /float ctaNebulaAlpha = clamp\(uIntensity, 0\.0, 1\.0\);/);
  assert.doesNotMatch(runtime, /flowLuminanceMask \* 0\.90/);
  assert.doesNotMatch(runtime, /bottomAnchoredFlowMask \* 0\.36/);
  assert.match(runtime, /float hoverSpotlightHalo = uPointerActive \* exp\(-pointerDistance \* 4\.5\)/);
  assert.match(runtime, /float selectedPlaybackHalo = uPlaybackSelected/);
});

test('home WebGL flow field follows Pencil source topology rather than synthetic alpha-mask smoke', () => {
  const runtime = read('docs-site/assets/redesign/home-webgl-runtime.js');

  for (const marker of [
    'sourceHeroFlowField',
    'sourceFlowRibbons',
    'sourceFlowFilaments',
    'heroFlowVfall',
    'flowRibbon',
    'hoverSpotlightHalo',
    'playbackSelectionHalo',
  ]) {
    assert.match(runtime, new RegExp(marker));
  }

  assert.doesNotMatch(runtime, /const NEBULA_FRAGMENT/);
  assert.doesNotMatch(runtime, /function organicPlume/);
  assert.doesNotMatch(runtime, /float flowLuminanceMask/);
  assert.doesNotMatch(runtime, /float bottomAnchoredFlowMask/);
});

test('home WebGL separates hover spotlight from selected playback and avoids CSS stretch wash', () => {
  const homeCss = read('docs-site/assets/redesign/home.css');
  const runtime = read('docs-site/assets/redesign/home-webgl-runtime.js');
  const heroWashLayer = cssRule(homeCss, '.hero-section .home-section__stage::before');

  assert.doesNotMatch(heroWashLayer, /radial-gradient\(ellipse at 6% 82%, rgba\(139, 92, 246, 0\.38\)/);
  assert.doesNotMatch(heroWashLayer, /filter:\s*blur\(20px\)/);
  assertRuleIncludes(homeCss, '.hero-section__canvas', [
    'opacity: 0.85;',
  ]);
  assertRuleIncludes(homeCss, '.cta-section__canvas', [
    'opacity: 0.55;',
  ]);

  for (const marker of [
    'uPlaybackSelected',
    'onPointerDown',
    'onPointerUp',
    'hoverSpotlightHalo',
  ]) {
    assert.match(runtime, new RegExp(marker));
  }

  assert.match(runtime, /float selectedPlaybackHalo = uPlaybackSelected/);
  assert.doesNotMatch(runtime, /float selectedPlaybackHalo = uPointerActive/);
  assert.match(runtime, /this\.playbackSelectedTarget = this\.playbackSelectedTarget > 0 \? 0 : 1;/);
  assert.doesNotMatch(runtime, /onPointerUp[\s\S]{0,180}playbackSelectedTarget = 0/);
});

test('home WebGL flow field keeps playback rings selected-only while hover remains a soft halo', () => {
  const runtime = read('docs-site/assets/redesign/home-webgl-runtime.js');

  for (const marker of [
    'cursorHotspotLens',
    'cursorHalo',
    'cursorGlow',
    'cursorRing',
    'cursorCoreRing',
    'ctaTealVaporMix',
  ]) {
    assert.match(runtime, new RegExp(marker));
  }

  assert.match(runtime, /float hoverSpotlightRing = uPlaybackSelected/);
  assert.doesNotMatch(runtime, /float hoverSpotlightRing = uPointerActive/);
});

test('home HUD radar shader keeps circular rings and a horizontal scan band like Pencil node Hprku', () => {
  const runtime = read('docs-site/assets/redesign/home-webgl-runtime.js');

  assert.match(runtime, /const RADAR_FRAGMENT = `[\s\S]*float horizontalScan =/);
  assert.doesNotMatch(runtime, /const RADAR_FRAGMENT = `[\s\S]*p\.x \*= 1\.35;/);
});

test('home CSS renders WebGL nebula as clipped dark smoke rather than a stretched screen wash', () => {
  const homeCss = read('docs-site/assets/redesign/home.css');

  assertRuleIncludes(homeCss, '.hero-section__canvas', [
    'mix-blend-mode: normal;',
  ]);
  assertRuleIncludes(homeCss, '.cta-section__canvas', [
    'mix-blend-mode: normal;',
  ]);
  assertRuleIncludes(homeCss, '.cta-section__right::after', [
    'background:',
    'box-shadow:',
  ]);
  assert.doesNotMatch(homeCss, /box-shadow:[^;]*\b394px\b/s);
  assertRuleIncludes(homeCss, '.cta-section__left', [
    'background:',
  ]);
});

test('home HUD CSS matches the Pencil telemetry geometry', () => {
  const homeCss = read('docs-site/assets/redesign/home.css');

  assertRuleIncludes(homeCss, '.hud-panel', [
    'padding: 26px;',
  ]);
  assertRuleIncludes(homeCss, '.hud-panel__title-row', [
    'display: flex;',
    'justify-content: space-between;',
    'align-items: center;',
  ]);
  assertRuleIncludes(homeCss, '.hud-panel__title', [
    'font-family: var(--rex-font-mono);',
    'font-size: 12px;',
    'font-weight: 700;',
    'letter-spacing: 1px;',
  ]);
  assertRuleIncludes(homeCss, '.hud-panel__sub', [
    'font-family: var(--rex-font-mono);',
    'font-size: 11px;',
  ]);
  assertRuleIncludes(homeCss, '.hud-bars', [
    'justify-content: center;',
    'gap: 10px;',
    'min-height: 150px;',
  ]);
  assertRuleIncludes(homeCss, '.hud-bar', [
    'width: 20px;',
    'height: 150px;',
    'background: transparent;',
    'border-radius: 5px;',
    'flex: 0 0 20px;',
  ]);
  assertRuleIncludes(homeCss, '.hud-bar__fill', [
    'border-radius: 5px;',
  ]);
  assertRuleIncludes(homeCss, '.zone-label--inline', [
    'width: 100%;',
    'border-radius: 6px;',
    'padding: 8px 10px;',
  ]);
  assertRuleIncludes(homeCss, '.zone-label--inline .zone-label__icon', [
    'width: 13px;',
    'height: 13px;',
  ]);
  assertRuleIncludes(homeCss, '.zone-label--inline', [
    'font-family: var(--rex-font-mono);',
    'font-size: 10.5px;',
  ]);
});

test('home shell matches the redesigned navigation contract', () => {
  const topbar = read('docs-site/overrides/partials/rex/topbar.html');

  for (const label of ['Capabilities', 'Demo', 'Docs', 'Changelog', 'Star', 'Get Started']) {
    assert.match(topbar, new RegExp(label));
  }

  assert.doesNotMatch(topbar, />Home</);
  assert.doesNotMatch(topbar, />Blog</);
  assert.doesNotMatch(topbar, />GitHub</);
});

test('home layout CSS pins the berPn desktop section geometry', () => {
  const home = read('docs-site/index.md');
  const homeCss = read('docs-site/assets/redesign/home.css');
  const shellCss = read('docs-site/assets/redesign/shell.css');

  assertRuleIncludes(homeCss, '.rex-home-main', [
    'min-height: 0;',
  ]);

  assert.match(home, /<div class="hero-layout">/);
  assert.match(home, /<div class="hero-content">/);
  assert.match(home, /<div class="hero-visual">/);

  assertRuleIncludes(homeCss, '.hero-section', [
    'height: 770px;',
    'min-height: 770px;',
  ]);
  assertRuleIncludes(homeCss, '.hero-layout', [
    'display: grid;',
    'grid-template-columns: minmax(0, 1fr) 540px;',
    'gap: 80px;',
    'padding: 120px 80px 80px 120px;',
  ]);
  assertRuleIncludes(homeCss, '.hero-content', [
    'position: relative;',
    'display: flex;',
    'flex-direction: column;',
    'gap: 32px;',
    'max-width: 720px;',
  ]);
  assertRuleIncludes(homeCss, '.hero-headline', [
    'position: relative;',
    'width: auto;',
    'max-width: 720px;',
    'font-size: 58px;',
  ]);
  assertRuleIncludes(homeCss, '.hero-visual', [
    'display: flex;',
    'justify-content: flex-end;',
    'align-items: center;',
  ]);
  assertRuleIncludes(homeCss, '.hero-abstract', [
    'position: relative;',
    'left: auto;',
    'top: auto;',
    'width: 540px;',
  ]);
  assertRuleIncludes(homeCss, '.hero-cta-row', [
    'position: relative;',
    'width: auto;',
  ]);
  assertRuleIncludes(homeCss, '.hero-works', [
    'position: relative;',
    'width: min(100%, 560px);',
    'padding-top: 0;',
  ]);

  assertRuleIncludes(homeCss, '.capabilities-section', [
    'height: 610px;',
    'min-height: 610px;',
  ]);
  assertRuleIncludes(homeCss, '.capabilities-content', [
    'height: 610px;',
    'padding: 60px 120px 0;',
  ]);
  assertRuleIncludes(homeCss, '.capabilities-cards', [
    'position: absolute;',
    'left: 120px;',
    'top: 268px;',
    'width: 1200px;',
    'height: 300px;',
    'grid-template-columns: repeat(4, 285px);',
    'gap: 20px;',
  ]);

  assert.match(homeCss, /\.capability-card:nth-child\(1\),\s*\.capability-card:nth-child\(3\)\s*\{\s*transform: translateY\(40px\);/m);
  assert.match(homeCss, /\.capability-card:nth-child\(2\),\s*\.capability-card:nth-child\(4\)\s*\{\s*transform: translateY\(0\);/m);

  assertRuleIncludes(homeCss, '.demo-section', [
    'height: auto;',
    'min-height: 760px;',
    'padding: 0;',
  ]);
  assertRuleIncludes(homeCss, '.demo-section .home-section__stage', [
    'width: min(100%, var(--rex-home-design-width));',
    'padding: 110px 80px 90px;',
    'transform: none;',
  ]);
  assertRuleIncludes(homeCss, '.demo-row', [
    'width: 100%;',
    'grid-template-columns: minmax(0, 720px) minmax(0, 420px);',
    'gap: 32px;',
    'margin-top: 48px;',
  ]);

  assertRuleIncludes(homeCss, '.cta-section', [
    'height: 520px;',
    'min-height: 520px;',
  ]);
  assertRuleIncludes(homeCss, '.cta-section .home-section__stage', [
    'grid-template-columns: 720px 720px;',
  ]);
  assertRuleIncludes(shellCss, '.rex-home-footer', [
    'height: 316px;',
    'padding: 50px 80px 40px;',
  ]);
});

test('home detail contract preserves berPn non-wrapping controls and terminal fit', () => {
  const home = read('docs-site/index.md');
  const homeCss = read('docs-site/assets/redesign/home.css');
  const runtime = read('docs-site/assets/redesign/home-webgl-runtime.js');

  assertRuleIncludes(homeCss, '.hero-badge', [
    'letter-spacing: 1.4px;',
    'white-space: nowrap;',
  ]);

  assertRuleIncludes(homeCss, '.hero-terminal__line', [
    'min-height: 0;',
    'line-height: 1.2;',
  ]);

  assertRuleIncludes(homeCss, '.cta-buttons .md-button--primary::after', [
    'content: "→";',
  ]);
  assertRuleIncludes(homeCss, '.cta-buttons .md-button:not(.md-button--primary)::before', [
    'content: "";',
    'width: 18px;',
    'mask:',
  ]);

  assertRuleIncludes(homeCss, '.cta-float-card', [
    'flex-direction: column;',
    'align-items: flex-start;',
  ]);
  assertRuleIncludes(homeCss, '.cta-float-card--1', [
    'width: 180px;',
  ]);
  assertRuleIncludes(homeCss, '.cta-float-card--2', [
    'width: 160px;',
  ]);

  assert.match(home, /cta-float-card__row/);
  assert.match(home, /10x faster[\s\S]*10x faster/);
  assert.match(home, /Verified[\s\S]*Verified/);

  for (const marker of [
    'uSmokeBias',
    'uCyanDamping',
    'deepPurple',
    'inkMask',
  ]) {
    assert.match(runtime, new RegExp(marker));
  }
});

test('home desktop design renders inside a centered 1440px stage instead of stretching per viewport', () => {
  const home = read('docs-site/index.md');
  const homeCss = read('docs-site/assets/redesign/home.css');
  const animation = read('docs-site/assets/home-animation.js');

  assert.equal((home.match(/home-section__stage/g) || []).length, 4);
  assert.match(home, /<div class="hero-section">\s*<div class="home-section__stage">/);
  assert.match(home, /<div id="capabilities" class="capabilities-section">\s*<div class="home-section__stage">/);
  assert.match(home, /<div id="demo" class="demo-section">\s*<div class="home-section__stage">/);
  assert.match(home, /<div class="cta-section">\s*<div class="home-section__stage">/);

  assertRuleIncludes(homeCss, '.rex-home-main', [
    '--rex-home-design-width: 1440px;',
  ]);
  assertRuleIncludes(homeCss, '.home-section__stage', [
    'position: relative;',
    'width: min(100%, var(--rex-home-design-width));',
    'margin: 0 auto;',
  ]);
  assertRuleIncludes(homeCss, '.hero-section', [
    '--rex-section-height: 770px;',
    'height: 770px;',
  ]);
  assertRuleIncludes(homeCss, '.demo-section', [
    '--rex-section-height: 760px;',
    'height: auto;',
    'min-height: 760px;',
  ]);
  assertRuleIncludes(homeCss, '.demo-section .home-section__stage', [
    'transform: none;',
  ]);

  assert.doesNotMatch(homeCss, /scale\(var\(--rex-home-scale\)\)/);
  assert.doesNotMatch(animation, /syncHomeDesignScale/);
  assert.doesNotMatch(animation, /--rex-home-scale/);
});

test('home demo section avoids global stage scaling and stacks before cards look compressed', () => {
  const homeCss = read('docs-site/assets/redesign/home.css');

  assertRuleIncludes(homeCss, '.demo-section .home-section__stage', [
    'position: relative;',
    'left: auto;',
    'width: min(100%, var(--rex-home-design-width));',
    'height: auto;',
    'transform: none;',
    'margin: 0 auto;',
  ]);
  assertRuleIncludes(homeCss, '.demo-row', [
    'width: 100%;',
    'grid-template-columns: minmax(0, 720px) minmax(0, 420px);',
  ]);
  assert.doesNotMatch(homeCss, /@media \(max-width: 1320px\)[\s\S]*\.demo-row\s*\{[\s\S]*grid-template-columns: 1fr;/);
  assert.match(homeCss, /@media \(max-width: 1080px\)[\s\S]*\.demo-row\s*\{[\s\S]*grid-template-columns: 1fr;[\s\S]*justify-items: center;/);
  assert.match(homeCss, /@media \(max-width: 1080px\)[\s\S]*\.hero-terminal,\s*[\s\S]*\.hud-panel\s*\{[\s\S]*width: min\(100%, 720px\);/);
});

test('home wide-screen effects are clipped to the Pencil 1440px stage', () => {
  const homeCss = read('docs-site/assets/redesign/home.css');

  assertRuleIncludes(homeCss, '.home-section__stage', [
    'overflow: hidden;',
  ]);
  assertRuleIncludes(homeCss, '.hero-section .home-section__stage::before', [
    'position: absolute;',
    'inset: 0;',
  ]);
  assertRuleIncludes(homeCss, '.hero-section .home-section__stage::after', [
    'position: absolute;',
    'inset: 0;',
  ]);
  assertRuleIncludes(homeCss, '.capabilities-section .home-section__stage::before', [
    'position: absolute;',
    'inset: 0;',
  ]);
  assertRuleIncludes(homeCss, '.capabilities-section .home-section__stage::after', [
    'position: absolute;',
    'inset: 0;',
  ]);

  assert.doesNotMatch(homeCss, /(^|\\n)\\.hero-section::before\\s*\\{/);
  assert.doesNotMatch(homeCss, /(^|\\n)\\.capabilities-section::before\\s*\\{/);
});

test('home WebGL runtime implements the Pencil cursor spotlight flow interaction', () => {
  const runtime = read('docs-site/assets/redesign/home-webgl-runtime.js');

  for (const marker of [
    'uPointerUv',
    'uPointerActive',
    'uSpotlightRadius',
    'uFlowStrength',
    'uSideDamping',
    'cursorGlow',
    'cursorRing',
    'flowRibbon',
    'pointerInside',
  ]) {
    assert.match(runtime, new RegExp(marker));
  }
});

test('home WebGL runtime uses a local Three.js module before CDN fallback', () => {
  const runtime = read('docs-site/assets/redesign/home-webgl-runtime.js');
  const three = read('docs-site/assets/vendor/three.module.js');

  assert.match(runtime, /THREE_LOCAL_URL/);
  assert.match(runtime, new RegExp(escapeRegExp('../vendor/three.module.js')));
  assert.match(runtime, /catch\(\(\) => import\(THREE_CDN_URL\)\)/);
  assert.match(three, /SPDX-License-Identifier: MIT/);
  assert.match(three, /const REVISION = '160';/);
});

test('home HUD shader keeps telemetry rings circular and decorative instead of overpowering the card content', () => {
  const runtime = read('docs-site/assets/redesign/home-webgl-runtime.js');

  assert.match(runtime, /float spokes = pow\(abs\(sin\(a \* 8\.0\)\), 34\.0\) \* smoothstep\(0\.60, 0\.05, r\);/);
  assert.match(runtime, /float horizontalScan = smoothstep\(0\.055, 0\.0, abs\(p\.y\)\) \* smoothstep\(0\.54, 0\.04, abs\(p\.x\)\);/);
  assert.match(runtime, /float alpha = rings \* 0\.10 \+ spokes \* 0\.07 \+ sweep \* 0\.12 \+ horizontalScan \* 0\.14 \+ coreGlow \* 0\.05;/);
  assert.doesNotMatch(runtime, /p\.x \*= 1\.35;/);
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
  assert.equal(exists('docs-site/overrides/partials/rex/docs-sidebar-links.html'), true);

  const sidebar = read('docs-site/overrides/partials/rex/docs-sidebar.html');
  for (const marker of [
    'rex-doc-sidebar',
    'HARNESS CLI',
    'docs-sidebar-links.html',
    'Local Machine',
    'aios v',
  ]) {
    assert.match(sidebar, new RegExp(marker));
  }

  const links = read('docs-site/overrides/partials/rex/docs-sidebar-links.html');
  for (const marker of [
    'Getting Started',
    'Core Systems',
    'Collaboration',
    'Reference',
  ]) {
    assert.match(links, new RegExp(marker));
  }

  const page = read('docs-site/overrides/partials/rex/docs-page.html');
  for (const marker of [
    'rex-doc-layout',
    'rex-doc-outline',
    'On This Page',
    'rex-doc-device-nav--tablet',
    'rex-doc-device-nav--mobile',
    'docs-sidebar-links.html',
    '{% include "partials/content.html" %}',
  ]) {
    assert.match(page, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('blog shell partials expose content-driven index and article contracts', () => {
  for (const path of [
    'docs-site/overrides/partials/rex/blog-header.html',
    'docs-site/overrides/partials/rex/blog-index.html',
    'docs-site/overrides/partials/rex/blog-post.html',
    'docs-site/overrides/partials/rex/blog-footer.html',
    'blog-site/assets/blog-runtime.js',
    'scripts/mkdocs_blog_content.py',
  ]) {
    assert.equal(exists(path), true);
  }

  const index = read('docs-site/overrides/partials/rex/blog-index.html');
  assert.match(index, /data-rex-blog-index/);
  assert.match(index, /data-rex-blog-pills/);
  assert.match(index, /data-rex-blog-featured/);
  assert.match(index, /data-rex-blog-grid/);
  assert.match(index, /rex_blog_posts_json/);
  assert.match(index, /rex-blog-featured/);
  assert.match(index, /rex-blog-card-grid/);
  assert.doesNotMatch(index, /42 articles/);
  assert.doesNotMatch(index, /Mira Osei/);
  assert.doesNotMatch(index, /Dan Roth/);

  const post = read('docs-site/overrides/partials/rex/blog-post.html');
  assert.match(post, /rex-blog-article-header/);
  assert.match(post, /rex-related-reading/);
  assert.match(post, /rex_blog\.current/);
  assert.match(post, /rex_blog\.related/);
  assert.match(post, /{% include "partials\/content.html" %}/);
  assert.doesNotMatch(post, /SYSTEM ARCHITECTURE/);
  assert.doesNotMatch(post, /Explorer/);
});

test('blog build wires dynamic content hook and runtime asset', () => {
  const config = read('mkdocs.blog.yml');

  assert.match(config, /hooks:\s*\n\s*-\s*scripts\/mkdocs_blog_content\.py/);
  assert.match(config, /extra_javascript:\s*\n\s*-\s*assets\/analytics-placeholder\.js\s*\n\s*-\s*assets\/blog-runtime\.js/);
});

test('blog runtime and hook implement content-driven rendering markers', () => {
  const runtime = read('blog-site/assets/blog-runtime.js');
  const hook = read('scripts/mkdocs_blog_content.py');

  for (const marker of [
    'data-rex-blog-index',
    'data-rex-blog-sort',
    'data-rex-blog-load-more',
    'renderFeatured',
    'renderPostCards',
  ]) {
    assert.match(runtime, new RegExp(escapeRegExp(marker)));
  }

  for (const marker of [
    'def on_nav',
    'def on_page_context',
    'estimate_read_minutes',
    'build_related_posts',
  ]) {
    assert.match(hook, new RegExp(escapeRegExp(marker)));
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
