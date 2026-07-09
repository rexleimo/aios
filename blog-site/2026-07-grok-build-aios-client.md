---
title: "Grok Build Is Now a First-Class AIOS Client"
description: "Harness CLI now registers xAI Grok Build as a first-class AIOS client — skills, agents, native sync, Codex-shaped TOML MCP, team and harness providers, with runtime id grok-build."
date: 2026-07-09
tags: ["Grok Build", "AIOS", "MCP", "client", "Skills", "xAI"]
---

# Grok Build Is Now a First-Class AIOS Client

xAI **Grok Build** (`grok` CLI) now joins Codex CLI, Claude Code, Gemini CLI, OpenCode, and Hermes Agent as a first-class AIOS client in Harness CLI.

This is not a config-only mention. Grok Build is wired through the same client registry that drives native sync, skills install, codemap MCP injection, `ctx-agent` one-shot/interactive routes, and solo harness / team providers.

## Why Grok Build needed first-class support

Grok Build already ships a strong TUI coding surface: project rules (`AGENTS.md`), skills (`.grok/skills` and `.agents/skills`), MCP servers (`~/.grok/config.toml`), subagents, headless `-p` mode, and `--always-approve` for unattended runs.

What it lacked in this repository was systematic AIOS integration:

1. **Client identity** — no `CLIENT_DEFINITIONS` entry, so skills/native/harness code paths could not resolve `grok` or `grok-build`.
2. **Native projection** — AIOS managed blocks and skill roots were never emitted under `.grok/`.
3. **Orchestration** — team / harness / `ctx-agent --agent ...` had no verified invocation shape for Grok.
4. **Docs** — official site, changelog, and blog listed only the older CLI set.

## What is registered

| Property | Value | Notes |
|----------|-------|-------|
| clientId | `grok` | Short name used by `--client` / `--provider` |
| commandName | `grok` | PATH binary |
| runtimeClientId | `grok-build` | Used by `--agent` and ContextDB runtime ids |
| capabilities | skills, agents, superpowers, native, team, harness | Full first-class set |
| projectSkillRoot | `.grok/skills` | Markdown-directory skills |
| agentTargetRoot | `.grok/agents` | Project agent definitions |
| instructionFileName | `AGENTS.md` | Shared with Codex / OpenCode / Hermes |
| modelArgFlag | `-m` | Model selection |
| unattendedArgs | `--always-approve` | Unattended / harness-friendly |

### MCP targets (Codex-shaped TOML)

| Scope | File |
|-------|------|
| Home | `~/.grok/config.toml` (`GROK_HOME` override) |
| Project | `.grok/config.toml` |

Format matches Codex: TOML tables under `mcp_servers.<name>` with `command` / `args` / `env`.

## How to enable

### 1. Install Grok Build

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
grok --version
```

### 2. Init AIOS in your project

```bash
node scripts/aios.mjs init --agent grok
# or
node scripts/aios.mjs setup --client grok
```

### 3. Run through AIOS routes

```bash
# Interactive
node scripts/ctx-agent.mjs --agent grok-build --workspace .

# One-shot (headless)
node scripts/ctx-agent.mjs --agent grok-build --prompt "summarize blockers" --no-bootstrap

# Solo harness
node scripts/aios.mjs harness run --objective "long task" --provider grok --worktree --max-iterations 8
```

### 4. Codemap / CRG (optional)

```bash
node scripts/aios.mjs internal codemap install --client grok
```

This injects the code-review-graph MCP entry into Grok's home TOML config when Grok is detected.

## Design choices

- **Mirror Codex for MCP** — Grok's official docs use TOML `[mcp_servers.*]`, so AIOS reuses the Codex TOML injector path instead of inventing a JSON shape.
- **Shared AGENTS.md** — Grok natively loads `AGENTS.md` / `Agents.md` / Claude-compat names. AIOS keeps a single managed instruction block and appends a Grok-specific native partial when Codex owns the write.
- **runtime id `grok-build`** — matches the product name and avoids colliding with a generic `grok-cli` assumption.
- **Unattended = `--always-approve`** — taken from current Grok Build CLI help; headless prompts use `-p` / `--single`.

## What this is not

- AIOS does not ship or pin the Grok binary.
- Live smoke evidence still follows the normal `clients doctor` / agents smoke gates before treating a machine as fully verified for unattended production loops.

## Related

- [Changelog v3.4.0](/changelog/)
- [Quick Start](/getting-started/)
- [Solo Harness](/solo-harness/)
- [Hermes Agent client post](/blog/2026-06-hermes-agent-aios-client/)
