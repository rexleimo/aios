---
name: rex-implement
description: Use only after rex-harness selects bounded implementation execution and supplies the current Command.
---

# Rex Implement

仅在 rex-harness 已经激活有边界的实施 Capability，并提供当前 Command 后执行本流程。

1. 读取当前 Command 携带的已批准行为、测试范围契约、测试缝和仓库约束。
2. 只实现当前纵向切片；遇到范围外需求时记录阻塞，不把它偷偷并入本次差异。
3. 复用现有抽象和错误处理方式，新增结构前必须尊重已经完成的最小构造决定。
4. 运行仓库要求的聚焦测试和类型检查，并确认没有通过修改测试来掩盖实现错误。

返回 `implementation-diff-recorded` 和 `focused-tests-pass`，每项都必须附带真实的差异、命令或报告引用。宿主要求 `AIOS_REX_EVIDENCE` 时，只在结尾输出当前 `activationId` 的恰好一个证据信封。

不要选择下一个 Capability，不要自行调用 Review，也不要创建第二条工作流或调用下一个 Provider。
