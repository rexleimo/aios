# Workflow Intelligence Diagnostic: Claude BBH-20 Attempt

## Scope and integrity boundary

This was a controlled, non-GAIA, no-browser workflow-guidance A/B attempt.
It does not measure inherent model intelligence, does not submit to any
leaderboard, and cannot be reported as a GAIA result.

The intended comparison was a single Claude Code `claude-sonnet-5` call per
arm. The only policy difference was the committed `AGENTS.md` source injected
through standard input. The model prompt did not contain either arm label.

| Arm | Committed policy ref | Policy SHA-256 |
| --- | --- | --- |
| Baseline | `c3b9197853bfb93ec264b03a838162cca9a035c4:AGENTS.md` | `77850723dfaf7d679fe26a92ad5a09e7db34b58bf849355ae68047b2825624ae` |
| Optimized | `4a77ad3d0eb0c5e2043bd9aaea91e3107d6210e9:AGENTS.md` | `edfc8a4c6dd0d54e37dda0c9532900ad66dc132a98bf01da7d99d7cb5a56c601` |

## Fixed BBH-20 task set

The public BIG-Bench Hard JSON files were read from
`suzgunmirac/BIG-Bench-Hard`. The deterministic selection rule was the first
four examples from each source file. Answers remained on the local scoring
side and were never included in the model prompt.

| Task | Examples selected | Source SHA-256 |
| --- | ---: | --- |
| `boolean_expressions` | 4 / 250 | `ea6c754ec005e2d3f2d085d349a740f593b5764f32ea4638ffed4cfc0061b12a` |
| `date_understanding` | 4 / 250 | `0148d4ac5fca05b2f82373e5fef7208e15363b9c6079493034d77b3dab496bf5` |
| `logical_deduction_five_objects` | 4 / 250 | `d2df31394b903b7f0e085d42a69572a092987856eac076799017d70ef266fa8f` |
| `multistep_arithmetic_two` | 4 / 250 | `c9d5a6433c9b78256422a15c78463949c8bec8d85607aa28b52d7234ad4a8595` |
| `tracking_shuffled_objects_three_objects` | 4 / 250 | `546cc7bf10c6a01a6a4c17ae28a4966485f21f29fd5d111f37858ec78e354f6b` |

The local full task-manifest digest was
`d5494361612c6fe96e69684cef63f524776836744dfee81927ab222c32bb5f3d`.
The answer-free question payload digest was
`a544aabaaa7b6d086b350730a9f2437285e6de8c575145dcbed61b5d6ae64293`.

## Controls

| Control | Value |
| --- | --- |
| Client / model | npm-native Claude Code `2.1.217` / `claude-sonnet-5` |
| Working directory | Newly-created isolated temporary directory |
| Tools | Explicitly prohibited: tools, files, browsers, network, and external services |
| Timeout | 55 seconds hard timeout per arm |
| Cost cap | `--max-budget-usd 0.50` per arm; 1.00 USD total reservation |
| Output contract | One JSON object with a 20-string `answers` array |
| Scoring | Exact answer-string comparison against local BBH targets |

## Execution result

The baseline process returned no model JSON and no answer array. The local
timeout marker fired at 55 seconds, but the Windows process tree did not close
until 75.186 seconds. Its exit code was zero after termination and stderr was
empty. The Claude JSON envelope, including `total_cost_usd`, was absent.

| Arm | Exit code | Timeout marker | Observed wall time | Reported cost | Score |
| --- | ---: | --- | ---: | --- | --- |
| Baseline | 0 | Yes | 75.186 s | unavailable | unavailable |
| Optimized | not run | n/a | n/a | n/a | n/a |

The optimized arm was deliberately not started. A retry would be a new paid
request, while the baseline call has no returned accounting record. Although
the request's CLI cap bounded that call at 0.50 USD, its actual charge cannot
be proven from the local result.

## Interpretation

There is no BBH accuracy result from this attempt. In particular, it provides
no evidence that the optimized workflow improved, preserved, or reduced task
quality. The only confirmed finding is a runner-observability failure: the
current Windows `.cmd` launch-and-kill path does not yield a bounded,
cost-auditable result for this 20-question call.

Before another paid comparison, validate the process supervisor against a
deliberately long-running local fixture, require an observable kill deadline,
and settle or explicitly re-authorize the remaining experiment budget. Then
run both arms with the same corrected supervisor and score the paired answers
locally.

VERDICT:
FILES_REVIEWED:
  - `AGENTS.md` at `c3b9197853bfb93ec264b03a838162cca9a035c4`: policy source reviewed (unchanged committed input)
  - `AGENTS.md` at `4a77ad3d0eb0c5e2043bd9aaea91e3107d6210e9`: policy source reviewed (unchanged committed input)
  - `docs/reports/2026-07-23-workflow-intelligence-diagnostic-claude-live-smoke.md`: lines 1-57 reviewed as prior experiment context (unchanged)
  - `docs/reports/2026-07-23-workflow-intelligence-diagnostic-claude-bbh20-attempt.md`: lines 1-80 added (execution evidence)
CHECKS:
  - `rtk curl.exe -fsSL -I --max-time 15 https://raw.githubusercontent.com/suzgunmirac/BIG-Bench-Hard/main/bbh/boolean_expressions.json`: PASS (HTTP 200)
  - read-only Node BBH schema and SHA-256 validation for all five sources: PASS (5 files, 250 examples each)
  - `rtk node --input-type=module -e <cmd.exe call Claude --version probe>`: PASS (`2.1.217 (Claude Code)`)
  - controlled baseline Claude BBH-20 call: FAIL (timeout marker, no JSON envelope, no `total_cost_usd`)
  - `rtk node --test scripts/tests/workflow-diagnostic-ab.test.mjs`: PASS (1/1)
  - `rtk node scripts/aios.mjs doctor`: PASS (exit 0; pre-existing browser-use path error remains out of scope for this no-browser diagnostic)
CODE:
  > {"exitCode":0,"timedOut":true,"durationMs":75186,"costUsd":null,"answers":null,"error":"timeout"}
VALIDATION:
  REJECTED - next_actions: validate a Windows process-tree supervisor with a local over-time fixture; obtain auditable accounting or explicit budget re-authorization; then rerun both arms and score all 20 paired answers locally.
