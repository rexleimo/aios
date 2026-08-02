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

完成范围设计后，当前 Command 若进入 `decide-testability`，只能提交一个类型化结论，并让 `testability-decision-recorded` 引用它的 `decisionRef`：

1. `behavior-delta`：只有新的用户可观察行为能通过稳定公共入口真实复现为失败时才能选择。`redCandidate` 必须包含公共入口、场景 setup、精确命令、预期、实际观察、失败原因和失败执行的 `receiptRef`。
2. `behavior-preserving-hardening`：没有新用户可观察行为时，先在独立可清理的真实场景运行通过基线。`baseline` 必须包含同样的场景字段及零退出的 `receiptRef`，随后才允许 Rex 选择 hardening。
3. `blocked`：验收条件无法在真实场景观察时，记录原因和缺失验收条件。此结论��令工作流 replan；停止并请求可观察的验收条件，不得重复提交旧 Command 或伪造 RED。

用 Rex 记录命令观察，例如：`rex-harness receipt --root <project-root> -- node --test <focused-test>`。该命令即使测试失败也会返回 JSON；仅使用其中真实的 `receipt:<id>` 作为 `receiptRef`，不能以自然语言、`command:`、旧日志或静态推断替代。

返回 `test-scope-contract-recorded`、`acceptance-test-mapping-recorded` 和 `test-seam-recorded`，每项都必须附带真实的文档或决定引用。宿主要求 `AIOS_REX_EVIDENCE` 时，只在结尾输出当前 `activationId` 的恰好一个证据信封；`decide-testability` 的信封同时包含类型化 `testabilityDecision`。

本能力只决定测什么和从哪里观察，不执行实现，也不自行升级为严格 TDD。不要调用下一个 Provider。
