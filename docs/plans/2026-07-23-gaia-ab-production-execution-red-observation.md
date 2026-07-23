# GAIA A/B Production Execution RED Observation

## Declared Public Scenario

`rtk node --test scripts/tests/gaia-ab-eval.test.mjs`

Declared scenario receipt: `receipt:7e02e0aa-5f42-4da4-b8f4-14ba2b29ebb0`

## Expected Behavior

The existing public CLI recognizes an explicit `--execute` request. With no
configuration supplied, it exits without launching a client and reports that a
configuration path is required; a future implementation can then validate the
manifest, browser readiness, client availability, and limits before any live
operation.

## Observed RED

The focused scenario exits with code 1. The new public-CLI assertion expects a
missing-configuration error, but the command instead reports that the evaluator
only supports `--dry-run` until live execution is explicitly authorized.

## Failure Classification

This is the requested user-visible behavior delta: the public entry point has
no operator-gated execution path. It is not a test, dependency, environment,
or credential failure. The scenario spawns only the repository's local Node
script; no model, browser, network, GAIA task, dataset, leader-board, or paid
service is contacted.
