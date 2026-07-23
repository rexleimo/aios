# Native Update Dry-Run Purity Standards and Specification Review

## Reviewed Scope

- `scripts/lib/lifecycle/options/defaults.mjs`
- `scripts/lib/lifecycle/update.mjs`
- `scripts/tests/aios-lifecycle-plan.test.mjs`
- Test contract: `2026-07-22-rex-native-update-dry-run-purity-test-scope.md`

## Standards Review

No findings.

- The update lifecycle remains the sole owner of update option normalization,
  preview construction, and execution policy; no parallel abstraction was
  introduced.
- The `dryRun` default uses the same option-default structure as neighboring
  update flags.
- The early return occurs before dependency selection and before
  `prepareRexWorkflowSurface()`, so the read-only boundary does not rely on
  each downstream component respecting dry-run independently.
- The test additions follow the existing Node test style and stay in the
  lifecycle plan test file that already owns `runUpdate()` coverage.

## Specification Review

No findings.

- The selected update plan now preserves `dryRun` and exposes `--dry-run` in
  its preview.
- The public lifecycle entry logs and returns that plan before workflow,
  runtime, or component work can occur.
- The isolated scenario passes while its native-updater dependency throws if
  called (`receipt:5310b647-87e2-4e29-8ea3-bc55470f7875`), directly covering
  the reported unwanted native-sync write path.
- The `dryRun: false` default leaves the existing normal update branch and its
  component sequence unchanged.

## Verification

`node --test scripts/tests/aios-lifecycle-plan.test.mjs` passed: 20 tests, 0
failures. `git diff --check` also passed.
