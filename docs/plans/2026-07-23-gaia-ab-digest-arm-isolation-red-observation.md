# GAIA Live A/B Digest and Arm-Isolation RED Observation

## Declared Public Scenario

`node --test scripts/tests/gaia-ab-live-runner.test.mjs`

Declared scenario receipt: `receipt:a5bdf838-3fba-4932-8615-3f17569ff6e7`

## Expected Behavior

With a locally supplied task text whose configured SHA-256 is intentionally
wrong, `runGaiaLiveEvaluation` rejects before invoking either the injected
browser preflight or task client.

## Observed RED

The scenario exits with code 1. The runner throws its expected digest-mismatch
error, but the public assertion observes `browserCalls` as `1` rather than
`0`. The client launch count remains zero.

## Failure Classification

The failure directly matches the integrity-order behavior delta: the runner
performs browser preflight at `live-runner.mjs:129-135` before it calls the
digest-verifying task loader at `live-runner.mjs:140`. The test uses a temporary
local task file and fake adapters, so it is not an external browser, client,
credential, network, dataset, or leaderboard failure.
