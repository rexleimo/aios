# Rex API, Outcome, and Dependency Hardening Test Scope

## User Goal

Make Rex workflow outcomes, blocked reasons, long-running feature dependency
edges, and error envelopes explicit, stable, and fail-closed. Standalone CLI,
standalone JS API, and the AIOS adapter must expose the same Rex semantics;
AIOS may bind execution but must not reinterpret outcomes or choose a next
dependency.

## Explicit Non-Goals

- Do not add P6 revisions, idempotency keys, journals, crash recovery, or
  storage migrations.
- Do not change capability selection, Provider selection, P4 proportional
  policy, or the one-current-Command invariant.
- Do not add a core Rex MCP server, client prompt hook, external relay, or
  transport-specific dependency scheduler.
- Do not execute dependency work in parallel merely because edges exist.

## Observable Behavior Contract

1. Public result envelopes use a closed Rex outcome vocabulary and, when work
   cannot proceed, a closed blocked-reason vocabulary. They do not use an
   unstructured exception message as their only machine-readable result.
2. A long-running feature may declare `dependsOn` feature IDs. Unknown,
   duplicate, self, and cyclic edges reject at construction; dependency
   relations are normalized, immutable, and preserved in the ledger.
3. Only a pending feature whose dependencies are accepted can become the one
   current feature. When no pending feature is dependency-ready, the ledger
   returns a blocked outcome with reason `dependencies-unresolved` and keeps
   the current feature null.
4. Invalid, wrong-feature, missing, unresolved, mismatched, or nonzero
   evidence has a stable blocked reason and cannot advance a feature, activate
   a dependent feature, or replace a current Command.
5. A valid dependency chain advances in deterministic declaration order among
   ready features and exposes only one current feature/Command at a time.
6. Standalone compact CLI output and JS API retain the same outcome, status,
   blocked reason, current command/feature identity, and missing evidence.
   AIOS adapter advancement retains those Rex fields byte-for-byte apart from
   its permitted executable Provider binding.
7. Legacy workflows and feature inputs without `dependsOn` retain their current
   sequential behavior and existing outcome-compatible projections.

## Acceptance-Test Mapping

| Behavior | Observable assertion | Public seam |
| --- | --- | --- |
| Stable outcomes | Every documented transition returns an enum outcome and optional enum blocked reason. | `advanceSoftwareWorkflow()` / `advanceLongRunningDelivery()`. |
| Dependency schema | Invalid edges reject before a ledger starts; valid edges serialize unchanged. | `startLongRunningDelivery()`. |
| Dependency blocking | Unresolved dependencies return `blocked` plus `dependencies-unresolved`, with no active feature replacement. | `advanceLongRunningDelivery()`. |
| Evidence rejection | Invalid evidence returns a typed blocked result and preserves ledger/workflow identity. | Public advance APIs and standalone submission. |
| Ordered release | Completing a prerequisite selects exactly one ready dependent feature. | `advanceLongRunningDelivery()`. |
| Adapter/CLI parity | Normalized public outcome projection matches standalone compact output and AIOS workflow advance. | `presentCliWorkflow()` / `advanceAiosSoftwareWorkflow()`. |
| Compatibility | No-edge fixtures keep sequential progression and legacy compact keys. | Existing long-running and standalone fixtures. |

## Test Seam and Minimal Vertical Slice

Add focused contract tests that import only public Rex entry points for
long-running delivery and software workflow. The smallest independent slice is
a two-feature chain in which the second feature depends on the first: the
ledger must expose the normalized edge, block when the prerequisite is not
accepted, then select the dependent feature only after a valid zero-exit
receipt accepts its prerequisite.

Use a root AIOS adapter test only to compare the Rex-owned semantic fields. It
must not mock a second scheduler, change the selected Provider, or infer a
dependency outcome from host state.

## Completion Judgment

P5 is ready only when outcome and blocked-reason values are explicit and
closed, dependency graph failures are deterministic and fail closed, valid
chains advance one feature at a time, CLI/JS/AIOS results agree on Rex
semantics, and old no-edge workflows retain their behavior.

Tests must not pass by inspecting private state, accepting a thrown message as
the sole outcome, silently skipping a dependency, or weakening evidence
validation.
