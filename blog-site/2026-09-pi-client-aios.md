---
title: "Pi coding agent is now a first-class AIOS client"
description: "AIOS registers Pi (earendil-works/pi) with skills, native instructions, harness driving, a code-level extension, and RPC control — prompt-level today, embedded tomorrow."
date: 2026-09-11
tags: ["AIOS", "pi", "client", "extension", "harness", "skills"]
---

# Pi coding agent is now a first-class AIOS client

Pi is a minimal, self-extensible terminal harness: four tools by default
(`read`, `write`, `edit`, `bash`), everything else as TypeScript extensions,
skills, and Pi packages. That philosophy matches AIOS — so instead of
treating Pi as "another CLI that reads AGENTS.md", AIOS now embeds into it.

## What landed

- **Registry**: `pi` / `pi-coding-agent` alongside the existing clients, with
  `skills`, `native`, and `harness` capabilities. Pi ships no sub-agents, so
  AIOS claims no `team`/`agents` capability until an extension verifies it.
- **No fake MCP**: Pi has no built-in MCP surface, and AIOS does not pretend
  otherwise. The registry models Pi as MCP-less (`format: none`, empty
  scopes), so every migration/proxy/codemap collector skips it safely.
- **Native + skills**: a Pi instruction layer (`client-sources`), project
  skills at `.pi/skills`, global skills at `~/.pi/agent/skills`, and all 25
  AIOS skills projected (`sync-skills` reports `skills pi -> installed=25`).
- **Runtime**: `ctx-agent` one-shot (`pi -p`) and interactive builders, a
  harness one-shot strategy, shell-bridge support with Pi package commands
  (`install`, `update`, `config`…) kept out of the wrapper.

## Code-level, not prompt-level

The `aios-pi-extension` package (`packages/aios-pi`) is the real upgrade:

- Four model-callable tools backed by the real CLI surface: memory
  recall/write/feedback (`memo search/add/useful`) and skill search.
- A `tool_call` gate that blocks destructive shell (`rm -rf`,
  `--no-preserve-root`, fork bombs, `mkfs`, `dd` to devices) and protected
  writes (`.env*`, `node_modules/`, `.git/`).
- A `before_agent_start` injection of the workflow policy plus a memory
  digest — deterministic even with `--no-context-files`.
- `aios init --agent pi` registers the entry into
  `~/.pi/agent/settings.json`, so install governs the plugin surface.
- A `pi --mode rpc` JSONL driver (`scripts/lib/pi/rpc-client.mjs`) for
  long-lived managed sessions: correlated commands, settle detection, and
  fail-closed handling of Pi permission dialogs.

## Try it

```bash
aios init --agent pi --dry-run
node scripts/aios.mjs harness run --provider pi --dry-run --objective "pi smoke"
node --test scripts/tests/pi-extension.test.mjs scripts/tests/pi-rpc-client.test.mjs
```

Live-load verification (`pi -p` with the extension) and package
publication are next. The unit contract — 8 extension tests, 7 RPC tests,
plus the full client matrix — is already green.
