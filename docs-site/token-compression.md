---
title: Token Compression
description: Save tokens with community tools RTK + Caveman — installed automatically by aios init.
---

# Token Compression

**AI models have a limit on how much text they can process at once.** Token compression keeps your context small enough to fit, while preserving the important stuff.

Harness CLI integrates two community-maintained tools — **RTK** and **Caveman** — installed automatically via `aios init`.

## The Problem

Every time your agent starts a new session, ContextDB loads the history of what happened before. But if your project has months of history, that's a LOT of text — often more than the model can handle.

Token compression solves this by:

1. **Keeping** recent work, errors, decisions, and file paths
2. **Compressing** repeated logs, verbose output, and stack traces
3. **Dropping** low-priority content only when necessary

## Two Tools

### RTK — Input Compression (command output)

RTK (https://github.com/rtk-ai/rtk) is a Rust CLI proxy that filters and compresses command output 60-90% before it reaches your agent's context. Single binary, <10ms overhead, 100+ supported commands.

Installed and initialized automatically:

```bash
# aios init handles this, but you can also do it manually:
rtk init -g                     # Claude Code / Copilot (default)
rtk init -g --codex             # Codex
rtk init -g --gemini            # Gemini CLI
rtk init --agent hermes         # Hermes
```

After init, commands like `git status` are automatically rewritten to `rtk git status` — your agent receives compact output without any manual effort.

### Caveman — Output Compression (agent replies)

Caveman (https://github.com/JuliusBrussee/caveman) is a Claude Code skill that cuts ~75% of output tokens while keeping full technical accuracy. It compresses the *style*, not the content.

```text
/caveman              # activate (default: full)
/caveman lite         # light: drop filler
/caveman ultra        # telegraphic: minimal
/caveman wenyan       # classical Chinese (even shorter)
"normal mode"         # back to normal
```

### ContextDB Packets

For session history compression:

```bash
npm run contextdb -- context:pack \
  --session <session-id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
```

| Strategy | When to use | What it does |
|---|---|---|
| `balanced` | Default | Compresses low-signal text, keeps errors and recent work |
| `aggressive` | Very small budgets | Maximum compression, minimal detail |
| `legacy` | Old behavior | Only keeps the tail end of history |

**What gets preserved** (never dropped):

- Error messages and failure signals
- File paths and command outputs
- Recent state and decisions

## Browser Reads

When your agent reads web pages, Harness CLI automatically prefers the most compact format:

1. Semantic snapshot (smallest)
2. Targeted text extraction
3. Full text extraction
4. Full HTML (largest)
5. Screenshot (only when visual evidence is needed)

This means less token waste when agents browse the web.

## Installation

```bash
# automatic — detects, installs, configures, initializes
node scripts/aios.mjs init --all

# CI/unattended
node scripts/aios.mjs init --all --yes-compression-tools

# manual
# RTK:     https://github.com/rtk-ai/rtk#installation
# Caveman: https://github.com/JuliusBrussee/caveman#install
```

Both tools run locally — no external services, no data leaves your machine.

## Where To Go Next

- [ContextDB](contextdb.md) — how memory works with compression
- [Solo Harness](solo-harness.md) — long runs benefit most from compression
- [Architecture](architecture.md) — technical details of the compression pipeline
