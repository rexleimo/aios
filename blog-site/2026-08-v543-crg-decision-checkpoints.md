---
title: "v5.4.3: CRG Decision Checkpoints, Worker Journal Rename, and Idempotent aios init"
description: "v5.4.3 wires code-review-graph decision checkpoints into the workflow layer so agents inspect impact before editing, renames the solo harness journal directory to worker-journal with automatic migration, and makes aios init idempotent with --yes/--retry/--force."
date: 2026-08-06
tags: ["AIOS", "CRG", "code-review-graph", "workflow", "aios init", "release"]
---

# v5.4.3: CRG Decision Checkpoints, Worker Journal Rename, and Idempotent `aios init`

> **Quick Answer:** v5.4.3 is a small release that makes the workflow layer structurally safer. `aios-workflow-router` and `rex-workflow` now run code-review-graph (CRG) decision checkpoints — inspect impact before editing, confirm tests exist before changing code, verify what actually changed after each stage — and degrade gracefully to `rg` + file reads when CRG is not installed. The solo harness journal directory is renamed `solo-harness` → `worker-journal` (legacy directories migrate automatically), and `aios init` gains `--yes` / `--retry` / `--force` for idempotent setup and update runs.

## Why decision checkpoints matter

Agents that edit code without looking at what depends on it are the #1 source of silent regressions. The previous workflow told agents *what* to do — plan, implement, verify — but not *how to look* before touching anything. v5.4.3 fixes that with four CRG checkpoints wired into the workflow skills:

1. **Before acting** — `get_minimal_context` gives the agent project context and suggested next steps in ~100 tokens.
2. **Before editing** — `get_impact_radius` checks the blast radius of the files about to change; `query_graph(tests_for)` confirms tests exist (and if they don't, tests come first).
3. **Before searching** — `semantic_search_nodes` / `query_graph` replace blind grep-and-read, which is both faster and cheaper.
4. **After each stage** — `detect_changes` verifies the actual impact matches what was intended, instead of trusting a self-report.

If CRG is not available in a project, the flow records that fact and falls back to `rg` + file reads — it never blocks the workflow or fakes graph evidence.

## Worker journal rename

The solo harness journal directory is now `worker-journal` instead of `solo-harness`, matching the module naming that already existed (`solo-journal`). Session artifacts live under `artifacts/worker-journal/`. Existing `solo-harness` directories are migrated automatically on first read — no manual step, no data loss — and solo worktree temp prefixes follow the new name.

## Idempotent `aios init`

`aios init` now accepts:

- `--yes` — skip interactive confirmations (CI / unattended installs).
- `--retry` — resume from components that are not yet installed.
- `--force` — reinstall everything even if already installed.

These are backed by a new `install-state` module that tracks component installation state, so interrupted setup runs can resume instead of restarting.

## What you should do

- Existing installs: `aios update` — nothing else. The rename migration is automatic.
- If you run `aios init` in scripts or CI, `--yes` skips the interactive prompts.

## FAQ

### Does this release change the CRG tools themselves?

No. The code-review-graph MCP server is unchanged; v5.4.3 changes when and how the workflow layer calls it. If you do not install CRG, everything works as before.

### Will my existing `solo-harness` session data be lost?

No. The migration renames the directory on first read and keeps all files. The old name is only used as a legacy lookup.

### Where can I see the details?

The [Changelog](https://cli.rexai.top/changelog/) documents v5.4.3 across all locales.

Small releases that tighten the loop between "intend to change" and "verify what changed" compound into much more reliable long-running agent work.
