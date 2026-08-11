---
title: "v5.6.0: Parallel Multi-Agent Coding with One Command — aios work"
description: "v5.6.0 adds aios work: one command turns any task into a planned, concurrent multi-agent dispatch — plan, implement, review, and security-check with a merge gate, instead of waiting on a single agent."
date: 2026-08-11
tags: ["AIOS", "multi-agent", "parallel", "orchestration", "release", "v5.6.0"]
---

# v5.6.0: Parallel Multi-Agent Coding with One Command — `aios work`

## Problem

Single coding agents work serially: plan, edit, review, repeat. Every step waits for the same process, so a task with three independent parts takes three times as long as one part. Parallel multi-agent orchestration existed in AIOS (`aios orchestrate`), but it was opt-in, environment-gated, and required several flags — so most daily work still ran on one agent.

## Quick Answer

**`aios work` is one command that turns a task description into a concurrent multi-agent dispatch.** It plans the work, splits it into independent items, runs planner, implementer, reviewer, and security-reviewer jobs in parallel (default concurrency 3), and merges results through a safety gate — all with a single CLI call. Live execution is on by default; `--dry-run` previews the plan, `--serial` forces safe sequential execution. It wraps the existing orchestration engine, so no new moving parts: the same evidence, ownership, and merge-gate guards apply.

## Action Steps

1. Upgrade AIOS to v5.6.0 (`aios update`).
2. Run any task with one command:

```bash
aios work --task "Ship the release checklist"
```

3. Preview before you commit to live dispatch:

```bash
aios work --task "Ship the release checklist" --dry-run --json
```

4. Force serial execution for coupled work:

```bash
aios work --task "Refactor the auth module" --serial
```

5. Tune concurrency and client:

```bash
aios work --task "Review auth, update tests, write docs" --client codex-cli --concurrency 4
```

## How the dispatch works

- **Automatic decomposition.** The task title and `--context` hints are split into work items with ownership hints (`docs/`, `scripts/tests/`, `mcp-server/src/`).
- **DAG execution.** Plan and implement phases run sequentially; review and security-review run in parallel; a merge gate validates handoffs, file ownership, and read-only review rules before anything is merged.
- **Bounded parallelism.** `aios work` defaults to 3 concurrent subagents (`--concurrency N` to change, `--serial` to drop to 1).
- **Safety is not bypassed.** Preflight readiness, capability manifests, owned path prefixes, file policy, and the merge gate all still apply. Live execution with unknown capability surfaces is refused unless you accept with `--force` — exactly like the existing `aios team` / `aios orchestrate --execute live` path.
- **Per-phase model routing.** Planner, implementer, reviewer, and security-reviewer jobs resolve their own model through the model router by default.

## Examples

```bash
# Default: live concurrent dispatch (concurrency 3, merge-gate closed)
aios work --task "Refactor mcp-server and add tests"

# Zero-cost preview (no model client is spawned)
aios work --task "Ship the release checklist" --dry-run --json

# Multi-item decomposition hints (semicolon / newline separated)
aios work --task "Prepare the release" --context "update changelog; refresh docs; bump version"

# Session-aware resume of a prior dispatch
aios work --task "Ship the release checklist" --session codex-cli-20260811T... --retry-blocked
```

## Why not just use `aios team` or `aios orchestrate`?

They still exist and are unchanged. `aios work` is the same engine with the *daily-driver defaults*: live on by default, one command, no environment variables to remember. `aios team` remains the status/history/observability view; `aios orchestrate` remains the fully explicit control surface.

## FAQ

### Does `aios work` spawn real model clients?

Yes — live mode runs real one-shot subagents (codex, claude, gemini, or opencode per `--client` / `AIOS_SUBAGENT_CLIENT`). Use `--dry-run` for a zero-cost preview, or set `AIOS_SUBAGENT_SIMULATE=1` to exercise the pipeline without calling a model.

### Is parallel dispatch safe for my workspace?

The same guards as `aios team` apply: preflight readiness, capability manifest check, owned-path file policy, and a merge gate that blocks overlapping file ownership across parallel outputs. Coupled work can always be forced back to serial with `--serial`.

### Does it replace the rex workflow command selection?

No. `aios work` is the parallel dispatch lane; the rex workflow (one current Command at a time) still owns staged provider selection. They are orthogonal.

### Which clients are supported?

`codex-cli`, `claude`, `gemini`, and `opencode` — the same client set as the subagent runtime. Default is `codex-cli`.

### I want speed but bounded cost. What should I use?

`aios work --task "..." --concurrency 2` bounds live parallelism, `--dry-run` previews the DAG and work items first, and `aios learn-eval` turns prior dispatch evidence into recommendations for the next run.

## Related

- [Orchestrate Live: Running Subagents in Production](orchestrate-live.md)
- [Parallel Coding Agents Are Not Free: Git Worktrees Isolate Files, Not State](2026-08-parallel-coding-agents.md)
- [Agent Governance: Make Team Runs Prove Themselves Before Going Live](2026-06-agent-governance.md)
- Docs: [Team Ops](https://cli.rexai.top/team-ops/) · [Route & Concurrency Profiles](https://cli.rexai.top/route-concurrency-profiles/)
