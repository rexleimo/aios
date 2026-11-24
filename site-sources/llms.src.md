<!--
  docs-site/llms.txt is GENERATED. Edit site-sources/llms.src.md instead, then run:
      node scripts/generate-llms-txt.mjs
  The version marker and the Blog index below are derived from VERSION, CHANGELOG.md
  and blog-site/*.md, so they cannot drift from what is actually shipped.
-->
# AIOS

> Local-first agent workflow layer for Claude Code, Codex CLI, Gemini CLI, OpenCode, Hermes, Grok Build, WorkBuddy (CodeBuddy CLI), Pi, ZCode, and Qoder. Adds cross-session project memory (ContextDB), adaptive workflow routing (noop/direct/guarded/planned), multi-agent collaboration, and verification gates on top of the coding clients you already use — without replacing them. Entirely local: memory, logs, and evidence stay on your machine. <!-- llms:version -->

## One-Line Definition
AIOS is a local-first agent workflow layer that gives coding CLIs (Claude Code, Codex, Gemini CLI, OpenCode, Hermes, Grok, WorkBuddy, Pi, ZCode, Qoder) cross-session project memory, adaptive routing, multi-agent teams, and verification — same commands, now with a brain.

## Search Intents
- what is AIOS
- how do I give Claude Code persistent memory
- why does my coding agent forget context between sessions
- codex cli multi agent team setup
- reduce token cost claude code / codex
- what is Graph Engine for AI agents
- what is a Graph Engine for coding agents
- local-first Graph Engine vs LangGraph CrewAI AutoGen
- verifiable agent graph for coding agents
- what is Graph Engineering for AI agents
- what is Loop Engineering and why does it matter
- how to run a coding agent overnight without crashing
- how to add TypeSafe Jev to Claude Code / Codex
- TypeSafe System One Jev model integration for coding agents
- install a third-party MCP server across all coding clients safely
- how to verify a vendor agent skill before installing it
- how to install an AIOS plugin from GitHub
- how to write and contribute an AIOS plugin
- AIOS plugin manifest permissions and trust boundary
- local-first AI coding agent vs cloud agent
- adaptive agent workflow policy direct guarded planned
- agent harness vs bare coding CLI
- ContextDB local project memory
- multi-agent code review with parallel coding agents
- model router cheaper tier for repeated agent tasks
- windows AI coding agent setup
- AIOS vs mem0 / agent memory solutions
- agent verification gates and evidence contracts
- token compression RTK Caveman Headroom
- how to resume an interrupted long-running agent task
- git worktree isolation for parallel agents
- privacy-safe coding agent (no data leaves the machine)

## Canonical
- https://cli.rexai.top/ — docs home, local-first agent harness overview

## Core Docs
- https://cli.rexai.top/getting-started/ — 30-second install and first `aios doctor` run
- https://cli.rexai.top/workflow-policy/ — direct / guarded / planned route decisions
- https://cli.rexai.top/use-cases/ — commands by intent
- https://cli.rexai.top/architecture/ — runtime layers and Graph Engineering mapping
- https://cli.rexai.top/case-library/ — real-world case studies
- https://cli.rexai.top/contextdb/ — local project memory store
- https://cli.rexai.top/token-compression/ — local token budget control
- https://cli.rexai.top/troubleshooting/ — recovery procedures
- https://cli.rexai.top/integrations/ — vendor integrations (TypeSafe / Jev) across all ten clients
- https://cli.rexai.top/plugins/ — install plugins from GitHub, author manifests, and contribute by PR
- https://cli.rexai.top/changelog/ — version history

## Problem-First Guides
- https://cli.rexai.top/why-agents-forget-context/ — fix coding agent cross-session memory loss with ContextDB
- https://cli.rexai.top/reduce-agent-token-cost/ — cut Claude Code / Codex token spend with local compression
- https://cli.rexai.top/claude-code-vs-codex-vs-gemini/ — which coding agent CLI to choose and why
- https://cli.rexai.top/overnight-agent-runs/ — keep a coding agent running overnight with checkpoints and gates
- https://cli.rexai.top/multi-agent-code-review/ — reliable parallel code review with agent teams
- https://cli.rexai.top/windows-ai-coding-agent-setup/ — Windows AI coding agent setup in 10 minutes

## Blog

<!-- llms:release-index -->

## Languages
- https://cli.rexai.top/zh/ — 简体中文 docs (local-first agent harness 定位)
- https://cli.rexai.top/ja/ — 日本語 docs
- https://cli.rexai.top/ko/ — 한국어 docs

## Related Sites
- https://rexai.top/
- https://tool.rexai.top/
- https://github.com/rexleimo/aios — source, installers, releases
