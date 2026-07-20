---
name: rex-test-design
description: Use only after rex-harness selects behavior-focused test design and supplies the current Command.
---

# Rex Test Design

仅在 rex-harness 已经激活测试设计 Capability，并提供当前 Command 后执行本流程。

先记录测试范围契约，至少包含：用户目标、明确非目标、范围内行为、范围外行为、允许修改的测试缝，以及完成判据。该契约用于防止 Agent 用实现反推测试目标。

1. 把每条验收行为映射为一个可观察断言，不用内部调用次数代替用户行为。
2. 优先选择稳定的公共入口；只有公共入口无法隔离风险时才使用更窄的测试缝。
3. 选择能独立失败的最小纵向切片，并说明它为什么足以代表本次目标。
4. 明确禁止通过删除断言、跳过用例、放宽期望或只测试模拟对象来获得假通过。

返回 `test-scope-contract-recorded`、`acceptance-test-mapping-recorded` 和 `test-seam-recorded`，每项都必须附带真实的文档或决定引用。宿主要求 `AIOS_REX_EVIDENCE` 时，只在结尾输出当前 `activationId` 的恰好一个证据信封。

本能力只决定测什么和从哪里观察，不执行实现，也不自行升级为严格 TDD。不要调用下一个 Provider。
