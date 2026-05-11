# Orchestrate Live Is Now Real: Subagent Runtime for Codex / Claude / Gemini

If you've been using `aios orchestrate` as a safe “plan + dry-run” harness, this is the missing piece: `subagent-runtime` can now execute orchestration phases via your chosen CLI.

## What Changed

Before:

- `--execute dry-run` produced a DAG and simulated handoffs (0 tokens)
- `--execute live` was gated and effectively a stub

Now:

- `--execute live` runs phase jobs through `codex` / `claude` / `gemini`
- Parallel phases run concurrently (bounded by `AIOS_SUBAGENT_CONCURRENCY`)
- A merge gate validates JSON handoffs and blocks conflicting file ownership

## Safety Defaults

Live execution is still off by default. To enable it:

```bash
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli  # or claude-code, gemini-cli
aios orchestrate --session <session-id> --dispatch local --execute live --format json
```

Tip (codex-cli): Codex CLI v0.114+ supports `codex exec` structured outputs (`--output-schema`, `--output-last-message`, stdin). AIOS uses them when available for more reliable JSON handoffs, and Codex child workers run with `--dangerously-bypass-approvals-and-sandbox` by default so unattended runs do not wait on prompts.

Token cost:

- `dry-run` does not call any model runtime
- `live` calls the selected CLI, so token/cost depends on that client

## Useful Env Controls

- `AIOS_SUBAGENT_CONCURRENCY` (default: `2`)
- `AIOS_SUBAGENT_TIMEOUT_MS` (default: `600000`)
- `AIOS_SUBAGENT_CONTEXT_LIMIT` (default: `30`)
- `AIOS_SUBAGENT_CONTEXT_TOKEN_BUDGET` (optional)

## Failure Semantics (What You'll See)

`subagent-runtime` returns structured per-job results. A job is marked `blocked` when:

- a dependency is blocked
- the selected CLI command is missing
- the subagent output is not valid JSON (handoff schema parse/validation failed)
- the merge gate blocks due to file ownership conflicts

## Why This Matters

This makes orchestration actionable without inventing a new runtime:

- same blueprints
- same ContextDB session memory
- same merge/ownership rules
- now with real (opt-in) parallel execution

## 2026-03-16 Progress Update

Since this post was published, we continued live sampling on the same session to validate runtime stability:

- Latest live artifact: `dispatch-run-20260316T111419Z.json` (`dispatchRun.ok=true`)
- `review` / `security` now auto-complete at `0ms` when upstream handoffs report `filesTouched=[]`
- `learn-eval` average elapsed improved to `160678ms`, but `sample.latency-watch` is still active
- Timeout budgets are intentionally unchanged until latency-watch clears and Windows-host validation evidence is fully closed

Practical takeaway: live orchestration is stable enough for routine use, but budget tightening should remain evidence-driven.
