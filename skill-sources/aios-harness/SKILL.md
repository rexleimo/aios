---
name: aios-harness
description: Design the operating contract for a planned long-running or recurring workflow, then host execution, evidence, checkpoints, and recovery through AIOS and the current Rex Command. Use only for an explicit resumable objective. Without AIOS, use harness-init-runner.

installCatalogName: aios-harness
clients: [codex, claude, hermes, workbuddy, pi, zcode, qoder]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [aios, harness]
repoTargets: [codex, claude, gemini, opencode, hermes, agents, workbuddy, pi, zcode, qoder]
---

# AIOS Harness

## Input and Output Contract

Use for a planned resumable objective selected by AIOS policy. Accept the current
work item, explicit `workflow_type: one-shot|recurring`, existing requirements/spec
refs, current Rex Command when present, and any selected recovery checkpoint.
The model declares task type; code must not infer it from prose or keywords.

Return a compact handoff with `workflow_ref`, `workflow_revision`, `run_ref`,
`evidence_refs`, `recovery_checkpoint_ref`, `decision_brief`, and
`improvement_candidates`. Use null or empty lists for inapplicable fields; do
not invent refs. The operating contract belongs in the existing spec/work item;
execution state belongs in the existing run journal. Reuse them rather than
creating another plan, wiki, or ledger.

## Workflow Integration

Read `references/workflow-integration.md` when authoring or importing a recurring
workflow, preparing a human decision, or converting upstream loop-me/chief-of-staff
artifacts into AIOS handoffs.

- **Specify:** reuse accepted requirements. If a consequential decision is still
  unresolved, report it to the current Rex Command; execute requirements work
  only when Rex selects it. An explicit `/grill` is the existing user entry.
- **Execute:** once the operating contract is actionable, host only the current
  Command and persist its evidence. Do not turn the harness into a Provider chain.
- **Decide:** prepare authorized work before a human decision point. Return the
  evidence, options, recommendation, and exact pending decision in one brief.
- **Learn:** at a milestone, return source-backed improvement candidates and
  write verified knowledge through existing Memo tools. `/retro` remains the
  explicit environment-review entry; unselected candidates are not applied.

The contract records objective/non-goals, trigger/input, artifacts/completion
evidence, failure/stop rules, budgets, and human decision points. For recurring
work, distinguish the reusable definition and revision from each individual run.
A previous run's success is not evidence for the next run. Definition changes
are explicit revisions, not silent changes to an active run's acceptance.

These are authoring and handoff rules. The existing runtime enforces only its
supported controls; writing a trigger or budget into a spec does not install a
scheduler or add a new enforcement gate. Unsupported requirements remain
explicit gaps. Manual start is sufficient unless automatic triggering is needed.

## Harness Loop

1. Preflight: reuse or complete the operating contract, stop conditions, budgets, and required artifacts.
2. Plan: consume the current accepted plan and idempotent steps; request changes through Rex when needed.
3. Execute: run the current Command's step with tool output capture.
4. Verify: assert completion from task-appropriate command receipts, artifacts, or explicit human evidence.
5. Checkpoint: persist current state, artifacts, bound workflow revision, and next action for recovery.
6. Recover: on failure, classify and retry only with a changed hypothesis.
7. Complete: run final verification and return the result with concrete evidence refs.

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

- Report consecutive `progress_made: false` rounds. At threshold 3 (or the
  preflight limit), stop repeating: recover with a changed hypothesis or escalate.
  Do not claim an unsupported runtime counter has enforced this reporting rule.
- An identical tool call issued twice in a row is evidence of no progress.
- Every N steps (`planning_interval`, default 5, set in preflight), re-emit
  the frontier: ready work vs. blocked work with reason and evidence. Submit
  consequential replanning through the current Command and checkpoint it.

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
2. If resume intent is absent, stop and wait for explicit resume intent from the user or orchestrator. Reuse intent already given in this session instead of asking again.
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

Do not enable `--unattended` for work that needs per-step human approval; keep the attended default. Unattended pacing does not register recurring schedules.

## Orchestrate Live Notes

- `aios orchestrate --execute live` currently supports `AIOS_SUBAGENT_CLIENT=codex-cli` only.
- Codex CLI v0.114+ structured exec outputs (`--output-schema`, `--output-last-message`, stdin) are required for handoff parsing; schema fallback to raw stdout is rejected.
- Transient `upstream_error`/`server_error` failures are retried with exponential backoff via `AIOS_SUBAGENT_UPSTREAM_MAX_ATTEMPTS` and `AIOS_SUBAGENT_UPSTREAM_BACKOFF_MS`.

## Required Controls

- Time budget per step and per run, mapped to supported runtime options where available.
- Retry budget per failure class; identify any limit that still needs explicit operator enforcement.
- Human decision points for login, payment, or policy-sensitive actions, distinct from persisted recovery checkpoints.
- Solo harness checkpoints should include the current stage (`research`, `requirements`, `planning`, `development`, `validation`, `handoff`) and concrete evidence.
- Structured logs for every major transition.

## Completion Gate

Declare success only when all are true:
- Target action satisfied the bound run's acceptance criteria.
- Expected artifact exists.
- Evidence receipt/log or required human decision exists.
- Result, remaining gaps, and recovery/knowledge refs are recorded. Discovered drift becomes a source-backed improvement candidate; modifying a skill requires its own authorized change.

## Resume With Offload Canvas

- On harness resume, AIOS shows or records the available `.aios/offload/canvas/<session>/task-canvas.mmd` path plus latest checkpoint/continuity references; it does not automatically inject those artifacts into model prompts.
- Use `aios refs grep/read` to pull only the node-level evidence needed for the next step after explicit resume intent.
- Token savings come from targeted recall and compact refs, not from replaying raw `l2-events.jsonl`, full tool logs, or long continuity packets.

## Resources

- `references/workflow-integration.md`: workflow inputs, upstream artifact mapping, decision briefs, and improvement handoffs.
- `references/harness-checklist.md`: operational checklist template.
- `references/anthropic-mapping.md`: principle-to-project mapping.
