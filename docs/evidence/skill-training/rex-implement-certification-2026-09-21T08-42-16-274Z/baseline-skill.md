---
name: rex-implement
description: Use only after rex-harness selects bounded implementation execution and supplies the current Command.
---

# Rex Implement

仅在 rex-harness 已经激活有边界的实施 Capability，并提供当前 Command 后执行本流程。

## 步骤

### 1. 读取契约

从当前 Command 中读取：已批准行为、测试范围契约、预确认的测试缝（seam）和仓库约束。
未列入 Command 的需求不实现——遇到范围外请求时记录为阻塞项，不并入本次差异。

### 2. 实现当前纵向切片

- 复用现有抽象和错误处理方式；新增结构前尊重已完成的最小构造决定
- 运行仓库要求的聚焦测试和类型检查
- 确认未通过修改测试来掩盖实现错误

### 3. Self-check gate（提交证据前必须完成）

列出 Command 中的每一条验收标准，逐条确认：

| 验收标准 | 已覆盖？ | 证据（文件:行号 或 测试名） |
|---|---|---|
| （从 Command 中复制每条） | 是 / 否 / 部分 | … |

**规则：**
- 有任何一条"否"或"部分"→ 继续实现，不得报完成
- 所有条目"是"且测试通过 → 方可进入下一步
- 若发现验收标准本身有歧义，记录为阻塞，走 REQUIREMENTS_CLARIFY，不猜测

### 4. 输出证据

返回 `implementation-diff-recorded`（附真实 diff 引用）和 `focused-tests-pass`（附测试命令输出）。
两项缺任何一项的真实引用，不得报完成。

宿主要求 `AIOS_REX_EVIDENCE` 时，只在结尾输出当前 `activationId` 的恰好一个证据信封。
不要选择下一个 Capability，不要自行调用 Review，也不要创建第二条工作流。

### S1 batch boundary

本批次的完成状态只能由当前 Command 的验收条目、真实 diff 和 focused receipt 共同决定。没有行为差异时返回 `no-op-recorded` 并停止；发现超出当前 Command 的 sediment、需求变化或不可逆副作用时返回 `blocked`，引用原因，不把它们并入实现。任何 rollback 说明必须引用旧 source/projection digest 和可执行恢复命令，不得用“已备份”代替证据。
