---
name: rex-code-review
description: Use only after rex-harness selects standards-and-spec review and supplies the current Command.
---

# Rex Code Review

仅在 rex-harness 已经激活标准与规格审查 Capability，并提供当前 Command 后执行本流程。

独立审查两个维度，不能用其中一个替代另一个：

- 标准：仓库约定、命名、重复、不恰当的基础设施、错误边界和无必要抽象。
- 规格：遗漏验收标准、错误行为、范围膨胀、未验证边界，以及测试范围契约是否被弱化。

每个发现都要给出位置、证据、严重度、实际影响和可执行修复建议。没有规格时明确写“缺少规格证据”，不能凭想象给出通过结论；没有发现时也要说明检查过的范围。

返回 `standards-review-recorded` 和 `spec-review-recorded`，每项都必须附带真实的差异、审查或报告引用。宿主要求 `AIOS_REX_EVIDENCE` 时，只在结尾输出当前 `activationId` 的恰好一个证据信封。不要调用下一个 Provider。
