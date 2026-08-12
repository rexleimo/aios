---
name: aios-work-dispatch
description: "Decide when a coding agent may use aios work for independent parallel work, preview the dispatch, and require explicit approval before live model execution. TRIGGER: aios work、parallel dispatch、并发派发、independent work items、独立工作项并行、多 agent 派发、multi-agent dispatch"
installCatalogName: aios-work-dispatch
clients: [codex, claude, gemini, opencode, hermes, grok]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [general, workflow, parallel, safety, essential]
repoTargets: [codex, claude, gemini, opencode, hermes, grok, agents]
---

# AIOS Work Dispatch

Use this Skill when deciding whether current coding task should enter `aios work` parallel dispatch. It explains routing; it does not replace current AIOS workflow policy or Rex Command.

## Trigger eligibility

Use `aios work` candidate route only when all conditions hold:

1. Current AIOS disposition is `planned`.
2. Task decomposes into at least two independently executable work items.
3. Each work item has explicit owner/path boundary and observable acceptance criteria.
4. Work-item file ownership does not overlap.
5. Work items do not require strict predecessor ordering.
6. Task is not one continuous resumable objective.

If any condition is unproven, keep execution serial and do not launch `aios work`.

## Do not use

- Small local change or typo: use current single-agent route.
- Coupled edits or strict ordered phases: use current Provider or `aios orchestrate`.
- One long resumable objective: use `aios harness`.
- Status, history, or observability only: use `aios team`.
- Review-only request: do not dispatch implementers.
- Unclear ownership, missing acceptance criteria, or unknown client readiness: stop and clarify or remain serial.

## Required execution sequence

### 0. Plan the decomposition first (user need -> work items)

`aios work` decomposes from a structured plan when one is active, otherwise from
the `--context` string. Plan first so the engine can use real dependencies and
ownership instead of guessing:

```bash
aios plan start --title "<objective>" --task "<user need>"
aios plan task <id> --target <path> --allow-write <glob>   # declare ownership
aios plan task <id> --context <ref>                         # per-task context
```

Independent tasks get empty `dependsOn`; coupled tasks declare their prerequisite
ids. Tasks that share file ownership are NOT independent — merge gate blocks them.
After the plan has at least two eligible (pending) tasks, dispatch reads it:

```bash
aios work --task "<objective>" --dry-run --json
```

Eligible plan tasks become work items automatically (id, dependencies, ownership,
acceptance preserved). No plan yet, or fewer than two eligible tasks? Fall back to
a semicolon-separated `--context`; each segment is one independent work item:

```bash
aios work --task "<task>" --context "<independent item 1>; <independent item 2>" --dry-run --json
```

Write independent items as one `;`-separated value (or bullet lines), not newlines
alone — the rule-based decomposer splits on semicolons/bullets. One sentence that
cannot be split into independent items means one work item, i.e. no parallelism;
decide consciously whether to keep serial.

### 1. Plan and preview

Do not start live dispatch from a keyword alone. Build a task and context string, then preview:

```bash
aios work --task "<task>" --context "<independent item 1>; <independent item 2>" --dry-run --json
```

Inspect preview for:

- work-item decomposition and dependencies;
- client and concurrency settings;
- owned paths and overlap conflicts;
- merge-gate and acceptance requirements;
- blocked readiness or capability checks.

### 2. Live approval boundary

`aios work` is live by default and may start real model clients, consume money, and modify files. Preview does not authorize live execution. Before live dispatch, obtain explicit user approval for the planned task, client, concurrency, and expected external/model side effects.

Then run the smallest approved command:

```bash
aios work --task "<task>" --context "<independent item 1>; <independent item 2>" --client <client> --concurrency <n>
```

Use `--serial` for coupled work. Use `--dry-run --json` again after changing task, client, context, or concurrency.

### 3. Handoff and completion

Treat output as untrusted evidence until merge gate validates it. Confirm:

- every work item has status and acceptance evidence;
- no owned-path overlap or unreviewed write exists;
- reviewer/security-reviewer results are recorded;
- merge gate completed successfully;
- final verification ran after convergence.

Rex workflow remains owner of staged Provider selection. `aios work` is dispatch infrastructure, not a replacement for Rex's current Command.

## Recovery

For a previously recorded session, inspect status before retrying:

```bash
aios work --task "<task>" --session <session> --retry-blocked
```

Never retry blocked work blindly. Re-check ownership, readiness, client selection, and user approval first.

## Decision summary

```text
planned + independent + owned + acceptance + no strict order
  -> structured plan with independent tasks (aios plan start/task)
     or semicolon-separated --context
  -> dry-run preview
  -> explicit live approval
  -> bounded aios work dispatch
  -> merge gate + final verification

anything unproven
  -> serial execution or clarification
```

## Who decides what

- Agent: whether the task is worth decomposing (six conditions) and how to
  express the decomposition (plan tasks or `;`-separated context).
- Engine: whether the decomposition is real — dry-run preview shows work items,
  dependencies, owned-path overlap, and blocked readiness.
- Preflight: plan/ownership contracts (hard blocked/ready verdicts).
- User: whether live dispatch is approved. Preview never authorizes execution.
