# GAIA Live A/B Client Error and Reconciliation Invariants Review

## Side-Effect Order

1. The local task text is SHA-256-verified before browser preflight.
2. Browser preflight completes before a task client can be invoked.
3. A validated estimate is reserved before task-client launch.
4. A successful client result replaces its reservation with reported actual
   spend; a timeout or client error retains its reservation.
5. Both completed and terminal records are constructed solely by
   `createGaiaLiveArtifact`, which whitelists persisted fields.

## Test-Diff Review

The new tests invoke the same public runner entry with temporary local files and
fake adapters. They assert adapter-visible budget boundaries and artifact
content; they do not inspect private helper calls. Existing assertions for
model pins, dry-run, browser failure, digest failure, cost limit, timeout,
redaction, and scoring remain present and unchanged.

No test-only production export or bypass was introduced.
