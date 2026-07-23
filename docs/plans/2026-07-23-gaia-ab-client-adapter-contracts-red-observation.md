# GAIA A/B Client Adapter Contracts RED Observation

## Declared Public Scenario

`rtk node --test scripts/tests/gaia-ab-client-adapters.test.mjs`

Declared scenario receipt: `receipt:9bd06d06-75bb-452f-a838-36002f68fb0c`

## Expected Behavior

The public adapter returns a Codex `exec` command pinned to
`gpt-5.6-terra`, with a read-only sandbox and a task envelope that includes
only task metadata, prompt, arm policy, timeout, and granted budget.

## Observed RED

The focused test exits with code 1 because
`scripts/lib/gaia-ab-eval/client-adapters.mjs` is absent. Therefore the
public invocation builder cannot be imported or exercised.

## Failure Classification

This is the intended missing-feature failure. It occurs before any process
adapter, client executable, browser, network, GAIA data, credential, or paid
service can be reached.
