# Environment Hygiene Token Diagnostic Refactor Review

## Refactor Decision

No further refactor is needed. The implementation reuses the existing browser
alias constant and changes only the two policy boundaries covered by the test
scope. Extracting a new configuration abstraction would add coupling without a
second caller.

## Test-Diff Review

The tests retain and strengthen behavior constraints:

- The existing one-surface over-budget doctor test remains unchanged, so real
  per-client budget excess continues to warn.
- The new multi-surface test verifies all source counts remain visible while
  only their maximum is compared to the per-client budget.
- An unrelated direct `browser-direct` server remains subject to the generic
  heuristic; the exception applies only to the existing primary browser alias.
- A separate test proves explicit `lowValueServerNames` policy still overrides
  the primary-alias exception.
- The prior compact native-guidance regression remains a negative assertion;
  this work does not reintroduce token detail into daily shared guidance.

## Verification

- Public-scenario refactor receipt:
  `receipt:fa11e057-a190-41b4-82f5-b8786a8a7d60` (exit 0).
- Focused token-discipline suite: 8 passed, 0 failed.
- `git diff --check`: passed.
