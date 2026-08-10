---
title: "Hermes Agent Is Now a First-Class AIOS Client"
description: "AIOS now registers Hermes Agent (Nous Research) as a first-class AIOS client, with an MCP bridge server exposing 5 core tools — context-pack, doctor, token compression, skill validation, and skill installation — directly inside Hermes sessions."
date: 2026-06-30
tags: ["Hermes Agent", "AIOS", "MCP", "client", "Skills", "Token Compression"]
---

# Hermes Agent Is Now a First-Class AIOS Client

Hermes Agent (the open-source CLI AI agent by Nous Research) now joins Codex CLI, Claude Code, Gemini CLI, OpenCode, and Crush as the seventh first-class AIOS client in AIOS.

This isn't just a config entry. The core of this integration is an **MCP bridge server** — exposing AIOS's five most valuable capabilities as MCP tools that Hermes can call directly.

## Why Hermes Agent needed this

Hermes already ships `session_search`, `memory`, `delegate_task`, `skill_manage`, and `cronjob` as built-in tools. But like every other AIOS client, it lacks systematic support in three areas:

1. **Strategic context recall** — Hermes can search session history, but it can't trim by token budget with priority sorting. Long sessions flood the context window with low-value history.
2. **Environment health self-checks** — Wrong MCP config, outdated Node version, broken skill directories — these silent problems drag down entire workflows, but Hermes has no automatic detection or repair.
3. **Large output compression** — Browser screenshots, long shell output, and HTML dumps waste tokens when they go straight into the context window. Hermes has no interception layer.

The AIOS MCP bridge closes all three gaps.

## The 5 MCP tools

`scripts/aios-mcp-server.mjs` is the new MCP bridge server. It exposes five tools:

### aios_context_pack

Token-budget-aware context compression. Three strategies:

| Strategy | Behavior | Use case |
|----------|----------|----------|
| `legacy` | Tail truncation | Simple scenarios, no priority |
| `balanced` | Priority-sorted pruning | Daily use, keeps most important info |
| `aggressive` | Only critical signals | Harness/checkpoint mode, max compression |

```bash
# Call from inside a Hermes session
aios_context_pack(query="auth bug fix history", token_budget=2000, strategy="balanced")
```

### aios_doctor_suite

Full health check — MCP config, Node version, ContextDB status, skill directories, and client connectivity. Supports `--fix` for auto-repair.

```bash
aios_doctor_suite(workspace="/path/to/project", fix=true)
```

### aios_intercept_compress

Large tool output compression. Three compression modes:

| Mode | Compression level | Use case |
|------|-------------------|----------|
| `tight` | Balanced | Default |
| `ultra` | Maximum | Harness/checkpoints |
| `precise` | Minimal | Safety-critical operations |

```bash
aios_intercept_compress(text="<raw browser output>", mode="tight", tool_name="page.screenshot")
```

### aios_skill_validate

Validate Hermes/AIOS skill directory structure — checks SKILL.md frontmatter required fields (name, description, version, author), content completeness, and referenced file existence.

```bash
aios_skill_validate(skill_path="/path/to/.hermes/skills/my-skill")
```

### aios_skill_install

Install skills from AIOS skill-sources into Hermes's `.hermes/skills/` directory. Supports `copy` (portable) and `link` (local dev) install modes.

```bash
aios_skill_install(skill_name="context-pack", install_mode="copy")
```

## Client registration details

Hermes is registered in `CLIENT_DEFINITIONS` with:

| Property | Value | Notes |
|----------|-------|-------|
| capabilities | skills, native, harness, superpowers | No team/agents yet |
| commandName | hermes | CLI command |
| runtimeClientId | hermes-agent | Runtime identifier |
| projectSkillRoot | `.hermes/skills` | Skill install directory |
| instructionFileName | AGENTS.md | Hermes auto-loads project root AGENTS.md |
| modelArgFlag | `--model` | Model selection flag |
| unattendedArgs | empty | Hermes has no `--yolo` mode |

MCP config dual-scope:

| Scope | File | Notes |
|-------|------|-------|
| Project | `.mcp.json` | Shared with Claude Code |
| Home | `config.yaml` (under `~/.hermes/`) | Hermes YAML config |

## How to enable

### Step 1: Make sure AIOS is installed

```bash
aios doctor
```

### Step 2: Run Setup

```bash
aios          # TUI → Setup → select hermes
```

Or directly:

```bash
aios setup --client hermes
```

### Step 3: Verify MCP bridge

```bash
aios doctor --fix
# Doctor auto-registers aios-mcp-server into Hermes MCP config
```

### Step 4: Use in Hermes

Start Hermes in any project. The 5 AIOS MCP tools are automatically available:

```bash
hermes
# In conversation: @aios_context_pack query="..." token_budget=2000 strategy="balanced"
```

## Differences from other clients

| Feature | Codex/Claude | Hermes |
|---------|-------------|--------|
| Skills directory | `.codex/skills` / `.claude/skills` | `.hermes/skills` |
| Instruction file | AGENTS.md / CLAUDE.md | AGENTS.md (shared) |
| Unattended mode | `--yolo` / `--dangerously-skip-permissions` | None (uses `delegate_task`) |
| MCP config | JSON / TOML | JSON + YAML dual-scope |
| Team orchestration | Supported | Not yet (future extension) |

## What's next

- **Distill Hermes-native skills** — Extract `context-pack`, `hermes-doctor` etc. from AIOS skill-sources into `.hermes/skills/` format
- **Team orchestration extension** — Hermes `delegate_task` already supports sub-agent dispatch; future integration with AIOS multi-client team orchestration
- **ACP sub-agent bridge** — Hermes supports ACP (e.g. Copilot CLI); could merge with AIOS `delegate_task` for cross-client orchestration

---

Read the [AIOS docs](https://cli.rexai.top/) for the full guide, or check [Agent Governance](/blog/2026-06-agent-governance/) to see how AIOS keeps multi-client workflows safe.

## Related

- [Getting Started](https://cli.rexai.top/getting-started/)
- [Quick Start](https://cli.rexai.top/getting-started/) — install AIOS in 30 seconds
- [Workflow Policy](https://cli.rexai.top/workflow-policy/) — direct / guarded / planned routes
