# GAIA A/B Production CLI Entrypoint RED Observation

## Declared Public Scenario

`rtk node --test scripts/tests/gaia-ab-eval.test.mjs`

Declared scenario receipt: `receipt:7e02e0aa-5f42-4da4-b8f4-14ba2b29ebb0`

## Expected Behavior

The public GAIA CLI accepts an explicit `--execute` mode. Without `--config`,
it makes no client launch and reports that configuration is required; later
stages may attach local preflight and adapter checks behind that gate.

## Observed RED

The focused test exits with code 1. The `--execute` assertion receives the
obsolete offline-only error (`only supports --dry-run`) instead of the required
configuration error.

## Failure Classification

The failure is the requested public behavior delta, not a test harness,
environment, dependency, browser, or credential failure. The test starts only
the local Node CLI, has no usable model/client adapter, and does not contact a
model, browser, network, GAIA dataset, leaderboard, or paid service.
