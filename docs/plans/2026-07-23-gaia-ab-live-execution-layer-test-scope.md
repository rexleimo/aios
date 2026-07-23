# GAIA Live A/B Execution Layer Test Scope

## User Goal

After the tested live gate succeeds, run bounded GAIA tasks through the selected
Codex, Claude Code, and Hermes client/model pairs while preserving common tool
controls and local-only, redacted evidence. The first real operator smoke is
one task per GAIA level for one client/model pair; it must not expand to other
arms until its artifacts and score are reviewed.

## Explicit Non-Goals

- Do not make a real model, browser, network, dataset, or leaderboard request
  from automated tests.
- Do not submit to the GAIA leaderboard.
- Do not place a credential, cookie, API key, raw authorization log, or an
  unredacted environment value in task files, config, artifacts, or reports.
- Do not launch a client without `--execute`, successful common browser
  preflight, a verified local task-manifest digest, a positive task cap, a
  positive spend cap, and a positive per-task timeout.
- Do not continue the affected arm after a timeout, cost-limit failure, task
  digest mismatch, or client error.

## Acceptance Mapping

| Behavior | Public assertion | Stable seam |
| --- | --- | --- |
| Local task integrity | A task file whose SHA-256 differs from the configured digest rejects before browser or client adapters run. | Task-loader adapter. |
| Explicit execution | The public CLI requires `--execute`; without it it returns a dry-run plan and does not launch. | CLI subprocess with fake configuration. |
| Bounded launch | An execute-mode fake adapter receives the declared task timeout and remaining spend; only deterministic first `maxTasks` tasks are selected. | Public runner with injected task/client adapters. |
| Spend guard | An estimated task cost above remaining spend prevents the launch and records a redacted failure for that arm. | Fake estimator/client and temporary artifacts. |
| Timeout/client failure | A rejected or timed-out task records a redacted failure, stops only that arm, and leaves other configured arms unchanged. | Fake client adapter and temporary artifacts. |
| Redacted evidence | Successful and failed task outcomes create one local JSON artifact per client/model/arm/task without secret-bearing fields. | Temporary artifact directory. |
| Score compatibility | Successful artifacts retain task ID, GAIA level, expected answer, and actual answer in a shape consumable by `summarizeGaiaScores`. | Existing public scorer. |
| No submission path | The public CLI/config contain no leaderboard URL, upload adapter, or submission option. | CLI help and runner inspection test. |

## Public Test Seams

- `scripts/gaia-ab-live-runner.mjs` will accept `--config`, `--dry-run`, and
  the explicit `--execute` flag. It will never infer execute mode from config.
- `scripts/lib/gaia-ab-eval/live-runner.mjs` will accept injected local file,
  browser-preflight, task-cost-estimator, task-client, clock, and artifact
  adapters. Its default production adapters will be added only after public
  module behavior is covered.
- `scripts/lib/gaia-ab-eval/live-artifacts.mjs` will own deterministic local
  record shape and redaction. It will not own scoring or client selection.
- `scripts/tests/gaia-ab-live-runner.test.mjs` will use a temporary task file,
  digest, and temporary artifact directory with fake adapters; it will not use
  a real CLI client or browser.

## Minimum Vertical Slice

The first independently failing slice executes exactly one task through one
fake client after a ready fake browser preflight and writes a redacted local
artifact. It is sufficient because it simultaneously proves task integrity,
explicit execution, timeout/spend propagation, artifact isolation, and scoring
shape without allowing an external request.

## Completion Criteria

Focused tests cover every acceptance row. The operator can invoke a real
one-client three-level smoke only after the live browser preflight is healthy,
the selected client reports the configured model, and a user-reviewed local
config supplies digest, task cap, spend cap, timeout, artifact directory, and
the explicit `--execute` argument.
