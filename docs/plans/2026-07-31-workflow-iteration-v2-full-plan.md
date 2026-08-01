# Rex Harness 工作流优化落地方案 v2
> 作者：与用户对话分析后汇总，供开发团队对接执行
> 日期：2026-07-31
> 基础版本：harness-cli@b23a88ad，rex-harness@92af46c

---

## 背景与核心诊断

本次分析对比了 mattpocock/skills（已克隆至 agent-sources/skills/）与当前 rex-harness skill 体系，发现两层问题：

**层1（运行时）**：derive-facts.mjs + software-workflow-runtime.mjs
- 路由全靠 regex，歧义时直接跳 Capability，不消歧
- explicitIntent 只有5个硬编码值，大量意图走 fallback

**层2（指令层）**：rex-*/SKILL.md
- 所有 skill 平均5-9行，只有"做什么"，没有"怎么证明做完了"
- code-review 无 smell 基线，每次结果随机
- implement 禁止自调 review，review 步骤永不自动触发
- requirements 没有 grilling 协议约束

---

## 已完成变更（v1，已合并至 main）

以下变更已在本次对话中完成，commit `92af46c` + `b23a88ad`：

| 变更 | 文件 | 状态 |
|---|---|---|
| 移除 superpowers 参考 | competitor-watchlist.json | ✅ 已推送 |
| 清理5个空壳目录 | skill-sources/matt-*/evals/ | ✅ 已推送 |
| 重写 rex-code-review | rex-harness/skill-sources/rex-code-review/SKILL.md | ✅ 已推送 |
| rex-implement 加 self-check gate | rex-harness/skill-sources/rex-implement/SKILL.md | ✅ 已推送 |
| rex-requirements 加 grilling 协议 | rex-harness/skill-sources/rex-requirements/SKILL.md | ✅ 已推送 |

---

## 待开发团队执行的迭代项

### P0 — 需求歧义自动触发消歧（运行时代码改动）

**优先级**：最高，影响所有 Agent 任务入口

**问题根因**：

当用户说"把登录逻辑改一改"时，derive-facts.mjs 同时命中 BEHAVIOR_CHANGE 和 HIGH_RISK_BOUNDARY，evaluateNext() 直接选择高风险 Capability，跳过了消歧。用户其实可能只是改一个按钮颜色。

**方案**：

在 `software-workflow-runtime.mjs` 的 `evaluateNext()` 里加弱信号检测：

```
当 derive-facts 的结论只来自 regex（没有 explicitIntent 加持），
且同时命中2个以上冲突 Fact 时：
  → 注入 GRILLING_REQUIRED 状态
  → 返回1-3个针对冲突点的澄清问题（不超过3个）
  → 等用户回答后，用结构化 observation 重新 derive
  → 再路由
```

**涉及文件**：
- `rex-harness/src/application/derive-facts.mjs`（加弱信号标记）
- `rex-harness/src/workflows/software-workflow-runtime.mjs`（evaluateNext 加判断分支）

**验证方式**：输入"把用户登录改一下"，期望 agent 问一个澄清问题而不是直接进 implementation。

---

### P1 — 扩充 explicitIntent 语义映射（运行时代码改动）

**优先级**：高，影响精确意图识别

**问题根因**：

用户说"帮我 review 一下" 或 "先给我一个 spec" 时，explicitIntent 里没有对应值，走 regex fallback，结果路由不稳定。

**方案**：

在 `derive-facts.mjs` 的 explicitIntentValue 函数里扩充映射表：

| 用户说（模糊匹配） | intent 值 | 路由到 |
|---|---|---|
| grill/问问题/澄清需求 | `grill` | REQUIREMENTS_CLARIFY（走 grilling 流程）|
| spec/写规格/规格文档 | `spec` | 直接产出规格，不进 wayfinder |
| tickets/拆任务/拆 tickets | `tickets` | 跳过 spec，直接拆 tickets |
| implement/直接做/开始写 | `implement` | 假设需求已清，直接进 IMPLEMENTATION_EXECUTE |
| review/代码审查/看看代码 | `review` | 强制 CODE_REVIEW，不走 regex 推导 |
| debug/排查/debugger | `debug` | DIAGNOSING_BUGS（走新的 debug 流程）|
| prototype/先做个原型 | `prototype` | PROTOTYPE_EXPLORE（新 Capability，见 P3）|

**涉及文件**：
- `rex-harness/src/application/derive-facts.mjs`
- `rex-harness/src/domain/capability-ids.mjs`（新增 Capability ID）

---

### P2 — 重写 rex-debug（仅 SKILL.md 改动）

**优先级**：高，直接解决"agent 没有反馈回路就乱改代码"

**问题根因**：

当前 rex-debug 是4条规则，没有方法论。Agent 接到 bug 任务后直接猜测原因修改代码，没有先建立可以重复触发 bug 的机制，改完说"好了"但没有实际验证。

**方案**：移植 mattpocock `diagnosing-bugs` 的6阶段结构：

```
Phase 1 — 建立反馈回路（核心，其余都是机械步骤）
  ├ 有10种方法可选：failing test / curl / CLI fixture / headless / replay /
  │  throwaway harness / fuzz / bisection / differential / HITL bash
  ├ 完成判据：能说出一个已经跑过至少一次的命令，能稳定复现
  └ 没有红色命令 → 不得进入 Phase 2

Phase 2 — 复现 + 最小化
Phase 3 — 生成3-5个可伪证的假设，先列给用户看
Phase 4 — 逐一探针（每次只改一个变量）
Phase 5 — 修复 + 回归测试（先写测试再修复）
Phase 6 — 清理 + 事后复盘
```

**涉及文件**：
- `rex-harness/skill-sources/rex-debug/SKILL.md`（重写）
- 同步到所有 client 目录

---

### P3 — 新增 rex-prototype（新 Skill）

**优先级**：中高，填补设计验证阶段的空白

**问题根因**：

当前流程：需求 → 规划 → 实现，中间没有"先做个可扔掉的原型验证想法"的步骤。设计决策没有经过快速验证就进了实现，经常要返工。

**方案**：基于 mattpocock `prototype` 新建 rex-prototype：

原型分两种，由用户问题决定选哪种：
- **逻辑原型**："这个状态机/逻辑合理吗？" → 做一个 terminal 小程序推状态机
- **UI 原型**："这个功能应该长什么样？" → 多个变体用 URL 参数切换

铁律：
- 原型代码放在靠近真实代码的位置，但命名明显标注是原型
- 一条命令可以运行
- 不做持久化（除非原型本身在验证持久化）
- 完成后把验证结论写进 issue/commit，原型分支保留但不入 main

**涉及文件**：
- 新建 `rex-harness/skill-sources/rex-prototype/SKILL.md`
- 同步到所有 client 目录
- `rex-harness/src/domain/capability-ids.mjs` 新增 PROTOTYPE_EXPLORE

---

### P4 — 升级 rex-wayfinder（仅 SKILL.md 改动）

**优先级**：中，改善大任务分解质量

**问题根因**：

当前 rex-wayfinder 是4行薄壳（destination → decision-map → next-slice），没有结构化的 Map/Ticket 框架，Agent 做大任务时经常"切横片"（按文件层次切）而不是"切纵片"（切穿所有层、可独立演示）。

**方案**：移植 mattpocock `wayfinder` 的完整结构：

```
Map 文档（持久化到 .wayfinder/map.md）：
  ├ Destination（最终可观察的目标）
  ├ Decisions-so-far（已确认的决策，不重开）
  ├ Not yet specified（模糊的，先放这，不猜测）
  └ Out of scope（明确排除的）

Ticket 类型：
  ├ Research AFK — Agent 可离线完成，产出知识文档
  ├ Grilling HITL — 需要用户参与消歧
  └ Task — 可执行的实现切片

Ticket 约束：
  ├ 每个 Task Ticket 必须是纵向切片（切穿 schema/API/UI/tests）
  ├ 切片完成后可独立演示
  └ one-ticket-per-session：一个 session 只执行一个 Ticket
```

**涉及文件**：
- `rex-harness/skill-sources/rex-wayfinder/SKILL.md`（重写）
- 同步到所有 client 目录

---

### P5 — 新增 rex-domain-model（新 Skill）

**优先级**：中，解决跨 session 术语漂移问题

**问题根因**：

当前无跨 session 词汇表机制。第一轮对话确认的术语，在第二轮 session 里 agent 可能用不同的词描述同一个概念，产生歧义。尤其在 requirements → plan → implement 跨越多个 session 时问题突出。

**方案**：基于 mattpocock `domain-modeling` 新建 rex-domain-model：

- 每次 requirements/grilling 确认一个术语时，**立即写入** `CONTEXT.md`（词汇表）
- `CONTEXT.md` 只放词汇定义，不放实现细节
- 有架构决策时写 ADR（`docs/adr/NNNN-title.md`），条件：难以逆转 + 不看会困惑 + 有真实 trade-off，三条都满足才写
- 之后所有 skill 读 `CONTEXT.md` 作为术语基线

**涉及文件**：
- 新建 `rex-harness/skill-sources/rex-domain-model/SKILL.md`
- 新建 `CONTEXT.md`（仓库词汇表，空模板）
- rex-requirements/SKILL.md 补充：解歧后自动更新 CONTEXT.md

---

### P6 — 新增 handoff skill（新 Skill）

**优先级**：中，解决长 session 后 context 压缩导致决策丢失

**问题根因**：

长对话被压缩后，agent 丢失关键决策背景。用户需要重新解释已经讲过的内容。

**方案**：直接采用 mattpocock `handoff`：

用户输入 `/handoff` 触发：
1. 把当前 session 压缩成一份 Markdown handoff 文档
2. 保存到 OS temp 目录（不进仓库）
3. 文档包含：当前进度、已做决策、阻塞项、下一步建议加载的 skill 列表
4. 不重复已有 artifact（只引用 path/URL，不复制内容）
5. 敏感信息（API key、密码）自动脱敏

**涉及文件**：
- 新建 `rex-harness/skill-sources/handoff/SKILL.md`（直接使用 mattpocock 版本）
- 同步到所有 client 目录

---

### P7 — Skill 质量 Audit（仅 SKILL.md 改动）

**优先级**：低，但影响长期维护质量

**问题根因**：

用 mattpocock `writing-great-skills` 的四维度审查现有 rex-* skill，发现高风险条目：

| 问题类型 | 定义 | 高风险 Skill |
|---|---|---|
| no-op 行 | 写了但 agent 默认就会做（浪费 context） | rex-planning, rex-tdd |
| negation 行 | "不要做X"反而激活 X 的联想 | rex-implement（原版）, rex-debug |
| sediment | 不断累积但从没删过的过时规则 | rex-workflow |
| 模糊完成判据 | "确认完成"这类无法检查的描述 | 所有 skill |

**方案**：对每个 rex-* skill 做一轮 audit，用以下检查：
- 这行如果删掉，agent 行为会变吗？→ 不变则删
- 这行是"不要X"格式？→ 改成"做Y"正向表述
- 完成判据是否可检查？→ "确认完成"改成"返回X时附带Y引用"

---

### P8 — Memory 清理与 Skill 调用类型标注（轻量运维）

**优先级**：低，但减少 context 浪费

**问题**：
- Memory 里混入了大量临时状态（PR 号、commit SHA、"Phase N done"）
- Skill 没有区分"agent 自动触发"和"用户显式触发"两种类型

**方案**：
1. Memory 清理原则：移除 PR 号、commit SHA、完成日志、临时路径；只保留用户偏好、环境约定、项目架构决策
2. Skill 标注：参考 mattpocock 的 `disable-model-invocation: true` 字段，把只有用户主动喊才需要加载的 skill（如 handoff、cap、rex-* provider）在 frontmatter 里标注，减少自动加载时的 context 压力

---

## 执行路线图

```
立即可做（无代码改动，仅改 SKILL.md）：
  P2 — rex-debug 重写
  P4 — rex-wayfinder 升级
  P6 — handoff 新增
  P7 — Skill Audit
  P8 — Memory 清理

需要代码改动（涉及 rex-harness JS 源码）：
  P0 — 需求歧义自动消歧（derive-facts + workflow-runtime）
  P1 — explicitIntent 扩充（derive-facts）
  P3 — rex-prototype 新增（新 Capability ID + Skill）
  P5 — rex-domain-model 新增（新 Skill + CONTEXT.md 集成）
```

**建议执行顺序**：

第一阶段（可立即启动，1-2天）：P2 + P6 + P4，这三个改动独立、影响大、无风险

第二阶段（需设计讨论，3-5天）：P0 + P1，改运行时逻辑，需要写测试验证路由行为

第三阶段（后续迭代）：P3 + P5 + P7 + P8，功能补全和质量收尾

---

## 对接检查清单

开发同事执行每个改动前：

- [ ] SKILL.md 改动：改完后运行 `scripts/sync-skills.sh`（或等价命令）同步到所有 client 目录（.agents/.claude/.gemini/.grok/.hermes/.opencode）
- [ ] 运行时代码改动：改完后补充场景测试（routing behavior test），在 rex-harness 内运行 `npm test`
- [ ] 新 Capability 加入时：capability-ids.mjs + catalog.mjs + workflow-runtime.mjs 三处同步更新
- [ ] 子模块（rex-harness）改动后：在父仓库 harness-cli 更新子模块指针并推送

---

## 参考素材位置

- mattpocock/skills 完整克隆：`E:/coding/harness-cli/agent-sources/skills/skills/`
- 已分析的关键 skill：
  - `engineering/diagnosing-bugs/SKILL.md` → P2 素材
  - `engineering/wayfinder/SKILL.md` → P4 素材
  - `engineering/prototype/SKILL.md` → P3 素材
  - `engineering/domain-modeling/SKILL.md` → P5 素材
  - `productivity/handoff/SKILL.md` → P6 素材
  - `productivity/writing-great-skills/SKILL.md` → P7 基准
- rex-harness 入口：
  - `rex-harness/src/application/derive-facts.mjs` → P0/P1
  - `rex-harness/src/workflows/software-workflow-runtime.mjs` → P0
  - `rex-harness/src/domain/capability-ids.mjs` → P1/P3
  - `rex-harness/src/providers/catalog.mjs` → P3

---

*计划书由 Claude Code 生成，基于2026-07-31与用户的完整对话分析。*
