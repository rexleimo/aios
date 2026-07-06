# Home HUD Telemetry Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Home page `SYSTEM TELEMETRY` HUD card to a close 1:1 match with the Pencil `WebGL — Ambient HUD` frame at the 1440px desktop baseline.

**Architecture:** Keep the HUD card content deterministic in HTML and CSS, and keep WebGL strictly decorative behind it. The implementation is split into three focused passes: lock the markup contract with a regression test, restore the exact card geometry and typography in CSS, and retune the HUD shader so the animated rings no longer overpower the foreground content.

**Tech Stack:** MkDocs Material, markdown/HTML in `docs-site/index.md`, vanilla CSS in `docs-site/assets/redesign/home.css`, vanilla JS + Three.js shader runtime in `docs-site/assets/redesign/home-webgl-runtime.js`, Node test runner in `scripts/tests/site-redesign-assets.test.mjs`.

## Global Constraints

- Match the Pencil source frame `CZd5Q -> berPn -> WebGL — Ambient HUD`.
- Keep the Home page exact at the 1440px desktop baseline before responsive downscaling.
- Keep the throughput bars in HTML; do not replace them with canvas-only rendering.
- Use `JetBrains Mono` for the HUD title, subtitle, and bottom label.
- Keep WebGL decorative; the HUD text and bars must remain readable without relying on shader contrast.
- Do not add any framework or build step.
- Verify with `npm run test:site-redesign` and `python3 -m mkdocs build -f mkdocs.yml --strict`.

---

## File structure

- Modify `scripts/tests/site-redesign-assets.test.mjs`
  - Add HUD-card-specific regression checks for markup structure, CSS geometry, and softened HUD shader tuning.
- Modify `docs-site/index.md`
  - Replace the loose title block with an exact title-row structure that includes the right-side activity icon.
- Modify `docs-site/assets/redesign/home.css`
  - Replace the flexible HUD layout with exact Pencil geometry for spacing, typography, bars, and bottom label.
- Modify `docs-site/assets/redesign/home-webgl-runtime.js`
  - Reduce HUD ring, ray, and sweep dominance so the effect sits behind the content instead of flattening it.

## Task 1: Lock the HUD markup contract and restore the title row

**Files:**
- Modify: `scripts/tests/site-redesign-assets.test.mjs`
- Modify: `docs-site/index.md`

**Interfaces:**
- Consumes: existing Home HUD section in `docs-site/index.md`
- Produces: exact HUD title-row structure with `.hud-panel__title-row` and `.hud-panel__status` hooks, covered by regression tests

- [ ] **Step 1: Write the failing test**

Add this test to `scripts/tests/site-redesign-assets.test.mjs` near the existing HUD-related assertions:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:site-redesign
```

Expected: FAIL because `docs-site/index.md` does not yet contain `.hud-panel__title-row`, `.hud-panel__status`, or the telemetry activity icon.

- [ ] **Step 3: Write minimal implementation**

Replace the current HUD title block in `docs-site/index.md` with:

```html
        <div>
          <div class="hud-panel__title-row">
            <div class="hud-panel__title">SYSTEM TELEMETRY</div>
            <svg class="hud-panel__status" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Telemetry activity">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
          </div>
          <div class="hud-panel__sub">live agent throughput</div>
        </div>
```

Keep the bar sequence and bottom label text unchanged in this task.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:site-redesign
```

Expected: PASS for the new markup-structure test; other existing Home redesign tests remain green.

- [ ] **Step 5: Commit**

```bash
git add scripts/tests/site-redesign-assets.test.mjs docs-site/index.md
git commit -m "fix(site): restore home hud telemetry title row"
```

## Task 2: Restore exact HUD CSS geometry and typography

**Files:**
- Modify: `scripts/tests/site-redesign-assets.test.mjs`
- Modify: `docs-site/assets/redesign/home.css`

**Interfaces:**
- Consumes: `.hud-panel`, `.hud-panel__title-row`, `.hud-bars`, `.hud-bar__fill`, `.zone-label--inline`, `.zone-label__icon`
- Produces: exact HUD card shell spacing, mono typography, fixed-width bars, and full-width bottom label

- [ ] **Step 1: Write the failing test**

Add this test to `scripts/tests/site-redesign-assets.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:site-redesign
```

Expected: FAIL because the current HUD CSS still uses oversized title/subtitle styling, flexible bar widths, and a fit-content bottom label.

- [ ] **Step 3: Write minimal implementation**

Replace the current HUD CSS block in `docs-site/assets/redesign/home.css` with:

```css
.hud-panel {
  position: relative;
  width: 420px;
  height: 420px;
  min-height: 420px;
  padding: 26px;
  box-sizing: border-box;
}

.hud-panel__content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100%;
  gap: 18px;
}

.hud-panel__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hud-panel__title {
  color: var(--rex-text);
  font-family: var(--rex-font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
}

.hud-panel__status {
  width: 15px;
  height: 15px;
  color: var(--rex-green);
  flex: 0 0 15px;
}

.hud-panel__sub {
  margin-top: 6px;
  color: #9AA7BC;
  font-family: var(--rex-font-mono);
  font-size: 11px;
}

.hud-bars {
  display: flex;
  gap: 10px;
  align-items: end;
  justify-content: center;
  min-height: 150px;
}

.hud-bar {
  display: flex;
  width: 20px;
  height: 150px;
  flex: 0 0 20px;
  align-items: end;
  background: transparent;
  border-radius: 5px;
}

.hud-bar__fill {
  width: 100%;
  border-radius: 5px;
  background: linear-gradient(180deg, var(--rex-cyan), var(--rex-blue));
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.27);
}

.zone-label--inline {
  position: static;
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  font-family: var(--rex-font-mono);
  font-size: 10.5px;
  border-radius: 6px;
  box-sizing: border-box;
}

.zone-label--inline .zone-label__icon {
  width: 13px;
  height: 13px;
  flex: 0 0 13px;
}
```

Do not change the bar heights in `docs-site/index.md`; they already match the Pencil sequence.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:site-redesign
```

Expected: PASS for the new HUD CSS regression test and all existing site-redesign checks.

- [ ] **Step 5: Commit**

```bash
git add scripts/tests/site-redesign-assets.test.mjs docs-site/assets/redesign/home.css
git commit -m "fix(site): restore home hud telemetry geometry"
```

## Task 3: Soften the HUD shader and verify the card visually

**Files:**
- Modify: `scripts/tests/site-redesign-assets.test.mjs`
- Modify: `docs-site/assets/redesign/home-webgl-runtime.js`

**Interfaces:**
- Consumes: `HUD_FRAGMENT` shader in `docs-site/assets/redesign/home-webgl-runtime.js`
- Produces: visibly softer HUD rings, rays, and sweep that remain behind the title, bars, and label

- [ ] **Step 1: Write the failing test**

Add this test to `scripts/tests/site-redesign-assets.test.mjs`:

```js
test('home HUD shader keeps telemetry rings decorative instead of overpowering the card content', () => {
  const runtime = read('docs-site/assets/redesign/home-webgl-runtime.js');

  assert.match(runtime, /float alpha = rings \\* 0\\.12 \\+ rays \\* 0\\.08 \\+ sweep \\* 0\\.14;/);
  assert.match(runtime, /float rays = pow\\(abs\\(sin\\(a \\* 8\\.0\\)\\), 46\\.0\\) \\* smoothstep\\(0\\.56, 0\\.07, r\\);/);
  assert.doesNotMatch(runtime, /float alpha = rings \\* 0\\.22 \\+ rays \\* 0\\.16 \\+ sweep \\* 0\\.32;/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:site-redesign
```

Expected: FAIL because the current HUD shader still uses the stronger ring/ray/sweep alpha mix.

- [ ] **Step 3: Write minimal implementation**

Update the HUD fragment in `docs-site/assets/redesign/home-webgl-runtime.js` from:

```js
    float rays = pow(abs(sin(a * 8.0)), 42.0) * smoothstep(0.56, 0.05, r);
    float sweepAngle = mod(uTime * 0.9, 6.28318) - 3.14159;
    float delta = abs(atan(sin(a - sweepAngle), cos(a - sweepAngle)));
    float sweep = smoothstep(0.46, 0.0, delta) * smoothstep(0.56, 0.08, r);
    vec3 cyan = vec3(0.04, 0.86, 1.0);
    vec3 violet = vec3(0.45, 0.30, 1.0);
    float alpha = rings * 0.22 + rays * 0.16 + sweep * 0.32;
```

to:

```js
    float rays = pow(abs(sin(a * 8.0)), 46.0) * smoothstep(0.56, 0.07, r);
    float sweepAngle = mod(uTime * 0.9, 6.28318) - 3.14159;
    float delta = abs(atan(sin(a - sweepAngle), cos(a - sweepAngle)));
    float sweep = smoothstep(0.50, 0.0, delta) * smoothstep(0.54, 0.12, r);
    vec3 cyan = vec3(0.04, 0.86, 1.0);
    vec3 violet = vec3(0.45, 0.30, 1.0);
    float alpha = rings * 0.12 + rays * 0.08 + sweep * 0.14;
```

Leave the rest of the shader intact in this task.

- [ ] **Step 4: Run automated verification**

Run:

```bash
npm run test:site-redesign
python3 -m mkdocs build -f mkdocs.yml --strict
```

Expected:

- `npm run test:site-redesign` exits `0`
- `python3 -m mkdocs build -f mkdocs.yml --strict` exits `0`

- [ ] **Step 5: Run visual verification**

Run:

```bash
python3 -m http.server 8023 --directory site
```

In another shell, capture a fresh desktop screenshot of `.hud-panel`:

```bash
node --input-type=module <<'EOF'
const { chromium } = await import('./mcp-server/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 2000 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:8023/', { waitUntil: 'networkidle' });
await page.locator('.hud-panel').screenshot({ path: '/tmp/hud-panel-final.png' });
await browser.close();
EOF
```

Expected visual checks:

- Title row includes the activity icon and no longer looks oversized.
- Subtitle scale matches the Pencil mono rhythm.
- Bars read as eight narrow fixed-width columns instead of wide pills.
- Bottom label spans the card content width.
- Rings and rays remain visible but no longer dominate the card.

- [ ] **Step 6: Commit**

```bash
git add scripts/tests/site-redesign-assets.test.mjs docs-site/assets/redesign/home-webgl-runtime.js
git commit -m "fix(site): soften home hud telemetry shader"
```

## Self-review

- Spec coverage:
  - Title-row icon and title scale: Task 1 + Task 2
  - Fixed bar geometry: Task 2
  - Full-width bottom label: Task 2
  - Reduced shader dominance: Task 3
  - Desktop screenshot verification: Task 3
- Placeholder scan:
  - No `TODO`, `TBD`, or unresolved “appropriate” wording remains.
- Type consistency:
  - Markup hooks `.hud-panel__title-row` and `.hud-panel__status` are defined in Task 1 and styled in Task 2.
  - Existing `.hud-panel`, `.hud-bars`, `.hud-bar__fill`, and `.zone-label--inline` hooks are reused consistently across tasks.
