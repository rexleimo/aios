# Standards and Specification Review: Update Superpowers Cleanup

Reviewed change: the isolated regression in
`scripts/tests/rex-workflow-surface-reconciliation.test.mjs` that exercises
the update lifecycle's Rex-only legacy-Superpowers migration.

## Standards review

Verdict: pass, no findings.

Reviewed scope:

- `runIsolatedUpdateReconciliation()` calls the public `runUpdate()` lifecycle
  and injects only the existing reconciliation dependency boundary.
- The injected boundary invokes the production
  `reconcileRexWorkflowSurface()` implementation rather than replacing its
  filesystem behavior with a mock.
- The helper creates a new `mkdtemp()` runtime root and always removes that
  helper-owned root in `finally`; the legacy client fixtures also expose and
  remove their own temporary roots in `finally`.
- The test reuses the existing all-client and shared-agent fixture factories;
  it adds no parallel cleanup implementation or client-specific test logic.

The test layout remains in the repository's established `scripts/tests/`
domain. The lifecycle keeps option forwarding in `update.mjs` and ownership
and deletion policy in the reconciliation module, preserving the existing
encapsulation boundary.

## Specification review

Verdict: pass, no findings.

The regression covers the acceptance contract in the active isolated update
migration plan:

| Requirement | Evidence in the regression |
| --- | --- |
| Default update is non-destructive for unproven legacy links | `runUpdate()` without adoption returns a non-`removed` report, has no removed paths, and every native/shared link plus its legacy source remains accessible via `lstat()`. |
| Explicit adoption removes exact recognized legacy links | `runUpdate({ adoptLegacySuperpowers: true })` returns `removed` with no conflicts; every projection and each legacy source root rejects `lstat()` with `ENOENT`. |
| Native and shared roots are covered | The native fixture includes Codex, Claude, Gemini, OpenCode, Hermes, and Grok; the shared fixture includes `.agents`. |
| Cleanup remains isolated | Every client home and `AIOS_HOME` is underneath a test-created temporary root; unrelated skill-install and doctor work is stubbed only after lifecycle reconciliation has executed. |

The CLI parser contract remains covered by the adjacent `aios-cli` tests:
the boolean `--adopt-legacy-superpowers` flag is accepted for `update`, while
the value-bearing form is rejected before a lifecycle run. No scope expansion
or weakened ownership boundary was identified.

## Review evidence

- Source reviewed: `scripts/lib/lifecycle/update.mjs`,
  `scripts/lib/workflows/rex-workflow-surface-lifecycle.mjs`,
  `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs`, and the
  focused lifecycle, CLI, and reconciliation tests.
- Verification completed: `node --test scripts/tests/aios-lifecycle-plan.test.mjs scripts/tests/rex-workflow-surface-reconciliation.test.mjs` passed 44 tests with 0 failures.
- Execution receipt: `receipt:f9bf9e0f-5ccb-4200-82a5-c5908c0a1dc1`.
