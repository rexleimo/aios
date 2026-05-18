---
title: Overview
description: RexCLI adds memory, collaboration, and verification to codex, claude, gemini, and opencode — without changing your workflow.
---

# RexCLI (AIOS)

> A local agent workflow layer that adds memory, collaboration, and verification to `codex` / `claude` / `gemini` / `opencode`.

You keep using the same commands. Nothing changes about your workflow — except your agents get a brain, a team, and self-diagnostics.

[Get Started in 3 Minutes](getting-started.md){ .md-button .md-button--primary }
[See It In Action](use-cases.md){ .md-button }

## Core Capabilities

| Capability | Description | Command |
|---|---|---|
| **ContextDB** | Cross-session project memory with events, checkpoints, and context packs | auto-loaded by `codex` / `claude` / `gemini` / `opencode` |
| **Memo Storage** | Git-friendly project notes; default append-only file storage plus optional split-file storage | `aios memo add "note"` / `aios memo storage status` |
| **Native Route Shortcuts** | Client-native route prompts for single/subagent/team/harness lanes | Claude/Gemini/OpenCode: `/team <task>`; Codex: `/prompts:team <task>` |
| **Native Token Compression** | Self-contained input/output token reduction inspired by RTK/Caveman patterns, without installing competitor tools | `context:pack --token-budget 1200 --token-strategy balanced` |
| **Model Router** | Intelligent multi-model dispatch for Agent Teams — match tasks to optimal model by capability, cost, and success rate | `node scripts/aios.mjs model-router route --task "..."` |
| **Agent Team** | Multi-agent parallel collaboration with HUD visual tracking | `aios team 3:codex "task description"` |
| **Solo Harness** | Single-agent overnight tasks with resume support and run journal | `aios harness run --objective "goal" --worktree` |
| **Perception** | Content outcome tracking + statistical insights + perception injection | `aios perception record` / `insights` / `summary` |
| **Browser MCP** | Stealth browser automation over CDP | `aios internal browser doctor` |
| **Superpowers** | Reusable workflow skills (brainstorm/plan/debug/verify) | Select from TUI |
| **Privacy Guard** | Auto-redact sensitive files before sharing | `aios privacy status` |

## How It Works

```text
User → codex / claude / gemini / opencode
     → zsh wrapper (transparent)
     → ctx-agent.mjs (ContextDB integration)
        → contextdb CLI (memory persistence)
        → launch native CLI (with context pack)
     → browser MCP (optional browser automation)
```

After installation, just use `codex`, `claude`, `gemini`, or `opencode` as usual — RexCLI automatically loads project memory in the background and provisions route shortcuts where the client supports them.

## Quick Tour

```bash
# Launch TUI
aios

# Save a Git-friendly project memo
aios memo add "Remember to keep auth tests strict"
aios memo storage status

# Route from inside native clients after setup
# Claude/Gemini/OpenCode: /team <task>
# Codex: /prompts:team <task>

# Multi-agent collaboration
aios team 3:codex "Refactor the auth module and run tests"

# Single-agent overnight task
aios harness run --objective "Finish the handoff docs for tomorrow" --worktree

# Intelligent model routing
node scripts/aios.mjs model-router route --task "Review auth.js for security issues"

# Native token-compressed ContextDB packet
cd mcp-server && npm run contextdb -- context:pack --session <session_id> --token-budget 1200 --token-strategy balanced

# Content outcome tracking
aios perception record --content-id note_001 --platform xiaohongshu --content-type note --title "Test" --metrics '{"likes":100}'

# Check task status
aios team status --provider codex --watch
```

## First Time Here?

**Start here:** [Quick Start](getting-started.md) — install, set up, and run your first agent with memory in about 3 minutes.

**Already set up?** Jump to what you need:

| I want to... | Go to |
|---|---|
| Give my agent project memory | [ContextDB](contextdb.md) |
| Use multiple agents together | [Agent Team](team-ops.md) |
| Let one agent work overnight | [Solo Harness](solo-harness.md) |
| Route tasks intelligently | [Model Router](model-router.md) |
| Reduce token usage | [Token Compression](token-compression.md) |
| Find the right command | [Commands By Scenario](use-cases.md) |

## Requirements

- Git
- Node.js 22 LTS + npm
- Windows: PowerShell 5.x or 7

## Development

```bash
git clone https://github.com/rexleimo/rex-cli.git
cd rex-cli
```

Verify:

```bash
cd mcp-server
npm test
npm run typecheck
npm run build
```

## Docs

- [Quick Start](getting-started.md) — Install, configure, first run
- [Model Router](model-router.md) — Multi-model dispatch for Agent Teams
- [ContextDB](contextdb.md) — Project memory system
- [Agent Team](team-ops.md) — Multi-agent collaboration guide
- [Solo Harness](solo-harness.md) — Overnight task guide
- [Perception](perception.md) — Content outcome tracking & insights
- [Architecture](architecture.md) — System architecture
- [Troubleshooting](troubleshooting.md) — Common issues
- [Use Cases](use-cases.md) — Find commands by scenario

## Blog Highlights

- [AIOS RL Training System](/blog/rl-training-system/)
- [ContextDB Search Upgrade](/blog/contextdb-fts-bm25-search/)
- [Windows CLI Startup Stability](/blog/windows-cli-startup-stability/)
- [Orchestrate Live](/blog/orchestrate-live/)
