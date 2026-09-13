---
name: aios-long-running-harness
description: AIOS-native long-running agent harness with rex Command execution, ContextDB, checkpoint recovery, and evidence capture. Use for a planned resumable objective when AIOS is installed. If AIOS is NOT installed, use `harness-init-runner` for a lightweight standalone alternative.

installCatalogName: aios-long-running-harness
clients: [codex, claude, hermes, workbuddy, pi]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [aios, harness]
repoTargets: [codex, claude, gemini, opencode, hermes, agents, workbuddy, pi]
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

## Progress self-report and replan cadence

Stuckness is self-reported by you in structured observations, never judged by a
second model call and never guessed from message keywords. After every
Execute/Verify round, emit:

- `progress_made: true|false` — `true` only when the round produced new
  evidence, a new artifact, or a state change versus the previous round.
  Repeating the same tool call with the same result is `false`.
- `blocked_reason: <empty|one line>` — empty when progress was made; otherwise
  the concrete blocker (selector gone, auth lost, tool error, waiting on input).

Rules:

- The harness counts consecutive `progress_made: false` rounds (threshold 3
  unless the run preflight set another). At threshold, stop repeating: run
  Recover with a changed hypothesis or escalate to the user. Never run the
  identical action a fourth time hoping for a different result.
- An identical tool call issued twice in a row is flagged immediately as
  no-progress, regardless of the self-report.
- Every N steps (`planning_interval`, default 5, set in preflight), re-emit
  the frontier: ready work vs. blocked work with reason and evidence, and
  replan the remaining steps from evidence. A replan is a checkpointed event,
  not a silent course change.

## rex Command Boundary

- The harness is an execution and recovery host, not a second software-workflow router. When a rex Workflow Activation exists, execute only the Provider selected by the current rex Command.
- Return the Command's required Evidence to rex before advancing. Do not choose the next Capability in the harness or preload a fixed Provider chain.
- Bundled `rex-*` Providers are the only software-workflow Providers. Do not enable compatibility substitutions or run an external playbook chain.
- Dispatch parallel agents only after the AIOS policy selects one planned work item with independent domains; keep coupled or shared-state changes sequential.
- Before claiming run success, apply the AIOS host verification gate and record concrete artifact evidence.

## Context Boundary

Use ContextDB as storage and evidence, not as prompt replay. The harness may write sessions, events, checkpoints, continuity files, handoff files, and offload refs, but it must not turn those artifacts into an automatic startup prompt.

Resume flow:
1. Show or record the available unfinished-task summary and latest checkpoint locations.
2. Stop and wait for explicit resume intent from the user or orchestrator.
3. Load only the selected handoff, checkpoint, event, or offload ref needed for the next step.
4. Do not feed `context:pack` output into a model prompt. Treat it as an explicit inspection/debug report.

Stable operating rules live in `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and skills. Do not regenerate those rules into per-run handoff prompts.

## Unattended Tier (opt-in)

Attended runs are the default and are unchanged: the loop runs turns back-to-back, and every stop waits for explicit resume intent. For scheduled or heartbeat-style unattended runs, `aios harness run --unattended` enables the should-run pacing gate:

- Quota (duty-ratio accounting): only material turns charge against a 24h sliding window (`--quota <ratio>`, default 1.0). Noop/wait turns are free; when the window is exhausted the loop sleeps until the earliest spend exits the window instead of burning paid turns.
- Cadence ladder: non-material outcomes widen the wake interval ×1.5 up to a cap (`--cadence-base-ms` / `--cadence-max-ms`); material progress resets to base; a human-gate stops auto-waking entirely.
- Quiet shutdown: after `--quiet-threshold` (default 3) consecutive noop polls the loop shuts down with a typed reason instead of polling forever. Re-entry is still `aios harness resume` only.
- Safe-bypass: when an unattended run hits an operator gate, the loop grants exactly one read-only steering/analysis turn. Code-level seals reject material claims from that turn: the harness clamps the outcome, and rex-bound runs additionally get `bypass_turn_material_outcome_forbidden` from the settlement gate. After the bypass turn the run waits for the operator again.
- Per-turn timeout: `aios harness run|resume --turn-timeout-ms <n>` caps a single provider turn (default 1800000 ms = 30 min, bounds 1 s – 6 h). On expiry the whole process group is cleaned in stages (SIGTERM group → grace → SIGKILL group → verify); a tree that survives SIGKILL stops the run fail-closed instead of overlapping the next turn. Grant long verification turns extra time explicitly instead of relying on the default.
- Active pacing state is persisted in the run summary and projected through `aios harness status --json` (`status.pacing`).

Do not enable `--unattended` for work that needs per-step human approval; keep the attended default.

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

- On harness resume, AIOS shows or records the available `.aios/offload/canvas/<session>/task-canvas.mmd` path plus latest checkpoint/continuity references; it does not automatically inject those artifacts into model prompts.
- Use `aios refs grep/read` to pull only the node-level evidence needed for the next step after explicit resume intent.
- Token savings come from targeted recall and compact refs, not from replaying raw `l2-events.jsonl`, full tool logs, or long continuity packets.

## Resources
- `references/harness-checklist.md`: operational checklist template.
- `references/anthropic-mapping.md`: principle-to-project mapping.
