# Rex API, Outcome, and Dependency Hardening Implementation

## GREEN Slice: Dependency-Ready Startup

`startLongRunningDelivery()` now normalizes an optional feature `dependsOn`
array into the immutable ledger record and selects the first declared feature
with no dependencies as the only current feature. A delivery without any
dependency-ready feature rejects at construction instead of activating a
known-blocked feature.

This change is intentionally limited to the accepted RED scenario. Validation
of dependency identifiers and cycles, dependency-aware advancement, typed
blocked reasons, and API/CLI/adapter outcome parity remain outside this GREEN
slice and require their own observable RED coverage.

## Verification

- Focused public contract: `node --test rex-harness/tests/contract/workflow-outcome-dependencies.test.mjs`
- Rex receipt: `receipt:36cc743d-9ad5-43c2-b3d4-5884ed921c5c` (exit 0)
- Adjacent existing coverage: `node --test rex-harness/tests/workflows/long-running-delivery.test.mjs` (5 passing)
