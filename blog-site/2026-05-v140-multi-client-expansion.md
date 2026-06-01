---
title: "v1.40: Now Supporting 6 AI Coding Clients"
description: "Harness CLI expands from 4 to 6 supported clients with Antigravity CLI and Crush, plus full superpowers parity across all clients."
date: 2026-05-31
tags: ["release", "multi-client", "antigravity", "crush", "superpowers", "AIOS"]
---

# v1.40: Now Supporting 6 AI Coding Clients

Harness CLI just got a lot bigger. Version 1.40 adds two new AI coding client integrations — **Antigravity CLI** and **Crush** — and brings **superpowers workflow skills to every supported client**.

## What's New

### Antigravity CLI Support

Antigravity CLI (the successor to Gemini CLI) is now a first-class Harness CLI client. It gets:

- **Skills** — all AIOS skills auto-discovered via `.gemini/skills/` (Antigravity's native path)
- **Native instructions** — `GEMINI.md` with ContextDB, codemap, and browser MCP guidance
- **Team routing** — `/team <task>` shortcut for multi-agent dispatch
- **Superpowers** — brainstorming, planning, debugging, verification workflows

If you were using Gemini CLI before, Antigravity is a drop-in replacement. Same skill paths, same instruction format.

### Crush (charmbracelet) Support

Crush is a new terminal-based AI coding client from the charmbracelet team. Harness CLI now supports:

- **Agent emitters** — Crush-specific agent definitions in `.crush/agents/`
- **Model flags** — `--model` argument passthrough for model selection
- **YOLO mode** — `--yolo` for fully unattended execution (no confirmation prompts)
- **Team capability** — full team dispatch support

Crush is ideal for headless/CI environments where you want AI coding without interactive prompts.

### Superpowers for Everyone

Before v1.40, superpowers workflow skills (brainstorming, planning, debugging, TDD, verification) were only wired for Codex and Claude. Now **all 6 clients** get superpowers:

| Client | Skills | Superpowers | Team | Agents |
|--------|--------|-------------|------|--------|
| Claude | ✅ | ✅ | ✅ | ✅ |
| Codex | ✅ | ✅ | ✅ | ✅ |
| Gemini | ✅ | ✅ | ✅ | ❌ |
| Antigravity | ✅ | ✅ | ✅ | ❌ |
| OpenCode | ✅ | ✅ | ✅ | ✅ |
| Crush | ✅ | ✅ | ✅ | ✅ |

*Note: Gemini and Antigravity don't support the `agents` capability because they don't have a native agent-file convention. This is intentional — routing `agent-routing.md` to a client that can't honor it would be misleading.*

### Other Changes

- **XHS-only skills removed** — core AIOS skills now work across all clients, not just Xiaohongshu-specific ones
- **OpenCode team support** — OpenCode now gets team/model-router/harness instruction injection
- **Skill sync** — `sync-skills.mjs` updated to handle all 6 clients

## Upgrade

```bash
# macOS / Linux
curl -fsSL https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.sh | bash

# Windows PowerShell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.ps1 | iex
```

Or update in-place: `aios` → `Update` → `Doctor`.

## What's Next

- Expanding agent support to Gemini/Antigravity if they add native agent-file conventions
- Cross-client agent migration (move agent definitions between clients)
- Enhanced model routing per client type

See the full [changelog](https://github.com/rexleimo/harness-cli/blob/main/CHANGELOG.md) for all details.
