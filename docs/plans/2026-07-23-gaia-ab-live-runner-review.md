# GAIA Live A/B Runner Gate Standards and Spec Review

## Reviewed Scope

- `scripts/lib/gaia-ab-eval/live-manifest.mjs`
- `scripts/lib/gaia-ab-eval/live-runner.mjs`
- `scripts/tests/gaia-ab-live-runner.test.mjs`
- `scripts/gaia-ab-live-runner.mjs` (expected public CLI; not present)
- `docs/plans/2026-07-23-gaia-ab-live-runner-test-scope.md`

## Standards Review

No standards findings in the implemented gate slice.

Manifest validation is pure and separate from execute-mode browser preflight.
The modules follow the repository's ESM style, use narrow injected adapters,
and do not create a client, browser, network, credential, or artifact side
effect during dry-run.

## Specification Review

### P1: No public CLI or tested task execution exists yet

The scope contract names `scripts/gaia-ab-live-runner.mjs` as the public CLI and
requires bounded task execution, redacted artifacts, failure records, and no
launch without an explicit `--execute` opt-in. That CLI is absent. In addition,
`scripts/lib/gaia-ab-eval/live-runner.mjs` stops after a successful browser
preflight with `GAIA live task execution is not implemented yet`.

Impact: the current implementation correctly prevents unsafe calls, but it
cannot satisfy the user goal of starting an actual A/B run. No model task can
be launched, capped, redacted, persisted, or scored through this path.

Recommended fix: add tests and implementation for a local task-manifest reader
with digest verification, explicit CLI `--execute` handling, per-task process
adapter timeout and cost ledger, redacted artifact writes, and fail-closed arm
termination. Keep actual client invocation behind the resulting tested gate.

## Verified Boundaries

- The focused gate test passed with receipt
  `receipt:39d604e4-a548-4ac2-9482-e7aa66517c28`.
- The runner does not silently call a model after a successful browser
  preflight; it fails closed instead.
