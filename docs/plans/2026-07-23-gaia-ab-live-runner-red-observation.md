# GAIA Live A/B Runner RED Observation

## Declared Public Scenario

`node --test scripts/tests/gaia-ab-live-runner.test.mjs`

Declared scenario receipt: `receipt:8918dfed-d324-4bcd-8675-a99a1cd43bf4`

## Expected Behavior

The local-only test imports the public live manifest and runner modules. It
must prove fixed client/model identities and explicit execution caps, produce
six isolated dry-run jobs without a client launch, and block all execute-mode
launches when browser preflight fails.

## Observed RED

The scenario exits with code 1 before assertions. Node reports:

`ERR_MODULE_NOT_FOUND: Cannot find module 'scripts/lib/gaia-ab-eval/live-manifest.mjs'`

## Failure Classification

The RED matches the requested behavior delta: no public live manifest or runner
exists to gate paid calls. The scenario needs no credential, client CLI,
browser runtime, network source, or GAIA download, so the failure is not a
local resource or external-service problem.
