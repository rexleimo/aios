# GAIA A/B Production CLI Entrypoint Review

## Standards Review

No standards finding in the bounded diff. The change reuses the repository's
existing CLI parser and ESM script, keeps argument validation in the public
entry point, adds no dependency or global state, and preserves the current
offline manifest-validation path.

## Specification Review

The public CLI now has an explicit `--execute` spelling, rejects ambiguous
`--dry-run --execute` requests, and requires `--config` before either a
configuration read or any possible production boundary. The configured execute
branch is intentionally fail-closed, so it cannot silently turn into a client
launch while adapters, manifest validation, and browser preflight are absent.

The focused public CLI test remains behavior-facing: it observes the process
status and user-visible error for an execute request rather than mocking an
internal helper. Its assertion was added rather than weakened. The pass receipt
is `receipt:f2c35771-534b-42c0-b3ff-9e9d1f1c5c7d`.

## Remaining Boundary

This review does not claim live-run readiness. A configured execute request
still fails closed by design, and no production client process, browser,
network, GAIA task, or paid model request has been made.
