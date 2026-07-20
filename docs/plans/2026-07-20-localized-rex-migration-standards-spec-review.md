# Localized Rex Migration Standards and Specification Review

Date: 2026-07-20

## Scope reviewed

- `docs-site/superpowers.md`
- `docs-site/zh/superpowers.md`
- `docs-site/ja/superpowers.md`
- `docs-site/ko/superpowers.md`
- `mkdocs.yml`
- `scripts/tests/release-pipeline.test.mjs`

## Standards review

One release-blocking finding:

1. **P1 - public documentation regression is incompatible with valid Markdown**
   - Location: `scripts/tests/release-pipeline.test.mjs:279`.
   - Evidence: after correcting the English guide to render only `rex-harness`
     as inline code, the focused command exited 1
     (`receipt:e051da5b-bfca-466f-bd3f-1fbfdb2fd957`). The assertion still
     expects the unformatted literal `rex-harness is the only default
     software-engineering workflow`.
   - Impact: the required public release-documentation regression remains red,
     so the documentation release cannot pass its focused quality gate.
   - Recommendation: make the assertion accept the intended inline-code
     markup, then re-run the exact focused test. Do not restore the malformed
     Markdown merely to satisfy the test.

No duplicate migration guide, misplaced navigation entry, or active localized
`Superpowers` navigation label was found in the reviewed scope.

## Specification review

The four guides describe the required Rex-only default, ownership-safe normal
upgrade behavior, explicit `--adopt-legacy-superpowers` cleanup, and the
supported client projection set. The localized navigation labels identify the
route as a Rex migration guide. The test failure above is an acceptance-gate
defect, not a reason to weaken these migration requirements.

## Result

Not approved until the focused public release-documentation test is green with
the intended Markdown rendering preserved.
