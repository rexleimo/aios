# Verification-Failed Reason Standards and Specification Review

## Standards

No blocking finding. The reason is supplied at the established exhausted-retry
terminal branch and uses the existing immutable decision helper. No retry
policy, shared error layer, or host integration changes.

## Specification

The reviewed behavior preserves a retry before the budget is exhausted and a
human gate after it. The latter now exposes `verification-failed`; no other
human-gate reason or output projection is claimed by this slice.

## Evidence

- `receipt:6d2296d4-0780-4bae-b86f-6b578b23117c` passed.
- `git -C rex-harness diff --check` was clean.
