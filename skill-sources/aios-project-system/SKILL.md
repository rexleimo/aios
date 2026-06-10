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
repoTargets: [codex, claude, gemini, antigravity, opencode, crush]
---

# AIOS Project System

## Overview
Use this skill as the repository map for `aios`. It explains where state lives, how automation actually runs, and which files are authoritative before you edit tasks, workflows, or browser operations.

**This skill is a map, not a router.** For task routing, use `aios-workflow-router`. For process skills, use `superpowers:*`.

## Core Topology
- `CLAUDE.md`: project-level behavior contract and architecture overview.
- `.codex/skills/*/SKILL.md` and `.claude/skills/*/SKILL.md`: operational playbooks for recurring tasks (not deterministic executors).
- `scripts/lib/specs/*.json`: runtime specifications and limits.
- `tasks/{pending,done,failed}`: task queue and outcomes.
- `scripts/run-browser-use-mcp.sh`: default browser MCP launcher (bridges to `ai-browser-book/mcp-browser-use`).
- `mcp-server/`: legacy Playwright MCP implementation retained for compatibility workflows.
- `docs/plans/`: design, implementation, and postmortem documents.

## Runtime Truths (Do Not Skip)
- MCP server label may still be `puppeteer-stealth`, but default runtime now routes to browser-use tools (`chrome.launch_cdp`, `browser.connect_cdp`, `page.*`) via `scripts/run-browser-use-mcp.sh`.
- `mcp-server/src/index.ts` still exposes Playwright `browser_*` tools, but treat that path as legacy/compatibility.
- If both `puppeteer-stealth` and `chrome-devtools` are available, use `puppeteer-stealth` for normal browser automation and reserve `chrome-devtools` for debugging only.
- For interactive runs, explicitly prefer `chrome.launch_cdp { port: 9222, user_data_dir: '~/.chrome-cdp-profile' }`, then `browser.connect_cdp`.
- Repo-local skill `SKILL.md` files can drift from site UI; treat them as runbooks that require live verification.
- Prefer `page.extract_text` / `page.get_html` evidence before using `page.screenshot`.
- Repo-local discoverable skills must live in `.codex/skills/` or `.claude/skills/`; do not create ad-hoc skill roots such as `.baoyu-skills/*/SKILL.md`. `.baoyu-skills/` is extension-config territory, not a Codex/Claude skill root.
- Keep safety constraints aligned with `scripts/lib/specs` and `.codex/skills/skill-constraints/SKILL.md`.

## Resources
- `references/system-map.md`: concise architecture and data flow map.
- `references/file-index.md`: fast file lookup by change intent.
