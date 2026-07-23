# Rex Projection Semantic Parity Standards and Specification Review

## Review Inputs

- P5 public contract: `docs/plans/2026-07-22-rex-api-outcome-dependency-hardening-test-scope.md`
- Current scope and execution plan: the matching projection-semantic-parity
  test-scope and execution-plan artifacts
- Nested Rex changes: compact output, standalone store, and standalone CLI test
- Root change: AIOS adapter parity test

## Standards Review

Reviewed the changed source and public tests for the nested package boundary,
compact CLI responsibility, test ownership, duplicate abstractions, mutation
scope, and error behavior.

Findings: none.

- The CLI remains a projection only; it neither chooses a Capability nor
  validates evidence.
- The standalone store forwards an existing core field without importing AIOS
  code or duplicating workflow rules.
- The typed-rejection condition has a narrow comment and preserves the existing
  accepted-partial-evidence token rotation behavior.
- The adapter test uses the public Rex and AIOS APIs and does not implement a
  host scheduler or inspect private state.
- `git diff --check` passed in the root and nested repositories.
- `npm test` in `rex-harness` passed all 109 tests; `npm run doctor` reported
  `ready`; `npm run test:rex-integration` passed all 31 root integration tests.

## Specification Review

Findings: none.

| Contract behavior | Review evidence |
| --- | --- |
| Compact CLI retains typed blocked reason | Direct scenario receipt and standalone CLI regression test. |
| Standalone public CLI retains Rex semantics | Regression asserts outcome, reason, status, identities, command token, and missing evidence after a real wrong-scenario receipt. |
| Rejected evidence preserves current command | The standalone regression compares the returned token to the TDD token. |
| AIOS does not reinterpret Rex result | Adapter test compares the direct public Rex result to the AIOS result, excluding only the executable Provider binding. |
| Compatibility and non-goals | Existing standalone tests, all Rex tests, and root Rex integration tests pass; no routing, dependency, Provider-selection, or storage migration behavior changed. |

## Verification Limitation

The broad `npm run test:scripts` command contains 69 sequential root suites and
did not complete within two local execution windows (64 seconds and 184
seconds), with no failure output before timeout. This is not treated as a pass.
The directly affected root integration group completed successfully; a caller
with a longer uninterrupted window should run the broad command before release.
