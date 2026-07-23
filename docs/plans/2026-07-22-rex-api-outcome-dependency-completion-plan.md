# Remaining P5 API, Outcome, and Dependency Completion Plan

## Dependency Graph

1. **Closed domain contract** (critical path start)
   - Define closed outcome and blocked-reason values, normalize all dependency
     edges, reject unknown/duplicate/self/cyclic references at construction.
   - Verify with public `startLongRunningDelivery()` contract tests.
   - Roll back point: domain-only patch can be reverted without state migration.

2. **Dependency-aware transition** (depends on 1)
   - Select only pending features whose dependencies are accepted; retain one
     current feature and return `dependencies-unresolved` with no current
     feature when none is ready. Make bad evidence return stable blocked reasons.
   - Verify with public `advanceLongRunningDelivery()` chain and invalid-evidence
     scenarios.
   - Roll back point: transition policy remains confined to the delivery domain.

3. **Software workflow outcome projection** (depends on 1)
   - Replace loose workflow transition outcomes with closed Rex semantic fields
     while retaining legacy-compatible projections.
   - Verify in software workflow runtime tests.
   - Can proceed independently of step 2 after shared vocabulary exists.

4. **Standalone CLI and JS API parity** (depends on 2 and 3)
   - Preserve outcome, status, blocked reason, command/current-feature identity,
     and missing evidence in compact CLI and public JS results.
   - Verify standalone failure-mode and compact-output tests.

5. **AIOS adapter semantic parity** (depends on 4)
   - Assert AIOS retains Rex fields byte-for-byte except its permitted executable
     Provider binding; do not add another scheduler.
   - Verify `scripts/tests/rex-harness-adapter.test.mjs`.

6. **Compatibility and final verification** (depends on 2, 4, 5)
   - Prove no-edge fixtures retain sequential behavior; run full nested tests,
     doctor, root affected tests, and diff review.

## Critical Path

`1 -> 2 -> 4 -> 5 -> 6`; step 3 can run after step 1 but must finish before
step 4. No parallel feature activation is introduced by these edges.
