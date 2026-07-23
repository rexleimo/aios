# GAIA Live A/B Execution Layer Implementation

## Bounded GREEN Slice

`runGaiaLiveEvaluation` now keeps dry-run behavior unchanged and, in explicit
execute mode, requires injected local adapters after a successful browser
preflight. It loads text from the configured task-manifest path, verifies the
configured SHA-256 digest, validates the local task shape, and selects only the
deterministic first `maxTasks` entries.

For every isolated client/model/arm job, the runner supplies the common
per-task timeout, arm policy, and remaining global spend to the injected task
adapter. The adapter receives a task without its expected answer. A task's
estimated and reported spend are checked before the next task can proceed.

## Local Artifact Boundary

`live-artifacts.mjs` creates an explicit whitelist record containing only the
score fields and client/model/arm audit fields. It does not copy prompts or
arbitrary adapter output, so secrets such as authorization data are excluded by
construction. The task ID is deterministically scoped to the isolated job so
the existing scorer can summarize a combined local A/B batch without duplicate
answer IDs.

## Deliberate Limits

This implementation has no default model, browser, network, GAIA-download, or
leaderboard adapter. An operator still cannot cause a paid call through this
unit test seam; production client adapters and their operator smoke remain a
later, separately reviewed step.
