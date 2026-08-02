---
name: rex-requirements
description: Use only after rex-harness selects software requirements clarification and supplies the current Command.
---

# Rex Requirements

仅在 rex-harness 已经激活当前 Capability，并提供当前 Command 后执行本流程。

1. 先读取已有领域术语、用户决定和仓库约束，不重复询问已经有答案的问题。
2. 每次只解决一个会改变实现或验收方式的歧义：参与者、触发条件、可观察结果、边界或失败行为。
3. 用用户可观察行为描述验收标准，同时记录明确非目标，防止后续实现静默扩张范围。
4. 找出第一个可独立验证的纵向切片；当实施不再需要猜测时立即停止。

返回 `acceptance-criteria-recorded`、`non-goals-recorded` 和 `first-slice-identified`，每项都必须附带真实的文档、决定或任务引用。宿主要求 `AIOS_REX_EVIDENCE` 时，只在结尾输出当前 `activationId` 的恰好一个证据信封。

不要替用户选择尚未确认的产品行为，不要创建第二份实施计划或分派 Agent，也不要调用下一个 Provider。
