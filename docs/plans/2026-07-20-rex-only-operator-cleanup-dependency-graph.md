# Rex-only operator cleanup dependency graph

## Objective

Finish the Rex-only migration without adopting or deleting an unproven
user-owned Superpowers projection. Operators must have one explicit,
previewable cleanup path for legacy AIOS projections, including installations
that do not use `aios update`.

## Dependency graph

```text
public CLI/lifecycle contracts (A) ----> option forwarding (C) --+
                                                        |         |
standalone reconciler help contract (B) --> help/error UX (D) ---+--> focused integration tests (F)

dead-helper reference audit (E) -------------------------------> deletion + repository search (G) --+
                                                                                                     |
                                                                                           broad release checks (H)
```

## Work items and evidence

| ID | Input / boundary | Completion condition | Verification evidence | Failure handling |
| --- | --- | --- | --- | --- |
| A | `aios init`, `aios setup`, and `aios update` parsing plus lifecycle seams | The opt-in is represented as `adoptLegacySuperpowers` and defaults to `false`. | Focused parser and lifecycle tests. | Reject an unrecognized or dropped flag; do not silently broaden cleanup. |
| B | `scripts/reconcile-rex-workflow-surface.mjs` | `--help` explains dry-run first, then explicit adoption; unknown flags fail rather than being ignored. | Process-level CLI test. | No reconciliation runs for help or invalid arguments. |
| C | Planning-kernel, setup, update, and dispatch adapters | The explicit flag reaches only the reconciliation adapter. | Dependency-injection assertions in lifecycle and dispatch tests. | Default lifecycle calls preserve `false`. |
| D | Standalone help text | The same command works for users who upgraded by a package manager, copied files, or did not run `aios update`. | Help-content assertion and release-asset inclusion test. | Operators can run `--dry-run` before a state-changing adoption. |
| E | `scripts/lib/components/superpowers/skills.mjs` | No production import/reference remains before the obsolete helper is removed. | Targeted `rg` search. | Keep historical documents and unrelated user skills untouched. |
| F | Reconciliation, CLI, and lifecycle public seams | The safe explicit cleanup path works end to end. | Focused Node test group. | Preserve `unproven-legacy-superpowers-projection` without opt-in. |
| G | Obsolete helper path | The unused Superpowers implementation file is absent and no imports remain. | File absence plus targeted search. | Stop if a live reference is found. |
| H | Release-facing scripts and generated projections | No drift or regression is introduced. | Script suite, sync checks, diff check, and selected release tests. | Report external/live-evidence blockers separately; do not fabricate evidence. |

## Critical path

`A -> C -> F -> H` is the implementation critical path. `B -> D -> F` shares
the same integration tests. `E -> G -> H` is independent and may be completed
after its reference audit. No destructive operation is coupled to normal
installation or update: it requires the explicit adoption option and supports
a non-mutating dry run.
