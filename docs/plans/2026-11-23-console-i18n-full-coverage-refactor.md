# REFACTOR check — Console i18n full coverage

- workItemKey: `console-i18n-full`
- activationId: `2a52ef72-c929-4614-bbf2-d5a978a19242`
- stage: `refactor`

## Refactor check

No production code was added or restructured in GREEN: only three catalog JSON
files gained three keys each. No shallow wrapper, no duplicated logic, no
changed ownership. Existing i18n module (`src/i18n/`) remains the single owner
of locale resolution, catalog loading and interpolation. No refactor needed.

All four focused test files pass after the change:
`receipt:84d1c0c4-0bf0-48d1-8f54-c8c8bd325102` (exit 0).

## Test diff review

- `apps/shell/ui/tests/i18n-full-coverage.test.mjs` is new; it asserts exact
  locale strings for three representative secondary-panel keys through the
  catalog seam consumed by `translate()`.
- RED body was not edited before GREEN; the same assertions now pass.
- Existing `i18n-catalogs.test.mjs`, `interpolate.test.mjs`, `locale.test.mjs`
  were not modified — no assertion deleted, skipped or weakened.
- The test constrains user-observable copy per locale, not implementation
  details or mock calls.

## Boundary

This REFACTOR covers only the TDD slice. Full panel externalization and the
source guard test remain for the implementation stage.
