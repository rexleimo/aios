# GAIA Live A/B Execution Layer Standards and Specification Review

## Review Scope

Reviewed the bounded execution diff in `live-runner.mjs` and
`live-artifacts.mjs` against the repository's ESM/strict-style conventions and
the acceptance mapping in `2026-07-23-gaia-ab-live-execution-layer-test-scope.md`.
The test continues to use only temporary local data and injected fakes; no
default model, browser, network, dataset, or leaderboard route was added.

## Standards Review

No standards finding in the accepted GREEN slice.

- The public entry remains one small exported function with explicit adapter
  dependencies rather than hidden global client state.
- Node built-ins use ESM imports and the persistence logic is encapsulated in
  `live-artifacts.mjs` instead of duplicating whitelist logic in the runner.
- Artifacts are constructed from named fields only. The prompt and arbitrary
  adapter fields, including the test's `authorization` value, are not copied.

## Specification Findings

### P1: Digest rejection occurs after browser preflight

- Location: `scripts/lib/gaia-ab-eval/live-runner.mjs:129-140`
- Evidence: the runner invokes `browserPreflight` before `loadTasks`, while the
  accepted test scope requires a SHA-256 mismatch to reject before browser or
  client adapters run.
- Impact: a tampered local task manifest can still invoke the browser boundary,
  which violates the declared integrity-first gate even though no model launch
  occurs.
- Fix: add a public test with a bad digest and spy adapters, then load and
  validate the task text before browser preflight.

### P1: A task failure terminates the whole A/B batch, not only its arm

- Location: `scripts/lib/gaia-ab-eval/live-runner.mjs:183-192`
- Evidence: after writing a redacted failure artifact, the catch block rethrows
  the error. This exits both loops and prevents later client/model/arm jobs.
- Impact: a timeout, cost-limit failure, or client error cannot leave other
  isolated arms unchanged as required by the acceptance mapping; it also makes
  paired A/B results less informative than the declared design.
- Fix: add public failure-path tests, record an arm-level terminal outcome, and
  continue with the next isolated job while preserving the global spend limit.

### P2: Only the successful vertical slice is currently exercised

- Location: `scripts/tests/gaia-ab-live-runner.test.mjs:159-189`
- Evidence: the test proves successful cap, timeout, redaction, and scoring,
  but does not assert the planned bad-digest, insufficient-spend, timeout, or
  client-error outcomes.
- Impact: the acceptance rows for integrity ordering and per-arm failure
  isolation remain unverified.
- Fix: extend the same public fake-adapter seam with one independently failing
  behavior slice at a time before broadening to real adapters.

## Review Conclusion

The GREEN implementation meets the narrow successful execution slice, but the
work item is not specification-complete. The P1 findings should be routed back
through test design and TDD before any real-operator smoke is considered.
