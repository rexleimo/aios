# Proportional Capability and Evidence Gates Implementation

## Bounded Implementation

- Extended only `strictTddCapability` eligibility, keeping the existing
  regression and `HIGH_RISK_BOUNDARY` trigger first for compatibility.
- A confirmed behavior/test-scope/honest-RED scenario now selects strict TDD
  when P3 facts prove an `external` or `destructive` effect, `system` blast
  radius, `irreversible` change, or `high` uncertainty.
- Local, non-external, reversible, low-uncertainty work still falls through to
  existing baseline TDD. Risk facts alone cannot bypass test design or create a
  delivery command.
- The selected strict-TDD Capability reuses its existing stronger evidence
  contract, especially `test-strength-check-recorded`; no Provider, second
  command, profile router, external action, or client adapter was added.
- Added public scenario tests for the full decision table, legacy compatibility,
  precondition preservation, strict evidence blocking, and post-execution-only
  analytics.

## Verification

- Focused public scenario:
  `receipt:af544146-0c91-4cde-a6c0-bfa9d60a5f9c` (`node --test
  rex-harness/tests/scenarios/proportional-gates.test.mjs`, exit 0).
- Combined P3/P4 and adjacent application/routing suites pass 36 tests.
- `git -C rex-harness diff --check` exits 0.
