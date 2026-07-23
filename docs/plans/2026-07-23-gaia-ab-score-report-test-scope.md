# GAIA A/B Score and Report Test Scope

## User Goal

Evaluate the workflow context-policy A/B result for each independent selected
model pair. The current run registration is Codex with `gpt-5.6-terra`, Claude
Code with `claude-sonnet-5`, and Hermes with `deepseek-v4-pro`. Local answer artifacts
must be scored with the GAIA public scorer's number, list, and normalized-string
behavior, then reported overall and by levels 1, 2, and 3.

## Explicit Non-Goals

- Do not combine accuracy, task outcomes, or a statistical conclusion across
  Codex, Claude, and Hermes/DeepSeek.
- Do not infer a base model's inherent intelligence from a GAIA agent result.
- Do not invoke a model, use a credential, download GAIA data, open a browser,
  or upload a leaderboard submission.
- Do not claim statistical significance from a small raw delta; reports must
  clearly return an inconclusive status where paired evidence is insufficient.

## Acceptance Mapping

| Behavior | Public assertion | Seam |
| --- | --- | --- |
| Official-compatible answer comparison | Fixture answers cover exact numeric conversion, ordered list matching, and whitespace/punctuation-normalized strings. | Pure scorer function. |
| Score breakdown is inspectable | A result fixture produces overall and L1/L2/L3 accuracy for one client/model pair. | Pure score summary function. |
| A/B conclusion is paired | Matching task IDs produce baseline/optimized paired outcomes and an explicit conclusion status, including inconclusive. | Pure report builder. |
| Results stay per model | Supplying more than one client/model pair returns one report section per pair and rejects a combined accuracy field. | Pure report builder. |
| Artifact errors are not hidden | Duplicate task IDs, unknown levels, or mismatched A/B task sets fail before a report is emitted. | Pure parser/validator. |

## Public Test Seams

- `scripts/lib/gaia-ab-eval/scorer.mjs` will expose pure answer normalization,
  correctness, and score-summary functions.
- `scripts/lib/gaia-ab-eval/report.mjs` will expose pure pair validation and
  report construction functions.
- Tests under `scripts/tests/` will import only these public modules and use
  inline local fixtures. No test invokes the CLI client, a network source, or
  GAIA data download.

## Completion Criteria

Focused scorer/report tests must verify GAIA-compatible comparison, per-level
and per-model isolation, and an explicit paired inconclusive result. The slice
delivers only offline computation; it is not an A/B experiment result until
the user supplies exact client model IDs, a common tool environment, budget,
timeout, and explicit live-run authorization.
