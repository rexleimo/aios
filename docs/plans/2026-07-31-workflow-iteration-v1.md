# 工作流迭代更新文档 v1 — 2026-07-31

本文档记录本次迭代讨论的背景、诊断结论、已完成变更，以及后续待完成的迭代方向。供开发同事对接用。

---

## 背景

本次迭代的触发点：参考 mattpocock/skills 仓库（已克隆至 agent-sources/skills/）后，发现我们现有 rex-harness skill 体系存在可量化的质量差距，具体表现为：

- Agent 经常汇报"已完成"但实际产出未达验收标准
- Code Review 每次结果不可预期，没有统一的 smell 基线
- 需求消歧阶段缺乏结构化流程，Agent 同时抛多个问题或直接猜测需求进入实现
- 部分空目录残留（幻觉文件）干扰仓库结构

参考仓库关键洞察：mattpocock/skills 的核心优势是每个 skill 都有**可检查的完成判据**（completion criterion），而我们的 rex skill 只有"做什么"没有"怎么证明做完了"。

---

## 本次迭代已完成变更

### 变更一：移除 superpowers 参考

文件：`docs/reports/competitor-watchlist.json`

将 superpowers（github.com/obra/superpowers）从 `archive-reference` 移入 `remove` 列表。

**原因：** superpowers 是一套 Shell prompt 注入方案，其方法论（brainstorm → plan → verification）已被 rex-harness 的 Capability 体系吸收。继续跟踪它的改动不会产生增量架构决策，但每次参考对比都有不必要的 context 成本。

---

### 变更二：清理幻觉空目录

删除了以下 5 个只有空 `evals/` 子目录、从未写过 SKILL.md 的残留目录：

- `skill-sources/matt-code-review/`
- `skill-sources/matt-implement/`
- `skill-sources/matt-requirements/`
- `skill-sources/matt-test-design/`
- `skill-sources/matt-wayfinder/`

**原因：** 上次集成时投影被删除（commit `47f6e072`），但空目录未清理，造成仓库结构误导。

---

### 变更三：重写 rex-code-review

文件：`rex-harness/skill-sources/rex-code-review/SKILL.md`（已同步到所有 client 目录）

**改动前问题：** 8 行，只说"审查两个维度"。Agent 不知道去哪里找规格、标准是什么、如何判断——导致每次 review 结果随机，或空报通过。

**改动后新增：**

1. **5 步操作流程**：找 diff range → 找规格来源（issue/文档/问用户）→ 找标准来源（仓库文档 + smell 基线）→ Standards / Spec 双轴并行审查 → 汇总
2. **Fowler 12 条 smell 基线**（始终生效，不依赖仓库文档）：Mysterious Name、Duplicated Code、Feature Envy、Data Clumps、Primitive Obsession、Repeated Switches、Shotgun Surgery、Divergent Change、Speculative Generality、Message Chains、Middle Man、Refused Bequest。每条有定义和修复方向。
3. **硬完成判据**：每个发现必须包含位置（文件:行号）、证据（引用原文）、严重度（hard/judgement）、可执行修复建议。Standards 轴必须逐一检查 12 条 smell，无发现的写"未见"。Spec 轴必须确认规格来源或明确标注无规格。

---

### 变更四：rex-implement 加 self-check gate

文件：`rex-harness/skill-sources/rex-implement/SKILL.md`（已同步到所有 client 目录）

**改动前问题：** Agent 执行完就报 `implementation-diff-recorded`，但没有任何机制核对验收标准是否真的覆盖了。

**改动后新增 step 3 — Self-check gate：**

在提交证据前，Agent 必须列出 Command 中的每条验收标准，填表确认：

| 验收标准 | 已覆盖？ | 证据（文件:行号 或 测试名） |
|---|---|---|
| ... | 是 / 否 / 部分 | ... |

规则：有任何一条"否"或"部分"→ 继续实现，不许报完成。全部"是"且测试通过才能进入 Evidence 步骤。

---

### 变更五：rex-requirements 加 grilling 协议

文件：`rex-harness/skill-sources/rex-requirements/SKILL.md`（已同步到所有 client 目录）

**改动前问题：** 需求消歧阶段 Agent 可以同时抛出多个问题，或直接猜测需求进入实现。用户被多个问题淹没或感到重复。

**改动后新增 grilling 协议：**

- **一次只问一个问题，等用户回答后再问下一个**（这是最重要的约束，显式标出）
- 能从仓库代码/配置查到的事实主动查，不问用户——只把**决策**交给用户
- 逐步消歧：参与者、触发条件、可观察结果、边界、失败行为
- 完成判据：至少一条用用户可观察行为表述的验收标准 + 明确非目标 + 可独立验证的第一个切片

---

## Commit 记录

```
rex-harness (子模块):
  92af46c feat(skills): upgrade code-review, implement, requirements

harness-cli (父仓库):
  b23a88ad feat(workflow): upgrade rex skills, remove superpowers ref, clean empty matt dirs
```

---

## 下一步迭代方向（待开发对接）

以下是本次讨论中识别出的、尚未实施的优化点，按优先级排列。

---

### P0：grilling 前置——需求歧义信号时自动触发消歧

**问题：** 当前 `derive-facts.mjs` 的路由逻辑：当 `BEHAVIOR_CHANGE` 和 `HIGH_RISK_BOUNDARY` 同时由 regex 命中时，直接路由到 specialist review，没有先消歧的机会。用户说"把登录逻辑改一改"可能只是 UI 细节，但被当成高风险安全边界处理。

**方案：** 在 `evaluateNext()` 里加弱信号检测：当 derive-facts 的结论只来自 regex（`request:current`），且同时命中多个冲突 Fact 时，先返回 `GRILLING_REQUIRED` 状态，附带 1-3 个针对冲突点的澄清问题，等用户回答后用结构化 observation 重新 derive，再路由。

**涉及文件：**
- `rex-harness/src/application/derive-facts.mjs`
- `rex-harness/src/workflows/software-workflow-runtime.mjs`

---

### P1：扩充 explicitIntent 语义映射

**问题：** `explicitIntent` 目前只有几个硬编码字符串（`direct/wayfinder/plan/team/harness`）。大量语义意图被迫走 regex fallback，导致路由不准确。

**方案：** 参考 mattpocock 的 intent 词汇，扩充映射表：

| intent 值 | 映射到 Capability |
|---|---|
| `grill` | REQUIREMENTS_CLARIFY（走新的 grilling 流程） |
| `spec` | 直接产出规格文档，不进入 wayfinder |
| `tickets` | 跳过 spec，直接拆 tickets |
| `implement` | 假设需求已清，直接进 IMPLEMENTATION_EXECUTE |
| `review` | 强制进入 CODE_REVIEW，不走 regex 推导 |

**涉及文件：**
- `rex-harness/src/application/derive-facts.mjs`（explicitIntentValue 函数下方）
- `rex-harness/src/domain/capability-ids.mjs`（确认 Capability ID 名称）

---

### P2：rex-wayfinder 对齐 mattpocock wayfinder 结构

**问题：** 当前 rex-wayfinder 是 4 行薄壳（destination → decision-map → next-slice）。mattpocock wayfinder 有完整的 Map/Ticket 结构、fog-of-war 概念、Ticket Types（Research/Prototype/Grilling/Task）和 one-ticket-per-session 约束。

**方案：** 在 rex-wayfinder 里加：
- Map 文档结构（Destination / Decisions-so-far / Not yet specified / Out of scope）
- Ticket 类型分类（Research AFK / Grilling HITL / Task）
- fog-of-war 原则：只 ticket 已经能精确表述的问题，模糊的留在 Not yet specified
- one-ticket-per-session 约束

**涉及文件：**
- `rex-harness/skill-sources/rex-wayfinder/SKILL.md`

---

### P3：rex-planning 加 to-tickets 纵向切片结构

**问题：** 当前 rex-planning 只做依赖图，没有 tracer-bullet 概念——每个 ticket 应该是一个能独立演示的端到端纵向切片，而不是按文件或层次横向分解。

**方案：** 在 rex-planning 里加：
- 纵向切片规则：每个切片切穿所有层（schema/API/UI/tests），完成后可独立演示
- blocking 边描述方式
- wide refactor 的 expand-contract 例外处理

**涉及文件：**
- `rex-harness/skill-sources/rex-planning/SKILL.md`

---

### P4：skill 质量 audit（writing-great-skills 原则）

对所有 rex-* skill 做一次 audit，用 mattpocock writing-great-skills 的四个维度检查：

- **no-op**：写了但模型默认就会做的行（直接删）
- **negation**：用"不要做X"反而激活 X 的行（改成正向表述）
- **sediment**：不断累积但从没删过的过时规则
- **模糊完成判据**："确认完成"这类无法检查的判据（改为可检查条件）

已知高风险：rex-debug、rex-tdd（内容复杂，negation 多）。

---

### P5：Memory 与 Skill 加载优化

**问题：** 当前 memory 注入了大量 session 级、会过期的内容（项目路径、PR 号、commit SHA），真正高价值的跨 session 偏好被稀释。skill 也没有区分"模型自动加载"和"用户显式触发"两种类型。

**方案：**
1. 按 `writing-great-skills` 的 `disable-model-invocation: true` 字段，把只有用户显式触发才需要的 skill（如 cap、rex-* provider）标记清楚，减少自动加载的 context 压力
2. Memory 清理：移除所有 PR 号、commit SHA、"Phase N done" 类条目；只保留偏好、环境事实、项目约定

---

## 开发对接说明

- P0/P1 涉及代码改动，需要进入 rex-harness 子模块开发，完成后更新父仓库指针
- P2/P3/P4 只涉及 SKILL.md 文本，修改后运行 `npm run distribute-skills`（或等价的 sync 脚本）同步到各 client 目录
- P5 Memory 清理是运维动作，不需要代码评审
- 所有 skill 改动优先在 `rex-harness/skill-sources/` 修改，再同步投影，不要直接改 `.claude/skills/` 等 client 目录

---

*文档由 Claude Code 生成，基于 2026-07-31 与用户的对话记录。*
