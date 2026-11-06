---
name: aios-project-system
description: Use when operating in the aios repository and needing the canonical architecture, memory schema, MCP browser tool behavior, and execution constraints before changing workflows.

installCatalogName: aios-project-system
clients: [codex, claude, hermes, workbuddy, pi, zcode, qoder]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [aios, repo]
repoTargets: [codex, claude, gemini, opencode, hermes, agents, workbuddy, pi, zcode, qoder]
---

# AIOS Project System

## Overview
Use this skill as the repository map for `aios`. It explains where state lives, how automation actually runs, and which files are authoritative before you edit tasks, workflows, or browser operations.

**This skill is a map, not a router.** For task routing, use `aios-workflow-router`; execute only the Provider selected by the current Rex Capability Command.

## Core Topology
- `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`: per-client project-level behavior contract and architecture overview (each client loads its own instruction file).
- `skill-sources/*/SKILL.md`: canonical skill sources (edit here, never edit generated copies).
- Generated repo-local skills per client: `.codex/skills`, `.claude/skills`, `.gemini/skills`, `.opencode/skills`, `.agents/skills` — emitted from `skill-sources/` via `config/skills-sync-manifest.json`.
- Agent promotion and workflow enablement are evidence-gated: use `agents smoke` for core-risk rollout evidence, then `skill verify-training` to block changed skills until SkillOpt training is accepted.
- `scripts/lib/tooling/specs/*.json`: runtime specifications and limits.
- `.aios/tasks/{pending,done,failed}`: task queue and outcomes.
- `apps/shell/ui/src/components/console/`: current local AI tool manager; `src/lib/console-navigation.ts` owns view paths and legacy redirects. The default `/` still uses explicit fixture data; real private-project reads and configuration writes are not connected to this UI.
- `scripts/lib/clients/mcp/`: shared landing schema, pure edit planner, format writers and ownership ledger used by MCP registration.
- `scripts/run-local-browser-mcp.mjs`: repository-local browser MCP launcher, used through the `mcp-browser-use` alias.
- `mcp-server/`: legacy Playwright browser runtime and ContextDB MCP servers.
- `docs/plans/`: design, implementation, and postmortem documents.

## Runtime Truths (Do Not Skip)
- The primary browser MCP server label is `mcp-browser-use`; do not add compatibility aliases for old browser MCP names.
- `mcp-server/src/index.ts` still exposes Playwright `browser_*` tools, but treat that path as legacy/compatibility.
- If both `mcp-browser-use` and `chrome-devtools` are available, use `mcp-browser-use` for normal browser automation and reserve `chrome-devtools` for debugging only.
- Use `browser_launch` for local browsers or a profile configured with `cdpPort` / `cdpUrl` for external CDP attachment.
- Repo-local skill `SKILL.md` files can drift from site UI; treat them as runbooks that require live verification.
- Start with `browser_snapshot`; use targeted HTML or screenshots when the accessible snapshot is insufficient.
- Repo-local discoverable skills are generated under each client's skill root (`.codex/skills`, `.claude/skills`, `.gemini/skills`, `.opencode/skills`, `.agents/skills`) from `skill-sources/` — do not create ad-hoc skill roots such as `.baoyu-skills/*/SKILL.md`. `.baoyu-skills/` is extension-config territory, not a skill root. Edit canonical sources under `skill-sources/`, then run skill sync.
- Keep safety constraints aligned with `scripts/lib/tooling/specs` and the `skill-constraints` skill.

## MCP Configuration Contract
- Use `aios mcp list/add/remove/enable/disable/adopt/doctor --json` for real configuration management; the current Console interactions simulate operations.
- Compute all edits for one file with `planServerEdits`, then commit the result with one atomic write. Preserve unmanaged bytes and per-client field allowlists.
- Ownership is a separate fact from matching content: external entries require explicit adoption; force does not adopt them.
- Configuration readability, successful writes, historical landing evidence and a current connection test are separate facts. Only a verified evidence card establishes historical landing verification.
- Preview evidence probes with `node scripts/mcp-landing-evidence.mjs`; `--apply` is required to perform the write/read-back/restore probe. Missing clients stay unsupported or unverified.

## Resources
- `references/system-map.md`: concise architecture and data flow map.
- `references/file-index.md`: fast file lookup by change intent.
