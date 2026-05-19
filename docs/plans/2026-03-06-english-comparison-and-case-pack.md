# English Comparison + Case Pack Implementation Plan

## Goal

Ship English-first public pages that improve developer understanding and conversion:

1. A clear comparison page (`raw CLI` vs `Harness CLI layer`)
2. Three reproducible case deep-dives with command-level evidence

## Scope

- Public developer docs only (`docs-site/**`)
- Internal planning stays in `docs/plans/**`
- No internal KPI notes in public docs

## Deliverables

1. `docs-site/cli-comparison.md`
2. `docs-site/case-cross-cli-handoff.md`
3. `docs-site/case-auth-wall-browser.md`
4. `docs-site/case-privacy-guard.md`
5. Update links from:
   - `docs-site/index.md`
   - `docs-site/case-library.md`

## Acceptance Criteria

- New pages build successfully with MkDocs.
- Comparison and case pages are reachable from homepage and case library.
- Each case page includes:
  - when to use
  - exact commands
  - measurable evidence
- Public pages contain product/developer guidance only.
