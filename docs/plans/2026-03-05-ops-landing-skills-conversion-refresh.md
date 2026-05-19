# Ops Landing Skills Conversion Refresh Plan

Date: 2026-03-05

## Goal

Improve top-of-funnel conversion on docs landing pages by clearly answering:

- What can Harness CLI do right now?
- Which reusable skills are available?
- What is the single primary action for new visitors?

## Scope

- `docs-site/index.md`
- `docs-site/zh/index.md`
- `docs-site/ja/index.md`
- `docs-site/ko/index.md`
- `docs-site/assets/analytics-placeholder.js`

## Changes

1. Landing page capability clarity:
   - Add a dedicated "what I can do" section focused on operator outcomes.
   - Add a dedicated "skills available now" section with concrete skill names and use cases.

2. CTA focus:
   - Keep one clear primary CTA in hero area.
   - Keep one secondary capability entry point (case library) for high-intent users.

3. Conversion instrumentation:
   - Add `data-rex-*` tracking attributes to key CTA buttons.
   - Extend placeholder analytics script to emit `page_view` and CTA click events.

## Verification

- `mkdocs build --clean -f mkdocs.yml`
- Confirm docs build succeeds with no errors.
- Spot check that pages render and CTA links still resolve.
