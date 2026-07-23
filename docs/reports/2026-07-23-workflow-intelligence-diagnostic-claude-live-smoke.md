# Workflow Intelligence Diagnostic: Claude Live Smoke

## Scope and integrity boundary

This is a small, non-GAIA, no-browser diagnostic. It does not use or submit
GAIA data, a leaderboard, browser automation, MCP tools, or external search.
It measures one configured client only and must not be read as an inherent
model-intelligence score or a statistically conclusive benchmark result.

The two policy sources were fixed before execution:

| Arm | Committed guidance source |
| --- | --- |
| Baseline | `c3b9197853bfb93ec264b03a838162cca9a035c4:AGENTS.md` |
| Optimized | `4a77ad3d0eb0c5e2043bd9aaea91e3107d6210e9:AGENTS.md` |

Each was injected through standard input into the same self-contained prompt;
the arm label was not sent to the model. Both calls used the npm-native Claude
Code CLI `2.1.217` from an isolated temporary working directory.

## Controls

| Control | Value |
| --- | --- |
| Client / model | Claude Code / `claude-sonnet-5` |
| Calls | Two total, one per arm, sequential |
| Task set | Five self-contained deterministic reasoning questions |
| Tools | Explicitly prohibited; no browser, files, network, or external service |
| Timeout | 55 seconds per call; neither timed out |
| Cost cap | `--max-budget-usd 0.50` per call; 1.00 USD total reservation |
| Scoring | Exact JSON answers against `109`, `success,3`, `9`, `A,B,C,D,E`, `allowed` |

## Results

| Metric | Baseline | Optimized | Observed delta |
| --- | ---: | ---: | ---: |
| Correct answers | 5 / 5 | 5 / 5 | 0 percentage points |
| Actual reported cost | $0.1382484 | $0.1194636 | -$0.0187848 (-13.6%) |
| Observed wall time | 43.9 s | 28.8 s | -15.1 s (-34.4%) |
| Timeout / client error | No | No | None |

Total actual reported spend was **$0.2577120**, below the 1.00 USD reserved
limit. Both returned the same structured answer:

```json
{"answers":["109","success,3","9","A,B,C,D,E","allowed"]}
```

## Conclusion

The optimized guidance showed **no observable quality regression** on this
five-task smoke: both arms reached the accuracy ceiling. Because all paired
outcomes are the same and `n = 5`, there is **no evidence here that the change
increased intelligence**; the quality result is **inconclusive**, not a
positive intelligence claim.

The one-run operational signals are favorable: the optimized arm cost less and
returned sooner. They are useful as a hypothesis for a larger controlled test,
but one run per arm cannot establish causality or a stable percentage saving.

## Launch accounting

Several local launcher attempts failed before a model request because of a
missing executable path, Windows `.cmd` spawning/quoting, and an AIOS shim
event-recording error. They produced no model JSON result or reported cost and
are excluded from the A/B results. Only the two npm-native Claude calls above
are counted.

## Required next evidence for an intelligence claim

Use a larger digest-pinned task set with enough paired difficulty to avoid the
ceiling effect, keep the same per-client isolation, and include a paired
statistical conclusion. A GAIA result additionally requires an authorized local
validation split and a production runner that can enforce and observe each
client's cost; neither condition was assumed here.
