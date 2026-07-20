# Rex-only operator cleanup test scope

## User-visible contract

AIOS keeps an unproven historical Superpowers projection by default. An
operator who chooses to clean legacy AIOS projections can use the same
explicit `--adopt-legacy-superpowers` option through `aios init`, `aios
setup`, `aios update`, or the standalone reconciler. The standalone command
must make the safe preview command discoverable with `--help` for users who
did not upgrade through `aios update`.

## Boundaries

- In scope: CLI option parsing and dispatch, init/setup/update lifecycle
  propagation, standalone reconciler usage/error handling, and removal of an
  unreferenced legacy helper.
- Out of scope: automatic adoption, deletion of an unproven or user-owned
  path, historical documents under `docs/superpowers/**`, live client smoke,
  and new Superpowers installation behavior.
- Safety invariant: without explicit adoption every lifecycle caller passes
  `false`; a dry run never writes a ledger or removes a projection.

## Acceptance mapping

| Observable behavior | Public seam | Assertion |
| --- | --- | --- |
| A user can request the explicit cleanup with any supported lifecycle command. | `parseArgs(['init'| 'setup'| 'update', '--adopt-legacy-superpowers'])` | Each result contains `options.adoptLegacySuperpowers === true`; omission retains `false`. |
| A requested flag reaches reconciliation and is not silently discarded. | Exported `ensureAiosPlanningKernel`, `runSetup`, and `runUpdate` with isolated dependency adapters. | Their reconciliation adapters receive `adoptLegacySuperpowers: true`; a default lifecycle test receives `false`. |
| A non-updating installation has an understandable safe cleanup command. | Spawn `node scripts/reconcile-rex-workflow-surface.mjs --help`. | Exit status is zero and usage documents `--dry-run`, `--adopt-legacy-superpowers`, and the required explicit order. |
| A typo cannot accidentally produce an incomplete cleanup. | Spawn the standalone reconciler with an unknown flag. | Non-zero exit and an actionable error; reconciliation is not invoked. |
| No legacy helper implementation remains. | Repository path plus targeted reference search. | `scripts/lib/components/superpowers/skills.mjs` is absent and no code imports it. |

## Minimal vertical slice

The lifecycle option tests and the process-level help test together exercise
the user-facing request path without invoking real home-directory cleanup. The
existing reconciliation integration tests remain the filesystem proof that
the opt-in performs an adoption and that the no-opt-in path preserves the
projection. This avoids replacing behavior tests with a mocked unlink or a
call-count-only assertion.

## Prohibited shortcuts

Do not weaken the default-preservation test, infer ownership from an exact
target alone, hide the adoption flag in an undocumented environment variable,
skip the standalone path, or claim live-client evidence from static projection
tests.

