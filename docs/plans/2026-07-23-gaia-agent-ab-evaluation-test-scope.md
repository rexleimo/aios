# GAIA Agent A/B Evaluation Test Scope

## User Goal

Measure whether the workflow change from broad, always-injected guidance to
compact, client-neutral, pull-based guidance improves end-to-end agent
performance. The evaluation runs the two context policies separately for each
selected client/model pair:

| Client | Model selection | Result boundary |
| --- | --- | --- |
| Codex | Record the exact runtime model identifier before a live run. | Codex-only result set. |
| Claude | Record the exact runtime model identifier before a live run. | Claude-only result set. |
| Hermes | `--model deepseek-v4-pro` | Hermes/DeepSeek-only result set. |

The harness compares policy A (the historical broad context) and policy B (the
current compact, client-neutral, pull-based context) using the same task,
tools, browser/search environment, retry policy, timeout, and concurrency for
both arms of each client/model pair.

## Explicit Non-Goals

- Do not make live or paid model calls before the user approves a total budget,
  per-task timeout, and the exact Codex and Claude model identifiers.
- Do not upload either local A/B arm to the GAIA private test leaderboard. Only
  the eventual winning configuration may be submitted once, under the
  leaderboard's account and submission rules.
- Do not aggregate scores across Codex, Claude, and Hermes/DeepSeek. Each
  client/model pair has an independent conclusion.
- Do not train on, republish, or otherwise redistribute GAIA development data.
- Do not claim a GAIA score delta proves a base model's inherent intelligence;
  GAIA measures the configured agent, tools, and operating environment.

## Observable Acceptance Mapping

| Behavior | Public assertion | Test seam |
| --- | --- | --- |
| The manifest describes a fair A/B pair | Configuration validation rejects missing A or B, unequal task selection, or mismatched execution controls within one client/model pair. | Public configuration parser/validator. |
| The selected model is unambiguous | A live manifest rejects missing Codex or Claude model IDs and rejects a Hermes model other than `deepseek-v4-pro`. | Public configuration validator. |
| Client results are isolated | Output paths and report rows are keyed by client/model pair; a combined cross-model accuracy is never emitted. | Artifact writer and report builder. |
| GAIA answers are scored consistently | The scorer emits accuracy overall and separately for levels 1, 2, and 3 using the official answer-normalization rules. | Pure scorer function with fixtures. |
| Improvement claim is paired and bounded | The report includes paired task outcomes, a paired statistical result (for example McNemar), confidence information, and an explicit inconclusive state where evidence is insufficient. | Pure report builder with deterministic paired fixtures. |
| Live execution requires explicit controls | Live mode rejects an absent explicit budget or per-task timeout before it invokes a client command. | CLI argument validation with a mocked process runner. |

## Public Test Seams

The future public entry point is `scripts/gaia-ab-eval.mjs`. It will separate
network and client-process adapters from pure functions so unit tests can cover
the contract without an API key, model endpoint, browser, or paid invocation:

- `parseGaiaAbConfig` validates the client/model and A/B-pair contract.
- `scoreGaiaAnswers` applies GAIA-compatible normalization and produces
  overall and per-level results.
- `buildGaiaAbReport` produces isolated per-client/model paired results.
- `runGaiaAbEvaluation` accepts injected client and process adapters; tests use
  inert fakes and assert that live-mode guards run before an adapter is called.

Focused tests will live under `scripts/tests/` and import these public seams.
No unit test is allowed to call a model endpoint, submit to Hugging Face, or
assume a browser/search tool is available.

## Completion Criteria

The completed implementation must provide a reproducible local manifest and
isolated JSONL/result artifacts for each selected client/model pair, run the
focused offline tests, and refuse unsafe live execution before a client command
is started. A full GAIA tool-use run additionally requires a common working
browser/search environment across both arms; its absence is reported as an
environmental block rather than silently comparing unequal capabilities.
