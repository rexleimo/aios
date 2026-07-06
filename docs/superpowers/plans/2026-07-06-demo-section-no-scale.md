# Demo Section No-Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the visibly shrunken / stretched look from the Home page `LIVE DEMO` section by stopping that section from depending on global stage scaling.

**Architecture:** Keep the existing 1440px desktop composition, but give the demo section a section-local layout override. The demo stage should size to real available width, preserve card proportions, and switch to a stacked layout before the terminal and HUD look like a scaled poster.

**Tech Stack:** MkDocs Material, `docs-site/index.md`, `docs-site/assets/redesign/home.css`, `scripts/tests/site-redesign-assets.test.mjs`

## Global Constraints

- Scope is the Home page `LIVE DEMO` section only.
- Do not redesign hero, capabilities, or CTA sections in this pass.
- Keep the terminal script content and HUD content unchanged.
- Preserve the 1440px desktop composition at full width.
- Do not add any framework, build step, or runtime dependency.

---

## File structure

- Modify `scripts/tests/site-redesign-assets.test.mjs`
  - Add regression coverage proving the demo section stops inheriting the global scaled-stage behavior and gains a real responsive fallback.
- Modify `docs-site/assets/redesign/home.css`
  - Add demo-specific stage and layout overrides to prevent the "overall scaled-down artboard" look.

## Task 1: Lock the no-scale demo layout contract with a failing test

**Files:**
- Modify: `scripts/tests/site-redesign-assets.test.mjs`

**Interfaces:**
- Consumes: `.demo-section`, `.demo-section .home-section__stage`, `.demo-row`, `.hero-terminal`, `.hud-panel`
- Produces: regression assertions that require the demo section to opt out of global scale behavior and define a stacked responsive fallback

- [ ] **Step 1: Write the failing test**

Add this test near the other home layout CSS assertions:

```js
test('home demo section avoids global stage scaling and stacks before cards look compressed', () => {
  const homeCss = read('docs-site/assets/redesign/home.css');

  assertRuleIncludes(homeCss, '.demo-section', [
    'height: auto;',
    'min-height: 760px;',
  ]);
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
  assert.match(homeCss, /@media \\(max-width: 1180px\\)[\\s\\S]*\\.demo-row\\s*\\{[\\s\\S]*grid-template-columns: 1fr;[\\s\\S]*justify-items: center;/);
  assert.match(homeCss, /@media \\(max-width: 1180px\\)[\\s\\S]*\\.hero-terminal,\\s*[\\s\\S]*\\.hud-panel\\s*\\{[\\s\\S]*width: min\\(100%, 720px\\);/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:site-redesign
```

Expected: FAIL because the demo section still inherits the shared scaled-stage behavior and lacks a stacking breakpoint.

- [ ] **Step 3: Commit**

```bash
git add scripts/tests/site-redesign-assets.test.mjs
git commit -m "test(site): capture demo section no-scale contract"
```

## Task 2: Implement demo-only no-scale layout and responsive fallback

**Files:**
- Modify: `docs-site/assets/redesign/home.css`
- Modify: `scripts/tests/site-redesign-assets.test.mjs`

**Interfaces:**
- Consumes: demo section DOM in `docs-site/index.md`, shared `.home-section__stage`
- Produces: demo-specific layout that uses native width instead of stage scale and stacks before compression becomes obvious

- [ ] **Step 1: Write minimal implementation**

Update the demo section CSS block to:

```css
.demo-section {
  --rex-section-height: 760px;
  height: auto;
  min-height: 760px;
  scroll-margin-top: 70px;
  padding: 0;
  background: var(--rex-bg);
}

.demo-section .home-section__stage {
  position: relative;
  left: auto;
  width: min(100%, var(--rex-home-design-width));
  height: auto;
  min-height: 760px;
  margin: 0 auto;
  padding: 110px 80px 90px;
  box-sizing: border-box;
  transform: none;
}

.demo-header {
  display: flex;
  width: 100%;
  max-width: 1280px;
  height: 125px;
  flex-direction: column;
  gap: 16px;
}

.demo-sub,
.demo-row {
  width: 100%;
  max-width: 1280px;
}

.demo-row {
  display: grid;
  height: auto;
  min-height: 420px;
  grid-template-columns: minmax(0, 720px) minmax(0, 420px);
  gap: 32px;
  align-items: end;
  justify-content: space-between;
  margin-top: 48px;
}

@media (max-width: 1180px) {
  .demo-section .home-section__stage {
    padding: 96px 40px 72px;
  }

  .demo-section__decor-number {
    right: 32px;
    font-size: 11rem;
  }

  .demo-row {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .hero-terminal,
  .hud-panel {
    width: min(100%, 720px);
  }

  .hud-panel {
    max-width: 420px;
    justify-self: center;
  }
}
```

Keep the existing desktop card heights unchanged in this pass.

- [ ] **Step 2: Run test to verify it passes**

Run:

```bash
npm run test:site-redesign
```

Expected: PASS for the new demo no-scale test and all existing site redesign tests.

- [ ] **Step 3: Run build verification**

Run:

```bash
python3 -m mkdocs build -f mkdocs.yml --strict
```

Expected: exit `0`

- [ ] **Step 4: Capture visual verification**

Run:

```bash
python3 -m http.server 8023 --directory site
```

Then in another shell:

```bash
node --input-type=module <<'EOF'
const { chromium } = await import('./mcp-server/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1220, height: 1400 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:8023/', { waitUntil: 'networkidle' });
await page.locator('#demo').screenshot({ path: '/tmp/demo-section-no-scale.png' });
await browser.close();
EOF
```

Expected visual result:

- terminal and HUD no longer look like a uniformly shrunk poster
- demo row either remains natural-width or stacks before it feels compressed
- text remains readable and less "scaled down"

- [ ] **Step 5: Commit**

```bash
git add docs-site/assets/redesign/home.css scripts/tests/site-redesign-assets.test.mjs
git commit -m "fix(site): remove demo section scaled layout compression"
```

## Self-review

- Spec coverage:
  - demo-only scope: Task 2
  - remove scaled poster look: Task 1 + Task 2
  - preserve desktop composition: Task 2
  - stack before visible compression: Task 1 + Task 2
- Placeholder scan:
  - no `TODO`, `TBD`, or vague “appropriate” wording remains
- Type consistency:
  - selectors asserted in Task 1 are implemented in Task 2 with exact names
