# GAIA A/B Production CLI Entrypoint Implementation

## Implemented GREEN Slice

`scripts/gaia-ab-eval.mjs` now exposes `--execute` as an explicit, mutually
exclusive alternative to `--dry-run`. Both modes require `--config` before any
configuration read, browser preflight, adapter construction, or client launch.

The execute branch is intentionally fail-closed after that validation. It
reports that production adapters are not yet configured rather than parsing a
manifest as a successful live request or invoking any external client. The
existing offline `--dry-run` behavior remains unchanged.

## Scope Boundary

This slice provides an observable, testable operator gate only. It does not
repair Codex, configure a browser, create a task manifest, call Codex/Claude/
Hermes, access the network, download GAIA data, submit a leaderboard result, or
produce any billable model usage.
