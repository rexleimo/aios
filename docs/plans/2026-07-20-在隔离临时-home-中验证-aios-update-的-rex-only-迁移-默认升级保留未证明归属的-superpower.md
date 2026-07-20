# 在隔离临时 home 中验证 aios update 的 Rex-only 迁移：默认升级保留未证明归属的 Superpowers 投影；带...

> AIOS Planning Contract (schema v2)
> created: 2026-07-20T03:18:55.287Z
> client: cli
> source: aios plan auto-gate
> route: implement

## Objective

在隔离临时 home 中验证 aios update 的 Rex-only 迁移：默认升级保留未证明归属的 Superpowers 投影；带 --adopt-legacy-superpowers 的升级仅删除精确识别的旧 Superpowers 投影，并验证所有客户端根目录和共享 agents 根目录的前后状态。

## Route skills

1. `rex-planning`

## Tasks

- [ ] **t1-understand**: Clarify objective: 在隔离临时 home 中验证 aios update 的 Rex-only 迁移：默认升级保留未证明归属的 Superpowers 投影；带 - — _Objective restated; constraints listed_
- [ ] **t2-plan**: Break work into executable tasks — _Plan tasks updated beyond scaffold if needed_
- [ ] **t3-implement**: Implement changes — _Code changes match objective_
- [ ] **t4-verify**: Verify with tests/checks — _Evidence recorded (command or artifact path)_

## Progress

- status: active

## Decision Log

- 2026-07-20: 只在 `mkdtemp()` 创建的隔离 home 中验证；不得以正确的 adopt 开关操作操作者真实的客户端目录。
- 2026-07-20: 复用 `runUpdate()` 的既有依赖注入边界和真实 `reconcileRexWorkflowSurface()`；不新增第二套升级或清理实现。升级生命周期负责转发选项和顺序，reconciler 负责归属验证与文件操作。
- 2026-07-20: 工作区已有大量未提交改动，因此不执行 `git pull`、不重置或清理；CRG 已刷新。该验证只会新增一个聚焦的回归用例（若现有用例不能覆盖真实删除），并用 `node:test` 的临时目录自动回收测试数据。

## Dependency graph

```text
isolated legacy fixture
        |
        +--> default runUpdate(adopt=false)
        |       -> real reconciler -> report conflict/preserved -> lstat(link) still exists
        |
        +--> explicit runUpdate(adopt=true)
                -> real reconciler -> ownership adoption -> unlink exact projections
                -> retire exact legacy source -> lstat(paths) = ENOENT
                -> no conflict
```

Critical path:

1. Establish the existing `runUpdate()` seam and the real reconciler's isolated-home inputs.
2. Add or complete an upgrade-lifecycle test which sends both option values through `runUpdate()` into that real reconciler.
3. Verify returned reconciliation report plus filesystem state for each client projection and the shared `.agents` projection.
4. Run the focused lifecycle/reconciliation suites, then inspect the diff and refresh CRG if source topology changes.

## Step verification

| Step | Input and boundary | Completion condition | Evidence / command | Failure handling |
| --- | --- | --- | --- | --- |
| Fixture | Temporary `CODEX_HOME`, `CLAUDE_HOME`, `GEMINI_HOME`, `OPENCODE_HOME`, `HERMES_HOME`, `GROK_HOME`, `AGENTS_HOME`, and `AIOS_HOME` only | Fixtures cannot resolve to the operator's actual home | Test helper paths and `lstat()` preconditions | Abort if any target escapes the temporary root |
| Default upgrade | `runUpdate({ adoptLegacySuperpowers: false })` with the real reconciliation closure | Unproven legacy projections remain and report a non-removal state | `lstat(projection)` succeeds; source remains readable | Treat unexpected unlink or ledger write as a regression |
| Adopted upgrade | `runUpdate({ adoptLegacySuperpowers: true })` with exact recognized legacy projections | `report.status === 'removed'`; all exact managed links disappear; source is retired | `lstat(projection)` and `lstat(sourceRoot)` reject with `ENOENT` | Keep the fixture for inspection and fail the test; never retry against a real home |
| Safety boundary | Foreign/unrecognized links and invalid `--adopt-legacy-superpowers true` syntax | Foreign paths survive; value-supplied boolean is rejected before lifecycle | focused CLI/reconciler tests | Report as a parser or ownership-boundary regression |

The upgrade test may stub unrelated component installers and doctor work only to keep the test hermetic. It must not stub the option-forwarding lifecycle seam or the reconciliation implementation whose filesystem behavior is under test.

## Test scope contract

### User objective

Prove the behavior of the upgrade lifecycle, not merely the standalone reconciler: `aios update` must pass its legacy-adoption setting into the Rex workflow-surface reconciler and the resulting filesystem state must match the safety contract.

### In scope

- A temporary-home update invocation with `adoptLegacySuperpowers: false` preserves an unmarked exact historical Superpowers projection and its source.
- A temporary-home update invocation with `adoptLegacySuperpowers: true` removes only exact, recognized legacy Superpowers links from the six native client roots and shared `.agents` root, then retires the exact old source checkout.
- The test observes both the `runUpdate()` ordering/option boundary and real filesystem state (`lstat`, source readability, and reconciliation report).

### Explicit non-goals

- Do not run a real update against the operator's home, update the checked-out runtime, or install client components.
- Do not claim unrecognized, foreign, or user-owned Superpowers-like paths may be deleted; those retain the conflict/preserve policy.
- Do not use only a mocked reconciler, returned call count, or a textual report as deletion proof.

### Acceptance mapping

| Observable acceptance behavior | Stable public seam | Assertion |
| --- | --- | --- |
| Default update is non-destructive for an unproven projection | `runUpdate()` -> real reconciliation closure | report is not `removed`; projection and source pass `lstat()` |
| Explicitly adopted update removes exact AIOS legacy projection | `runUpdate({ adoptLegacySuperpowers: true })` -> real reconciliation closure | report is `removed`; each projection and source reject `lstat()` with `ENOENT` |
| Cleanup is bounded | exact known fixture paths only | report has no conflicts; any foreign fixture is retained by the existing reconciliation suite |

### Minimal vertical slice and test seam

The narrowest representative slice is a `runUpdate()` call using the existing `deps.reconcileRexWorkflowSurface` seam. The injected closure calls the production `reconcileRexWorkflowSurface` with only `homeDir` and explicit client-home environment values belonging to the temporary fixture. This verifies upgrade option forwarding and production cleanup without self-updating the repository or writing client integrations. Existing component installers are harmlessly stubbed because they are outside both assertions.

## Hardening invariant review

- The production update lifecycle and reconciliation modules are unchanged. The new test calls the public `runUpdate()` lifecycle and reuses its existing reconciliation dependency boundary; it does not add a test-only product API.
- The default branch asserts both a non-`removed` report and successful `lstat()` for every fixture projection and source root. A future change cannot make default update silently unlink a link while retaining only a report assertion.
- The opt-in branch asserts `status === 'removed'`, no conflicts, an exact removed-path set, `ENOENT` for every former projection and source root, and one retirement record. It cannot pass by merely forwarding the option to a mock.
- Six native-client roots and the shared-agent root are built by existing fixture factories. Their `homeDir` and explicit environment paths originate under `mkdtemp()` and are removed in a `finally` block; no operator-owned path is a cleanup target.
- The focused regression and its adjacent lifecycle/reconciliation suites pass. The independent one-shot scenario produced the same state transition before the durable regression was added.

## Acceptance

- Complete planned tasks and record verification evidence.

## Next Actions

- Start with the first pending task.

## Verification evidence

- Attach via `aios plan add-evidence --kind command|path|test --value "..."`
- Plan cannot be `done` without evidence and completed tasks

## Status

- status: active
