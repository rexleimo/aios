---
name: aios-project-system
description: Use when operating in the aios repository and needing the canonical architecture, memory schema, MCP browser tool behavior, and execution constraints before changing workflows.

installCatalogName: aios-project-system
clients: [codex, claude]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [aios, repo]
repoTargets: [codex, claude, gemini, opencode]
---

# AIOS Project System

## Overview
Use this skill as the repository map for `aios`. It explains where state lives, how automation actually runs, and which files are authoritative before you edit tasks, workflows, or browser operations.

**This skill is a map, not a router.** For task routing, use `aios-workflow-router`. For process skills, use `superpowers:*`.

## Core Topology
- `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`: per-client project-level behavior contract and architecture overview (each client loads its own instruction file).
- `skill-sources/*/SKILL.md`: canonical skill sources (edit here, never edit generated copies).
- Generated repo-local skills per client: `.codex/skills`, `.claude/skills`, `.gemini/skills`, `.opencode/skills`, `.agents/skills` — emitted from `skill-sources/` via `config/skills-sync-manifest.json`.
- Agent promotion and workflow enablement are evidence-gated: use `agents smoke` for core-risk rollout evidence, then `skill verify-training` to block changed skills until SkillOpt training is accepted.
- `scripts/lib/specs/*.json`: runtime specifications and limits.
- `tasks/{pending,done,failed}`: task queue and outcomes.
- `scripts/run-browser-use-mcp.sh`: default browser MCP launcher (bridges to `ai-browser-book/mcp-browser-use`).
- `mcp-server/`: legacy Playwright MCP implementation retained for compatibility workflows.
- `docs/plans/`: design, implementation, and postmortem documents.

## Runtime Truths (Do Not Skip)
- The primary browser MCP server label is `mcp-browser-use`; do not add compatibility aliases for old browser MCP names.
- `mcp-server/src/index.ts` still exposes Playwright `browser_*` tools, but treat that path as legacy/compatibility.
- If both `mcp-browser-use` and `chrome-devtools` are available, use `mcp-browser-use` for normal browser automation and reserve `chrome-devtools` for debugging only.
- For interactive runs, explicitly prefer `chrome.launch_cdp { port: 9222, user_data_dir: '~/.chrome-cdp-profile' }`, then `browser.connect_cdp`.
- Repo-local skill `SKILL.md` files can drift from site UI; treat them as runbooks that require live verification.
- Prefer `page.extract_text` / `page.get_html` evidence before using `page.screenshot`.
- Repo-local discoverable skills are generated under each client's skill root (`.codex/skills`, `.claude/skills`, `.gemini/skills`, `.opencode/skills`, `.agents/skills`) from `skill-sources/` — do not create ad-hoc skill roots such as `.baoyu-skills/*/SKILL.md`. `.baoyu-skills/` is extension-config territory, not a skill root. Edit canonical sources under `skill-sources/`, then run skill sync.
- Keep safety constraints aligned with `scripts/lib/specs` and the `skill-constraints` skill.

## Resources
- `references/system-map.md`: concise architecture and data flow map.
- `references/file-index.md`: fast file lookup by change intent.
