# Model Router Agent Team Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `aios team` / live subagent dispatch visibly and deterministically apply `model-router` decisions instead of only selecting one toolchain-level provider.

**Architecture:** Keep existing dispatch skeletons and runtimes, but attach model-router decisions to each phase job, include them in prompts and runtime metadata, select the CLI protocol from the routed model when enabled, and record per-job `model.dispatch` events for `model-router stats`. Dry-run remains non-mutating but now exposes the intended model rule.

**Tech Stack:** Node.js ESM, built-in `node:test`, AIOS ContextDB CLI, existing `scripts/lib/specs/model-registry.json`.

---

## Root Cause Evidence

- `scripts/lib/harness/orchestrator.mjs` creates every phase job with `launchSpec.requiresModel: false`, so the dispatch plan cannot show model routing.
- `scripts/lib/harness/subagent-runtime.mjs` executes every phase through one `AIOS_SUBAGENT_CLIENT`, so `agent team` uses the selected provider/toolchain rather than model-router's provider/model rules.
- `scripts/lib/harness/groupchat-runtime.mjs` builds role prompts without model-route context, so GroupChat speakers cannot display or verify routed model rules.
- `scripts/lib/model-router.mjs` can record model dispatch events, but no team/subagent runtime calls it.

## Files

- Modify: `scripts/lib/model-router.mjs`
- Modify: `scripts/lib/harness/orchestrator.mjs`
- Modify: `scripts/lib/harness/subagent-runtime.mjs`
- Modify: `scripts/lib/harness/groupchat-runtime.mjs`
- Modify: `scripts/lib/harness/orchestrator-runtimes.mjs`
- Modify: `scripts/tests/aios-orchestrator.test.mjs`
- Modify: `scripts/tests/groupchat-runtime.test.mjs`
- Modify: `.codex/skills/model-router/SKILL.md`
- Modify: `.claude/skills/model-router/SKILL.md`
- Modify: `docs-site/model-router.md`

## Task 1: Failing Tests

- [x] Add assertions that `buildLocalDispatchPlan()` phase jobs have `requiresModel=true` and role-specific `modelRouting` metadata.
- [x] Add a live subagent test that captures fake CLI argv and verifies planner/implementer/reviewer/security reviewer jobs use routed CLI protocol/model args.
- [x] Add a live subagent test that reads ContextDB events and verifies `kind=model.dispatch`, `turn.environment=model-router`, and refs include model/task/role.
- [x] Add GroupChat prompt/run tests that assert routed model context is passed to the speaker and returned in dispatch job runs.
- [x] Run focused tests and confirm they fail before implementation.

## Task 2: Shared Router Adapter

- [x] Export model-router helpers for role decisions, provider-to-client mapping, CLI argument construction, prompt metadata, and dispatch recording.
- [x] Keep default behavior deterministic: env `AIOS_MODEL_ROUTER=0|false|off` disables execution-time override but still allows metadata generation where safe.
- [x] Support role env overrides like `AIOS_MODEL_PLANNER`, plus existing task-type overrides like `AIOS_MODEL_IMPLEMENTATION`.

## Task 3: Dispatch Plan Integration

- [x] In `createPhaseJob`, resolve model routing by role/task type.
- [x] Set `launchSpec.requiresModel=true` for phase jobs and include `launchSpec.modelRouting` with `role`, `taskType`, `modelId`, `provider`, `clientId`, `cliCommand`, `reason`, and `fallback`.
- [x] Preserve merge-gate as `requiresModel=false`.

## Task 4: Runtime Integration

- [x] In subagent runtime, derive per-job client and CLI model args from `launchSpec.modelRouting` when enabled.
- [x] Add a Model Router section to phase system prompts.
- [x] Attach `modelRouting` to jobRun metadata and call `recordModelDispatch()` after each phase job completes/blocks.
- [x] In GroupChat, resolve model routing per role, include it in prompts, route each speaker to the right CLI client, and attach model routing to mapped dispatch job runs.

## Task 5: Docs And Verification

- [x] Update `model-router` skills for Codex and Claude to state that `aios team` now uses model-router per phase by default.
- [x] Update `docs-site/model-router.md` with the observable metadata and disable env.
- [x] Run focused tests, `npm run test:scripts`, and any impacted docs sync checks.
