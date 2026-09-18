---
title: "v5.9.0 — Memory Activation Across Clients"
date: 2026-09-02
description: "v5.9.0 activates memory across clients: ContextDB session registration, the aios-memory MCP server, an OpenCode plugin, Codex trust fixes, and Gemini restored."
---

# v5.9.0 — Memory Activation Across Clients: From Regex Triggers to Prompt-Driven

> 2026-09-02 · Seven clients × five MCP servers all green

## Why this release

The previous release (v5.8.2) finished WorkBuddy client support. But while debugging we found an architectural problem:

**The memory system's trigger layer was built on regular expressions.** `intent.mjs` guessed intent with regexes, `complexity.mjs` guessed complexity with heuristics — regexes never gave the LLM a real understanding of the tools, and results were poor in practice. After deleting the regex trigger layer we found a new problem: **removing implicit triggers without moving the trigger points into explicit prompt-layer positions** made the memory system look "not enabled".

v5.9.0 completes that refactor: **a deterministic data plane (hooks and plugins fetch and inject automatically) + a semantic plane (prompts declare the trigger points) + an MCP tool plane (a deterministic entry point for clients without hooks)**.

## Core changes

### 1. Session lifecycle joins memory (option A: memory enabled at the workflow entry)

`aios session start` now registers a ContextDB session (idempotent, injectable, degrades on failure), with `--session-id/--agent/--client` fully parameterized. Starting a session automatically surfaces the previous session's handoff and pinned memos; the `session: (new)` era is over.

### 2. A brand-new `aios-memory` MCP server

Three tools give clients without a hook surface (Gemini / Hermes / WorkBuddy) a deterministic entry point:

- `memory_recall` — unified retrieval (memo + contextdb + plans), searchable the moment something is written
- `memory_write` — conclusions, fixes, and preferences land in memo without confirmation (local and rollback-able)
- `memory_checkpoint` — checkpoints enter the pinned surface, visible at the next session start

### 3. OpenCode plugin plus the full Claude/Codex/Grok hook chain

Claude's SessionStart + UserPromptSubmit hooks and the Codex/Grok UserPromptSubmit hook already worked; an OpenCode plugin is added (session lifecycle + per-turn recall through the existing hook pipeline + system injection). Turn-recall is verified at runtime.

### 4. The Memory Trigger Contract, projected to five surfaces

AGENTS.md / CLAUDE.md / GEMINI.md each carry the same trigger contract: recall first in a new session, recall before continuing or resuming, write a conclusion the moment you have one, write a checkpoint when done, record it when unsure. **Regex is dead; the trigger decision belongs to the LLM, but the trigger points are declared by the contract.**

### 5. Root-cause fix for the Codex startup popup (the worst offender)

Codex 0.148+ introduced a hooks trust mechanism, with trust state persisted in `~/.codex/config.toml` — a file AIOS never wrote, so projects stayed untrusted forever: **a popup on every start, recurring after every update**. The installer now writes a managed section (trust plus the five MCP servers), idempotently, preserving user content. **Fixed at install time, and it no longer recurs on update.**

### 6. Gemini support fully restored

Upstream stopped iterating on Gemini CLI (pivoting to Antigravity), but per the project promise — consistent support on every client — the deprecated flag is withdrawn: MCP memory, directive projection, and skill sync are fully wired again.

### 7. Five MCP servers × seven clients all green

code-review-graph / mcp-browser-use / aios-auth-tools / aios-shell / aios-memory are registered across all seven clients (Claude, Hermes, Gemini, WorkBuddy, Grok, Codex, OpenCode), including a fix for aios-shell workspace drift.

## Upgrade notes

- `aios session start --json` output changed from a bare array to `{ registration, lines }`
- WorkBuddy CLI users: the CLI bundled with the desktop app is not on PATH and needs a shim (documented in this release)
- `opencode run` (headless) not loading project plugins is upstream behavior; TUI sessions are unaffected
- Codex users who still see one trust prompt after upgrading can accept once — it now persists

## Verification

- Session registration unit tests 5/5, codex config unit tests 5/5, MCP smoke 4/4, client regression 47 pass / 0 fail
- Turn-recall runtime verification (live Claude/Codex/Grok hook chain)
- Real-machine E2E: legacy manual sections adopted, idempotent reuse, byte-level confirmation
