# GAIA A/B Manifest Validation Test Scope

## User Goal

Provide an offline, reproducible manifest validation step for three independent
GAIA A/B evaluation units:

- Codex with a required non-empty runtime model identifier.
- Claude with a required non-empty runtime model identifier.
- Hermes with model exactly `deepseek-v4-pro`.

Each unit must compare the same model and execution controls between the
historical broad-context baseline arm and the current pull-based optimized arm.

## Explicit Non-Goals

- Do not invoke Codex, Claude, Hermes, DeepSeek, or any other model endpoint.
- Do not load, download, train on, republish, score, or submit GAIA data.
- Do not launch a browser, search service, or Hugging Face session.
- Do not accept absent, placeholder, or unconfirmed Codex and Claude model IDs
  for a future live run.
- Do not aggregate accuracy or any other score across model families.

## Acceptance Mapping

| Behavior | Public assertion | Seam |
| --- | --- | --- |
| A valid selected-client manifest is reproducible | `--config <valid.json> --dry-run` exits 0 and prints one independent summary entry for Codex, Claude, and Hermes. | Public CLI process. |
| Hermes remains pinned | A manifest whose Hermes model differs from `deepseek-v4-pro` exits nonzero with a model-policy error. | Public CLI process. |
| A/B arms are fair within one model | A manifest with a differing task, tool, browser, timeout, retry, or concurrency control exits nonzero and identifies the mismatched control. | Public CLI process backed by pure manifest validator. |
| Model results remain separate | A manifest that enables `aggregateAcrossModels` exits nonzero before any external adapter could be reached. | Public CLI process backed by pure manifest validator. |
| Normal repository verification includes the new behavior | `npm run test:scripts` explicitly includes `scripts/tests/gaia-ab-eval.test.mjs`. | Root package script. |

## Public Test Seams

- `scripts/gaia-ab-eval.mjs` is the only CLI seam. Tests launch it with a
  temporary JSON file and `--dry-run`.
- `scripts/lib/gaia-ab-eval/manifest.mjs` will expose a pure validator for
  direct edge-case coverage where a process assertion alone would obscure the
  failure reason.
- File reads are injected or performed against temporary local files only. No
  test is permitted to invoke a model, browser, dataset source, or leaderboard
  service.

## Completion Criteria

The focused public tests pass, the new test is registered in `test:scripts`,
and valid dry-run output proves only local parsing and validation occurred. A
successful result is an offline manifest check, not a GAIA score or a claim of
model intelligence improvement.
