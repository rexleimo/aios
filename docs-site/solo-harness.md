---
title: Solo Harness
description: Let one agent work overnight on a clear task — with journals, stop/resume controls, and optional git worktree isolation.
---

# Solo Harness

**Give your agent a task before you go to sleep. Check the results in the morning.**

Solo Harness is for when you have **one clear objective** that's worth running for a long time. It keeps a journal of everything the agent does, and you can stop, check status, or resume at any time.

## When To Use Solo Harness

### Good fit

- You have **one clear goal** — like "refactor the auth module" or "write integration tests for the payment flow"
- The task is **too big for a single session** but doesn't need multiple agents
- You want the agent to keep working **while you're away**
- You want changes **isolated** from your main branch (with `--worktree`)

### Not a good fit

- The task could be **split across independent modules** — use [Agent Team](team-ops.md) instead
- You need **staged execution with quality gates** — use `aios orchestrate ...`
- You're still **figuring out the requirements** — start with a normal interactive session first

## Quick Start

```bash
# Start an overnight run in an isolated worktree
aios harness run \
  --objective "Refactor the auth module and write integration tests" \
  --session nightly-auth \
  --worktree \
  --max-iterations 20

# Check status anytime
aios harness status --session nightly-auth --json

# Monitor in HUD
aios hud --session nightly-auth --json

# Tell it to stop (at the next safe point)
aios harness stop --session nightly-auth --reason "morning review"

# Continue later
aios harness resume --session nightly-auth --max-iterations 10
```

## The Overnight Workflow

Here's how a typical overnight session works:

```
Evening:
  1. Write a clear objective
  2. Start with --worktree (isolates changes from your main branch)
  3. Check status once to confirm it started OK
  4. Go to sleep

Morning:
  5. Check status or HUD to see what happened
  6. If done: review the changes in the worktree
  7. If stuck: read the journal, fix issues, and resume
```

## Why Use `--worktree`?

The `--worktree` flag creates a **separate git worktree** — a copy of your repo where the agent can make changes without affecting your main branch.

- If the agent produces great work: merge it in
- If the agent goes off track: just delete the worktree, no harm done

**This is recommended for all overnight runs.**

## Try Before You Commit (Dry Run)

Want to see what would happen without spending tokens?

```bash
aios harness run \
  --objective "Draft tomorrow handoff" \
  --session test-run \
  --worktree \
  --max-iterations 3 \
  --dry-run --json
```

Dry run creates the session structure but doesn't actually invoke the agent.

## Agent Self-Trigger

When you're using a wrapped CLI (`codex`, `claude`, `gemini`, `opencode`, `hermes`, `grok`), your agent can **trigger a harness run itself** when it recognizes a long-running task:

```
You: "This refactoring is going to take a while. Keep working on it overnight."
Agent: *triggers harness run with the current objective*
```

You can control this behavior:

```bash
# Change the default agent
export CTXDB_HARNESS_PROVIDER=claude

# Change the max iterations
export CTXDB_HARNESS_MAX_ITERATIONS=12

# Disable the auto-route prompt
export CTXDB_INTERACTIVE_AUTO_ROUTE=0
```

## Hook Controls

By default, harness runs record lifecycle hooks (evidence of what happened at each step). You can toggle this:

```bash
# With hooks (default)
aios harness run --objective "task" --session my-run --hooks

# Without hooks (less noise)
aios harness resume --session my-run --no-hooks
```

## What Gets Written

All artifacts live in your project:

```
.aios/context-db/sessions/<session-id>/artifacts/solo-harness/
  ├── objective.md           # The goal you gave it
  ├── run-summary.json       # Current state and progress
  ├── control.json           # Stop requests and notes
  ├── hook-events.jsonl      # Lifecycle evidence
  ├── iteration-0001.json    # What happened in iteration 1
  ├── iteration-0001.log     # Raw log for debugging
  └── ...
```

## Solo Harness vs. Agent Team

| Need | Use |
|---|---|
| One agent, one goal, long-running | `aios harness run ...` |
| Multiple agents on a splittable task | `aios team ...` |
| Staged execution with preflight gates | `aios orchestrate ...` |

## Where To Go Next

- [Agent Team](team-ops.md) — when one agent isn't enough
- [HUD Guide](hud-guide.md) — monitoring dashboard
- [Find Commands By Scenario](use-cases.md) — more command examples
- [Troubleshooting](troubleshooting.md) — fix common issues
