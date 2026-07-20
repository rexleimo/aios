# 在隔离安装环境中执行 AIOS v5.0.0 更新，并验证 Rex-only 投影与 Superpowers 显式迁移行为

> AIOS Planning Contract (schema v2)
> created: 2026-07-20T06:04:06.742Z
> client: cli
> source: aios plan auto-gate
> route: implement

## Objective

在隔离安装环境中执行 AIOS v5.0.0 更新，并验证 Rex-only 投影与 Superpowers 显式迁移行为

## Route skills

1. `rex-planning`

## Tasks

- [ ] **t1-understand**: Clarify objective: 在隔离安装环境中执行 AIOS v5.0.0 更新，并验证 Rex-only 投影与 Superpowers 显式迁移行为 — _Objective restated; constraints listed_
- [ ] **t2-plan**: Break work into executable tasks — _Plan tasks updated beyond scaffold if needed_
- [ ] **t3-implement**: Implement changes — _Code changes match objective_
- [ ] **t4-verify**: Verify with tests/checks — _Evidence recorded (command or artifact path)_

## Progress

- status: active

## Decision Log

- Dependency graph:
  1. `v5.0.0` release tag and its bundled `rex-harness` submodule are the immutable input.
  2. A temporary client-home fixture seeds recognized historical Superpowers links for Codex, Claude, Gemini, OpenCode, Hermes, Grok, and shared `.agents`.
  3. A normal update runs first. It must install Rex projections while preserving unproven legacy links as conflicts; this is the default safety contract.
  4. Only after that observation may an explicit `--adopt-legacy-superpowers` update run. It must remove only recognized legacy links and retire the corresponding fixture source.
  5. Final filesystem assertions and the existing isolated lifecycle regression provide the acceptance evidence. The fixture is disposable, so neither the operator's client homes nor repository sources are changed.
- Critical path: release tag -> seeded isolated fixture -> default update observation -> explicit adoption observation -> path assertions.
- Failure boundary: any missing Rex projection, unexpected deletion during the default update, or surviving recognized link after explicit adoption is a release-validation failure and stops the workflow.

## Acceptance

- Complete planned tasks and record verification evidence.

## Test Scope Contract

- User goal: after upgrading to AIOS v5.0.0, clients use the Rex workflow projection; an operator may explicitly adopt and remove AIOS-owned legacy Superpowers projections without deleting unproven user-owned links.
- Non-goals: do not mutate the operator's real client homes, infer ownership from only a matching skill name, or assert GitHub Release assets that cannot be observed locally.
- Public test seam: call the lifecycle public entry point `runUpdate(...)` through the existing temporary-home fixture in `scripts/tests/rex-workflow-surface-reconciliation.test.mjs`; it exercises the same reconciliation and client projection paths as the CLI without relying on mocks for the filesystem effects.
- Smallest representative slice: the named test seeds all native client roots plus the shared `.agents` root, runs default update and adopted update consecutively, then checks observable paths. It independently fails for an unsafe default deletion, a missing Rex installation, or an incomplete explicit cleanup.

### Acceptance-to-assertion mapping

1. Default update: the fixture observes installed Rex projections while an unproven Superpowers link remains and is reported as a conflict.
2. Explicit `--adopt-legacy-superpowers`: the fixture observes removal of every recognized legacy link for Codex, Claude, Gemini, OpenCode, Hermes, Grok, and the shared `.agents` root.
3. Ownership safety: the fixture observes retirement only after adoption; a link outside the recognized AIOS legacy metadata is not treated as removable merely by its name.
4. Release boundary: this isolated regression is a local upgrade behavior check. The pushed Git tag is verified separately; GitHub Release assets are outside this test seam.

Test integrity rule: do not weaken assertions, skip the adoption phase, replace the lifecycle entry point with a mock-only test, or use static source inspection as a passing substitute.

## Next Actions

- Start with the first pending task.

## Verification evidence

- Attach via `aios plan add-evidence --kind command|path|test --value "..."`
- Plan cannot be `done` without evidence and completed tasks
- Planned verification commands:
  - `node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs` validates the isolated update fixture across all supported clients.
  - `node scripts/aios.mjs update --components skills,native --client all --scope global --skip-doctor` is exercised only with temporary client-home environment variables, first without adoption and then with `--adopt-legacy-superpowers`.
  - Filesystem checks assert Rex projections are present, the default update preserves legacy links, and explicit adoption removes only the recognized legacy projections and source.

## Status

- status: active
