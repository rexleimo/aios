# Site Responsive Reflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the docs home page and blog responsive behavior so layouts reflow naturally instead of visually shrinking or stretching on tablet and mobile widths.

**Architecture:** Keep the current desktop art direction and markup, but replace scale-based layout behavior with real breakpoint-driven reflow. The home page should preserve a left-right hero at tablet widths, then stack only on smaller screens, while capabilities, demo, CTA, and blog cards progressively collapse from desktop to tablet to mobile grids.

**Tech Stack:** MkDocs + Material overrides, static HTML partials, CSS responsive layers, small vanilla JS bootstrap, Node.js `node:test` regression tests.

## Global Constraints

- Preserve the current desktop visual design and copy; do not redesign the page.
- Remove whole-page responsive scaling for the home page; use layout reflow instead of `scale(...)`.
- Keep hero left-right around tablet landscape widths (~1024px); stack hero only below mobile/tablet breakpoint (~768px).
- Make blog index cards reflow `3 -> 2 -> 1` across desktop, tablet, and mobile widths.
- Prefer CSS-only fixes; change markup only if strictly required.
- Follow TDD: add failing regression tests before changing production behavior.
- Do not append substantial new test logic to `scripts/tests/site-redesign-assets.test.mjs` because it already exceeds 500 lines; create a focused sibling test file instead.

---

### Task 1: Add responsive regression coverage

**Files:**
- Create: `scripts/tests/site-redesign-responsive.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `docs-site/assets/home-animation.js`, `docs-site/assets/redesign/home.css`, `blog-site/assets/redesign/blog-index.css`, `blog-site/assets/redesign/blog-cards.css`
- Produces: `npm run test:site-redesign` coverage for responsive home/blog layout contracts

- [ ] **Step 1: Write the failing test**

Create assertions that require:

- `docs-site/assets/home-animation.js` no longer derives `--rex-home-scale` from viewport width.
- `docs-site/assets/redesign/home.css` no longer scales `.home-section__stage` with `transform: ... scale(...)`.
- Home breakpoints keep `.hero-layout` in two columns on tablet widths, then switch to one column on smaller screens.
- `.capabilities-cards` reflows from 4 columns to 2 columns to 1 column.
- `.demo-row` and `.cta-section .home-section__stage` reflow to one column on narrower widths.
- `blog-site/assets/redesign/blog-cards.css` provides a 2-column tablet breakpoint before the existing 1-column mobile breakpoint.
- `blog-site/assets/redesign/blog-index.css` reduces featured panel and hero spacing cleanly on narrower widths.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/site-redesign-responsive.test.mjs`

Expected: FAIL because the current home runtime still sets `--rex-home-scale`, the home stage still scales, and the blog grid lacks a 2-column tablet breakpoint.

- [ ] **Step 3: Wire the new test into the site suite**

Update `package.json` so `test:site-redesign` runs both:

- `scripts/tests/site-redesign-assets.test.mjs`
- `scripts/tests/site-redesign-responsive.test.mjs`

- [ ] **Step 4: Re-run the focused suite**

Run: `npm run test:site-redesign`

Expected: still FAIL until production CSS/JS is updated.


### Task 2: Replace home scale behavior with real responsive reflow

**Files:**
- Modify: `docs-site/assets/home-animation.js`
- Modify: `docs-site/assets/redesign/home.css`

**Interfaces:**
- Consumes: home markup in `docs-site/index.md`, existing canvas boot in `bootHomeWebGL()`
- Produces: breakpoint-driven layout behavior with no global home-page shrink transform

- [ ] **Step 1: Remove scale-sync behavior from the runtime**

In `docs-site/assets/home-animation.js`:

- remove `HOME_DESIGN_WIDTH`
- remove `syncHomeDesignScale()`
- stop writing `--rex-home-scale`
- keep boot, reduced-motion handling, resize-safe WebGL startup, and cleanup behavior intact

- [ ] **Step 2: Convert home sections from scale-sized to width-constrained layouts**

In `docs-site/assets/redesign/home.css`:

- remove `--rex-home-scale` usage
- remove `transform: translateX(-50%) scale(var(--rex-home-scale))` from `.home-section__stage`
- stop deriving section heights from scaled `calc(...)`
- keep desktop dimensions via `max-width`, fixed desktop paddings, and explicit per-section layout rules

- [ ] **Step 3: Add progressive breakpoints for the home page**

Implement responsive breakpoints that:

- keep `.hero-layout` as two columns around tablet landscape widths
- reduce right-column art width and padding before stacking
- stack `.hero-layout` below the mobile breakpoint
- reflow `.capabilities-cards` from 4 columns to 2 columns to 1 column
- reflow `.demo-row` to one column and let `.hero-terminal` / `.hud-panel` fill available width without distortion
- reflow `.cta-section .home-section__stage` to one column and reposition floating decorations so they do not collide or overflow

- [ ] **Step 4: Run focused responsive tests**

Run: `node --test scripts/tests/site-redesign-responsive.test.mjs`

Expected: PASS


### Task 3: Improve blog tablet/mobile reflow

**Files:**
- Modify: `blog-site/assets/redesign/blog-index.css`
- Modify: `blog-site/assets/redesign/blog-cards.css`

**Interfaces:**
- Consumes: `docs-site/overrides/partials/rex/blog-index.html` structure and `blog-site/assets/blog-runtime.js` content rendering
- Produces: smoother tablet/mobile blog index layout without abrupt 3-column-to-1-column collapse

- [ ] **Step 1: Add tablet breakpoint for blog cards**

In `blog-site/assets/redesign/blog-cards.css`:

- keep 3 columns on desktop
- add a tablet breakpoint with 2 columns
- preserve the existing 1-column mobile breakpoint or move it to a narrower width

- [ ] **Step 2: Soften featured/index spacing on narrower widths**

In `blog-site/assets/redesign/blog-index.css`:

- reduce large desktop-only spacing for blog hero and featured section
- keep featured card readable when it collapses to one column
- ensure header controls stack cleanly and do not overflow

- [ ] **Step 3: Run focused responsive tests**

Run: `node --test scripts/tests/site-redesign-responsive.test.mjs`

Expected: PASS


### Task 4: Full verification

**Files:**
- Verify only

**Interfaces:**
- Consumes: updated docs/blog assets and tests
- Produces: evidence that responsive fixes did not break the docs build or existing shell contracts

- [ ] **Step 1: Run the site redesign suite**

Run: `npm run test:site-redesign`

Expected: PASS

- [ ] **Step 2: Run docs build**

Run: `python3 -m mkdocs build --strict`

Expected: PASS

- [ ] **Step 3: Run blog build**

Run: `python3 -m mkdocs build -f mkdocs.blog.yml --strict`

Expected: PASS

- [ ] **Step 4: Inspect git diff**

Run: `git diff -- docs-site/assets/home-animation.js docs-site/assets/redesign/home.css blog-site/assets/redesign/blog-index.css blog-site/assets/redesign/blog-cards.css scripts/tests/site-redesign-responsive.test.mjs package.json`

Expected: only responsive layout and related test changes are present.
