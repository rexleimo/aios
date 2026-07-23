# Workflow Intelligence Diagnostic: Codex BBH-20 A/B

## Scope and integrity boundary

This is a small, controlled, non-GAIA diagnostic. It compares the effect of
two committed workflow-guidance documents on one configured Codex client. It
does not measure inherent model intelligence, does not submit to a leaderboard,
and is not a GAIA result.

The valid calls differed only in the committed `AGENTS.md` text supplied through
standard input. Neither prompt included the words `baseline` or `optimized`.

| Arm | Committed policy ref | Policy SHA-256 |
| --- | --- | --- |
| Baseline | `c3b9197853bfb93ec264b03a838162cca9a035c4:AGENTS.md` | `77850723dfaf7d679fe26a92ad5a09e7db34b58bf849355ae68047b2825624ae` |
| Optimized | `4a77ad3d0eb0c5e2043bd9aaea91e3107d6210e9:AGENTS.md` | `edfc8a4c6dd0d54e37dda0c9532900ad66dc132a98bf01da7d99d7cb5a56c601` |

## Protocol

| Control | Value |
| --- | --- |
| Client / model | Codex CLI `0.145.0` / `gpt-5.6-terra` |
| Task set | 20 public BBH questions: first four examples from each of five fixed source files |
| Question-payload SHA-256 | `a544aabaaa7b6d086b350730a9f2437285e6de8c575145dcbed61b5d6ae64293` |
| Working directory | One fresh isolated temporary directory shared by both valid arms |
| Tools | Explicitly prohibited: tools, files, browsers, network, and external services |
| CLI isolation | `--sandbox read-only --skip-git-repo-check --ephemeral --ignore-rules` |
| Timeout | 55 seconds per arm |
| Output / scoring | A 20-string JSON `answers` array; exact comparison with local BBH targets |

The source files, each containing 250 examples, were digest-pinned before
calling the model:

| Task | Source SHA-256 |
| --- | --- |
| `boolean_expressions` | `ea6c754ec005e2d3f2d085d349a740f593b5764f32ea4638ffed4cfc0061b12a` |
| `date_understanding` | `0148d4ac5fca05b2f82373e5fef7208e15363b9c6079493034d77b3dab496bf5` |
| `logical_deduction_five_objects` | `d2df31394b903b7f0e085d42a69572a092987856eac076799017d70ef266fa8f` |
| `multistep_arithmetic_two` | `c9d5a6433c9b78256422a15c78463949c8bec8d85607aa28b52d7234ad4a8595` |
| `tracking_shuffled_objects_three_objects` | `546cc7bf10c6a01a6a4c17ae28a4966485f21f29fd5d111f37858ec78e354f6b` |

The targets remained in the local scorer and were not put in either model
prompt.

## Valid A/B result

| Metric | Baseline | Optimized | Difference |
| --- | ---: | ---: | ---: |
| Correct answers | 18 / 20 (90%) | 18 / 20 (90%) | 0 / 20 |
| Observed wall time | 29.497 s | 31.395 s | +1.898 s |
| Timeout | No | No | n/a |
| Tool events | 0 | 0 | 0 |
| Answer array | Valid 20 strings | Valid 20 strings | Identical to baseline |

| BBH task family | Baseline | Optimized |
| --- | ---: | ---: |
| Boolean expressions | 4 / 4 | 4 / 4 |
| Date understanding | 3 / 4 | 3 / 4 |
| Logical deduction, five objects | 4 / 4 | 4 / 4 |
| Multistep arithmetic | 4 / 4 | 4 / 4 |
| Tracking shuffled objects | 3 / 4 | 3 / 4 |

Both valid calls made the same two errors: `date_understanding-3` returned
`(C)` instead of `(B)`, and `tracking_shuffled_objects_three_objects-2`
returned `(C)` instead of `(A)`. All remaining 18 answers matched exactly.

The baseline Codex JSON event stream reported 46,690 input tokens, 1,390 output
tokens, and 1,236 reasoning-output tokens. A directly comparable cost figure is
not emitted by this authenticated Codex CLI run, so no cost delta is claimed.

## Excluded attempts

Two non-scored runtime attempts were excluded rather than mixed into the A/B
result:

1. A preliminary baseline call completed in 31.704 seconds, but a local JSONL
   parser bug treated the event stream as one JSON document. Its answer output
   was not recoverable, so it was not scored.
2. The first optimized call produced no final message before the timeout path.
   Its 55-second timer fired, while Windows retained a descendant output handle
   until 106.711 seconds. It was discarded and retried with the CLI's temporary
   `--output-last-message` artifact; the retry above completed within the same
   55-second limit.

These exclusions do not alter either valid answer array. They are recorded to
avoid presenting a transport or parser failure as a model score.

## Conclusion

For this fixed 20-question, single-run-per-arm diagnostic, the optimized
guidance showed **no observed quality improvement and no observed quality
regression**: both arms obtained the same 18/20 answers. The appropriate result
is **not improved in this small measurement**, not a claim that the underlying
model did not improve or that the workflow can never improve other tasks.

The sample is intentionally too small for a statistical intelligence claim:
the questions are a deterministic public slice, there is one successful run
per arm, and no randomized repetition. A stronger conclusion would require a
larger pre-committed task set, several paired repeats, and a specified paired
statistical test. The earlier Claude experiment is a different client/model and
must not be combined with this Codex score.

VERDICT:
FILES_REVIEWED:
  - `AGENTS.md` at `c3b9197853bfb93ec264b03a838162cca9a035c4`: committed baseline input reviewed (unchanged)
  - `AGENTS.md` at `4a77ad3d0eb0c5e2043bd9aaea91e3107d6210e9`: committed optimized input reviewed (unchanged)
  - `docs/reports/2026-07-23-workflow-intelligence-diagnostic-codex-bbh20.md`: lines 1-117 added (validated experiment record)
CHECKS:
  - `rtk cmd /d /c call C:\Users\Administrator\AppData\Roaming\npm\codex.cmd --version`: PASS (`codex-cli 0.145.0`)
  - local JSONL event-splitting fixture: PASS (2 events parsed)
  - valid baseline Codex BBH-20 call: PASS (29.497 s, valid JSON, 0 tool events, 18/20)
  - valid optimized Codex BBH-20 retry: PASS (31.395 s, valid JSON, 0 tool events, 18/20)
CODE:
  > {"baseline":{"correct":18,"total":20,"toolEventCount":0},"optimized":{"correct":18,"total":20,"toolEventCount":0},"pairedAnswerArraysEqual":true}
VALIDATION:
  APPROVED - the recorded result is supported by two valid, policy-isolated Codex runs; interpretation is limited to this small BBH-20 diagnostic.
