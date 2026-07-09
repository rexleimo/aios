# Grok Build First-Class AIOS Client — Design

**Date:** 2026-07-09  
**Status:** Approved  
**Approach:** A (mirror Codex-style surfaces)  
**runtimeClientId:** `grok-build`

## Goal

Register xAI **Grok Build** (`grok` CLI) as a first-class AIOS client with the same capability set as Codex/Claude: skills, agents, superpowers, native, team, harness — plus official docs, changelog, and multi-language blog.

## Identity

| Field | Value |
|-------|--------|
| clientId | `grok` |
| commandName | `grok` |
| runtimeClientId | `grok-build` |
| projectSkillRoot | `.grok/skills` |
| agentTargetRoot | `.grok/agents` |
| nativeMetadataRoot | `.grok` |
| instructionFileName | `AGENTS.md` |
| nativeProjectSourceFile | `AGENTS.md` |
| modelArgFlag | `-m` |
| unattendedArgs | `['--always-approve']` |
| capabilities | skills, agents, superpowers, native, team, harness |

## MCP

| Scope | File |
|-------|------|
| home | `config.toml` under `~/.grok` (`GROK_HOME`) |
| project | `.grok/config.toml` |

Format: `toml`, namespace: `mcp_servers` (same shape as Codex).

## Runtime

- Interactive: `grok` + passthrough args
- One-shot: `grok --always-approve -p <prompt>`
- Harness/team subagent: same as one-shot via strategy table
- Shell bridge: wrap interactive `grok` turns; block management subcommands (`mcp`, `login`, `agent`, etc.)

## Native sync

- Manage `.grok/skills` and `.grok/agents`
- AGENTS.md: when `codex` is selected, codex remains primary writer and appends Grok partial; when only grok (no codex/opencode), grok emitter writes AGENTS.md
- Codemap instruction targets include `grok` on AGENTS.md
- Codemap MCP injects into `~/.grok/config.toml` (codex-toml format)

## Docs

- docs-site: getting-started, use-cases, cli-comparison, solo-harness, architecture, changelog, related lists
- blog: `2026-07-grok-build-aios-client` (en + zh + ja + ko)
- Help strings for `--agent` / `--client` / providers

## Non-goals

- Shipping or forking the Grok binary
- Claiming live smoke verified until smoke evidence exists (capability-report may still classify as pending until smoke)
