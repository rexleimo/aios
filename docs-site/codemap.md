---
title: Code Review Graph (Codemap)
description: A structural knowledge graph that gives your coding agents instant codebase understanding — callers, dependents, test coverage, and blast radius at every decision point.
---

# Code Review Graph (Codemap)

**The short version:** Codemap builds a Tree-sitter knowledge graph of your entire codebase and injects it as MCP tools into all your coding agents. Your agents stop blindly grepping files and start making informed decisions — knowing what calls what, what tests cover what, and what will break if you change something.

No external services. No cloud. Just a local SQLite graph in `.code-review-graph/`.

## Why Codemap?

Without Codemap, agents explore codebases like this:

```
Agent reads README → grep for "auth" → reads 3 files blind → guesses impact → modifies code → reads more files to verify → may miss callers → rework
```

With Codemap:

```
Agent queries graph → knows callers/dependents/tests → calculates blast radius → makes informed change → queries graph to verify → confident submission
```

**Measured token reduction:** 4.9x–27.3x across real repos, averaging 8.2x. More importantly, it changes the *quality* of agent decisions.

## One-Command Setup

```bash
aios internal codemap install
```

That's it. This single command:

1. Checks `uv` is available (CRG runs via `uvx` — zero global installs)
2. Builds the initial graph (~5-15s for most projects)
3. Injects the CRG MCP server into all detected clients (opencode / codex / claude / gemini)
4. Installs the opencode auto-update plugin (if opencode is detected)
5. Updates `AGENTS.md` with graph-first decision guidance

```bash
# Check installation health
aios internal codemap doctor

# Fix any issues
aios internal codemap doctor --fix

# Rebuild graph from scratch
aios internal codemap build

# Incremental update (changed files only, <2s)
aios internal codemap update

# View graph statistics
aios internal codemap status

# Remove cleanly (preserves .code-review-graph/)
aios internal codemap uninstall
```

## How Agents Use It

After install, every agent session loads the AGENTS.md decision checkpoints:

### Decision Checkpoints (Mandatory)

| When | Call | Why |
|------|------|-----|
| Before doing anything | `get_minimal_context(task="...")` | Project context + suggested next steps |
| Before modifying code | `get_impact_radius(detail_level="minimal")` | Check blast radius; if risk=high, re-evaluate plan |
| Before modifying code | `query_graph(pattern="tests_for", target="...")` | Confirm tests exist; if not, write tests first |
| After modifying code | `detect_changes(detail_level="minimal")` | Verify actual impact matches expected |
| Before submitting | `get_affected_flows()` + `get_suggested_questions()` | Final safety net |

### Search Rules

- Finding code: `semantic_search_nodes` before grep
- Understanding relationships: `query_graph` (callers_of/callees_of/tests_for) before reading files
- Code review: `detect_changes` → `get_review_context` before reading entire files

Always use `detail_level="minimal"`; escalate to "standard" only when insufficient.

## Key Tools

Codemap exposes 28 MCP tools + 5 prompts. Here are the most impactful ones:

| Tool | What It Does | When To Use |
|------|-------------|-------------|
| `get_minimal_context` | Returns project structure, risk level, relevant communities, next steps | Every session start |
| `get_impact_radius` | Shows everything affected by a change | Before writing any code |
| `detect_changes` | Risk-scored analysis of what actually changed | After modifying code |
| `query_graph` | Traces callers, callees, imports, tests for any symbol | Understanding relationships |
| `semantic_search_nodes` | Finds functions/classes by name or meaning | Locating code (replaces grep) |
| `get_review_context` | Focused source snippets for code review | Before submitting |
| `get_affected_flows` | Which execution paths are impacted | Impact analysis |

### `query_graph` Patterns

| Pattern | Returns |
|---------|---------|
| `callers_of` | Functions that call the target |
| `callees_of` | Functions called by the target |
| `imports_of` | Imports from a file/module |
| `importers_of` | Files that import a file/module |
| `tests_for` | Tests covering the target |
| `inheritors_of` | Classes inheriting from target |

## Deep Integration

Codemap is not a standalone tool — it's woven into AIOS workflows:

- **Doctor suite:** `doctor:codemap` gate checks graph health, MCP config, and state file in every `aios doctor` run
- **Harness:** Solo harness automatically builds the graph inside worktrees when Codemap is active
- **Agent Team:** Team dispatch includes CRG `detect-changes` analysis so every worker knows the change impact
- **Skills:** Search-first, debug-hub, and requesting-code-review skills prioritize CRG tools over grep/glob

## Architecture

```
aios internal codemap install
  ├─ Checks uv/uvx availability
  ├─ Runs uvx code-review-graph build      → .code-review-graph/ (SQLite)
  ├─ Injects MCP config into all clients    → .mcp.json / ~/.claude.json / etc.
  ├─ Installs opencode auto-update plugin   → ~/.config/opencode/plugins/crg-plugin.ts
  ├─ Writes state file                      → .aios/codemap.json
  ├─ Updates AGENTS.md decision guidance
  └─ Syncs aios-codemap-ops skill to client dirs
```

All graph data stays local. CRG runs via stdio MCP — no HTTP server, no external network calls (except one-time `uvx` package resolution on first install).

## Uninstall

```bash
aios internal codemap uninstall
```

Removes MCP config entries, state file, and AGENTS.md section. Preserves `.code-review-graph/` — your graph data is valuable and never deleted.

Dry-run preview:

```bash
aios internal codemap uninstall --dry-run
```
