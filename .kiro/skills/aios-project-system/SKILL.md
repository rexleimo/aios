---
name: aios-project-system
description: Use when operating in the aios repository and needing the canonical architecture, memory schema, MCP browser tool behavior, and execution constraints before changing workflows.
---

# AIOS Project System

## Overview
Use this skill as the repository map for `aios`. It explains where state lives, how automation actually runs, and which files are authoritative before you edit tasks, workflows, or browser operations.

## Core Topology
- `CLAUDE.md`: project-level behavior contract and architecture overview.
- `memory/skills/*.json`: operational playbooks for recurring tasks (not deterministic executors).
- `memory/specs/*.json`: safety constraints and limits.
- `tasks/{pending,done,failed}`: task queue and outcomes.
- `scripts/run-browser-use-mcp.sh`: default browser MCP launcher (bridges to `ai-browser-book/mcp-browser-use`).
- `mcp-server/`: legacy Playwright MCP implementation retained for compatibility workflows.
- `docs/plans/`: design, implementation, and postmortem documents.

## Runtime Truths (Do Not Skip)
- MCP server label may still be `puppeteer-stealth`, but default runtime now routes to browser-use tools (`chrome.launch_cdp`, `browser.connect_cdp`, `page.*`) via `scripts/run-browser-use-mcp.sh`.
- `mcp-server/src/index.ts` still exposes Playwright `browser_*` tools, but treat that path as legacy/compatibility.
- If both `puppeteer-stealth` and `chrome-devtools` are available, use `puppeteer-stealth` for normal browser automation and reserve `chrome-devtools` for debugging only.
- For interactive runs, explicitly prefer `chrome.launch_cdp { port: 9222, user_data_dir: '~/.chrome-cdp-profile' }`, then `browser.connect_cdp`.
- `memory/skills/*.json` can drift from site UI; treat them as runbooks that require live verification.
- Prefer `page.extract_text` / `page.get_html` evidence before using `page.screenshot`.
- Repo-local discoverable skills must live in `.codex/skills/` or `.claude/skills/`; do not create ad-hoc skill roots such as `.baoyu-skills/*/SKILL.md`. `.baoyu-skills/` is extension-config territory, not a Codex/Claude skill root.
- Keep safety constraints aligned with `memory/specs` and `memory/skills/技能使用约束.json`.

## Superpowers Route Bridge
When requests are substantial, chain process skills and harness controls in this order:
1. Choose process: `superpowers:brainstorming` / `superpowers:writing-plans` / `superpowers:systematic-debugging`.
2. Produce plan artifact in `docs/plans/YYYY-MM-DD-<topic>.md`.
3. Apply `aios-long-running-harness` preflight, evidence gates, and retry policy.
4. Persist run state via ContextDB checkpoints.
5. If work splits into independent domains, use `superpowers:dispatching-parallel-agents`; if domains are coupled, stay sequential.
6. End only with `superpowers:verification-before-completion`.

## Default Operating Order
1. Read task context and matching `memory/skills` + `memory/specs` files.
2. Confirm available MCP tools, CDP session strategy, and selector strategy.
3. Execute with evidence checkpoints (`page.extract_text` / `page.get_html` logs per key step; `page.screenshot` only for visual fallback).
4. Write outcome to docs/history and patch skills if drift is found.

## Resources
- `references/system-map.md`: concise architecture and data flow map.
- `references/file-index.md`: fast file lookup by change intent.
