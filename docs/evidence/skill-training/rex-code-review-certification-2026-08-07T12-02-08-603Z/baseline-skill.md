---
name: rex-code-review
description: Use only after rex-harness selects standards-and-spec review and supplies the current Command.
---

# Rex Code Review

Required sequence:
1. Resolve the current Command fixed-point and require a non-empty diff before review.
2. Review Standards and Spec axes independently, recording each finding and its evidence.
3. Return one bounded verdict artifact and stop without calling another Provider.

仅在 rex-harness 已经激活标准与规格审查 Capability，并提供当前 Command 后执行本流程。

## 步骤

### 1. 确定差异范围

运行 `git diff <fixed-point>...HEAD`（三点，基于 merge-base）和 `git log <fixed-point>..HEAD --oneline`。
fixed-point 从当前 Command 的 `targetRefs` 或用户参数中取；若均无，问用户一次。
先验证 fixed-point 可 resolve（`git rev-parse`）且 diff 非空——空 diff 或坏 ref 直接报失败，不进入审查。

### 2. 找规格来源

按顺序查找：
1. 提交信息中的 issue 引用（`#123`、`Closes #45`）→ 从 issue tracker 拉取正文
2. 用户传入的路径
3. `docs/`、`specs/`、`.scratch/` 下与分支名或功能匹配的文件
4. 以上均无 → 问用户一次；用户确认无规格时，Spec 轴跳过并标注"缺少规格证据"

### 3. 找标准来源

仓库内所有记录编码规范的文件（`CODING_STANDARDS.md`、`CONTRIBUTING.md`、`AGENTS.md` 中的 Coding Style 节等）。
无论仓库是否有文档，以下 **smell 基线**始终生效。仓库标准冲突时仓库标准优先；工具已覆盖的规则跳过。

**Smell 基线（Fowler，Refactoring ch.3）**

- **Mysterious Name**：函数、变量或类型名无法表达它做什么或持有什么 → 重命名；若想不出诚实的名字，设计本身可能模糊
- **Duplicated Code**：同一逻辑形态出现在 diff 的多处或多文件 → 提取共享结构，两处调用它
- **Feature Envy**：方法访问另一对象的数据多于自己的 → 把方法移到它所羡慕的数据旁
- **Data Clumps**：相同的几个字段或参数总是一起出现（一个类型想要诞生）→ 将它们封装成一个类型
- **Primitive Obsession**：用原始类型或字符串代替一个值得有自己类型的领域概念 → 给概念一个小类型
- **Repeated Switches**：相同类型上的 switch/if 级联在 diff 中多处重复 → 用多态替代，或让两处共享一张映射表
- **Shotgun Surgery**：一个逻辑变更导致 diff 里多处散射修改 → 把一起变化的东西聚拢到一个模块
- **Divergent Change**：同一文件因多个无关原因被修改 → 拆分，使每个模块只因一个原因变化
- **Speculative Generality**：为规格中不存在的需求添加了抽象、参数或钩子 → 删除，回归到真实需求出现时再抽象
- **Message Chains**：调用者依赖 `a.b().c().d()` 这样的长导航链 → 在第一个对象上隐藏这条链，暴露一个方法
- **Middle Man**：一个类或函数几乎只做转发 → 去掉中间人，直接调用真正的目标
- **Refused Bequest**：子类或实现者忽略或覆盖了它继承的大部分内容 → 放弃继承，改用组合

### 4. 并行运行两个审查轴

**Standards 轴** — 针对 diff，逐文件/逐块检查：
- 是否违反仓库已记录的标准（引用来源文件 + 规则原文）
- 是否命中 smell 基线（标注 smell 名称并引用对应代码块）
- 区分硬违规（文档标准）和判断性发现（smell 基线总是判断性的）
- 限 400 字以内

**Spec 轴** — 针对 diff + 规格：
- 规格要求但缺失或不完整的部分（引用规格原文）
- diff 中未被规格要求的行为（scope creep）
- 看似已实现但实现有误的需求（引用规格 + 代码行）
- 限 400 字以内；无规格时写"缺少规格证据，Spec 轴跳过"

两个轴独立报告，不合并排序——一个轴通过不能掩盖另一个轴的问题。

### 5. 汇总输出

在 `## Standards` 和 `## Spec` 两个标题下分别呈现结果，原文或轻度整理。
末尾一行汇总：两轴各自的发现数量，以及每轴最严重的一项（若有）。

**完成判据（缺任何一项不得报完成）：**
- 每个发现必须包含：位置（文件:行号或代码块）、证据（引用原文）、严重度（hard / judgement）、可执行修复建议
- Standards 轴：已检查 smell 基线全部 12 条，无发现的条目写"未见"
- Spec 轴：已确认规格来源，或明确标注无规格
- 无发现时明确写出检查过的范围，不能空报通过

返回 `standards-review-recorded` 和 `spec-review-recorded`，每项附带真实的差异、审查或报告引用。

### S4 review verdict boundary

完成态必须能归一化为一个 `rex.standards-spec-review.v1`：包含 fixed-point、非空 diff ref、Spec 来源或明确缺失、Standards/Spec 两轴 findings、每项 finding 的位置/证据/严重度/修复建议、最终 verdict 和 evidence refs。空 diff、坏 fixed-point 或未区分两轴时只能返回 `blocked`/`incomplete`，不得报通过。

宿主要求 `AIOS_REX_EVIDENCE` 时，只在结尾输出当前 `activationId` 的恰好一个证据信封。不要调用下一个 Provider。
