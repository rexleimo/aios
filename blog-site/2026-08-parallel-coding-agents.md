---
title: "Parallel Coding Agents Are Not Free: Git Worktrees Isolate Files, Not State"
description: "\"Git worktrees are not an isolation boundary for coding agents\" earned 30+ comments on Hacker News this week, and the parallel-agent trend keeps growing. File isolation protects source files, but activation state, tokens, and evidence still race. Here is what state-level isolation and explicit coordination look like."
date: 2026-08-02
tags: ["parallel coding agents", "git worktree", "concurrency", "agent team", "state isolation", "developer productivity"]
---

# Parallel Coding Agents Are Not Free: Git Worktrees Isolate Files, Not State

> **Quick Answer:** This week's Hacker News thread "Git worktrees are not an isolation boundary for coding agents" made a point that most parallel-agent setups miss: a worktree isolates *files*, not *state*. When several agents run against the same plan, activation store, token stream, and evidence log, you get the same race conditions as multi-threaded code — lost updates, double consumption, and silent conflicts. File isolation is necessary but not sufficient; you also need transactional state and explicit coordination.

## The parallel-agent hype meets reality

Parallel coding agents are everywhere now: tmux TUIs that run Claude Code, Codex, and OpenCode side by side, local merge queues for parallel agents, and teams that spin up one worktree per agent. The idea is simple — agents are cheap, so run more of them.

The reality check came from a thread this week arguing that **worktrees are not an isolation boundary**. It got the core thing right: two agents in two worktrees cannot corrupt each other's *source files*, but they absolutely can corrupt each other's *state*.

## What worktree isolation actually gives you

A git worktree gives each agent its own working directory and branch. That protects:

- **Source files** — agent A's edits cannot overwrite agent B's files.
- **Branches** — each agent merges its own branch; conflicts surface at merge time.

What it does **not** protect:

- **The activation store** — which workflow is active, which token the plan is on.
- **Token advancement** — two agents both read "current token = 3" and both advance to 4. One step runs twice, another never runs.
- **Evidence and verification** — agent A's verification log can be overwritten by agent B's run of the same check.
- **Shared caches and locks** — the same lock file, the same registry, the same `.aios` state directory.

If your agents share any of that, worktrees give you the *feeling* of isolation while the state machine underneath races exactly like buggy multi-threaded code: lost updates, double consumption, silent conflicts.

## What state-level isolation looks like

Three things separate "parallel agents that work" from "parallel agents that corrupt each other":

### 1. Transactional state writes

State updates must be atomic and crash-safe. If an agent crashes mid-write, the next run rolls forward or fails closed — it never trusts a half-written projection. AIOS v5.4.0 makes activation writes transactional (write-ahead transactions, automatic roll-forward on restart, read-side consistency validation with `stale-activation-projection` failure).

### 2. A real lock on shared tokens

Parallel agents must not double-consume the same Command token. A store file lock serializes advancement: concurrent calls get `AIOS_REX_STORE_BUSY` instead of silently racing. This is the same discipline as `SELECT ... FOR UPDATE` — you serialize the one thing that cannot be parallelized: who owns the next step.

### 3. Explicit coordination, not implicit trust

Parallelism needs a coordination layer: independent work packages with clear ownership, monitoring (who is stuck?), and safe recovery (what happens when a worker dies?). AIOS's Agent Team route splits work into independent packages with acceptance criteria and a HUD for live status; Solo Harness offers worktree isolation for one long objective with journals and stop/resume — the two are different tools for different jobs.

## The rule of thumb

Use parallel agents when the work splits into **independent packages with independent state**. Keep coupled changes sequential — the workflow policy already does this (`planned` route, coupled changes stay in one client). If two agents must touch the same activation, token, or evidence, you do not have two parallel tasks; you have one task with a race condition.

## A safe starting sequence

```bash
aios init --all
aios doctor --native --verbose
```

Read the [Agent Team guide](https://cli.rexai.top/team-ops/) for independent work packages and HUD monitoring, the [Solo Harness guide](https://cli.rexai.top/solo-harness/) for resumable long-running work with worktree isolation, and the [Workflow Policy](https://cli.rexai.top/workflow-policy/) for when coupled changes must stay sequential.

## FAQ

### So should I stop using worktrees?

No. Worktrees are a good file-level isolation mechanism. The point is that they are *not sufficient*: add transactional state and explicit coordination on top, or the parallelism will bite you in ways file conflicts never would.

### How do I know if my agents share state?

Check what they write outside the worktree: shared `.aios` directories, lock files, registries, or anything that records "which step are we on." If two agents can read and write the same file, they share state.

### Isn't the merge queue enough coordination?

A merge queue coordinates *code* — when branches merge. It does not coordinate *state* — who advances the plan token, who owns verification. Both are needed.

### Where can I see the details?

The [Changelog](https://cli.rexai.top/changelog/) covers the v5.4.0 state-hardening releases, and the release post [Workflow Iteration v2.1](https://cli.rexai.top/blog/2026-08-v540-workflow-iteration-v21/) explains the concurrency failure modes being closed.

Parallelism is a force multiplier — for throughput, and for corruption. Isolate files by all means. Isolate state, or the agents will do it for you, in the worst possible way.
