# GAIA Agent A/B Evaluation Refactor and Test Review

## Refactor Check

No extra refactor was needed after the minimal GREEN change. The new CLI reuses
the repository's `createCliParser` instead of introducing another argument
parser. It exposes help only and exits before any model, dataset, browser, or
leaderboard adapter could be invoked.

The declared public scenario remains green:

`node scripts/gaia-ab-eval.mjs --help`

Receipt: `receipt:878663ce-d516-4e34-bb89-1ec0523f2762` (exit 0).

## Test Diff Review

`scripts/tests/gaia-ab-eval.test.mjs` runs the real public process entry point
and asserts its successful help behavior plus the `--config` and `--dry-run`
interface. It does not mock an internal function, assert implementation call
counts, weaken the expected exit status, or reach an external endpoint.

The focused test remains green:

`node --test scripts/tests/gaia-ab-eval.test.mjs`

The test therefore preserves the user-visible offline-entry contract recorded
in the test scope. Future configuration validation, scoring, and live-mode
guard behavior require their own public tests before they are implemented.
