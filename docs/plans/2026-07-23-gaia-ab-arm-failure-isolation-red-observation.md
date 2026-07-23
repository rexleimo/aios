# GAIA Live A/B Arm Failure-Isolation RED Observation

## Declared Public Scenario

`node --test scripts/tests/gaia-ab-live-runner.test.mjs`

Declared scenario receipt: `receipt:aac646bd-861d-4f76-8a99-1042ae1df365`

## Expected Behavior

For a verified two-task local manifest, an over-budget estimate in the first
Codex baseline task emits one redacted `cost_limit` artifact, launches neither
task for that job, and permits the other five client/model/arm jobs to complete
both selected tasks.

## Observed RED

The scenario exits with code 1 and reports:

`Error: GAIA live task cost estimate exceeds remaining spend`

The runner terminates before returning artifacts for the unaffected jobs.

## Failure Classification

The failure matches the requested arm-isolation delta. The catch block in
`live-runner.mjs:183-192` records a failure then rethrows it, exiting both job
loops. All inputs are temporary local text and fake adapters; no browser,
model, credential, network, dataset, or leaderboard dependency caused the
failure.
