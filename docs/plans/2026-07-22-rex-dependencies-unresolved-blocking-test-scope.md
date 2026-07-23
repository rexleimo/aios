# Dependencies-Unresolved Blocking Test Scope

## Goal

Expose a stable, machine-readable long-running delivery decision when pending
work exists but no pending feature is dependency-ready.

## Public Mapping

| Behavior | Public seam | Assertion |
| --- | --- | --- |
| Unresolved pending work | `advanceLongRunningDelivery()` | Returns `decision.kind = 'blocked'`, `decision.reason = 'dependencies-unresolved'`, `ledger.currentFeatureId = null`, and activates no pending feature. |
| No accidental completion | `advanceLongRunningDelivery()` | Ledger status remains blocked rather than completed while pending features remain. |
| Compatibility | Existing long-running test suite | Valid dependency and no-dependency paths preserve their behavior. |

## Test Seam

Construct a valid public ledger, then provide a controlled ledger state with a
single active feature and remaining pending feature whose dependencies are not
accepted. Assert only the public return decision and ledger fields.

## Non-Goals

Do not define CLI/API/AIOS output projections or broader outcome vocabulary in
this slice.
