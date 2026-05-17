---
title: Agent Team
description: When to use multiple agents, how to start and monitor them, and when NOT to use teams.
---

# Agent Team

**One agent is good. Multiple agents working together can be great — but only when the task actually calls for it.**

Agent Team lets you split a task across multiple coding agents working in parallel. Each agent handles part of the work, and you can monitor their progress in real time.

## The One Command To Remember

```bash
# Start 3 agents on a task
aios team 3:codex "Build the settings page, add tests, and update docs"

# Watch them work
aios team status --provider codex --watch
```

## When To Use Teams (And When Not To)

### Good fit for Agent Team

- The task has **independent parts** (frontend + backend + tests + docs)
- You already know the **acceptance criteria** ("tests must pass", "docs must be updated")
- The work can be split without agents **editing the same files**
- You're OK spending extra tokens for faster parallel execution

### Bad fit for Agent Team

- The requirement is still **unclear** — you're still figuring out what to build
- It's a **small bug** or **single-file fix**
- Multiple agents would **step on each other's toes** (editing the same files)
- You're **debugging** something that needs stable, reproducible steps

!!! tip "When in doubt, use one agent"
    ```bash
    codex  # Start with a single agent
    ```
    If the task turns out to be parallelizable, you can always start a team later.

### Quick Checklist

Before starting a team, confirm all three:

- [ ] The task splits into 2+ independent modules
- [ ] Workers will NOT edit the same files
- [ ] You can describe the acceptance criteria in one sentence

## The 10-Minute Flow

### 1. Write A Clear Task

A good task description has three parts: **goal**, **boundary**, and **acceptance criteria**.

```bash
aios team 3:codex \
  "Improve login form error messages; \
   do not change the auth API; \
   run related tests and update docs before finishing"
```

### 2. Start Monitoring

```bash
aios team status --provider codex --watch
```

For a lighter view:

```bash
aios team status --provider codex --watch --preset minimal --fast
```

### 3. Check History And Failures

```bash
# Recent team runs
aios team history --provider codex --limit 20

# Only failed runs
aios team history --provider codex --quality-failed-only
```

### 4. Run A Quality Check Before Finishing

```bash
aios quality-gate pre-pr --profile strict
```

If the quality gate fails, **inspect the failure first**. Don't just start more workers.

## How Many Agents Should I Use?

| Count | Command | Best for |
|---|---|---|
| 2 | `aios team 2:codex "task"` | First time, or when files might overlap |
| 3 | `aios team 3:codex "task"` | Most daily features (recommended) |
| 4 | `aios team 4:codex "task"` | Very independent modules with clear tests |

If you see conflicts or duplicate edits, **reduce** the count — don't increase it.

## Choosing A Provider

```bash
aios team 3:codex "task"       # Good for daily implementation
aios team 2:claude "task"      # Good for analysis or planning
aios team 2:gemini "task" --dry-run  # Preview without running
```

## If Something Goes Wrong

### A run was interrupted

Check what happened first:

```bash
aios team history --provider codex --limit 5
```

Then retry only the blocked parts:

```bash
aios team --resume <session-id> --retry-blocked --provider codex --workers 2
```

!!! warning "Don't just start a bigger team"
    Figure out why the previous run failed before starting a new one. More agents on a broken task won't help.

## How Team Works Under The Hood

When you start a team, RexCLI uses a **GroupChat Runtime** — a round-based system where agents share a conversation thread:

```
Round 1 → Planner analyzes the task and creates work items
Round 2 → N implementers work in parallel (one per work item)
Round 3 → Reviewer checks the results
```

If an agent gets stuck, the planner **automatically re-plans** the next round.

### Blueprints

| Blueprint | Rounds | Best for |
|---|---|---|
| `bugfix` | plan → implement → review | Simple fixes, small scope |
| `feature` | plan → implement → review + security | New features with quality checks |
| `refactor` | plan → implement → review | Pure refactoring, no new features |
| `security` | assess → plan → implement → review | Security-sensitive changes |

Use the smallest blueprint that fits your task.

Blueprints, role cards, runtime manifests, executor manifests, and handoff schemas are packaged under `scripts/lib/specs/`. Team run state and evidence are still written to `.aios/context-db/`; `memory/memo/` is only for project memo records and is not the team runtime store.

### Configuration

```bash
# Required for live execution
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli  # or claude-code, gemini-cli

# How many agents run at once per round (default: 3)
export AIOS_SUBAGENT_CONCURRENCY=3

# Timeout per agent turn in ms (default: 10 min)
export AIOS_SUBAGENT_TIMEOUT_MS=600000
```

## Team vs. Harness vs. Orchestrate

| Need | Use |
|---|---|
| Multiple agents on one task | `aios team ...` |
| One agent working overnight | `aios harness run ...` |
| Staged execution with gates | `aios orchestrate ...` |

New users should start with `team`. Orchestration is for advanced users who need strict staged execution.

## Command Reference

```bash
# Start a team (dry-run by default)
aios team 3:codex "Ship feature X"

# Start a team with live execution
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios team 3:codex "Ship feature X"

# Watch current status
aios team status --provider codex --watch

# Recent history
aios team history --provider codex --limit 20

# Failures only
aios team history --provider codex --quality-failed-only

# Retry blocked jobs
aios team --resume <session-id> --retry-blocked --provider codex --workers 2

# Current session HUD
aios hud --provider codex
```

## Where To Go Next

- [Solo Harness](solo-harness.md) — when you need one agent working overnight
- [HUD Guide](hud-guide.md) — monitoring dashboard details
- [Find Commands By Scenario](use-cases.md) — more command examples
- [Troubleshooting](troubleshooting.md) — fix common issues
