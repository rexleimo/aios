# GAIA A/B Claude and Hermes Adapters RED Observation

## Declared Public Scenario

`rtk node --test scripts/tests/gaia-ab-client-adapters.test.mjs`

Receipt: `receipt:115b265f-8530-474b-8abd-86f6fb901452`

## Observed RED

The Claude invocation assertion fails because the public factory reports Claude
as unconfigured. The existing Codex test remains local; no executable is
spawned.

## Classification

This is the intended missing Claude command-contract behavior, not an
authentication, network, browser, or paid-service failure.
