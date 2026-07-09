# Grok Build AIOS Client Implementation Plan

> **For agentic workers:** Inline execution of this plan.

**Goal:** First-class Grok Build client + docs/changelog/blog.

**Architecture:** Registry-first client definition; Codex-like TOML MCP; AGENTS.md shared instruction file; headless `-p` + `--always-approve`.

**Tech Stack:** Node ESM, existing `scripts/lib/clients` + native emitters + ctx-agent + harness.

## Global Constraints

- runtimeClientId must be `grok-build`
- unattendedArgs must be `--always-approve`
- Do not break existing client order tests without updating them

## Tasks

### Task 1: Registry + paths + emitters
### Task 2: Runtime (interactive, one-shot, harness, shell-bridge, init)
### Task 3: Codemap / route-commands / help
### Task 4: Tests
### Task 5: Docs + changelog + blog
### Task 6: Verification
