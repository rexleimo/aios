# Native Update Dry-Run Purity Test Scope

## User Goal

Make the public `aios update --components native --dry-run` path genuinely
read-only so users can preview global-client changes without refreshing native
sync metadata or touching managed targets.

## Explicit Non-Goals

- Do not alter the normal non-dry-run update sequence.
- Do not change browser provisioning, token-discipline policy, or external
  browser-use checkout discovery.
- Do not delete, archive, or overwrite ownership-ambiguous user client files.

## Acceptance Mapping

| Observable behavior | Public test seam | Assertion |
| --- | --- | --- |
| A dry-run reports the selected update plan without entering any write-capable lifecycle stage. | `runUpdate()` with `dryRun: true` and injected lifecycle/component functions. | It returns a dry-run plan, logs a plan message, and never calls workflow preparation, runtime update, native update, or route-command-capable component dependencies. |
| The parsed/previewed update contract retains dry-run. | `planUpdate({ dryRun: true })`. | The normalized options and preview contain `dryRun` / `--dry-run`. |
| Normal native updates remain live. | Existing `runUpdate()` native-and-agent scope test. | Without `dryRun`, the native updater still receives the original root, project root, and client. |

## Test Boundary

The stable public seams are `planUpdate()` and `runUpdate()` in
`scripts/lib/lifecycle/update.mjs`. The focused test belongs in
`scripts/tests/aios-lifecycle-plan.test.mjs`, which already owns lifecycle
planning and dependency-injection coverage. It uses throwing dependencies as
the observable no-write boundary; it does not inspect or alter global homes.

## Completion Criteria

The new focused test fails because the current dry run invokes lifecycle work,
then passes after the early plan-only path is implemented. Existing normal
update coverage and the full script suite remain green.
