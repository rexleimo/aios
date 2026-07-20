# 修复 AIOS 新会话仍从活动指令中发现 Superpowers 工作流并输出独立设计规格提交的旧行为；让所有客户端只按 Rex Capabi...

> AIOS Planning Contract (schema v2)
> created: 2026-07-20T01:37:40.898Z
> client: codex
> session: codex-cli-current
> source: codex-cli
> route: implement

## Objective

修复 AIOS 新会话仍从活动指令中发现 Superpowers 工作流并输出独立设计规格提交的旧行为；让所有客户端只按 Rex Capability Command 执行。

## Route skills

1. `rex-test-design`

## Tasks

- [ ] **t1-understand**: Clarify objective: 修复 AIOS 新会话仍从活动指令中发现 Superpowers 工作流并输出独立设计规格提交的旧行为；让所有客户端只按 Rex Capabil — _Objective restated; constraints listed_
- [ ] **t2-plan**: Break work into executable tasks — _Plan tasks updated beyond scaffold if needed_
- [ ] **t3-implement**: Implement changes — _Code changes match objective_
- [ ] **t4-verify**: Verify with tests/checks — _Evidence recorded (command or artifact path)_

## Progress

- status: active

## Decision Log

- Test scope contract:
  - User goal: a newly opened AIOS client session must receive Rex-only
    workflow guidance and must not be directed to create or separately commit
    a legacy Superpowers design specification.
  - In scope: the active project instruction files for Codex, Claude, and
    Gemini, plus the shared generated agent-routing partial they rely on.
  - Out of scope: historical documents under `docs/superpowers/**`, recovery
    copies outside client discovery roots, and user-owned skills or documents.
  - Observable acceptance: every active instruction source states that the
    current Rex Capability Command selects the provider and contains none of
    the legacy workflow names that activate the former plan/spec flow.
  - Acceptance mapping: one public Node test reads each active instruction
    source, asserts Rex Capability Command guidance, then rejects the legacy
    provider names. This maps directly to what a new client session can load,
    rather than to implementation call counts.
  - Test seam: `scripts/tests/rex-only-workflow-surface-retirement.test.mjs`,
    test name `active client instructions use Rex providers without legacy
    workflow references`.
  - Minimal vertical slice: the single test covers all four shared discovery
    sources; its existing failure on `AGENTS.md` proves the old behavior is
    currently observable before implementation.
  - Prohibited shortcuts: do not hide the strings only in the test, weaken the
    assertion, skip a client source, or treat historical archive documents as
    active workflow configuration.

## Acceptance

- Complete planned tasks and record verification evidence.

## Next Actions

- Start with the first pending task.

## Verification evidence

- Attach via `aios plan add-evidence --kind command|path|test --value "..."`
- Plan cannot be `done` without evidence and completed tasks

## Status

- status: active
