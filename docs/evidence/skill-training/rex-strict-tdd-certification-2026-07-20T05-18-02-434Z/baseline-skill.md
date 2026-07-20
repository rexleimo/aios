---
name: rex-strict-tdd
description: Use only after rex-harness selects high-risk strict TDD and supplies the current Command.
---

# Rex Strict TDD

仅在 rex-harness 已经确认测试范围契约，并因回归或高风险边界已经激活严格 TDD Capability 后执行。严格模式保留基础 TDD 的全部约束，并额外证明测试真的能阻止目标缺陷。

## RED 与 GREEN

1. RED 必须由测试范围契约中的目标行为触发；记录失败原因与已观察回归或风险之间的因果关系。
2. 只实施让当前行为正确的最小差异，然后运行目标测试和风险邻近测试。
3. 不得删除测试、跳过测试、弱化断言、替换为只验证模拟调用的用例，或修改期望来迎合错误实现。

## REFACTOR 与强度检查

1. 在保持测试通过时整理实现，并审查测试差异仍覆盖用户可观察行为。
2. 选择与风险匹配的强度探针，例如临时反转关键条件、破坏边界值、模拟并发顺序或验证失败路径。
3. 强度探针必须证明测试会重新失败；恢复实现后再次通过。不能把临时破坏提交为产品代码。

按当前阶段返回真实引用：`failing-test-observed`、`red-failure-reason-recorded`、`passing-test-observed`、`implementation-diff-recorded`、`refactor-check-recorded`、`test-strength-check-recorded` 和 `test-diff-review-recorded`。宿主要求 `AIOS_REX_EVIDENCE` 时，只在结尾输出当前 `activationId` 的恰好一个证据信封。

一次只完成当前 Command 的阶段，不伪造测试强度证据，也不要调用下一个 Provider。
