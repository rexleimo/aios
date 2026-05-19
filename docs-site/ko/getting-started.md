---
title: 빠른 시작
description: Install RexCLI, set it up, and run your first agent with memory — in about 3 minutes.
---

# 빠른 시작

**Goal:** By the end of this page, you'll have RexCLI installed and your coding agent will remember things across sessions.

Sounds good? Let's go.

## What You Need

Before we start, make sure you have:

- **Node.js 24** (the required LTS baseline) — [download it here](https://nodejs.org/) or use `nvm install 24`
- **A coding CLI** — at least one of: `codex`, `claude`, `gemini`, or `opencode`
- **A project folder** — any code project where you want your agent to have memory

Check your Node version:

```bash
node -v  # Should show v24.x.x
```

??? note "Need to install or switch Node?"
    ```bash
    nvm install 24
    nvm use 24
    ```

## Step 1: Install RexCLI

=== "macOS / Linux"

    ```bash
    curl -fsSL https://github.com/rexleimo/rex-cli/releases/latest/download/aios-install.sh | bash
    source ~/.zshrc
    ```

    If you use bash instead of zsh, replace `source ~/.zshrc` with `source ~/.bashrc`.

=== "Windows PowerShell"

    ```powershell
    irm https://github.com/rexleimo/rex-cli/releases/latest/download/aios-install.ps1 | iex
    . $PROFILE
    ```

!!! tip "Stable vs. Development"
    The commands above install the **stable release** (recommended). Only use `git clone` if you specifically want unreleased features from the `main` branch.

## Step 2: Run Setup

Open the RexCLI menu:

```bash
aios
```

You'll see a TUI (terminal UI) with several options. Do these two things, **in this order**:

1. **Choose "Setup"** — this installs the shell wrappers and skills
2. **Choose "Doctor"** — this checks everything is working correctly

<figure class="rex-visual">
  <img src="assets/visual-tui-setup-doctor.svg" alt="Setup first, Doctor second">
  <figcaption>Always run Setup first, then Doctor. If Doctor shows zero critical errors, you're good to go.</figcaption>
</figure>

!!! warning "If Doctor shows errors"
    Don't panic. Most errors are easy fixes — missing PATH entries, wrong Node version, etc. Doctor will tell you exactly what's wrong and often offers to fix it automatically.

After setup, reload your shell:

=== "macOS / Linux"
    ```bash
    source ~/.zshrc
    ```

=== "Windows PowerShell"
    ```powershell
    . $PROFILE
    ```

## Step 3: Turn On Memory For Your Project

Go to any project folder where you want your agent to remember things:

```bash
cd /path/to/your/project
aios init
```

That's it. `aios init` detects your installed coding agents (Claude Code, Codex CLI, Gemini CLI, OpenCode) and configures each one to use the memory system. It's **idempotent** — safe to run multiple times.

??? info "How it works"
    `aios init` adds a lightweight marker (`<!-- AIOS: .aios/context-db/index.json -->`) to each agent's config file (CLAUDE.md, AGENTS.md, GEMINI.md). When your agent starts, it sees the marker, reads the context registry, and loads only what it needs — no more waiting through lengthy context injection.

??? info "Opt-in mode (legacy)"
    If you prefer the old opt-in method, you can still use:

    === "macOS / Linux"
        ```bash
        touch .contextdb-enable
        ```

    === "Windows PowerShell"
        ```powershell
        New-Item -ItemType File -Path .contextdb-enable -Force
        ```

    The new `aios init` method is recommended — it gives you faster startup and cross-agent memory sharing.

## Step 4: Start Your Agent

Now just start your agent like you normally would:

```bash
codex
# or: claude
# or: gemini
```

Your agent now has **project memory**. It will remember:

- What files you worked on
- What decisions you made
- What errors you encountered
- What was left to do

...even after you close the terminal and come back tomorrow.

## Step 5: Verify It's Working

Run this to check that memory is active:

```bash
aios doctor --native --verbose
ls .aios/context-db/
```

You should see directories like `sessions/`, `index/`, or `exports/`. That means memory is recording.

??? troubleshooting "Don't see the memory directory?"
    1. Start your agent once normally — RexCLI creates the directory on first run
    2. If it still doesn't appear: `aios doctor --native --fix`

**You're all set!** Your agent now has memory. Keep reading to learn what else you can do.

---

## Beyond The Basics

You have memory working. Here are the next things to try, in order of usefulness:

### Save Persistent Notes With Memo

Memo lets you save Git-friendly project notes that your agent will see in every session:

```bash
# Save a note about this project
aios memo add "Always use TypeScript strict mode in this project"

# Save a reminder
aios memo pin add "Never push directly to main"

# Search your notes later
aios memo search "typescript"

# Inspect the active storage implementation
aios memo storage status
```

By default, project memos are append-only JSONL under `.aios/memo/file/events.jsonl`. Use `aios memo storage use split` only when you prefer one JSON file per memo event; `storage rebuild` regenerates derived query files without rewriting canonical records.

### Set Your Agent's Personality

You can tell RexCLI how your agent should behave across all projects:

```bash
# Set the agent's communication style
aios memo persona init
aios memo persona add "Response style: concise, direct, evidence-first"

# Set your own preferences
aios memo user init
aios memo user add "Preferred language: zh-CN + technical English terms"
```

These profiles apply everywhere — not just one project.

### Run Multiple Agents Together

When a task is too big for one agent, split it across multiple workers:

```bash
# Start 3 agents working in parallel
aios team 3:codex "Build the settings page, add tests, and update docs"

# Watch their progress
aios team status --watch
```

!!! tip "When to use teams"
    Use Agent Team only when the task can be **split into independent parts**. For single-file fixes or unclear requirements, stick with one agent.

### Let An Agent Work Overnight

Give your agent a clear objective and let it run while you sleep:

```bash
aios harness run \
  --objective "Refactor the auth module and write integration tests" \
  --worktree \
  --max-iterations 20
```

Check progress anytime:

```bash
aios harness status --session <session-name> --json
```

### Use Route Shortcuts Inside Agents

When you're inside a running agent, you can trigger RexCLI features with shortcuts:

| Shortcut | What it does |
|---|---|
| `/single <task>` | Handle the task in the current agent |
| `/team <task>` | Split across multiple agents |
| `/harness <task>` | Run as a long overnight job |

!!! note "Client differences"
    - **Claude Code / Gemini / OpenCode**: `/single`, `/team`, `/harness`
    - **Codex**: `/prompts:single`, `/prompts:team`, `/prompts:harness`

    If shortcuts are missing, run `aios doctor --native --fix`.

---

## Common Questions

### Does RexCLI replace my coding agent?

**No.** You still run `codex`, `claude`, `gemini`, or `opencode`. RexCLI adds memory, skills, and teamwork on top of them.

### Why do I need `.contextdb-enable`?

It's an opt-in switch. Without it, RexCLI won't record anything. You choose which projects get memory.

### Will my agents share the same memory?

**Yes.** If you run `codex` and then `claude` in the same project folder, they share the same ContextDB. This means Claude knows what Codex did earlier.

### Do I need to learn everything at once?

**No.** The three things you need on day one are:

1. `aios` — for setup and diagnostics
2. `touch .contextdb-enable` — to turn on memory
3. `codex` (or `claude`/`gemini`) — to start coding

Everything else — teams, harness, memo, superpowers — you can learn as you need them.

### How do I update?

```bash
aios
# Then choose "Update" from the menu
```

### How do I uninstall?

```bash
aios uninstall --components shell,skills,native
```

## Where To Go Next

- [ContextDB](contextdb.md) — understand how memory works under the hood
- [Agent Team](team-ops.md) — run multiple agents in parallel
- [Solo Harness](solo-harness.md) — let agents work overnight
- [Find Commands By Scenario](use-cases.md) — a command reference organized by task
- [Troubleshooting](troubleshooting.md) — fix common issues
