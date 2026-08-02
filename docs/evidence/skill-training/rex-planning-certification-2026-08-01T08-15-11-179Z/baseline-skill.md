---
name: rex-planning
description: Use only after rex-harness selects dependency-aware implementation planning and supplies the current Command.
---

# Rex Planning

仅在 rex-harness 已经激活依赖规划 Capability，并提供当前 Command 后执行本流程。

1. 把目标拆成能产生可验证结果的工作项，不按文件列表机械分步。
2. 标记工作项之间真实的先后依赖、共享状态和可以独立执行的边界。
3. 为每一步写清输入、完成条件、验证命令或证据，以及失败后的回退点。
4. 识别最短关键路径；没有依赖的工作不要强行串成固定流水线。

返回 `dependency-graph-recorded` 和 `step-verification-recorded`，每项都必须附带真实的计划或任务引用。宿主要求 `AIOS_REX_EVIDENCE` 时，只在结尾输出当前 `activationId` 的恰好一个证据信封。

不要重新解释已经确认的需求或设计，不要启动实施、Team 或 Harness，也不要调用下一个 Provider。
