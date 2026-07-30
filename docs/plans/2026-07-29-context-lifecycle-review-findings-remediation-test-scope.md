# Context Lifecycle Review Findings Remediation - Test Scope Contract

> Historical narrow remediation record. Its non-goals no longer define the product goal: agent-driven target-plus-codemap inference, MCP proposal, and human confirmation are now tracked by `docs/plans/2026-07-29-context-lifecycle-agent-intelligence-test-scope.md`.

## User Goal

Repair the confirmed findings in `docs/reports/2026-07-29-context-lifecycle-v1-review-findings.md` without creating a commit or changing unrelated worktree files.

## In Scope

1. A real CLI producer can add a task's required context, targets, and allowed write declarations to the active structured plan.
2. Default orchestration chooses the first pending task in dependency-topological order when the caller does not pass `--context-task`.
3. The dream archive index becomes stale when an existing proposal file is changed in place, and rebuilds before memo filtering uses the stale result.
4. The Unreleased changelog records the four documented compatibility changes.
5. The reported root-level browser-eval artifact is removed only if it is present and verified as the named artifact. It is currently absent, so no deletion is expected.

## Explicit Non-Goals

- Do not infer context declarations from arbitrary source code or add an LLM planner.
- Do not change the default seeded task structure or silently invent task targets.
- Do not enable dream GC, change governance authority, or alter proposal-only behavior.
- Do not stage, commit, rebase, reset, or alter unrelated dirty files.
- Do not broaden the MCP tool surface in this remediation slice.

## Acceptance Mapping

| Finding | Observable behavior | Test seam | Assertion |
|---|---|---|---|
| P0 | A user can create a plan, declare context with the public `plan task` CLI, and run orchestrate without manually editing `.aios/planning/active.json`. | `scripts/aios.mjs plan start`, `plan task`, and `orchestrate` in a temporary workspace. | The declaration persists; the default orchestrate run reports `observed`, selects the declared task, and delivers a non-empty context payload. |
| P1 | A plan with multiple unfinished tasks does not return `ambiguous_context_task` when no task ID is supplied. | `prepareOrchestrateContextLifecycle()` with a deliberately non-topological task array. | The selected task is the first pending node in dependency-topological order; an explicit task ID still overrides the default. |
| P2 | A proposal rewritten at the same path invalidates the archive index even when the proposal directory entry does not change. | `readDreamArchivedEventIds()` and the durable derived archive index in a temporary workspace. | The source token changes and the rebuilt archived ID set reflects the rewritten proposal. |
| Changelog | Upgrade-visible changes are discoverable before release. | `CHANGELOG.md` Unreleased section. | The four documented behaviors and their migration/operational implications are present. |

## Allowed Targets

- `scripts/lib/cli/parse-args/plan.mjs`
- `scripts/lib/planning/cli.mjs`
- `scripts/lib/planning/contract.mjs`
- `scripts/lib/lifecycle/orchestrate/context-lifecycle.mjs`
- `scripts/lib/lifecycle/dream/archive-index.mjs`
- `scripts/lib/cli/help/commands/maintenance.mjs`
- `scripts/tests/workflow-adapters.test.mjs`
- `scripts/tests/context-lifecycle-orchestrate-integration.test.mjs`
- `scripts/tests/memo-archive-index.test.mjs`
- `CHANGELOG.md`

## Verification Plan

1. Run the focused context lifecycle, planning/workflow adapter, and archive-index test files after the final code edit.
2. Run `npm run test:scripts` from the repository root after all product and test edits are complete.
3. Re-check `git status --short` and review the final diff without staging or committing.
