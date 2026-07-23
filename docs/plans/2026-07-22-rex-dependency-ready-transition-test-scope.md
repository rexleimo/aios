# Dependency-Ready Transition Test Scope

## Goal

Advance only one pending feature whose declared dependencies are accepted. When
none is ready, surface a closed blocked decision with
`dependencies-unresolved` and no current feature.

## Non-Goals

Do not add CLI, JS API, AIOS adapter projections, persistence, concurrency, or
new dependency graph validation in this slice.

## Public Acceptance Mapping

| Behavior | Public seam | Observable assertion |
| --- | --- | --- |
| Ready dependent | `advanceLongRunningDelivery()` | Accepting a prerequisite activates its dependent even if the dependent occurs earlier in declaration order. |
| Deterministic choice | `advanceLongRunningDelivery()` | Among multiple ready pending features, only the earliest declared becomes current. |
| Unresolved block | `advanceLongRunningDelivery()` | Pending but blocked work returns `decision.kind === 'blocked'`, `decision.reason === 'dependencies-unresolved'`, and `ledger.currentFeatureId === null`. |
| Compatibility | `advanceLongRunningDelivery()` | No-edge fixtures keep their sequential next-feature behavior. |

## Test Seam

Extend `rex-harness/tests/contract/workflow-outcome-dependencies.test.mjs` using
the package public entry point and real standalone receipts. Tests inspect only
the returned ledger and decision, never a scheduler helper or internal state.

## Completion

The focused contract must prove one ready feature is selected, blocked graphs
do not activate a feature, and existing no-edge delivery coverage remains
green.
