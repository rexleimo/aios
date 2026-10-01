---
name: rex-requirements
description: Use when a request is vague, underspecified, or could be interpreted multiple ways — even when it names a specific feature but acceptance criteria, scope, or success are not yet defined. Also use after rex-harness selects software requirements clarification and supplies the current Command.
---

# Rex Requirements

需求澄清（Grilling）可以在两种入口下执行：

1. **自助触发（无 Command）**：用户在对话中提出需求，你判断其存在模糊信号——验收标准缺失、范围不清、成功标准未定义、领域词汇有歧义、或同一请求存在多种合理解读——即使请求点名了具体功能。此时**先自行推进**：查文档、读代码、找事实，能自己解决的不要问；只在真正需要用户决策的点停下来，一次问一个问题。
2. **rex-harness 激活（有 Command）**：仅在 rex-harness 已经激活当前 Capability，并提供当前 Command 后执行本流程。此时以 Command 的期望证据为准。

## Grilling 模式：执行期内嵌，不是开头审问会

Grilling 是**制作过程中内嵌的交互机制**，不是流水线开头的一道闸。正确顺序：

```
用户发需求 → 你自行规划/分析/找事实（查文档、读代码、查配置）
          → 遇到自己无法决定的方向/边界/验收选择 → 停下来问（一次一题，带推荐答案）
          → 继续做 → 下一个决策点 → 再问 → ...直到完成
```

**一次只问一个问题，等用户回答后再问下一个。** 同时抛出多个问题会让用户迷失——这是此流程最重要的约束。

能从环境中查到的事实（文件、代码、配置）主动查，不问用户。只把**决策**交给用户——那些改变实现方式或验收方式的选择。

## 思考优先级：先思考，后提问

遇到不清晰时，按顺序尝试，**提问是最后手段**：

1. **查**：从环境查证（文件、代码、历史证据、已有 requirements decision）；
2. **推**：从上下文推断（用户已做决定、仓库约束、领域惯例）；
3. **猜**：采用合理默认值，明确标注"这是假设"；
4. **问**：只有前三步都失败、且该问题会改变实现或验收方式时才问用户。

## 带假设提问（Ask-with-hypothesis）

提问必须携带你的理解与默认答案，让用户低成本确认：

> "我理解你的目标是提升页面转化率，对吗？如果不是，是 A 还是 B？（若不回答，我将按 A 继续）"

用户不回答时自动采用默认假设，**永远不因缺答案卡住**。

## 澄清预算（时间盒收敛）

澄清必须收敛，防止无限询问：

- 每次只问一个**决策性**问题（改变实现或验收方式）；
- 每个问题回答后状态必须前进；
- **累计 3 轮仍未收敛** → 停止询问，把未决项记录为**假设**（`assumptions-recorded`），立即解锁执行；
- 假设清单随交付物一起交付，用户验收时可见。

## 步骤

### 1. 读取已有上下文

先读取仓库中已有的领域术语（`CONTEXT.md` 若存在）、用户决定和仓库约束。
已经有答案的问题不重复询问。

### 2. 执行中识别决策点

在规划/分析/制作过程中，遇到会改变实现或验收方式的歧义才停下来问：
- 参与者是谁
- 触发条件是什么
- 可观察的结果是什么
- 边界条件（最大/最小/空/并发）
- 失败行为（错误后系统状态如何）

等用户回答后，继续推进；遇到下一个决策点再问。

### 3. 记录验收标准

用**用户可观察行为**描述验收标准，不用实现细节。
同时记录明确的**非目标**，防止后续实现静默扩张范围。

### 4. 找到第一个可验证切片

找出最小的、可以独立验证的纵向切片。
当实施不再需要猜测时立即停止，不继续扩写完整计划。

**完成判据（满足其一即可收敛）：**
- 至少一条验收标准已用用户可观察行为表述，并有明确的非目标；或
- 澄清预算耗尽，未决项已记录为假设（`assumptions-recorded`），假设清单随交付物交付
- 第一个可独立验证的切片已识别

返回 `acceptance-criteria-recorded`（或 `assumptions-recorded`）、`non-goals-recorded`（或 `assumptions-recorded`）、`first-slice-identified` 与 `requirements-decision-recorded`，每项附带真实的文档、决定或任务引用。
宿主要求 `AIOS_REX_EVIDENCE` 时，只在结尾输出当前 `activationId` 的恰好一个证据信封。

### 需求变更边界

Requirements Decision 一旦完成并写入 workflow state，后续路由以该类型化 artifact 和追加 Evidence 为准，不覆盖原 decision。若用户在工作流中途改变需求，应新开一条 workflow，而不是修改既有 decision。

不要替用户选择尚未确认的产品行为，不要创建第二份实施计划，也不要调用下一个 Provider。
