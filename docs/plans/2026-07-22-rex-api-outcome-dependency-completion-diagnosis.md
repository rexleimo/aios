# Remaining P5 Dependency Hardening Diagnosis

## Reproduction

`receipt:6bf21082-0d80-4336-ad28-ec05c2964b48` records a zero-baseline public
delivery whose sole feature declares `dependsOn: ['missing']`. The assertion
that `startLongRunningDelivery()` rejects an unknown dependency exits 1.

## Root Cause

In `src/domain/long-running-delivery.mjs`, `normalizeDependsOn()` converts only
to nonempty strings. `normalizeFeatures()` never compares dependency IDs to
the normalized feature-ID set, detects duplicate/self edges, or traverses the
graph for cycles. Separately, `advanceLongRunningDelivery()` selects the next
pending array entry by index rather than checking accepted dependencies. These
are the earliest semantic deviations; CLI and AIOS merely project Rex results.

## Regression Check

Add a public contract suite covering unknown, duplicate, self, and cyclic edge
rejection plus dependency-ready advancement and typed blocking. The focused
unknown-edge command from the recorded receipt is the first required RED.
