# AIOS Orchestrator Blueprints — Design

**Date:** 2026-03-09  
**Status:** Drafted

## Goal

Standardize multi-agent delivery into reusable workflow blueprints so repeated tasks do not require manual subagent decomposition every time.

## Scope

This design defines:

- reusable blueprints: `feature`, `bugfix`, `refactor`, `security`,
- reusable role cards: `planner`, `implementer`, `reviewer`, `security-reviewer`,
- a merge gate for parallel outputs,
- one operator-facing `orchestrate` command for previewing the blueprint,
- a learn-eval recommendation overlay that can feed blueprint selection and carry structured guidance into orchestration output,
- a local dispatch skeleton mode that turns the blueprint into non-executing jobs and dependencies,
- a local dry-run executor mode that simulates dispatch outputs without invoking any model runtime,
- a local executor registry that exposes capability metadata and resolves per-job execution adapters,
- dispatch evidence persistence that writes dry-run artifacts back into ContextDB.

## Design Rules

- Blueprints are declarative and live in `scripts/lib/specs/orchestrator-blueprints.json`.
- Runtime helpers live in `scripts/lib/harness/orchestrator.mjs` and related executor/evidence helpers.
- Every parallel branch must emit a valid P0 handoff payload.
- Parallel merge stops when statuses are blocked or file ownership overlaps.
- `orchestrate` may consume `learn-eval` JSON, but it does not auto-run agents or mutate blueprints.
- `orchestrate --dispatch local` only emits a scheduler skeleton unless `--execute dry-run` is also requested.
- `orchestrate --execute dry-run` never invokes a model runtime; it only simulates executor outputs locally.
- Executor selection must resolve through a registry layer so future runtimes can plug in without changing DAG construction.

## Learn-Eval Consumer Model

When `orchestrate` is called with a session overlay:

- it reads the canonical `learn-eval` report for that session,
- it prefers a promoted blueprint recommendation when the operator did not explicitly choose a blueprint,
- it preserves the ordered `recommendations.all` payload in a `learnEvalOverlay` object,
- it renders the same overlay in text mode for operator review.

This keeps blueprint selection machine-readable for future subagent dispatch without requiring text parsing.

## Local Dispatch Skeleton

When `orchestrate` is called with `--dispatch local`:

- each phase becomes a stable local job with a `jobId`, dependency list, and placeholder `launchSpec`,
- grouped parallel phases share the same upstream dependency,
- groups with multiple parallel jobs produce a synthetic `merge-gate` job,
- every launch spec is explicitly marked `requiresModel=false` and uses a placeholder executor.

This creates a deterministic DAG for future runtime integration while keeping the current slice local-only and token-free.

## Local Dry-Run Executor

When `orchestrate` is called with `--dispatch local --execute dry-run`:

- phase jobs are routed through a local executor registry keyed by `launchSpec.executor`,
- the placeholder executor emits synthetic but valid handoff payloads,
- merge-gate jobs consume upstream handoffs through the existing merge validation rules,
- the command returns a `dispatchRun` artifact with job-level statuses and output types.

This gives AIOS a concrete execution contract before any real subagent runtime is attached.

## Runtime Adapter Boundary

Dry-run execution now flows through a plan-level runtime adapter boundary before reaching local job executors. The current runtime catalog contains exactly one runtime, `local-dry-run`, which wraps the local executor path without exposing client- or provider-specific details inside `dispatchPlan`. This keeps the DAG runtime-agnostic while making future runtime integration additive.

## Dispatch Preflight Integration

When `orchestrate` is called with `--preflight auto`, AIOS may execute supported local runbooks before final DAG selection. The current slice can preflight `quality-gate`, `doctor`, and `orchestrate --dispatch local --execute dry-run` actions. Blueprint-planning `orchestrate` commands remain hints only and are recorded as skipped. Nested dry-run replays force `preflight=none` so the preflight stage does not recurse into itself.

## Local Executor Registry

The local executor registry defines which executors are available for dry-run orchestration and what each one can handle. In the current slice:

- phase jobs resolve to a dedicated `local-phase` executor,
- merge-gate jobs resolve to a dedicated `local-merge-gate` executor,
- executor metadata is surfaced in both `dispatchPlan` and `dispatchRun`,
- phase and merge-gate behavior still run through existing synthetic handoff and merge validation logic.

This keeps the orchestration DAG stable while making runtime integration additive instead of invasive.

## Executor Capability Manifest

Executor capability metadata is defined in a declarative spec so downstream systems can reason about executor behavior without parsing code. Each executor entry describes:

- supported execution modes,
- supported job types and roles,
- output types,
- whether a model runtime is required,
- concurrency/ownership constraints for scheduling.

This is intentionally modest, but it creates a stable contract for future real executors and scheduling policy.

## Dispatch Evidence Persistence

When a session-backed dry-run executes successfully enough to produce a `dispatchRun`, AIOS writes the result back into ContextDB using existing event and checkpoint primitives. The persistence contract is:

- write one artifact JSON file containing the dispatch report,
- append one `assistant` event summarizing the run and linking to the artifact,
- append one checkpoint carrying verification/result metadata and the artifact reference,
- update both JSONL and SQLite sidecar through the existing ContextDB write path.

A passing dry-run keeps the session status `running` because no real work has shipped yet; a blocked merge gate emits a blocked checkpoint.

## Merge Gate

The merge gate allows parallel review outputs to merge only when:

- no handoff has `status=blocked` or `status=needs-input`,
- touched file ownership does not overlap across branches.

This is intentionally conservative because AIOS currently prioritizes correctness and user work preservation over maximal parallelism.
