---
title: "v1.52.0: Deterministic Shell Output Compression via MCP"
description: "AIOS v1.52.0 introduces aios_shell — an MCP tool that gives every AIOS client deterministic shell output compression at 99% saving ratio, plus shim self-healing and sensitive-command guards."
date: 2026-06-11
tags: ["release", "token-compression", "shell", "MCP", "multi-client", "shim"]
---

# v1.52.0: Deterministic Shell Output Compression via MCP

Shell commands are the biggest untracked token consumer in an AI agent session. A `git diff`, a `find` command, or a test runner can dump tens of thousands of tokens into context — and most of them are noise.

The problem is not compressing the output. The engine could already do that (99% saving ratio since v1.12). The problem is interception: how do you make every shell command consistently flow through the compression layer, across all AIOS clients, without depending on host-specific hooks or PATH hacks?

v1.52.0 answers that question with a new MCP tool: `aios_shell`.

## The Old Way: Hooks and Shims

Before this release, shell output compression relied on two mechanisms:

1. **Native shims** (`~/.aios/bin/codex`) — intercept CLI launches, route them through the AIOS bridge. Works only when the shim is in PATH and the shell environment is correctly sourced.
2. **Claude PreToolUse hooks** — rewrite Bash commands before execution. Claude-only, and only matches commands in an allowlist (`git`, `ls`, `cat`, etc.).

Both mechanisms are fragile. Shims fail when `AIOS_ROOT_DIR` points to a stale temp directory. Hooks fail when the agent uses pipes, redirects, or commands outside the allowlist. For Codex, OpenCode, Gemini, Crush, and Antigravity — there was no shell interception at all.

## The New Way: MCP Shell Tool

`aios_shell` is a standard MCP tool registered under the `aios-shell` alias in all 9 client configs. It works like this:

```
agent → aios_shell MCP tool → MCP proxy → compression → compact packet
```

The key insight: **the tool itself does not compress**. It just runs a shell command and returns raw output. Compression happens automatically in the MCP proxy layer (`json-rpc-proxy.mjs`), which already intercepts `tools/call` responses for the browser MCP server. The same engine that compresses `page.screenshot` output now compresses `git log` output.

```bash
# Before: raw output floods context
agent → Bash tool → 30638 bytes → context window

# After: compressed packet, raw stored as ref
agent → aios_shell → MCP proxy → 411 bytes (98.7% reduction) + ref recall
```

## Three-Layer Defense

The release implements three independent interception layers. If any one fails, the next one catches:

| Layer | Mechanism | Clients |
|-------|-----------|---------|
| 1. MCP tool | `aios_shell` via MCP proxy | All (MCP protocol) |
| 2. Shim + Hook | PATH hijack + Claude hook | Claude (hook), all (shim start) |
| 3. Prompt | AGENTS.md guidance for `--stat`, `--short`, `head -20` | All |

## Shim Self-Healing

Native shims now include a self-healing sequence:

1. Check `AIOS_ROOT_DIR` from environment
2. Check baked-in fallback path
3. Probe `~/.rexcil/aios`
4. Probe `~/cool.cnb/rex-ai-boot`

If all probes fail — the shim `exec`s the real client binary directly. No more `exit 127` dead ends.

## Sensitive Command Guard

The command rewrite engine now intercepts `git push` and `npm publish`, flagging them as "requires host permission review" instead of silently allowing execution.

## Proof

```bash
node scripts/aios.mjs interception proof --json
# saved_bytes: 25875, saving_ratio: 0.993, all clients compliant
```

```bash
node scripts/aios.mjs interception doctor --fix
# 9 config files updated, aios-shell registered everywhere
```

## What Changed

- New: `scripts/shell-mcp-server.mjs` — standalone MCP server for shell execution
- New: `aios-shell` alias registered in `.mcp.json`, `.codex/config.toml`, `.gemini/settings.json`, `opencode.json`, `crush.json`
- Changed: shim self-healing with multi-path probing and fail-open to real client
- Changed: `git push` / `npm publish` require host permission review
- Changed: Claude PreToolUse hook uses envelope-based wrapping, no longer forces auto-allow
