---
name: aios-long-running-harness
description: AIOS-native long-running agent harness with ContextDB, superpowers pairing, checkpoint recovery, and evidence capture. Use when AIOS is installed. If AIOS is NOT installed, use `harness-init-runner` for a lightweight standalone alternative.

installCatalogName: aios-long-running-harness
clients: [codex, claude]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [aios, harness]
repoTargets: [codex, claude, gemini, antigravity, opencode, crush]
---

# AIOS Long-Running Harness

## Overview
Use this harness to keep long tasks stable under UI drift, model variability, and partial failures. It maps Anthropic's long-running-agent harness ideas into this repository's file-based workflow.

## Harness Loop
1. Preflight: lock objective, stop conditions, budgets, and required artifacts.
2. Plan: split into idempotent steps with explicit success/failure evidence.
3. Execute: run one step at a time with tool output capture.
4. Verify: assert completion from page evidence, not assumptions.
5. Checkpoint: persist current state, artifacts, and next action.
6. Recover: on failure, classify and retry only with a changed hypothesis.
7. Complete: run final verification and write summary doc.

## Pairing with Superpowers Skills
- Plan step should be produced through `superpowers:writing-plans` (or `superpowers:brainstorming` first when scope is unclear).
- For 2+ independent domains, use `superpowers:dispatching-parallel-agents`; for coupled domains, run sequentially.
- If the runtime has no true subagent tool, emulate dispatch with explicit per-domain task queues and only parallelize safe independent reads/checks.
- Always finish with `superpowers:verification-before-completion` before claiming run success.

## Orchestrate Live Notes
- `aios orchestrate --execute live` currently supports `AIOS_SUBAGENT_CLIENT=codex-cli` only.
- Codex CLI v0.114+ structured exec outputs (`--output-schema`, `--output-last-message`, stdin) are required for handoff parsing; schema fallback to raw stdout is rejected.
- Transient `upstream_error`/`server_error` failures are retried with exponential backoff via `AIOS_SUBAGENT_UPSTREAM_MAX_ATTEMPTS` and `AIOS_SUBAGENT_UPSTREAM_BACKOFF_MS`.

## Required Controls
- Time budget per step and per run.
- Retry budget per failure class.
- Human-gate checkpoints for login, payment, or policy-sensitive actions.
- Solo harness checkpoints should include the current stage (`research`, `requirements`, `planning`, `development`, `validation`, `handoff`) and concrete evidence.
- Structured logs for every major transition.

## Failure Classes
- Selector/UI drift.
- Authentication/session loss.
- Policy rejection/content moderation.
- Network/transient failures.
- Tool/runtime errors.

## Completion Gate
Declare success only when all are true:
- Target action succeeded.
- Expected artifact exists.
- Evidence snapshot/log exists.
- Updated runbook reflects newly observed drift.

## Resume With Offload Canvas

- On harness resume, AIOS injects `.aios/offload/canvas/<session>/task-canvas.mmd` when present plus the latest checkpoint/continuity before replaying raw `l2-events.jsonl` or full tool logs.
- Use `aios refs grep/read` to pull only the node-level evidence needed for the next step.
- This saves tokens only when resume/context injection excludes the raw logs; it is not retroactive for outputs already injected in the active turn.

## Resources
- `references/harness-checklist.md`: operational checklist template.
- `references/anthropic-mapping.md`: principle-to-project mapping.
