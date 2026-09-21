---
name: aios-engineering-standards
description: "Shared engineering quality baseline for all code-producing work in AIOS. 工程质量基线：代码生成/修改/审查前加载，用经典软件工程原则（Clean Code、Clean Architecture 边界、深层模块、DRY、测试担保、工具链自动化）约束生成物。TRIGGER: 写代码/改代码/审查代码前、用户要求代码质量或架构规范、新建项目或包需要工具链基线"

installCatalogName: aios-engineering-standards
clients: [codex, claude, gemini, opencode, hermes, grok, workbuddy, pi, zcode, qoder]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [general, quality, architecture, essential]
repoTargets: [codex, claude, gemini, opencode, hermes, grok, agents, workbuddy, pi, zcode, qoder]
---

# AIOS Engineering Standards

所有代码生产工作的共同质量基线。本技能不替代任何 `rex-*` Provider 的流程——
它是实现、加固、设计、审查之前**必须先读的标准**，也是 Definition of Done 的出处。

## 何时加载

- `aios-workflow-router` 路由到代码生产类 Provider 时：`rex-implement`、
  `rex-refactor-hardening`、`rex-code-review`、`rex-design`——执行前先读本标准。
- 用户提出代码质量、规范、架构、可维护性相关要求时。
- 新建项目 / 新包 / 新模块，需要工具链基线时。

## 边界（本技能不管什么）

- 不管工作流路由与阶段顺序（归 `aios-workflow-router`）。
- 不管 Fowler 坏味道清单（归 `rex-code-review` smell 基线，已覆盖，不重复）。
- 不管测试方法论（归 `rex-tdd` / `rex-strict-tdd` / `verification-loop`）。
- 本技能只提供**上游的设计与质量标准**：边界怎么划、模块做多深、代码长什么样、
  工具链必须有什么、做到什么程度算完成。

## 1. 架构边界（Clean Architecture）

> 源码依赖只能指向内层；业务逻辑不认识框架、数据库和 UI。

- **先划边界，再谈模式**。每个改动先回答：这个行为属于哪个领域/层？现有哪个模块拥有它？
  （pre-edit-safety-gate 的变更形态决策已回答前半，本标准回答后半。）
- **依赖规则**：领域/实体层不得 import 框架、驱动、UI 细节；外层通过接口依赖内层，
  依赖方向永远从外指向内。违反时把依赖倒置，而不是把内层改造成适配外层的形状。
- **高内聚、低耦合**：一起变化的东西聚拢到一个模块（对治 Shotgun Surgery）；
  一个模块只因一个原因变化（对治 Divergent Change）。
- **最小接口**：模块对内封装细节，对外暴露最小接口。接口里出现实现细节
  （框架类型、存储结构、第三方 DTO）即边界泄漏。
- **命名即边界**：无法诚实地命名一个模块/边界的改动，说明设计未想清——
  停下来回到 `rex-design` 出选项，不要硬写。

## 2. 深层模块（A Philosophy of Software Design）

> 复杂度 = 理解成本 + 修改成本。好的模块接口小、实现深。

- **深层模块优先**：一个小接口后面藏着大体量实现的模块，比一层薄转发函数的堆叠更好。
  新增"只转发另一个函数的函数/类"前先问：它增加了什么信息隐藏？
- **浅模块警惕**：接口和实现一样大的抽象（为抽象而抽象的 wrapper、为未来预留的参数）
  是净复杂度，删掉。Speculative Generality 同样在 smell 基线上，双向对治。
- **战略编程 > 战术编程**：每个小改动都留一点改进（童子军军规），
  而不是每次都在"能跑"上再糊一层。投资占比建议：快速交付与结构改进兼顾，
  不允许连续多个改动只堆功能不动结构。
- **注释是设计工具**：写不出清晰注释往往说明模块边界或职责模糊——
  先改设计，再让注释描述"为什么"，而不是复述代码在做什么。

## 3. 代码基线（Clean Code / The Pragmatic Programmer）

- **命名表达意图**：名不副实的标识符先重命名再动手；想不出诚实的名字 = 设计模糊（同 §1）。
- **函数做一件事**：一个函数只有一个抽象层级；参数超过 3 个考虑封装为类型（Data Clumps）。
- **错误处理**：用异常/错误类型表达失败，不用返回码让调用方到处判断；
  错误信息携带上下文，不吞异常。
- **DRY**：一个知识点在系统里只有一个权威表示。两处相似先问是不是同一个知识，
  是则提取，不是则不要强行合并（偶然相似比错误耦合便宜）。
- **正交性**：改一个需求只动一个地方。修改前预估爆炸半径，动了多处 = 结构信号。
- **童子军军规**：离开代码库时，让它比你看到时更干净——小步、持续、可验证。

## 4. 测试基线

- 核心逻辑必须有自动化覆盖（单元 + 必要的集成）；重构与加固只能在绿色测试后进行。
- 不得为让测试通过而弱化断言、删用例、跳过用例、只验 mock。
- 测试是重构的担保，也是"行为未变"的证据——没有它们，重构是祈祷。

## 5. 工具链基线（把标准变成自动化）

> 能机器检查的规则，不靠人肉 review 的记忆。——落地建议：开箱即用模板 +
> Lint + Pre-commit Hooks + CI，把工程标准转化为自动化流程。

新建项目 / 新包 / 新模块时，交付物必须包含：

- [ ] Lint / 格式化配置（与仓库现有规范一致，不另起炉灶）
- [ ] Pre-commit hooks（lint + 快速测试）
- [ ] CI 配置（lint + 静态检查 + 全量测试）
- [ ] 测试框架就位，至少一条可运行的核心路径测试
- [ ] 结构化日志（不用 print 裸奔；至少分级、可检索）

对已有仓库：遵守仓库既有标准（仓库标准优先），缺项记入交付说明，
不静默忽略也不擅自引入平行规范。

## 6. 文档基线

- Consequential 改动（影响边界、接口、数据结构、运维方式的改动）写一条简短
  ADD（Architecture Design Document）：决策、适用条件、权衡、被拒选项——
  与 `rex-design` 的决策记录同构，不扩写成实施计划。
- API / 公共接口的契约随改动更新；"知识只存在于某人脑子里"视为未完成。

## Definition of Done（生成代码的完成定义）

声称"完成"前逐项确认；任何一项为否 → 继续做，不报完成：

| # | 条目 | 通过标准 |
|---|---|---|
| 1 | 行为符合验收标准 | rex-implement self-check 全"是" |
| 2 | 边界清晰 | 改动落在正确的模块/层；依赖方向未被破坏；无接口泄漏 |
| 3 | 模块够深 | 新抽象隐藏了真实细节；无薄转发、无预留参数 |
| 4 | 命名与函数 | 名实相符；函数单一抽象层级；错误处理统一 |
| 5 | 测试担保 | 核心路径有自动化覆盖；断言未被弱化 |
| 6 | 工具链 | Lint / pre-commit / CI / 日志达到 §5 基线 |
| 7 | 文档 | ADD（consequential 时）+ 接口契约已更新 |
| 8 | 证据 | focused-tests-pass 等证据信封已附真实引用 |

## 参考

- 公开标准页与参考文案（书单 / 免费资源 / 四阶段模型）：
  <https://cli.rexai.top/engineering-standards/>
- 观点来源：Clean Code（Martin）、Refactoring 2（Fowler）、The Pragmatic Programmer 2（Hunt/Thomas）、
  Design Patterns（GoF）、Clean Architecture（Martin）、DDIA（Kleppmann）、
  A Philosophy of Software Design（Ousterhout）、The Mythical Man-Month（Brooks）、
  Making Things Happen（Berkun）。
