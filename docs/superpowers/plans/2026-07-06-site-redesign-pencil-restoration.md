# AIOS Site Pencil Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the main docs site and blog site to the Pencil design in `/Users/rex/Downloads/cli.rexai.top.pen` while preserving existing markdown copy.

**Architecture:** Keep MkDocs as the content generator and isolate presentation into focused assets. Shared docs styling is split into tokens, shell, components, home, and docs-page layers; blog styling is split into blog tokens and blog layout. Animation code exposes small canvas controllers initialized only when matching DOM hooks exist.

**Tech Stack:** MkDocs Material, markdown content in `docs-site/` and `blog-site/`, vanilla CSS, vanilla JavaScript canvas animation, Node test runner.

## Global Constraints

- Preserve existing copy from `docs-site/*.md` and `blog-site/*.md`.
- Use `CZd5Q` as the source of truth for visual layout and page treatment.
- Use `o2Bi8` for design tokens, menu states, and interaction behavior.
- Use `yZfz0` for Home page animation implementation guidance.
- Do not manually edit generated output under `site/`.
- Respect `prefers-reduced-motion`.
- Prefer focused files over monolithic CSS/JS.
- Keep existing MkDocs routes, i18n folders, analytics, and structured data intact.

---

## File structure

### Tests

- Create `scripts/tests/site-redesign-assets.test.mjs`
  - Verifies the MkDocs configs reference the decoupled redesign assets.
  - Verifies Home markdown contains the required animation canvas hooks.
  - Verifies override template adds stable body-class hooks.
  - Verifies blog assets define the orange blog design tokens.

### Main docs assets

- Create `docs-site/assets/redesign/tokens.css`
  - Color, typography, radius, shadow, spacing variables for the cyan/blue docs design.
- Create `docs-site/assets/redesign/shell.css`
  - Header, nav, drawer, sidebar, search, footer, and general MkDocs shell restyling.
- Create `docs-site/assets/redesign/components.css`
  - Buttons, cards, code blocks, tables, admonitions, chips, link states, focus states.
- Create `docs-site/assets/redesign/home.css`
  - Home-only section layout matching `berPn`.
- Create `docs-site/assets/redesign/pages.css`
  - Non-home docs content layout matching the docs page frames in `CZd5Q`.
- Modify `docs-site/assets/custom.css`
  - Reduce it to an import manifest plus compatibility shims.
- Modify `docs-site/assets/home.css`
  - Reduce it to import `redesign/home.css`.
- Modify `docs-site/assets/pages.css`
  - Reduce it to import `redesign/pages.css`.
- Modify `docs-site/assets/home-animation.js`
  - Keep one entry point, split internals into small controller functions in the same file to avoid a build step.

### Blog assets

- Create `blog-site/assets/redesign/blog-tokens.css`
  - Black/orange blog design variables.
- Create `blog-site/assets/redesign/blog-layout.css`
  - Blog index and post styling matching `C6Bnp` and `fj4lo`.
- Modify `blog-site/assets/custom.css`
  - Import blog redesign files and keep minimal compatibility overrides.

### Templates/config

- Modify `docs-site/overrides/main.html`
  - Add page-class script that marks `rex-home`, `rex-blog`, `rex-blog-post`, and `rex-doc-page`.
  - Keep existing analytics and schema scripts.
- Modify `mkdocs.yml`
  - Keep existing CSS entries and ensure `assets/home-animation.js` is loaded.
- Modify `mkdocs.blog.yml`
  - Ensure blog custom CSS is loaded; do not add docs-only Home JS to the blog.

---

### Task 1: Add structural regression tests

**Files:**
- Create: `scripts/tests/site-redesign-assets.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Node built-in `node:test`, `node:assert/strict`, `node:fs`.
- Produces: `npm run test:site-redesign` script and tests that fail until redesign assets/templates exist.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/site-redesign-assets.test.mjs`:

```js
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
```

Add to `package.json` scripts:

```json
"test:site-redesign": "node --test scripts/tests/site-redesign-assets.test.mjs"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:site-redesign
```

Expected: FAIL because the focused redesign imports and template class hooks do not exist yet.

- [ ] **Step 3: Commit**

```bash
git add scripts/tests/site-redesign-assets.test.mjs package.json
git commit -m "test(site): add redesign asset structure checks"
```

### Task 2: Install decoupled docs design layers

**Files:**
- Create: `docs-site/assets/redesign/tokens.css`
- Create: `docs-site/assets/redesign/shell.css`
- Create: `docs-site/assets/redesign/components.css`
- Modify: `docs-site/assets/custom.css`

**Interfaces:**
- Consumes: MkDocs Material HTML classes.
- Produces: global docs CSS variables and shared UI styling used by Home and docs pages.

- [ ] **Step 1: Implement CSS tokens**

Create `docs-site/assets/redesign/tokens.css` with variables for `--rex-bg`, `--rex-panel`, `--rex-border`, `--rex-cyan`, `--rex-blue`, `--rex-violet`, `--rex-green`, text colors, radii, shadows, and max content widths.

- [ ] **Step 2: Implement shell styling**

Create `docs-site/assets/redesign/shell.css` to style:

- `body`
- `.md-header`
- `.md-tabs`
- `.md-sidebar`
- `.md-nav`
- `.md-footer`
- mobile drawer states

Use `o2Bi8` states for default, hover, active, and focus.

- [ ] **Step 3: Implement shared components**

Create `docs-site/assets/redesign/components.css` to style:

- `.md-button`
- `.md-typeset table`
- `.md-typeset code`
- `.md-typeset pre`
- `.admonition`
- reusable chips/cards.

- [ ] **Step 4: Convert `custom.css` into a manifest**

Ensure the top of `docs-site/assets/custom.css` is:

```css
@import url("redesign/tokens.css");
@import url("redesign/shell.css");
@import url("redesign/components.css");
```

Keep only compatibility shims below the imports.

- [ ] **Step 5: Run focused test**

Run:

```bash
npm run test:site-redesign
```

Expected: still FAIL until template and blog layers are added; docs css import assertion should pass.

- [ ] **Step 6: Commit**

```bash
git add docs-site/assets/redesign docs-site/assets/custom.css
git commit -m "style(site): add decoupled docs redesign layers"
```

### Task 3: Restore Home layout and animation entrypoint

**Files:**
- Create: `docs-site/assets/redesign/home.css`
- Modify: `docs-site/assets/home.css`
- Modify: `docs-site/assets/home-animation.js`
- Modify: `docs-site/index.md`

**Interfaces:**
- Consumes: canvas ids `hero-canvas`, `grid-canvas`, `hud-canvas`, `cta-canvas`.
- Produces: decorative animation controllers initialized through `DOMContentLoaded`.

- [ ] **Step 1: Implement Home CSS layer**

Create `docs-site/assets/redesign/home.css` with section styles for:

- `.hero-section`
- `.capabilities-section`
- `.demo-section`
- `.cta-section`
- `.hero-abstract`
- `.zone-label`
- responsive breakpoints
- reduced-motion fallbacks.

Modify `docs-site/assets/home.css` to import the layer:

```css
@import url("redesign/home.css");
```

- [ ] **Step 2: Refactor animation JS into small controllers**

Implement in `docs-site/assets/home-animation.js`:

- `createCanvasController(canvas, drawFrame)`
- `createParticleField(canvas, options)`
- `createNodeGrid(canvas)`
- `createHudRadar(canvas)`
- `createNebula(canvas)`
- `initHomeAnimations()`

Each controller must:

- Return a cleanup function.
- Skip work when `prefers-reduced-motion` matches.
- Resize canvas using `devicePixelRatio`.
- Stop drawing when the document is hidden.

- [ ] **Step 3: Keep Home copy stable**

Only adjust `docs-site/index.md` where required for structural wrappers/classes. Do not replace current marketing copy with design placeholder copy.

- [ ] **Step 4: Run focused test**

Run:

```bash
npm run test:site-redesign
```

Expected: still FAIL until template and blog layers are added; Home canvas hook assertion should pass.

- [ ] **Step 5: Commit**

```bash
git add docs-site/assets/redesign/home.css docs-site/assets/home.css docs-site/assets/home-animation.js docs-site/index.md
git commit -m "feat(site): restore home layout and canvas animation system"
```

### Task 4: Restore docs page shell

**Files:**
- Create: `docs-site/assets/redesign/pages.css`
- Modify: `docs-site/assets/pages.css`
- Modify: `docs-site/overrides/main.html`

**Interfaces:**
- Consumes: generated MkDocs page markup and page metadata.
- Produces: stable page classification classes and docs-page styling.

- [ ] **Step 1: Implement docs page CSS**

Create `docs-site/assets/redesign/pages.css` with styles for:

- `.rex-doc-page .md-main`
- `.rex-doc-page .md-content`
- `.rex-doc-page .md-typeset h1`
- `.rex-doc-page .md-typeset h2`
- `.rex-doc-page .md-typeset p`
- long content sections, cards, lists, and tables.

Modify `docs-site/assets/pages.css`:

```css
@import url("redesign/pages.css");
```

- [ ] **Step 2: Add page classification hook**

In `docs-site/overrides/main.html`, add a small script in `extrahead` after the Home marker:

```html
<script>
  document.addEventListener('DOMContentLoaded', function() {
    var path = window.location.pathname;
    var body = document.body;
    var isHome = {{ 'true' if page.meta and page.meta.home else 'false' }};
    body.classList.add(isHome ? 'rex-home' : 'rex-doc-page');
    if (path.indexOf('/blog/') === 0) {
      body.classList.add('rex-blog');
      if (path !== '/blog/' && !path.endsWith('/blog/')) {
        body.classList.add('rex-blog-post');
      }
    }
  });
</script>
```

Keep the existing `md-home` class behavior for compatibility.

- [ ] **Step 3: Run focused test**

Run:

```bash
npm run test:site-redesign
```

Expected: still FAIL until blog token assertion passes; template assertion should pass.

- [ ] **Step 4: Commit**

```bash
git add docs-site/assets/redesign/pages.css docs-site/assets/pages.css docs-site/overrides/main.html
git commit -m "style(site): restore docs page shell"
```

### Task 5: Restore blog index and post design

**Files:**
- Create: `blog-site/assets/redesign/blog-tokens.css`
- Create: `blog-site/assets/redesign/blog-layout.css`
- Modify: `blog-site/assets/custom.css`
- Modify: `mkdocs.blog.yml` if needed

**Interfaces:**
- Consumes: generated MkDocs Blog HTML and `blog-site/*.md` copy.
- Produces: black/orange Blog Index and Blog Post treatment.

- [ ] **Step 1: Implement blog tokens**

Create `blog-site/assets/redesign/blog-tokens.css`:

```css
:root {
  --rex-blog-bg: #111111;
  --rex-blog-panel: #1A1A1A;
  --rex-blog-panel-strong: #2E2E2E;
  --rex-blog-border: #2E2E2E;
  --rex-blog-accent: #FF8400;
  --rex-blog-text: #FFFFFF;
  --rex-blog-muted: #B8B9B6;
  --rex-blog-soft: #7A7A76;
  --rex-blog-radius: 12px;
}
```

- [ ] **Step 2: Implement blog layout**

Create `blog-site/assets/redesign/blog-layout.css` to style:

- blog header/nav
- blog home hero and post lists
- article container at 800px readable width
- code blocks
- callouts
- related/pagination-like sections
- footer.

- [ ] **Step 3: Convert blog custom CSS to manifest**

Ensure `blog-site/assets/custom.css` starts with:

```css
@import url("redesign/blog-tokens.css");
@import url("redesign/blog-layout.css");
```

Keep minimal compatibility overrides below the imports.

- [ ] **Step 4: Run focused test**

Run:

```bash
npm run test:site-redesign
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add blog-site/assets/redesign blog-site/assets/custom.css mkdocs.blog.yml
git commit -m "style(blog): restore Pencil blog design"
```

### Task 6: Build and visual smoke

**Files:**
- No new source files unless build failures require small fixes.

**Interfaces:**
- Consumes: implemented site assets.
- Produces: verification evidence.

- [ ] **Step 1: Run tests**

```bash
npm run test:site-redesign
npm run test:check-site-sync
```

Expected: PASS.

- [ ] **Step 2: Build docs site**

```bash
python -m mkdocs build -f mkdocs.yml --strict
```

Expected: build exits 0.

- [ ] **Step 3: Build blog site**

```bash
python -m mkdocs build -f mkdocs.blog.yml --strict
```

Expected: build exits 0.

- [ ] **Step 4: Inspect generated outputs without hand editing**

Check that the generated files include expected CSS/JS references:

```bash
rg -n "redesign|home-animation|rex-blog-accent|hero-canvas|grid-canvas|hud-canvas|cta-canvas" site site/blog | sed -n '1,120p'
```

Expected: matches in generated HTML/CSS.

- [ ] **Step 5: Commit final verification fixes if any**

```bash
git add docs-site blog-site mkdocs.yml mkdocs.blog.yml package.json scripts/tests
git commit -m "chore(site): verify Pencil redesign build"
```

Only commit if Task 6 required additional source changes.

## Self-review

- Spec coverage: Home, docs pages, blog index/post, animations, copy preservation, and MkDocs pipeline are covered.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps are used.
- Type/interface consistency: CSS import paths and animation hook ids are consistent across tasks.
