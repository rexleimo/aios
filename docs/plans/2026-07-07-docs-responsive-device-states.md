# Docs Responsive Device States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the docs shell match the approved Pencil device states for 1024px laptop, 768px tablet, and 375px mobile without stretched or collapsed previews.

**Architecture:** Keep one shared docs page shell, but split its presentation into three responsive states. Desktop keeps the left sidebar layout, tablet swaps to a 64px utility header, and mobile swaps to a 56px compact header with tighter spacing while reusing the same content rendering pipeline.

**Tech Stack:** MkDocs Material overrides, Jinja partials, CSS media queries, Node test contracts.

## Global Constraints

- Keep the docs page content dynamic through the existing MkDocs partial pipeline.
- Preserve docs navigation access on tablet/mobile; do not hide navigation with no replacement.
- Align breakpoints to the approved device states: desktop around 1024px, tablet around 768px, mobile around 375px.
- Add regression coverage before relying on visual inspection.
- Limit changes to docs shell/template/CSS/test files required for this responsive fix.

---

### Task 1: Lock the responsive contract in tests

**Files:**
- Modify: `scripts/tests/site-redesign-responsive.test.mjs`
- Modify: `scripts/tests/site-redesign-assets.test.mjs`

**Interfaces:**
- Consumes: `docs-site/assets/redesign/shell.css`, `docs-site/assets/redesign/pages.css`, `docs-site/overrides/partials/rex/docs-page.html`, `docs-site/overrides/partials/rex/docs-sidebar.html`
- Produces: Failing tests that define required docs device-state shell markers and breakpoints.

- [ ] Add docs responsive assertions for desktop/sidebar, tablet header, and mobile header contracts.
- [ ] Add template assertions for tablet/mobile docs header markers and shared navigation hooks.
- [ ] Run the targeted site redesign tests and confirm the new docs assertions fail before implementation.

### Task 2: Implement the shared three-state docs shell

**Files:**
- Modify: `docs-site/overrides/partials/rex/docs-page.html`
- Modify: `docs-site/overrides/partials/rex/docs-sidebar.html`
- Create: `docs-site/overrides/partials/rex/docs-sidebar-links.html`

**Interfaces:**
- Consumes: existing docs page context (`page`, `config`, `page.toc`)
- Produces: a shared docs shell with desktop sidebar, tablet header/nav drawer, and mobile header/nav drawer.

- [ ] Extract reusable docs navigation links into a shared partial.
- [ ] Keep desktop sidebar markup aligned with the existing docs shell contract.
- [ ] Add tablet/mobile header + drawer structure that preserves navigation access on narrow screens.

### Task 3: Match spacing, typography, and breakpoint behavior to the Pencil states

**Files:**
- Modify: `docs-site/assets/redesign/shell.css`
- Modify: `docs-site/assets/redesign/pages.css`

**Interfaces:**
- Consumes: docs shell class hooks from Task 2.
- Produces: responsive CSS for 1024 / 768 / 375 layouts with no stretched preview.

- [ ] Tune desktop docs shell to the 220px sidebar + tighter content proportions.
- [ ] Add tablet-only header, padding, and typography rules.
- [ ] Add mobile-only header, compact spacing, and stacked narrow-screen rules.

### Task 4: Verify with tests and local device screenshots

**Files:**
- No new source files required unless a verification helper is needed.

**Interfaces:**
- Consumes: updated MkDocs templates/CSS and targeted tests.
- Produces: test/build evidence plus local screenshots for 1024px / 768px / 375px states.

- [ ] Run `node --test scripts/tests/site-redesign-responsive.test.mjs scripts/tests/site-redesign-assets.test.mjs`.
- [ ] Run `npm run test:site-redesign` and `python3 -m mkdocs build --strict`.
- [ ] Capture local screenshots at 1024px, 768px, and 375px widths to validate the preview states.
