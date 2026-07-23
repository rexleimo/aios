# GAIA Live A/B Execution Layer RED Observation

## Declared Public Scenario

`node --test scripts/tests/gaia-ab-live-runner.test.mjs`

Declared scenario receipt: `receipt:3ac66b9e-b595-4f2a-bd7a-8d478401a42d`

## Expected Behavior

With a digest-verified local task file and ready fake adapters, the public
runner executes the deterministic first task for each isolated client/model/arm
job. It forwards the configured 300-second timeout and bounded spend, withholds
the expected answer from the fake client, and writes only redacted,
score-compatible local artifacts.

## Observed RED

The scenario exits with code 1. Three existing gate tests pass, and the
execution-slice test fails with:

`Error: GAIA live task execution is not implemented yet`

## Failure Classification

The RED matches the requested behavior delta. The runner deliberately stops
after browser preflight because it has no task loader, cost ledger, client
adapter call, or artifact writer. The test uses only a temporary local task
file and fake adapters, so the failure is neither a credential, browser,
network, model, dataset, nor leaderboard dependency failure.
