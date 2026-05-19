---
title: Route & Concurrency Profiles
description: Minimal env profiles for interactive routing and parallel execution in Harness CLI.
---

# Route & Concurrency Profiles

Use this page when you want a **single place** to choose routing + parallel settings without memorizing many env vars.

## Core knobs

- `CTXDB_INTERACTIVE_AUTO_ROUTE`: enable/disable interactive auto-routing (`single/subagent/team/harness`)
- `CTXDB_CODEX_DISABLE_MCP`: skip MCP startup for wrapped `codex` sessions (`1` = faster startup, no MCP tools in that run)
- `CTXDB_HARNESS_PROVIDER`: provider used by the injected `harness` route (`codex|claude|gemini|opencode`; default: current CLI)
- `CTXDB_HARNESS_MAX_ITERATIONS`: iteration budget for the injected `harness` route (default: `8`)
- `CTXDB_TEAM_WORKERS`: worker concurrency for `aios team ...`
- `AIOS_SUBAGENT_CONCURRENCY`: executor concurrency for `aios orchestrate --execute live` and GroupChat speakers per round (default: `3`)
- `AIOS_SUBAGENT_TIMEOUT_MS`: per-agent-turn timeout in milliseconds for live execution (default: `600000` = 10 min)
- `AIOS_ALLOW_UNKNOWN_CAPABILITIES`: skip the capability guard when running live execution (`1` = accept risk)

## Recommended profiles

### 1) Balanced default (recommended)

```bash
export CTXDB_INTERACTIVE_AUTO_ROUTE=1
export CTXDB_CODEX_DISABLE_MCP=1
export CTXDB_HARNESS_MAX_ITERATIONS=8
export CTXDB_TEAM_WORKERS=3
export AIOS_SUBAGENT_CONCURRENCY=3
export AIOS_SUBAGENT_TIMEOUT_MS=600000
```

Use for daily work: keeps parallel throughput while avoiding common MCP cold-start stalls.

### 2) High throughput

```bash
export CTXDB_INTERACTIVE_AUTO_ROUTE=1
export CTXDB_CODEX_DISABLE_MCP=1
export CTXDB_HARNESS_MAX_ITERATIONS=12
export CTXDB_TEAM_WORKERS=4
export AIOS_SUBAGENT_CONCURRENCY=4
```

Use for larger independent work domains. If you see more blocked merges or retries, step back to `3 + 3`.

### 3) Debug stability mode

```bash
export CTXDB_INTERACTIVE_AUTO_ROUTE=0
export CTXDB_CODEX_DISABLE_MCP=1
export CTXDB_HARNESS_MAX_ITERATIONS=4
export CTXDB_TEAM_WORKERS=1
export AIOS_SUBAGENT_CONCURRENCY=1
```

Use for incident triage and deterministic reproduction when you want minimal parallel noise.

## Quick switch aliases (optional)

```bash
alias rex-par3='export CTXDB_INTERACTIVE_AUTO_ROUTE=1 CTXDB_CODEX_DISABLE_MCP=1 CTXDB_HARNESS_MAX_ITERATIONS=8 CTXDB_TEAM_WORKERS=3 AIOS_SUBAGENT_CONCURRENCY=3'
alias rex-par4='export CTXDB_INTERACTIVE_AUTO_ROUTE=1 CTXDB_CODEX_DISABLE_MCP=1 CTXDB_HARNESS_MAX_ITERATIONS=12 CTXDB_TEAM_WORKERS=4 AIOS_SUBAGENT_CONCURRENCY=4'
alias rex-debug='export CTXDB_INTERACTIVE_AUTO_ROUTE=0 CTXDB_CODEX_DISABLE_MCP=1 CTXDB_HARNESS_MAX_ITERATIONS=4 CTXDB_TEAM_WORKERS=1 AIOS_SUBAGENT_CONCURRENCY=1'
```

Then run:

```bash
rex-par3
codex
```

## Notes

- Changing these env vars affects **new sessions**. Restart `codex/claude/gemini/opencode` to apply.
- Parallel count is controlled by `CTXDB_TEAM_WORKERS` and `AIOS_SUBAGENT_CONCURRENCY`, not by `CTXDB_INTERACTIVE_AUTO_ROUTE`.
- In GroupChat live mode, `AIOS_SUBAGENT_CONCURRENCY` controls how many agents speak in parallel per round. Each agent sees the full shared conversation history from previous rounds.
- Harness self-trigger runs one provider loop, not a parallel team. Use `CTXDB_HARNESS_PROVIDER` only when you want the injected harness route to differ from the current CLI.
- `AIOS_ALLOW_UNKNOWN_CAPABILITIES=1` bypasses the live execution capability guard. Use it when you trust the task scope and want to skip the dry-run-first requirement.
- If you need MCP tools (for example context7/figma), launch one run with:

```bash
CTXDB_CODEX_DISABLE_MCP=0 codex
```
