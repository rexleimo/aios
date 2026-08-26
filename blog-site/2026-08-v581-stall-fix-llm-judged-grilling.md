---
title: "v5.8.1: No More Frozen Agents — aios-shell Stall Fix and LLM-Judged Requirements Clarification"
description: "AIOS v5.8.1 fixes the aios-shell MCP stall that froze opencode/codex mid-command, and replaces regex-based ambiguity detection with LLM semantic judgment — grilling happens in-execution, one decision at a time."
date: 2026-08-26
tags: ["AIOS", "release", "mcp", "aios-shell", "requirements", "grilling", "llm", "stability"]
---

# v5.8.1: No More Frozen Agents — aios-shell Stall Fix and LLM-Judged Requirements Clarification

Two long-standing pain points get fixed in v5.8.1: coding agents (opencode, codex) freezing mid-command with no way to recover, and the workflow layer failing to notice when a request is actually vague.

## The stall: long commands froze the whole agent

If you ran `aios_shell` with a command that took a while — a build, a test run, a multi-minute script — the agent went dead. No ping response, no cancel, no progress. You had to press Esc and send "continue" to get it moving again.

The root cause was architectural: the MCP server and the stdio proxy both processed JSON-RPC **serially**. One long-running command blocked every request behind it, including the `notifications/cancelled` message that Esc sends. The client literally could not cancel the command, and no response ever came back.

### What changed

- The shell server main loop is now **concurrent**: ping, cancel, and other requests stay responsive while a command runs.
- The stdio proxy forwards concurrently too, so the proxy layer no longer blocks on an upstream command.
- `notifications/cancelled` terminates the in-flight command by requestId immediately, instead of waiting for the timeout.
- On Windows, `taskkill /T /F` reaps the **entire process tree** — no more orphaned node/npm/git children after `cmd.exe` exits.
- Closing stdin cleans up all pending commands, so nothing is left hanging.

The aios-shell proxy chain is preserved: `aios-mcp-proxy.mjs` still attaches `_meta.aios` observation metadata and local refs. RTK and Caveman remain the client-side output compression (the proxy never actually compressed output — it forwards it unchanged, and `SHELL_TOOL.description` no longer claims otherwise).

As a safety net on top of the concurrency fix, generated MCP server configs now carry startup timeouts (`startup_timeout_sec` 60/30/30 for browser/auth/shell on Codex; `experimental.mcp_timeout: 90000` injected for OpenCode).

## The other fix: knowing when a request is vague

The workflow layer previously decided "this request is vague" with **regex**. Patterns like `VAGUE_BEHAVIOR_PATTERN` matched explicit wording — "优化一下" / "tweak the login logic" — but missed the far more common case: a request that names a concrete feature yet has no acceptance criteria, no scope, and no success definition. The regex fired only when the user happened to phrase things the pattern expected, so requirements clarification often never triggered and the agent built the wrong thing.

### Grilling is now LLM-judged and in-execution

- `derive-facts.mjs` no longer derives ambiguity from wording with regex.
- The requirements capability activates only on a `grill`/`spec` intent (the LLM's semantic judgment) or a domain-vocabulary observation.
- `rex-requirements` was rewritten around **embedded in-execution grilling**: ask one decision question at a time with a recommended answer, converge within three rounds, and only when you hit a real decision point. Grilling is not a front-loaded interrogation gate — the agent works first, looks up facts itself, and stops to ask only when a decision genuinely belongs to the user.
- Because the workflow runtime re-selects the next capability at every stage boundary, clarification can be inserted mid-delivery and the original capability resumes afterwards.

The skill description is dual-trigger: the LLM may self-trigger on a vague, underspecified, or multi-interpretable request — even one that names a specific feature — and rex-harness may activate it as before.

## Upgrade

```bash
aios update
```

No config migration is needed. Restart opencode/codex after updating so the new shell server and proxy take effect.

## Also in this release

- `rex-code-review` gained a **scenario-based subagent acceptance mode**: isolated, context-free acceptance runs covering normal, boundary, and abnormal scenarios, with evidence collected per finding.
- All MCP config generators (Codex TOML, OpenCode JSON) now emit startup timeouts by default.
