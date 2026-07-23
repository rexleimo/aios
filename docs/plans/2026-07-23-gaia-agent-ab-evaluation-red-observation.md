# GAIA Agent A/B Evaluation RED Observation

## Focused Command

Declared RED scenario:

`node scripts/gaia-ab-eval.mjs --help`

Declared scenario receipt: `receipt:9bf7e9df-61bb-474e-bb1e-c83e33b0d344`

Supplemental focused regression test:

`node --test scripts/tests/gaia-ab-eval.test.mjs`

Focused test receipt: `receipt:ffabf805-f0ce-492b-89da-e95d899fdcf9`

The regression test runs the public entry point
`node scripts/gaia-ab-eval.mjs --help` from the project root. It does not load
GAIA data, invoke a model, start a browser, or submit to a leaderboard.

## Expected Behavior

The public CLI exists, exits successfully for `--help`, and documents the
offline `--config` and `--dry-run` controls needed before any live evaluation
is authorized.

## Observed RED

The focused test exits with code 1. Its assertion receives Node's
`MODULE_NOT_FOUND` error for
`E:\\coding\\harness-cli\\scripts\\gaia-ab-eval.mjs`, then observes
`1 !== 0` instead of the required successful help command.

## Failure Classification

This is an honest behavior-delta failure: the requested public offline
evaluation entry point has not been implemented. The failure is not caused by
model credentials, a paid endpoint, browser availability, dataset access, test
syntax, or a mocked internal helper.
