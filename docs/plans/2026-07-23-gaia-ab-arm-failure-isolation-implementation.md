# GAIA Live A/B Arm Failure-Isolation Implementation

## Implemented GREEN Slice: Cost Limit

The runner's terminal-artifact helper now returns the whitelist record after
writing it, so the public result contains successful and terminal outcomes.
When an estimate exceeds the remaining global budget, the runner records one
`cost_limit` artifact with zero actual spend, stops the current job with
`break`, and continues the outer client/model/arm loop.

This preserves the shared ledger: a task that was never launched cannot consume
budget, while unaffected jobs still receive the current remaining-spend bound.
The artifact is constructed through the existing whitelist-only module, so
prompt text and arbitrary client output remain excluded.

## Deliberate Boundary

This GREEN slice proves only cost-limit isolation. Timeout and client-error
status classification and reserved-spend behavior remain in the separately
approved acceptance rows and require their own RED evidence before they can be
claimed complete.
