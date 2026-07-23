# GAIA A/B Score and Report Standards and Spec Review

## Reviewed Scope

- `scripts/lib/gaia-ab-eval/scorer.mjs`
- `scripts/lib/gaia-ab-eval/report.mjs`
- `scripts/tests/gaia-ab-score-report.test.mjs`
- `package.json` GAIA pretest registration
- `docs/plans/2026-07-23-gaia-ab-score-report-test-scope.md`

## Standards Review

No standards findings.

The code keeps pure scoring and paired reporting in separately owned modules,
uses the repository's ESM and two-space style, has no unnecessary framework or
external runtime dependency, and exposes narrow functions used directly by the
focused tests. The test registration adds only the new focused test to the
existing GAIA pretest entry.

## Specification Review

### P2: String normalization leaves currency and other symbol characters

`scripts/lib/gaia-ab-eval/scorer.mjs` normalizes non-numeric strings with
`[\s\p{P}]`, which removes Unicode punctuation but leaves symbols such as `$`.
The local observation `isGaiaAnswerCorrect('cost $100', 'cost 100')` returns
`false`. The test scope requires GAIA-compatible whitespace and punctuation
normalization; GAIA's reference normalization removes non-word characters, so
this can produce a false-negative score for an otherwise equivalent string
answer.

Impact: an affected answer changes a per-level, per-model, and paired A/B
outcome, so a small score error can be presented as a workflow-policy delta.

Recommended fix: normalize all non-word characters in the string path (or add
Unicode symbols to the removal class) and add a public test covering a string
containing `$`. Keep numeric comparison behavior unchanged.

## Verified Boundaries

- No model, browser, network, credential, GAIA download, or leaderboard path
  appears in the changed modules or tests.
- Reports remain individual client/model sections and do not expose a
  cross-model aggregate.
- The declared focused test passed with receipt
  `receipt:50909fef-148e-4199-bc0b-bcdab9d878e4`.
