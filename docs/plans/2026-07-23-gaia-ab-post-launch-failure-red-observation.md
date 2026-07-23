# GAIA Live A/B Post-Launch Failure RED Observation

## Declared Public Scenario

`node --test scripts/tests/gaia-ab-live-runner.test.mjs`

Declared scenario receipt: `receipt:0e176af3-c7a8-4598-bc5e-ffb9b0bb2824`

## Expected Behavior

After a validated 2 USD estimate, a fake TimeoutError from the first job's
first task creates a terminal `timeout` artifact retaining that reservation,
stops the job's second task, and gives the next job an 8 USD remaining budget.

## Observed RED

The scenario exits with code 1. The test cannot find a `timeout` artifact and
throws when reading its spend. The current runner records generic `failed`.

## Failure Classification

This is the intended post-launch failure delta. The generic catch at
`live-runner.mjs:186-191` does not distinguish TimeoutError, and the successful
result path is the only location that decrements remaining spend. The scenario
uses only local temporary input and fake adapters, not a browser, model,
credential, network, data source, or leaderboard.
