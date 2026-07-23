# GAIA A/B Manifest Validation Standards and Specification Review

## Reviewed Scope

- `scripts/lib/gaia-ab-eval/manifest.mjs`
- `scripts/gaia-ab-eval.mjs`
- `scripts/tests/gaia-ab-eval.test.mjs`
- `scripts/tests/fixtures/gaia-ab-eval-valid.json`
- `package.json` test lifecycle registration

## Standards Review

The implementation follows the repository's ESM, two-space indentation, and
shared CLI-parser conventions. The pure manifest policy is separated from the
CLI's file I/O, and `git diff --check` reports no tracked whitespace errors.
The focused public test uses a real child process and local temporary files;
it has no mock model, browser, or network dependency.

`npm run test:scripts` completed with exit 0, including the five GAIA tests in
`pretest:scripts`, and the full suite reported 833 passing, 0 failing, and 8
skipped tests.

## Specification Findings

### P1: five required A/B controls are not independently protected by tests

Evidence: `manifest.mjs` compares six fields in `CONTROL_FIELDS`, but
`gaia-ab-eval.test.mjs` mutates only `concurrency`. A regression that stops
comparing `taskSet`, `toolProfile`, `browserProfile`, `timeoutSeconds`, or
`retryPolicy` would still pass every current GAIA test.

Impact: the evaluator could accept an unfair A/B pair and report a workflow
effect when the task corpus, tools, browser state, timeout, or retry policy
actually changed.

Fix: make the public rejection test parameterized over every required control
field, asserting an observable error for each changed value.

### P1: missing Codex and Claude model IDs lack an observable rejection test

Evidence: `validateGaiaAbManifest` calls `assertNonEmptyString` for each run's
model, but no public test clears either the Codex or Claude model from the
valid fixture.

Impact: a future regression could admit an unpinned Codex or Claude run,
breaking reproducibility and making a later live result impossible to
attribute to a model version.

Fix: parameterize a public test over Codex and Claude model removal and assert
that the CLI rejects each manifest before it can reach any execution adapter.

## Passed Specification Boundaries

- Hermes model drift is publicly rejected unless it equals `deepseek-v4-pro`.
- A valid manifest produces separate client entries and disallows
  `aggregateAcrossModels: true`.
- Only `--dry-run` is accepted; no code path invokes a client, GAIA data,
  browser, or leaderboard service.

## Review Verdict

The offline implementation is safe, but the two P1 test gaps must be fixed
before it can be treated as sufficient evidence for a fair multi-model A/B
configuration.

## Resolution

The follow-up guarded test change parameterized the public control-mismatch
test over all six required fields and added public rejection checks for empty
Codex and Claude model values. `node --test scripts/tests/gaia-ab-eval.test.mjs`
now passes 6 tests, and `npm run pretest:scripts` passes with the same GAIA
tests executed through the normal `test:scripts` lifecycle.
