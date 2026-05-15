---
title: Overview
description: RexCLI adds memory, skills, and teamwork to the coding agents you already use. No new tools to learn.
---

# RexCLI

**Give your coding agent a brain and a team.**

RexCLI wraps around `codex`, `claude`, `gemini`, and `opencode` to add things they don't have on their own: project memory that survives restarts, reusable skills, and the ability to run multiple agents in parallel.

You keep using the same commands. Nothing changes about your workflow — except your agents get way more capable.

[Get Started in 3 Minutes](getting-started.md){ .md-button .md-button--primary }
[See It In Action](use-cases.md){ .md-button }

## What Can You Do?

!!! example "Real-world scenarios"
    === "Remember things"
        Your agent forgets everything when you close the terminal. **Not anymore.**

        ```bash
        cd your-project
        touch .contextdb-enable
        codex  # Now your agent remembers what you did yesterday
        ```

    === "Run overnight"
        Give your agent a task before you sleep. Check the results in the morning.

        ```bash
        aios harness run \
          --objective "Refactor the auth module and write tests" \
          --worktree
        ```

    === "Use a team"
        Split big tasks across multiple agents working in parallel.

        ```bash
        aios team 3:codex \
          "Build the settings page, add tests, update docs"
        aios team status --watch  # Monitor progress in real time
        ```

    === "Debug itself"
        Your agent can search its own logs and figure out what went wrong.

        ```bash
        cd packages/debug-hub && npm run dev
        # Agents now have tools: search_logs, get_trace, get_stats
        ```

## Why RexCLI?

If you've ever used a coding agent and thought:

- **"I wish it remembered what we did yesterday"** — that's ContextDB
- **"I want it to follow a consistent style"** — that's Memo (persona + user profile)
- **"This task is too big for one agent"** — that's Agent Team
- **"I want it to keep working while I sleep"** — that's Solo Harness
- **"I need to debug what the agent is doing"** — that's debug-hub
- **"I want the right model for each task"** — that's Model Router

RexCLI is **not** another coding agent. It's a layer that makes your existing agents better.

## The Big Picture

Think of RexCLI like a power-up for your coding agents:

```
Your Project
  └── ContextDB (memory)
        └── Sessions, events, checkpoints
  └── Memo (persistent notes)
        └── Persona, user profile, project facts
  └── Superpowers (skills)
        └── Brainstorm, plan, debug, verify
  └── Agent Team (parallel work)
        └── Multiple agents, one goal
  └── Solo Harness (long-running work)
        └── Overnight runs with journals
  └── debug-hub (self-diagnostics)
        └── Agents query their own logs
```

## First Time Here?

**Start here:** [Quick Start](getting-started.md) — install, set up, and run your first agent with memory in about 3 minutes.

**Already set up?** Jump to what you need:

| I want to... | Go to |
|---|---|
| Give my agent project memory | [ContextDB](contextdb.md) |
| Use multiple agents together | [Agent Team](team-ops.md) |
| Let one agent work overnight | [Solo Harness](solo-harness.md) |
| Find the right command | [Commands By Scenario](use-cases.md) |
| Use browser automation | [Troubleshooting](troubleshooting.md) |
| Understand the architecture | [Architecture](architecture.md) |

## New To AI Coding Agents?

No worries. Here's what you need to know:

**An "agent"** is a coding assistant that runs in your terminal — like Claude Code, Codex CLI, or Gemini CLI. You type what you want, and it writes code for you.

**The problem?** These agents are forgetful. Close the terminal, and everything's gone. They also can't work together or run for a long time without supervision.

**RexCLI fixes this** by adding a memory layer, skills, and teamwork — without changing how you interact with your agent.

## Common Questions

### Do I need to stop using my current agent?

No. You keep running `codex`, `claude`, `gemini`, or `opencode` exactly like before. RexCLI just makes them better.

### Is this a cloud service?

No. Everything runs locally on your machine. Your code and data never leave your computer.

### Which agents does it support?

Codex CLI, Claude Code, Gemini CLI, and OpenCode. If your favorite isn't listed, [open an issue](https://github.com/rexleimo/rex-cli/issues).

### Do I need to learn a lot of new commands?

No. The three things you'll use most are:

1. `aios` — open the setup menu
2. `touch .contextdb-enable` — turn on memory for a project
3. `codex` (or `claude`/`gemini`) — start coding as usual

Everything else is optional and you can learn it as you go.

## What's Next?

- [Quick Start](getting-started.md) — get running in 3 minutes
- [ContextDB](contextdb.md) — understand how memory works
- [Agent Team](team-ops.md) — run multiple agents together
- [Solo Harness](solo-harness.md) — let agents work overnight
- [Find Commands By Scenario](use-cases.md) — the command reference
- [Changelog](changelog.md) — what's new in each release

## Blog Highlights

- [AIOS RL Training System](/blog/rl-training-system/)
- [ContextDB Search Upgrade](/blog/contextdb-fts-bm25-search/)
- [Windows CLI Startup Stability](/blog/windows-cli-startup-stability/)
- [Orchestrate Live](/blog/orchestrate-live/)
