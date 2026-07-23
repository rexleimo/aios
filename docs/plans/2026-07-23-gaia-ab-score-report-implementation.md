# GAIA A/B Score and Report Implementation

## Changed Ownership Areas

- `scripts/lib/gaia-ab-eval/scorer.mjs` owns pure GAIA-compatible answer
  comparison and overall/L1/L2/L3 score summaries.
- `scripts/lib/gaia-ab-eval/report.mjs` owns validation and paired baseline /
  optimized reporting for each independently selected client/model pair.
- `scripts/tests/gaia-ab-score-report.test.mjs` exercises the public pure-module
  seam with inline local artifacts only.
- `package.json` registers the focused score/report test in the normal script
  pretest lifecycle alongside manifest validation.

## Minimal Behavior Change

The scorer compares numeric answers after removing `$`, `%`, and commas;
compares comma/semicolon lists by normalized ordered elements; and compares
other answers after lowercasing and removing whitespace and punctuation. It
rejects duplicate task IDs and levels outside 1, 2, and 3.

The report builder returns a separate report per client/model pair, verifies
that each baseline and optimized arm has the same task IDs, and records paired
improvements, regressions, both-correct, and both-incorrect outcomes. It emits
an explicit `inconclusive` conclusion because this offline layer has no
configured statistical decision rule. It intentionally produces no
cross-model aggregate.

No model client, credential, browser, network source, GAIA download, or
leaderboard submission path was added.

## Verification

Declared public scenario:

`node --test scripts/tests/gaia-ab-score-report.test.mjs`

Receipt: `receipt:c8606cb6-8ff5-4967-9cfd-b2b45c7d6d2e` (exit 0).

Focused result: 4 passed, 0 failed.

Adjacent GAIA test command:

`node --test scripts/tests/gaia-ab-eval.test.mjs scripts/tests/gaia-ab-score-report.test.mjs`

Result: 10 passed, 0 failed.

Repository pretest lifecycle:

`npm run pretest:scripts`

Result: exit 0; it ran 10 GAIA tests, 63 workflow-policy tests, 109 rex-harness
tests, and 31 Rex integration tests with no failures.
