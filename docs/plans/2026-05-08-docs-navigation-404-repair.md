# Official Docs Navigation and 404 Repair Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix official documentation page content issues, incorrect page jumps, and 404-producing navigation/link problems across the MkDocs site.

**Architecture:** The official docs are built from `mkdocs.yml` with source pages under `docs-site/` and localized folders under `docs-site/<locale>/`. The repair should keep content and navigation consistent across locales, then add or improve deterministic checks so future broken links and missing nav targets fail locally.

**Tech Stack:** MkDocs Material, mkdocs-static-i18n, Markdown docs, Node.js validation scripts, npm scripts.

---

## Progress

- [x] Existing pre-task work committed in `d73316a chore(aios): sync model-router agent config`.
- [x] Agent Team domain audit completed.
- [x] Broken internal docs links and 404 routes fixed.
- [x] Content/navigation inconsistencies fixed or explicitly documented as follow-up.
- [x] Verification commands run and recorded.

## Decision Log

- 2026-05-08: Use AIOS `team` route because the user explicitly requested agent team and the work naturally splits into link audit, route/root-cause repair, and validation coverage.
- 2026-05-08: Keep edits scoped to official docs site files (`mkdocs.yml`, `docs-site/`, site validation scripts/tests, and release metadata if needed).
- 2026-05-08: Do not commit the docs repair automatically unless the user asks after reviewing the final diff.

## Acceptance

- `mkdocs.yml` navigation points only to existing local docs files or intentional external URLs.
- Internal Markdown links under `docs-site/` resolve for the built site, including locale-aware paths where applicable.
- Known wrong page jumps and 404-producing links are corrected with minimal content churn.
- Local verification includes at least one docs build/link check or a deterministic fallback script when full MkDocs tooling is unavailable.
- Final handoff lists changed files, commands run, and any remaining links that require external/manual verification.

## Next Actions

- [x] Inspect `mkdocs.yml`, `docs-site/`, and existing site validation scripts.
- [x] Build or statically validate docs to collect concrete broken links and missing pages.
- [x] Fix root causes in nav config, Markdown links, and/or missing page content.
- [x] Add or update a script/test that catches the same class of broken docs links.
- [x] Re-run docs validation and summarize evidence.

## Work Item Split for AIOS Team

### Work Item 1: Navigation and Content Audit

**Files:**
- Read: `mkdocs.yml`
- Read: `docs-site/**/*.md`
- Read: `scripts/check-site-sync.mjs`

- [ ] Map all nav entries in `mkdocs.yml` to existing docs pages.
- [ ] Identify localized pages missing from `zh/`, `ja/`, or `ko/` where nav/i18n expects them.
- [ ] Return a concise list of broken targets and suspected content issues.

### Work Item 2: 404 and Wrong Jump Repair

**Files:**
- Modify: `mkdocs.yml`
- Modify: `docs-site/**/*.md`

- [ ] Fix internal links that point to missing Markdown files or wrong generated URLs.
- [ ] Add lightweight placeholder/redirect content only when a real nav target exists but the page is missing.
- [ ] Preserve external links unless they are clearly typoed.

### Work Item 3: Verification Coverage

**Files:**
- Modify: `scripts/check-site-sync.mjs` or create a focused docs link checker under `scripts/`
- Modify/Test: `scripts/tests/*.test.mjs` if an existing pattern exists
- Modify: `package.json` only if adding a script is necessary

- [ ] Ensure local checks fail on missing nav targets and broken relative Markdown links.
- [ ] Prefer deterministic filesystem checks over network checks.
- [ ] Document exact verification command output in the final handoff.


## Verification Evidence

- `npm run test:check-site-sync` -> PASS (6 tests)
- `npm run check:site-sync` -> PASS (`[check-site-sync] OK`)
- `.venv-docs/bin/mkdocs build --strict --clean --site-dir /tmp/rex-ai-boot-site-verify -f mkdocs.yml` -> PASS
- `.venv-docs/bin/mkdocs build --strict --clean --site-dir /tmp/rex-ai-boot-blog-verify -f mkdocs.blog.yml` -> PASS
- `npm run test:scripts` -> FAIL with 400/402 passing; failing tests are pre-existing ContextDB persona overlay assertions expecting `Memory prelude: enabled`, unrelated to docs/link changes.

## Repair Notes

- Localized docs/blog pages now keep users on the matching `zh`, `ja`, or `ko` routes for internal absolute docs/blog URLs.
- Localized `debug-hub` quick-start CTAs use a stable `{#quick-start}` anchor to avoid CJK slug mismatch warnings.
- `mkdocs.yml` now exposes Model Router in Core Features and fills missing localized nav labels.
- `scripts/check-site-sync.mjs` now validates mkdocs nav targets, local Markdown/HTML links, locale drift links, same-page anchors, and locale nav translation coverage.
