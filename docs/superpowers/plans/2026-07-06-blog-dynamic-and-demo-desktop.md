# Blog Dynamic Shell + Demo Desktop Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Home demo section side-by-side at desktop widths and convert the blog shell from hardcoded content into a real content-driven experience.

**Architecture:** Use a narrow CSS fix for the Home demo breakpoint. For the blog, derive post metadata through a MkDocs hook, render shell data through Jinja templates, and power index interactions with a small runtime script.

**Tech Stack:** MkDocs Material, Jinja overrides, Python MkDocs hook, vanilla JavaScript, existing blog/home CSS, Node test runner

## Global Constraints

- Keep `docs-site/*.md` and `blog-site/*.md` as the source of truth.
- No framework migration or generated-site hand edits.
- Do not reopen accepted Home hero/HUD work.
- Do not revert unrelated dirty-worktree changes.
- Verify with `npm run test:site-redesign`, `python3 -m mkdocs build -f mkdocs.yml --strict`, and `python3 -m mkdocs build -f mkdocs.blog.yml --strict`.

---

### Task 1: Lock the regression contracts first

**Files:**
- Modify: `scripts/tests/site-redesign-assets.test.mjs`

**Interfaces:**
- Consumes: `docs-site/assets/redesign/home.css`, `docs-site/overrides/partials/rex/blog-index.html`, `docs-site/overrides/partials/rex/blog-post.html`, `mkdocs.blog.yml`
- Produces: failing regression tests for the demo breakpoint and dynamic blog shell

- [ ] Add a demo-layout regression test that forbids the old `1320px` stack breakpoint and requires a smaller stack breakpoint.
- [ ] Add blog-shell regression tests that require hook/runtime wiring and reject hardcoded fake article shell markers.
- [ ] Run `npm run test:site-redesign` and confirm the new assertions fail first.

### Task 2: Implement the content-driven blog shell

**Files:**
- Create: `scripts/mkdocs_blog_content.py`
- Create: `blog-site/assets/blog-runtime.js`
- Modify: `docs-site/overrides/partials/rex/blog-index.html`
- Modify: `docs-site/overrides/partials/rex/blog-post.html`
- Modify: `blog-site/assets/redesign/blog-index.css`
- Modify: `blog-site/assets/redesign/blog-post.css`
- Modify: `mkdocs.blog.yml`

**Interfaces:**
- Consumes: `blog-site/**/*.md` frontmatter/content, MkDocs page/nav context
- Produces: `rex_blog` template context, dynamic index runtime, related-post/article metadata rendering

- [ ] Add a MkDocs hook that collects per-post metadata, excludes redirects, estimates read time, and prepares locale-aware post lists.
- [ ] Wire the hook into `mkdocs.blog.yml` and load the new blog runtime asset.
- [ ] Replace hardcoded index/post shell content with template context and runtime hooks.
- [ ] Extend blog CSS only where needed for buttons, states, counts, and pagination.

### Task 3: Apply the demo breakpoint fix

**Files:**
- Modify: `docs-site/assets/redesign/home.css`

**Interfaces:**
- Consumes: existing `.demo-row`, `.hero-terminal`, `.hud-panel`
- Produces: side-by-side desktop demo layout that only stacks below the revised breakpoint

- [ ] Lower the `.demo-row` stacking breakpoint so 1280px and 1100px remain desktop left/right.
- [ ] Keep terminal/HUD card proportions intact when the row finally stacks.

### Task 4: Verify and tighten impact

**Files:**
- Modify only the files above if verification reveals scoped regressions

**Interfaces:**
- Consumes: updated blog/home files and tests
- Produces: verified strict-build-safe change set

- [ ] Run `npm run test:site-redesign`.
- [ ] Run `python3 -m mkdocs build -f mkdocs.yml --strict`.
- [ ] Run `python3 -m mkdocs build -f mkdocs.blog.yml --strict`.
- [ ] Update the code graph and run a post-edit impact check.
