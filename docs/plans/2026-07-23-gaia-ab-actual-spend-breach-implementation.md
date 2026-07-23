# GAIA Live A/B Actual-Spend Breach Implementation

## Implemented GREEN Slice

If a validated client outcome reports actual spend greater than the budget it
was granted, the runner creates a dedicated `SpendLimitBreachError`. The
terminal handler persists one whitelist-only `spend_limit_breach` artifact with
the reported actual answer and spend, sets remaining budget to zero, and returns
an explicit terminal result immediately.

This route deliberately does not reuse the ordinary per-arm error continuation:
once a client reports that the global budget has been exceeded, later client
launches are unsafe. The terminal result exposes only status and zero remaining
budget, not raw adapter data.

## Scope Boundary

The change is exercised entirely through temporary local task data and fake
adapters. No real browser, model, client CLI, network, dataset, leaderboard, or
credential was used or added.
