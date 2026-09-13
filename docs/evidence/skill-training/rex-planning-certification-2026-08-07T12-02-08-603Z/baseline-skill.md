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

### Artifact contract

完成态必须返回一个 `rex.delivery-ticket.v1`，并且 `decisionTicketRef` 必须引用独立的 Decision Ticket。每个 work item 必须有稳定 `work-*` id、observable outcome、completion criteria、verification、evidence refs 和真实 `dependsOn`；依赖图不得有未知节点或环。

Artifact 还必须包含：

- `frontier`：当前 ready work 和带原因/evidence 的 blocked work；
- `parallelGroups`：可以独立执行的工作边界，不重复、不伪造依赖；
- `convergenceGate`：汇合条件、验证和 required evidence refs；
- `completionClaim`：`soft` 或 `hard`；hard completion 必须提供 `rex.runtime-artifact-contract.v1`，写明 consumer、artifact ref、verification 和 evidence refs。

不要把 Decision Ticket 改写成 Delivery Ticket，不要用文件列表冒充纵向切片，不要在规划阶段启动 Team/Harness 或调用下一个 Provider。

不要重新解释已经确认的需求或设计，不要启动实施、Team 或 Harness，也不要调用下一个 Provider。
