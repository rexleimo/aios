# GAIA Live A/B Actual-Spend Breach RED Observation

## Declared Public Scenario

`node --test scripts/tests/gaia-ab-live-runner.test.mjs`

Declared scenario receipt: `receipt:1e69833d-4112-4be1-acc5-01964f1b1d7d`

## Expected Behavior

When the first fake client reports 11 USD after receiving the 10 USD bound, the
runner writes one redacted `spend_limit_breach` artifact, returns a global
terminal state with zero remaining spend, and performs no more client launches.

## Observed RED

The scenario exits with code 1. Its first assertion sees 11 launches rather
than 1; later jobs continued after the over-limit reported result.

## Failure Classification

The failure is the requested global fail-closed behavior delta. The current
result-spend check enters the ordinary per-arm terminal catch, so it does not
make the budget breach terminal. Inputs are temporary local task text and fake
adapters; no external client, browser, credential, network, dataset, or
leaderboard service is involved.
