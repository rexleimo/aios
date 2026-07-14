---
title: Workflow Policy
description: Choose direct, guarded, or planned agent work with Harness CLI's adaptive workflow policy.
---

# Workflow Policy

## Quick Answer

Harness CLI uses a risk-based workflow policy. In adaptive mode, a read-only question stays direct, a small code change is guarded, and multi-step or explicitly routed work gets a persistent plan. Strict mode makes substantive work planned, but it does not turn an empty message or a read-only question into a plan. The policy decides how a turn should be handled; it does not prove that an implementation is complete.

## Do It Now

Preview or apply the policy for a task from the project root:

```bash
node scripts/aios.mjs plan auto-gate --task "Refactor the auth boundary and add tests" --json
node scripts/aios.mjs plan auto-gate --task "Refactor the auth boundary and add tests" --dry-run --json
```

The first command may create a plan when the decision is `planned`. The second evaluates the same request without persisting a planned artifact. Use `--workspace <path>` when the project root is not the current directory.

## The Four Dispositions

| Disposition | Use it for | Persistence | Verification scope |
| --- | --- | --- | --- |
| `noop` | Empty input or an explicit no-op | `none` | `none` |
| `direct` | Questions, explanations, status checks, acknowledgements, or resume decisions | `none` or `reuse` | `none` |
| `guarded` | A small substantive change in adaptive mode | `none` | `focused` |
| `planned` | Multi-step work, explicit plans, Team/Harness routes, design work, or strict substantive work | `create` | `full` |

`direct` does not mean "skip all safety." If a direct request later becomes a file change, the normal edit and verification gates still apply. `guarded` means the policy did not ask for a persistent plan; it still requires `pre-edit-safety-gate` before changing files and focused verification afterward.

## Adaptive vs Strict

Adaptive mode is the default. It keeps a small implementation request such as "change this label and run the focused test" in `guarded`, while a request with multiple steps, a migration, a team route, or a harness route becomes `planned`. Strict mode makes substantive work `planned` so a plan can record ownership, tasks, and evidence before implementation. Both modes keep read-only questions, empty input, and missing-plan resume requests direct.

The policy is a classifier, not a universal definition of "small." The final decision includes `reason`, `routeHint`, `requiredSkills`, `requiresPreEditSafety`, and `verificationScope`; inspect the JSON when the boundary matters.

## Plan Persistence

The adapter reports one of three persistence instructions:

- `none`: do not create or update a plan artifact. This is the result for `noop`, ordinary direct questions, and adaptive guarded changes.
- `reuse`: use the existing nonterminal active plan. This is used for a valid same-session acknowledgement or an explicit resume.
- `create`: start a new work-item plan with the selected route and required skills. A dry run returns the decision but does not write it.

Terminal statuses such as `done`, `blocked`, `cancelled`, `completed`, `failed`, and `abandoned` cannot be continued. A plan decision is not an implementation result: the plan still needs task updates, evidence, edit gates, and verification before it can be closed.

## Continuation Rules

There are two intentionally different continuation paths:

1. **Same-session acknowledgement.** A short acknowledgement such as `ok` or `approved` can reuse a nonterminal plan only when the client and session identity match the plan. An acknowledgement from another client or session is treated as a direct request with missing continuation.
2. **Explicit resume.** A message such as `resume` or `continue` can reuse a nonterminal plan across clients. If no usable active plan exists, the result is `direct` with `continuation=missing`; it never creates a plan by accident.

If an acknowledgement or resume also contains a new actionable objective, it is new work and is classified again instead of silently attaching to the old plan.

## Route Hints and Skills

The decision can suggest a route and the smallest process skill set:

| Route hint | Typical trigger | Planned skills |
| --- | --- | --- |
| `implement` | Feature or file change | `writing-plans`, `test-driven-development` |
| `debug` | Bug, failure, or crash | `systematic-debugging` |
| `verify` | Test, typecheck, CI, or regression validation | `verification-before-completion` |
| `ops` | Install, configure, upgrade, deploy, or release | `writing-plans` |
| `team` | Parallel or delegated work | `writing-plans`, `dispatching-parallel-agents` |
| `harness` | Long-running or overnight work | `writing-plans`, `aios-long-running-harness` |
| `design` | Architecture, design, or brainstorming | `brainstorming`, `writing-plans` |

The policy does not replace the selected skill. It also does not replace `pre-edit-safety-gate`, which checks impact, dependencies, style, and test coverage before any file is changed.

## Examples

### Read-only question

```bash
node scripts/aios.mjs plan auto-gate --task "Why is this request classified as direct?" --json
```

Expect `disposition=direct`, `persistence=none`, and no new plan artifact.

### Small implementation in adaptive mode

```bash
node scripts/aios.mjs plan auto-gate --task "Update the button label and run its focused test" --json
```

This is normally `guarded`, with focused verification and no persistent plan. If the request expands into multiple files or stages, classify the expanded request again.

### Multi-step implementation

```bash
node scripts/aios.mjs plan auto-gate --task "First update the schema, then migrate callers, and finally add regression tests" --json
```

Expect `planned` with `persistence=create`, a full verification scope, and implementation skills.

### Team task

```bash
node scripts/aios.mjs plan auto-gate --task "Use an Agent Team to audit the API and docs in parallel" --json
```

The route hint is `team`. A policy decision does not itself launch providers; use the Agent Team preflight and execution controls after the plan and safety gates are ready.

### Explicit resume

```bash
node scripts/aios.mjs plan auto-gate --task "resume" --json
```

With a usable active plan, expect `continuation=explicit-resume` and `persistence=reuse`. Without one, expect a direct missing-continuation result and no new plan.

## FAQ

### Does every message create a plan?

No. Empty input is `noop`; questions and explanations are `direct`; small adaptive changes are usually `guarded`. Plans are reserved for work that benefits from durable tasks and evidence.

### Does strict mode plan read-only questions?

No. Read-only classification happens before the strict substantive-work rule. Strict mode changes substantive work, not ordinary explanation.

### Can another client continue my plan with "ok"?

Not with a weak acknowledgement. Same-session acknowledgement requires the originating client and session. Use an explicit `resume` when intentionally handing work to another client.

### Does dry-run prove that a live provider works?

No. Dry-run proves only the local decision or preview path. Live Agent Team, Harness, and Orchestrate execution need their own capability, human-gate, and verification evidence.

### Is a planned decision the same as a finished change?

No. It is a routing and persistence decision. The implementation still needs the selected process skill, pre-edit checks, tests, and final verification.

## Next Steps

- [Quick Start](getting-started.md): initialize the project and run `aios doctor`.
- [Architecture](architecture.md): see where policy, memory, agents, and browser runtime boundaries meet.
- [ContextDB](contextdb.md): understand pull-based project memory and explicit recall.
- [Agent Team](team-ops.md) and [Solo Harness](solo-harness.md): choose parallel or long-running execution.
- [Workflow Policy release story](/blog/2026-07-v400-adaptive-workflow-policy/): read the v4.0 rationale and examples.
