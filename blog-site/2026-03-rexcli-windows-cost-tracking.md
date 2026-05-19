---
title: "Harness CLI Update: Windows Native Support + Live Cost Tracking"
description: "Harness CLI brings major updates: a complete Windows workflow, live API cost telemetry, and OpenCode Agent integration for more transparent AI development."
date: 2026-03-16
tags: [Harness CLI, Windows, Cost Tracking, OpenCode, AI Development]
---

# Harness CLI Update: Windows Native Support + Live Cost Tracking

This update ships multiple improvements that make AI-assisted development more reliable and transparent.

## Windows Native Workflow Support

Harness CLI now supports Windows workflows end-to-end. We addressed Windows-specific issues around path handling and command-line argument splitting so Windows developers can use the same workflows smoothly.

Key improvements:

- Native Windows path handling (e.g. `C:\Users\...`)
- Safer startup behavior for cmd-based wrappers
- Reduced risk of Codex argument splitting issues on Windows
- Graceful degradation support for non-git workspaces

Related docs: [Windows Guide](/windows-guide/)

## Live Cost Tracking (Cost Telemetry)

Live cost telemetry helps you understand API usage cost in real time. During long-running tasks, Harness CLI can track and display:

- token usage
- cost summary
- budget controls
- warnings when budget thresholds are crossed

You can see cost telemetry in `aios orchestrate` runs.

## OpenCode Agent Support

Harness CLI integrates OpenCode Agent support so you can:

- use OpenCode’s agent ecosystem,
- run more flexible orchestration and dispatch strategies.

## Related Links

- Docs: `/getting-started/`
- Repo: <https://github.com/rexleimo/harness-cli>
