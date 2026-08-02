---
name: rex-design
description: Use only after rex-harness selects consequential design resolution and supplies the current Command.
---

# Rex Design

仅在 rex-harness 已经激活设计决策 Capability，并提供当前 Command 后执行本流程。

1. 从当前 Command 提取必须现在决定的问题、硬约束和推迟决定的成本。
2. 基于仓库现状提出少量真实可行选项，优先包含复用现有设计的选项。
3. 用一致维度比较正确性、复杂度、兼容性、可测试性、运维成本和可逆性。
4. 记录最终决定、适用条件、主要权衡和被拒绝选项；不要把决定文档扩写成实施计划。

返回 `decision-recorded`、`tradeoffs-recorded` 和 `rejected-options-recorded`，每项都必须附带真实的设计、代码或决定引用。宿主要求 `AIOS_REX_EVIDENCE` 时，只在结尾输出当前 `activationId` 的恰好一个证据信封。

不要仅因任务复杂就创造新抽象，不要越过用户尚未确认的产品边界，也不要调用下一个 Provider。
