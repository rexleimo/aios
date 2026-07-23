# GAIA A/B Hermes Adapter RED Observation

## Declared Public Scenario

`rtk node --test scripts/tests/gaia-ab-client-adapters.test.mjs`

Receipt: `receipt:f21083a7-b926-44b7-ad4f-952f7c0f7efa`

## Observed RED

The new Hermes invocation assertion fails because the adapter reports Hermes as
unconfigured. The failure occurs without a spawned Hermes process.

## Classification

This is the intended missing command-contract behavior, not a credentials,
network, browser, dataset, or paid-service issue.
