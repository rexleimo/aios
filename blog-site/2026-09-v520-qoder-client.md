---
title: "v5.20.0: Qoder Joins AIOS — Ten Clients, One Definition Block"
description: "AIOS v5.20.0 adds Qoder as the tenth first-class client: .qoder/skills projection, MCP in the settings.json files Qoder actually reads, AGENTS.md context, and headless team runs."
date: 2026-09-19
tags: ["AIOS", "Qoder", "client", "agents", "MCP", "release", "v5.20.0"]
---

# v5.20.0: Qoder Joins AIOS — Ten Clients, One Definition Block

Qoder — Alibaba's AI IDE, with a coding-agent CLI shipped alongside it — is now the tenth first-class AIOS client, next to codex, claude, gemini, opencode, hermes, grok, workbuddy, pi, and zcode. As with every client since the registry refactor, it is one definition block in `scripts/lib/clients/core/definitions.mjs`: skills projection, native sync, MCP targets, shell shims, and doctor gates all derive from it.

## Audited, not assumed

Capabilities were checked against what Qoder really reads, not the feature list. Skills sync into `.qoder/skills/` as SKILL.md markdown directories (user level: `~/.qoder/skills/`) — that is Qoder's authoritative read surface; the shared `.agents/skills` project root also receives the usual AIOS mirror, but Qoder scanning it is unverified, so nothing depends on it. The instruction file is AGENTS.md — AIOS writes its managed block there and Qoder loads it; QODER.md is an accepted alias AIOS deliberately does not write. Both distributions are covered: the international CLI is `qoder` with home `~/.qoder`, the CN one is `qoderclicn` with home `~/.qoder-cn`.

## MCP in the files Qoder actually reads

The migrator projects AIOS-managed servers into Qoder's real settings files — user-level `~/.qoder/settings.json` and project-level `.qoder/settings.json`, both under the top-level `mcpServers` JSON namespace. Remote HTTP MCP goes through Qoder's own CLI CRUD (`qoder mcp add --scope user|local|project --transport stdio|sse|http|ws`) and is reported as registered only against verified evidence. The gitignored `settings.local.json` scope exists and AIOS leaves it alone.

## Headless where team and harness need it

`aios init --agent qoder` does the setup, and auto-detection finds the CLI without a hint. Team and harness spawn routing drives Qoder headless in `-p` print mode, with `--yolo` for unattended runs and `--output-format` for parseable results (flags from the official CLI docs). Doctor and host-capability reporting place Qoder at L2 — MCP proxy — the same tier zcode sits in: enough for interception and projection, with the limits on the record too, since Qoder has host hooks that AIOS init does not inject yet and no turn compression is claimed.

## Model routing: own

Model routing is `own`. Qoder's model is bound to the account and selected interactively with `/model`; there is no verified headless `--model`, so AIOS does not relay endpoints to Qoder — the same honest status as zcode, grok, and workbuddy. The registry records it empty rather than inventing a channel.

## Upgrade

Run `aios init --agent qoder` (or `aios init --all`, or `aios update`) to project skills, migrate the MCP config, and write the AGENTS.md block. Then restart Qoder — and in a session that is already running, `/mcp reload` for MCP changes to take effect. Changelogs ship in English, Chinese, Japanese, and Korean.
