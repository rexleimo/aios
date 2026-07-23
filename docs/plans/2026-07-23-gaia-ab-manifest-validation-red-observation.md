# GAIA A/B Manifest Validation RED Observation

## Declared Public Scenario

`node scripts/gaia-ab-eval.mjs --config scripts/tests/fixtures/gaia-ab-eval-valid.json --dry-run`

Declared scenario receipt: `receipt:c2531cb4-06c5-4087-bd1b-d05ddc2f05c7`

## Expected Behavior

The CLI accepts the local valid three-client manifest and prints separate
Codex, Claude, and Hermes dry-run entries. It must not start any external
client, browser, dataset, or leaderboard action.

## Observed RED

The declared scenario exits with code 1. Its observed public error is:

`The GAIA A/B evaluator is not ready to run yet. Use --help for the offline interface.`

The focused test command `node --test scripts/tests/gaia-ab-eval.test.mjs`
also fails four new behavior checks: valid dry-run validation, Hermes model
pinning, unequal A/B concurrency rejection, and cross-model aggregation
rejection. The existing help test continues to pass.

## Failure Classification

The failures agree with the requested behavior delta: the public CLI has no
offline manifest parser or validator. They are not caused by invalid JSON,
model credentials, an external service, browser availability, test syntax, or
a mocked internal call.
