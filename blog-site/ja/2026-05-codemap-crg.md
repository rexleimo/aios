---
title: "Codemap：AIエージェントにコードベースの地図を"
description: "ワンコマンドで Tree-sitter 知識グラフをすべての AI コーディングエージェントに注入。opencode、codex、claude、gemini。エージェントは盲目的な grep をやめ、構造に裏打ちされた意思決定を始める。"
date: 2026-05-21
tags: ["codemap", "code-review-graph", "CRG", "knowledge-graph", "AIOS"]
---

# Codemap: Give Your AI Agent a Map of Your Codebase

AI coding agents are great at writing code. But they're terrible at understanding how code *connects*. They grep filenames, read a few files, and guess the impact of changes. Half the tokens you pay for are spent on blind exploration.

**Codemap changes this.** It builds a Tree-sitter knowledge graph of your entire codebase — every function, every import, every call relationship — and makes it available to your agents as MCP tools. One command. All clients.

## The Problem: Agents Are Blind

When an agent gets a task like "fix the auth timeout bug," here's what happens without Codemap:

```
Agent reads README
  → grep for "auth" → 47 matches across 18 files
  → reads 5 files (maybe the wrong ones)
  → guesses which function to modify
  → writes code
  → reads more files to verify (still guessing)
  → submits — hopes nothing breaks
```

Every "reads file" costs tokens. Every "guesses impact" adds risk. This is why agents sometimes break things they didn't know existed.

## The Solution: A Knowledge Graph for Code

With Codemap installed, the same task becomes:

```
Agent calls get_minimal_context(task="fix the auth timeout bug")
  → Project structure, risk assessment, relevant modules — instantly
Agent calls query_graph(pattern="callers_of", target="authenticate")
  → 12 callers — can't just change the signature, need a wrapper
Agent calls get_impact_radius()
  → 3 files affected, 2 tests covering them — manageable
Agent modifies code
Agent calls detect_changes()
  → Confirms actual impact matches expected — nothing missed
Agent submits with confidence
```

**No blind exploration. No guessing. Every decision backed by structure.**

## One Command, All Clients

```bash
aios internal codemap install
```

This single command:

1. Checks prerequisites (`uv`/`uvx`)
2. Builds the initial graph (5-15 seconds)
3. Injects CRG MCP config into opencode, codex, claude, and gemini
4. Installs the opencode auto-update plugin
5. Updates AGENTS.md with decision-point guidance

That's it. Every agent session from now on gets graph-first code exploration.

```bash
# Health check
aios internal codemap doctor

# Rebuild from scratch
aios internal codemap build

# Quick incremental update (<2 seconds)
aios internal codemap update

# See what's in your graph
aios internal codemap status
```

## What Agents Can See

Codemap exposes 28 MCP tools. Here's what matters most:

| Tool | What it replaces |
|------|-----------------|
| `semantic_search_nodes` | grep — finds code by name *and meaning* |
| `query_graph` | Reading files to understand call chains |
| `get_impact_radius` | Guessing what might break |
| `detect_changes` | Manual diff review |
| `get_affected_flows` | Guessing which features are affected |
| `get_minimal_context` | Reading README + ls + exploring |

## Real Impact

Across real repositories, Codemap delivers 4.9x to 27.3x token reduction compared to grep-based exploration, averaging 8.2x. But the real value isn't just cost — it's the change in agent behavior.

Without Codemap, agents spend 60-80% of their tokens on *understanding* the codebase. With Codemap, that drops dramatically. Agents spend their tokens on *doing work* — which is what you're paying for.

## Deep Integration

Codemap isn't a standalone plugin. It's woven into every AIOS workflow:

- **`aios doctor`** checks Codemap health alongside everything else
- **Solo Harness** automatically builds the graph in worktrees for overnight tasks
- **Agent Team** dispatch includes change impact analysis so every worker knows the blast radius
- **Skills** (search-first, debug-hub, code-review) prioritize CRG tools over grep

## Try It

```bash
# Install (one command)
aios internal codemap install

# Verify
aios internal codemap doctor

# Let your agent explore with a map instead of a flashlight
```

[Full Documentation →](/codemap/){ .md-button }
