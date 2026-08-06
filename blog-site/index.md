---
title: Blog Hub
description: Stories, tutorials, and deep dives about Harness CLI — the local agent workflow layer that adds memory, collaboration, and verification to codex, claude, gemini, opencode, and Grok Build.
---

# Blog

Stories, tutorials, and deep dives about making AI coding agents smarter, more reliable, and easier to work with.

Harness CLI (also called AIOS) is a local agent workflow layer — not a new coding agent, but a layer that makes your existing `codex`, `claude`, `gemini`, and `opencode` better with memory, teamwork, and self-diagnostics.

## Start Here

New to Harness CLI? These posts will get you oriented:

- [The Story Behind Harness CLI](launch-post.md) — why it was built, and what problems it solves
- [CLI Comparison: Raw vs. Harness CLI](cli-comparison-post.md) — what changes when you add the layer
- [Automation Playbook](automation-playbook-post.md) — practical patterns for daily use
- [v4.0 Adaptive Workflow Policy](2026-07-v400-adaptive-workflow-policy.md) — how the route decision works
- [Which AI Agent Workflow Should You Choose?](2026-07-choose-agent-workflow.md) — a decision table with examples
- [From Raw CLI Commands to a Reliable Workflow](2026-07-raw-cli-to-reliable-workflow.md) — boundaries that make automation repeatable

## Latest Posts

- [v5.4.3: CRG Decision Checkpoints, Worker Journal Rename, and Idempotent aios init](2026-08-v543-crg-decision-checkpoints.md)
- [v5.4.1: Why "aios update" Broke on Windows and How We Fixed Self-Updating](2026-08-v541-windows-self-update-safety.md)
- [Parallel Coding Agents Are Not Free: Git Worktrees Isolate Files, Not State](2026-08-parallel-coding-agents.md)
- [Agent Security Is a State Machine Problem: What the Codex Security Thread Missed](2026-08-ai-agent-security.md)
- [AI Coding Costs Are Out of Control — Cursor Hid the Numbers, Amazon Blew $1.8M, and What a Local Layer Changes](2026-08-ai-coding-cost-crisis.md)
- [v5.4.0: Workflow Iteration v2.1 — Activation Safety, Typed Evidence Contracts, and Full Skill Audit](2026-08-v540-workflow-iteration-v21.md)
- [v4.0 Adaptive Workflow Policy: How Harness CLI Chooses the Right Amount of Process](2026-07-v400-adaptive-workflow-policy.md)
- [Which AI Agent Workflow Should You Choose?](2026-07-choose-agent-workflow.md)
- [From Raw CLI Commands to a Reliable AI Agent Workflow](2026-07-raw-cli-to-reliable-workflow.md)
- [v3.6.0: A Safer Token Intelligence Workflow with Headroom and Ponytail](2026-07-headroom-token-intelligence.md)
- [v3.2.0: Harness 可靠性与技能生命周期升级](2026-07-v320-harness-reliability-upgrade.md)
- [Grok Build Is Now a First-Class AIOS Client](2026-07-grok-build-aios-client.md)
- [Hermes Agent Is Now a First-Class AIOS Client](2026-06-hermes-agent-aios-client.md)
- [v2.0.2: Safer Skill Health Records and Cleaner Crush Config](2026-06-v202-ecc-uplift.md)
- [Agent Governance: Make Team Runs Prove Themselves Before Going Live](2026-06-agent-governance.md)
- [v1.52.0: Deterministic Shell Output Compression via MCP](2026-06-v152-aios-shell-mcp.md)
- [v1.50.1: All-Client Token Compression Compliance](2026-06-v1501-token-compression-compliance.md)
- [v1.50.0: Unified AIOS Search Across Memory, Docs, Plans, and Code](2026-06-v150-unified-aios-search.md)
- [Codemap: Give Your AI Agent a Map of Your Codebase](2026-05-codemap-crg.md)
- [ContextDB Token Compression: Fit More Memory In Less Space](2026-05-token-compression.md)
- [Model Router: The Right Model for Every Task](2026-05-model-router.md)
- [aios memo GUI: See Your Agent's Memory](2026-05-aios-memo-gui.md)
- [Solo Harness: Let One Agent Work Overnight](2026-04-solo-harness.md)
- [debug-hub: When Agents Debug Themselves](2026-05-debug-hub-mcp.md)
- [Browser MCP Upgrades: Smarter Page Reading](2026-04-browser-mcp-weak-model-upgrade.md)
- [Advanced Design Skills: From Vague Prompts to Production UI](advanced-design-skills-page-building.md)
- [Harness CLI TUI Refactor: A Better Terminal Experience](2026-04-rexcli-ink-tui-refactor.md)
- [Windows CLI Startup Stability Update](windows-cli-startup-stability.md)

## Deep Dives

- [AIOS RL Training System: Teaching Agents to Learn](rl-training-system.md)
- [ContextDB Search: Finding Needles in Your History](contextdb-fts-bm25-search.md)
- [Orchestrate Live: Running Subagents in Production](orchestrate-live.md)

## FAQ

### Where should I start?
Read [The Story Behind Harness CLI](launch-post.md) first, then try the [Quick Start](https://cli.rexai.top/getting-started/) guide.

### I care about memory and context management
Start with [Token Compression](2026-05-token-compression.md), then read [ContextDB Search](contextdb-fts-bm25-search.md).

### I want to run agents overnight
Read [Solo Harness](2026-04-solo-harness.md), then check the [Solo Harness docs](https://cli.rexai.top/solo-harness/).

### I want agents to debug themselves
Read [debug-hub](2026-05-debug-hub-mcp.md), then check the [debug-hub docs](https://cli.rexai.top/debug-hub/).

### Is Harness CLI a new coding agent?
No. It wraps around `codex`, `claude`, `gemini`, `opencode`, `hermes`, and `grok` (Grok Build) to add memory, teamwork, and self-diagnostics — without changing how you work.
