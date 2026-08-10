# AIOS Site Template Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the AIOS docs and blog site shells so the generated pages match the Pencil layout system instead of the default MkDocs Material layout.

**Architecture:** Keep MkDocs for routing, Markdown, search, i18n, and generation. Override Material template blocks and route pages into custom Home, Docs, Blog Index, and Blog Post shells. Split templates and CSS by responsibility so each page type can evolve independently.

**Tech Stack:** MkDocs Material, Jinja templates, Markdown, vanilla CSS, vanilla JavaScript canvas animation, Node test runner.

## Global Constraints

- Preserve existing markdown copy except structural wrappers/classes.
- Use Pencil node `CZd5Q` as the source of truth for page layout.
- Use Pencil node `o2Bi8` for tokens, navigation states, and component behavior.
- Use Pencil node `yZfz0` for Home animation implementation details.
- Do not manually edit generated output under `site/`.
- Keep routes, i18n folders, analytics, structured data, and current Markdown pages intact.
- Respect `prefers-reduced-motion`.
- Prefer small focused files over monolithic CSS or template files.

---

## File Structure

### Tests

- Modify: `scripts/tests/site-redesign-assets.test.mjs`
  - Add structural assertions for template block overrides and focused partials.

### Templates

- Modify: `docs-site/overrides/main.html`
  - Preserve current `extrahead` analytics/schema behavior.
  - Override `header`, `tabs`, `site_nav`, `container`, and `footer`.
  - Route Home, Docs, Blog Index, and Blog Post to custom partials.
- Create: `docs-site/overrides/partials/rex/topbar.html`
- Create: `docs-site/overrides/partials/rex/home-footer.html`
- Create: `docs-site/overrides/partials/rex/docs-sidebar.html`
- Create: `docs-site/overrides/partials/rex/docs-page.html`
- Create: `docs-site/overrides/partials/rex/blog-header.html`
- Create: `docs-site/overrides/partials/rex/blog-index.html`
- Create: `docs-site/overrides/partials/rex/blog-post.html`
- Create: `docs-site/overrides/partials/rex/blog-footer.html`

### CSS

- Modify: `docs-site/assets/custom.css`
- Modify: `docs-site/assets/redesign/shell.css`
- Modify: `docs-site/assets/redesign/pages.css`
- Modify: `docs-site/assets/redesign/home.css`
- Modify: `blog-site/assets/custom.css`
- Create: `blog-site/assets/redesign/blog-shell.css`
- Create: `blog-site/assets/redesign/blog-index.css`
- Create: `blog-site/assets/redesign/blog-post.css`
- Create: `blog-site/assets/redesign/blog-cards.css`

## Task 1: Add structural regression tests

**Files:**
- Modify: `scripts/tests/site-redesign-assets.test.mjs`

**Interfaces:**
- Consumes: template source files and CSS manifests as plain text.
- Produces: failing structural checks that require custom shell partials and Material block overrides.

- [ ] **Step 1: Extend tests**

Add tests that assert:

- `main.html` contains `{% block header %}`, `{% block tabs %}`, `{% block site_nav %}`, `{% block container %}`, and `{% block footer %}`.
- `docs-site/overrides/partials/rex/docs-sidebar.html` includes `rex-doc-sidebar`, `AIOS`, `Getting Started`, `Core Systems`, `Collaboration`, `Reference`, `Local Machine`, and `aios v`.
- `docs-site/overrides/partials/rex/docs-page.html` includes `rex-doc-layout`, `rex-doc-outline`, `On This Page`, and `{% include "partials/content.html" %}`.
- Blog partials include `rex-blog-featured`, `rex-blog-card-grid`, `rex-blog-article-header`, and `rex-related-reading`.
- Blog CSS manifest imports `blog-shell.css`, `blog-index.css`, `blog-post.css`, and `blog-cards.css`.

- [ ] **Step 2: Run focused test and confirm failure**

Run:

```bash
npm run test:site-redesign
```

Expected: FAIL because the new partials and block overrides do not exist yet.

- [ ] **Step 3: Commit**

```bash
git add scripts/tests/site-redesign-assets.test.mjs
git commit -m "test(site): lock Pencil shell structure"
```

## Task 2: Build custom docs shell templates

**Files:**
- Modify: `docs-site/overrides/main.html`
- Create: `docs-site/overrides/partials/rex/topbar.html`
- Create: `docs-site/overrides/partials/rex/home-footer.html`
- Create: `docs-site/overrides/partials/rex/docs-sidebar.html`
- Create: `docs-site/overrides/partials/rex/docs-page.html`

**Interfaces:**
- Consumes: MkDocs page object, nav object, and default `partials/content.html`.
- Produces: Home and Docs shells without Material header, tabs, sidebars, or right TOC.

- [ ] **Step 1: Add shared topbar and footer partials**

Implement a topbar that renders product brand, navigation links, GitHub link, and primary CTA. Implement a Home footer matching the landing page footer.

- [ ] **Step 2: Add docs sidebar partial**

Implement a fixed sidebar with grouped links matching the Pencil docs shell. Use static links mapped to existing MkDocs routes to avoid depending on Material nav markup.

- [ ] **Step 3: Add docs page partial**

Implement a `rex-doc-layout` wrapper with sidebar and main content. Include breadcrumbs, title, optional description, an in-content `rex-doc-outline` card generated from `page.toc`, and default MkDocs content rendering through `partials/content.html`.

- [ ] **Step 4: Override Material blocks in `main.html`**

Keep `extrahead`, but override header/tabs/site_nav/footer to suppress Material defaults and override container to route:

- Home pages to topbar + content + home footer.
- Blog pages to blog partials.
- Docs pages to docs page partial.

- [ ] **Step 5: Run focused test**

Run:

```bash
npm run test:site-redesign
```

Expected: still FAIL until blog partials and CSS imports are added; docs shell assertions pass.

- [ ] **Step 6: Commit**

```bash
git add docs-site/overrides
git commit -m "feat(site): add Pencil docs template shell"
```

## Task 3: Build custom blog shell templates

**Files:**
- Create: `docs-site/overrides/partials/rex/blog-header.html`
- Create: `docs-site/overrides/partials/rex/blog-index.html`
- Create: `docs-site/overrides/partials/rex/blog-post.html`
- Create: `docs-site/overrides/partials/rex/blog-footer.html`
- Modify: `docs-site/overrides/main.html`

**Interfaces:**
- Consumes: MkDocs page object and default content renderer.
- Produces: Blog Index and Blog Post shells that match Pencil nodes `C6Bnp` and `fj4lo`.

- [ ] **Step 1: Add blog header/footer partials**

Implement black/orange editorial topbar and footer.

- [ ] **Step 2: Add blog index partial**

Implement hero, category pills, featured article card, and a three-column card grid using existing blog routes and preserved titles.

- [ ] **Step 3: Add blog post partial**

Implement breadcrumb/tags/meta/hero visual, article content via `partials/content.html`, related reading cards, and footer.

- [ ] **Step 4: Route blog pages in `main.html`**

Use `page.is_homepage` in the blog build for Blog Index. Route all non-index blog pages to Blog Post.

- [ ] **Step 5: Run focused test**

Run:

```bash
npm run test:site-redesign
```

Expected: still FAIL until blog CSS imports are split; template assertions pass.

- [ ] **Step 6: Commit**

```bash
git add docs-site/overrides/partials/rex docs-site/overrides/main.html
git commit -m "feat(blog): add Pencil blog template shell"
```

## Task 4: Rework shell CSS around custom templates

**Files:**
- Modify: `docs-site/assets/custom.css`
- Modify: `docs-site/assets/redesign/shell.css`
- Modify: `docs-site/assets/redesign/pages.css`
- Modify: `docs-site/assets/redesign/home.css`
- Modify: `blog-site/assets/custom.css`
- Create: `blog-site/assets/redesign/blog-shell.css`
- Create: `blog-site/assets/redesign/blog-index.css`
- Create: `blog-site/assets/redesign/blog-post.css`
- Create: `blog-site/assets/redesign/blog-cards.css`

**Interfaces:**
- Consumes: custom template classes.
- Produces: layout fidelity for Home, Docs, Blog Index, and Blog Post.

- [ ] **Step 1: Update docs CSS**

Make `shell.css` target custom shell classes instead of Material defaults. Move docs page layout rules into `pages.css`.

- [ ] **Step 2: Update blog CSS split**

Split blog layout into shell, index, post, and cards files. Keep `blog-layout.css` as a compatibility import layer or remove it from manifest after tests are updated.

- [ ] **Step 3: Run focused test**

Run:

```bash
npm run test:site-redesign
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs-site/assets blog-site/assets
git commit -m "style(site): align CSS with Pencil shells"
```

## Task 5: Build and visual smoke

**Files:**
- No generated site edits.

**Interfaces:**
- Consumes: implemented templates and assets.
- Produces: build evidence and screenshots.

- [ ] **Step 1: Run regression commands**

```bash
npm run test:site-redesign
npm run test:check-site-sync
python3 -m mkdocs build -f mkdocs.yml --strict
python3 -m mkdocs build -f mkdocs.blog.yml --strict
npm run test:scripts
```

Expected: all commands exit 0.

- [ ] **Step 2: Capture screenshots**

Capture Home, Docs page, Blog Index, and Blog Post screenshots from a local `site/` server.

- [ ] **Step 3: Inspect generated output markers**

Run:

```bash
rg -n "rex-doc-layout|rex-doc-sidebar|rex-blog-featured|rex-blog-card-grid|rex-blog-article-header|rex-related-reading" site site/blog
```

Expected: generated pages contain the custom shell markers.

- [ ] **Step 4: Commit verification fixes if needed**

Only commit if Task 5 required source fixes.

## Self Review

- Spec coverage: Home, Docs, Blog Index, Blog Post, shell templates, CSS split, structural tests, build, and visual smoke are covered.
- Placeholder scan: no TODO/TBD placeholders are used.
- Interface consistency: template markers in tests match planned partials and CSS classes.
