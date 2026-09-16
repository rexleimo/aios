---
title: "v5.16.0: ZCode Joins AIOS — with Real Subagents"
description: "AIOS v5.16.0 adds ZCode as a first-class client: shared-root skills, AGENTS.md native context, team routing, a strict-schema MCP bridge, and rex role cards installed as executable ZCode subagents through an inline plugin. Pi's capability chain is repaired alongside."
date: 2026-09-16
tags: ["AIOS", "ZCode", "client", "agents", "MCP", "release", "v5.16.0"]
---

# v5.16.0: ZCode Joins AIOS — with Real Subagents

ZCode — Z.AI's desktop coding app — is now the ninth first-class AIOS client. Like every client added since the registry refactor, it is one definition block in `scripts/lib/clients/core/definitions.mjs`: skills projection, native sync, interception, shell shims, and doctor gates all derive from it.

## Audited, not assumed

Capabilities were checked against the real app, not the feature list. ZCode natively scans the shared `.agents/skills` root, so AIOS projects there instead of leaving duplicate copies; the instruction file is AGENTS.md; team routing drives the bundled CLI headlessly with `--mode yolo`. Two things ZCode 0.16.5 genuinely lacks: a `--model` flag (model routing stays empty until upstream adds it) and project-scope subagent definitions.

## Subagents through the plugin door

The missing subagent surface mattered — until we found the door ZCode does have: plugin `agents/*.md` directories are executed as subagents (the official document-skills plugin proves the channel). v5.16.0 materializes rex role cards as an `aios-agents` inline plugin under `~/.aios/zcode-plugin` and registers it through the user-level `plugins.dirs` config — no GUI clicks. A `doctor:zcode-agents` gate reports manifest validity, agent drift, and registration state.

## The strict-schema trap

ZCode silently discards MCP servers that carry unknown config keys. The JSON migrator now understands ZCode's nested `mcp.servers` namespace and normalizes the three AIOS-managed servers to its strict schema (`startupTimeoutSec` seconds → `timeoutMs` milliseconds, field allowlist); user-owned servers pass through untouched.

## The shim that made detection work

ZCode's CLI ships inside the app bundle and is not on PATH. AIOS's registry-driven native shims plus a launcher for the bundled `zcode.cjs` fixed detection and dispatch — `zcode --version` verified end-to-end through the shim chain.

## Also in this release

Pi's capability chain was repaired: `aios-bridge` joins the MCP servers seeded into Pi, the harness gains a long-lived `--transport rpc` driver, `doctor:pi-bridge` landed, `aios memo checkpoint` pins milestones from the CLI, and Pi project skills moved to the shared `.agents/skills` root with paired legacy cleanup.

## Upgrade

Run `aios init --agent zcode` (or `aios update`) to project skills, register the agents plugin, and install the shims. One heads-up: running ZCode headless needs a one-time `zcode login`. Changelogs ship in English, Chinese, Japanese, and Korean.
