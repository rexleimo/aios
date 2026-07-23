# GAIA Agent A/B Evaluation Standards and Specification Review

## Reviewed Scope

- `scripts/gaia-ab-eval.mjs`
- `scripts/tests/gaia-ab-eval.test.mjs`
- the `test:scripts` command in `package.json`
- the recorded GAIA A/B test-scope contract

## Standards Review

### P1: the new public CLI regression is omitted from the repository test script

Evidence: `package.json:30` enumerates every `test:scripts` input explicitly,
but does not include `scripts/tests/gaia-ab-eval.test.mjs`. The focused test
passes when run directly, but the repository-required `npm run test:scripts`
will not execute this new behavior check.

Impact: a future regression in the GAIA entry point can pass the normal script
verification without running its only public regression test.

Fix: add `scripts/tests/gaia-ab-eval.test.mjs` to the explicit `test:scripts`
file list, then run the focused test and the standard repository script at the
appropriate implementation milestone.

### Passed standards checks

- The source and test use the repository's ESM style, two-space indentation,
  semicolons, and the shared `createCliParser` abstraction.
- The test invokes the public Node entry point; it does not use mocks or
  assert a private implementation detail.
- `git diff --check` reports no whitespace errors for tracked changes.

## Specification Review

The implemented slice meets only the initial public-entry acceptance: `--help`
is available and documents `--config` and `--dry-run`; the declared public
scenario passes with receipt `receipt:878663ce-d516-4e34-bb89-1ec0523f2762`.

The full GAIA A/B specification is intentionally still incomplete. In
particular, there is not yet a manifest validator, client/model isolation,
GAIA answer scorer, level breakdown, paired statistical report, or a live-mode
budget and timeout guard. `scripts/gaia-ab-eval.mjs:21` accurately rejects all
non-help invocations, so these missing behaviors are not hidden behind an
unsafe partial live path.

Before any future live run, the run manifest must retain Hermes as
`deepseek-v4-pro` and record exact runtime model identifiers for Codex and
Claude. The current review found no path that can invoke a model endpoint,
download GAIA data, access a browser, or submit a leaderboard result.

## Review Verdict

Do not claim the evaluation harness is complete. Resolve the P1 test-suite
registration issue before broader verification, then implement and test the
remaining acceptance rows in bounded slices.
