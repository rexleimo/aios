---
name: rex-requirements
description: Use only after rex-harness selects software requirements clarification and supplies the current Command.
---

# Rex Requirements

仅在 rex-harness 已经激活当前 Capability，并提供当前 Command 后执行本流程。

## Grilling 模式

**一次只问一个问题，等用户回答后再问下一个。** 同时抛出多个问题会让用户迷失——这是此流程最重要的约束。

能从环境中查到的事实（文件、代码、配置）主动查，不问用户。只把**决策**交给用户——那些改变实现方式或验收方式的选择。

## 步骤

### 1. 读取已有上下文

先读取仓库中已有的领域术语（`CONTEXT.md` 若存在）、用户决定和仓库约束。
已经有答案的问题不重复询问。

### 2. 逐一解决歧义

每次只选一个会改变实现或验收方式的歧义，问用户：
- 参与者是谁
- 触发条件是什么
- 可观察的结果是什么
- 边界条件（最大/最小/空/并发）
- 失败行为（错误后系统状态如何）

等用户回答后，根据答案决定是否还有下一个歧义需要解决。

### 3. 记录验收标准

用**用户可观察行为**描述验收标准，不用实现细节。
同时记录明确的**非目标**，防止后续实现静默扩张范围。

### 4. 找到第一个可验证切片

找出最小的、可以独立验证的纵向切片。
当实施不再需要猜测时立即停止，不继续扩写完整计划。

**完成判据：**
- 至少一条验收标准已用用户可观察行为表述，并有明确的非目标
- 第一个可独立验证的切片已识别
- 没有未解决的、会影响实现方式的歧义

返回 `acceptance-criteria-recorded`、`non-goals-recorded` 和 `first-slice-identified`，每项附带真实的文档、决定或任务引用。
宿主要求 `AIOS_REX_EVIDENCE` 时，只在结尾输出当前 `activationId` 的恰好一个证据信封。

不要替用户选择尚未确认的产品行为，不要创建第二份实施计划，也不要调用下一个 Provider。
