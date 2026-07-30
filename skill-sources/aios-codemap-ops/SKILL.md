---
name: aios-codemap-ops
description: >
  Quick reference for code-review-graph (CRG) MCP tools. Use when you need
  to look up a CRG tool name, parameter, or pattern. For workflow guidance,
  see AGENTS.md decision checkpoints. Requires `aios internal codemap install`.

installCatalogName: aios-codemap-ops
clients: [codex, claude, gemini, opencode, hermes]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [aios, codemap, code-review, crg, reference]
repoTargets: [codex, claude, gemini, opencode, hermes]
---

## CRG Tool Quick Reference

## Install/Doctor Targets

`aios internal codemap install --client all` should make CRG available to the AIOS-supported clients:

| Client | Config written |
|--------|----------------|
| Codex | `~/.codex/config.toml` (`[mcp_servers.code-review-graph]`) |
| Claude Code | `<project>/.mcp.json` |
| Gemini CLI | `<project>/.gemini/settings.json` |
| OpenCode | `~/.config/opencode/opencode.json` plus `plugins/crg-plugin.ts` |

If a client cannot see CRG tools, run `aios internal codemap doctor --fix --client <client>` from the target project, then restart that client.

## Structured-plan context candidates

When you know a structured-plan task's implementation target, do not ask a human to hand-author every supporting context reference.

1. Call AIOS MCP `aios_plan_task` with `action: "propose_context"`, the active `task_id`, and workspace-relative `targets` when the task has no targets yet.
2. AIOS derives a durable proposal from the target plus CRG callers, callees/imports, and tests. This proposal is reviewable only; it does not alter `.aios/planning/active.json`.
3. Present the refs and reasons to the human. Ask a human to activate all candidates with `aios plan task <id> --confirm-context-candidates`, or select a subset by repeating `--candidate-ref <ref>`; this is an explicit process step, not an identity/authentication boundary.
4. Only after confirmation may you say that the task has active execution context or invoke context-dependent orchestration.

### query_graph patterns

| Pattern | Returns |
|---------|---------|
| `callers_of` | Functions that call the target |
| `callees_of` | Functions called by the target |
| `imports_of` | Imports from a file/module |
| `importers_of` | Files that import a file/module |
| `children_of` | Nodes contained in a file/class |
| `tests_for` | Tests covering the target |
| `inheritors_of` | Classes inheriting from target |
| `file_summary` | All nodes in a file |

### refactor_tool modes

| Mode | Action |
|------|--------|
| `rename` | Preview rename across all locations |
| `dead_code` | Find unreferenced symbols |
| `suggest` | Community-driven refactoring suggestions |

### Confidence tiers

| Tier | Meaning |
|------|---------|
| `EXTRACTED` | Certain — directly parsed from code |
| `INFERRED` | Likely — deduced from patterns |
| `AMBIGUOUS` | Guess — low confidence |

### detail_level

- **minimal** (default): summary + counts + key entity names
- **standard**: full output with node/edge details

Always start with `minimal`. Escalate to `standard` only when insufficient.

### Key tool parameters

| Tool | Key params |
|------|-----------|
| `get_minimal_context` | `task` (required) |
| `detect_changes` | `base`, `detail_level`, `changed_files` |
| `get_impact_radius` | `changed_files`, `max_depth`, `detail_level` |
| `get_review_context` | `base`, `detail_level`, `include_source` |
| `get_affected_flows` | `changed_files`, `base` |
| `semantic_search_nodes` | `query`, `kind`, `limit` |
| `query_graph` | `pattern`, `target`, `detail_level` |
| `traverse_graph` | `query`, `mode` (bfs/dfs), `depth`, `token_budget` |
| `find_large_functions` | `min_lines`, `kind`, `file_path_pattern` |
| `get_architecture_overview` | (none) |
| `get_hub_nodes` | `top_n` |
| `get_bridge_nodes` | `top_n` |
| `get_knowledge_gaps` | (none) |
| `get_surprising_connections` | `top_n` |
| `get_suggested_questions` | (none) |
