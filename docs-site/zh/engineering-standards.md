---
title: 工程标准——AIOS 构建软件，而不只是生成代码
description: "AIOS 6.0 把经典软件工程标准内建到工作流：Clean Architecture 边界、深层模块、Clean Code 规则、测试与工具链基线——每一处生成的改动都有 Definition of Done，并附参考书单与免费合法资源。"
---

# 工程标准

## Quick Answer（一句话答案）

传统的编码智能体生成**能跑**的代码，AIOS 生成**工程化**的代码。自 v6.0.0 起，工作流中每一个代码生产步骤都会先加载同一套质量基线——`rex-engineering-standards` 技能：《Clean Architecture》的架构边界、《软件设计哲学》的深层模块、《代码整洁之道》的命名与函数规则、《程序员修炼之道》的 DRY 与正交性——任何改动只有通过 Definition of Done 才算完成。这套标准骑在已有的证据驱动能力链上，不是一道可以绕过的额外门。本页即公开标准，并附参考文案：四阶段能力模型、九本书单、免费合法资源。

## 为什么：生成代码的质量缺口

生成代码通不过评审的原因是可预测的，而且几乎没有一条是"算法写错了"：

- **边界违规**——业务逻辑直接伸手进框架、存储和 UI 细节，于是一个需求改动同时打破三层。
- **浅抽象**——一层层只做转发的 wrapper、为永远不会到来的未来预留的参数：净复杂度，零信息隐藏。
- **命名与形态漂移**——一个函数做四件事、名不副实的标识符、错误返回码在十几处被反复判断。
- **缺少安全网**——没有测试，每次重构都是祈祷，每次评审都从零开始。
- **缺少工具链**——没有 lint、没有 pre-commit、没有 CI：标准活在某个人的记忆里，而不是流水线里。

这些不是模型规模问题，是**标准问题**。而标准属于框架，不属于一篇没人会打开的 wiki。

## AIOS 已经具备、传统智能体没有的能力

AIOS 是本地优先的编排控制平面，不是套在代码生成器外面的聊天壳。软件工程能力在这里早已是结构性的——v6.0.0 把质量基线也变成了一等公民：

| 传统编码智能体 | AIOS |
| --- | --- |
| 生成一个 diff，然后祈祷 | 每个阶段先产出类型化证据（`implementation-diff-recorded`、`focused-tests-pass`、receipt），才解锁下一阶段 |
| "完成"意味着模型说完成了 | 完成 = Definition of Done 清单与证据契约同时通过 |
| 标准写在没人加载的规范文档里 | 标准是一个技能，router 在代码生产类 Provider 执行**之前**加载 |
| 评审靠感觉 | 评审基于 fixed-point diff 跑 Fowler 坏味道基线 + 规格轴 + 标准轴 |
| 质量是最后一道抛光 | 质量门内建在 计划 → 实现 → 加固 → 评审 全链路 |

一句话：传统智能体帮你*写*代码；AIOS 运行整个工程闭环——需求对齐、记录被拒选项的设计决策、行为保持的加固、有证据的评审——现在再加上所有产出的共同质量基线。

## 质量基线

### 1. 架构边界（Clean Architecture）

- **依赖规则**：源码依赖只指向内层。领域逻辑不 import 框架、驱动、UI 细节；外层通过领域定义的接口依赖内层。
- **高内聚、低耦合**：一起变化的东西聚拢到一个模块；一个模块只因一个原因变化。
- **最小接口**：模块把细节藏在最小而诚实的接口后面。接口里出现框架类型、存储结构、第三方 DTO 即边界泄漏。
- **命名即边界测试**：无法诚实地命名一个模块或边界，说明设计没想清——回到设计选项，不要隔着雾硬写。

### 2. 深层模块（《软件设计哲学》）

- 复杂度 = 理解成本 + 修改成本。每个新抽象都用这个总和来衡量。
- **深层模块优先**：小接口 + 大体量被良好隐藏的实现，优于一层层薄转发。
- **警惕浅模块**：接口和实现一样大的抽象、不增加信息隐藏的 wrapper、为臆测未来预留的参数——删掉。
- **战略编程优于战术编程**：每个改动都让代码库好一点（童子军军规）；快速交付与结构改进不是二选一。
- **注释是设计工具**：写不出清晰注释，往往说明边界或职责模糊——先改设计；注释解释"为什么"，不复述"在做什么"。

### 3. 代码基线（Clean Code / 程序员修炼之道）

- 命名表达意图，先重命名再推理；一个函数在同一抽象层级只做一件事。
- 错误用异常或错误类型表达并携带上下文，不用返回码逼调用方在每个调用点解码。
- DRY：一个知识点只有一个权威表示。两处相似只在它们是**同一个**知识时才合并——偶然相似比错误耦合便宜。
- 正交性：一个需求变化只动一个地方。如果脑内 diff 有五个文件，那是结构信号，不是运气差。

### 4. 测试基线

- 核心逻辑有自动化覆盖（单元 + 必要的集成）；重构与加固只在绿色测试后进行。
- 永远不为让构建通过而弱化断言、删用例、跳用例。测试是"行为未变"的证据——没有测试，重构就是祈祷。

### 5. 工具链基线（把标准变成自动化）

> 机器能检查的规则，不靠人肉评审的记忆。——参考材料的落地建议：交付开箱即用的模板，内置 Lint、Pre-commit Hooks、CI，把工程标准转化为自动化流程。

新项目、新包、新模块必须带：

- [ ] 与仓库现有规范一致的 Lint / 格式化配置
- [ ] Pre-commit hooks（lint + 快速测试）
- [ ] CI 配置（lint + 静态检查 + 全量测试）
- [ ] 测试框架就位，至少一条可运行的核心路径测试
- [ ] 结构化、分级、可检索的日志——不是裸 print

已有仓库以仓库自身记录的标准优先；缺口记录进交付说明，不静默忽略，也不擅自引入平行的私有规范。

### 6. 文档基线

- Consequential 改动（触及边界、接口、数据结构、运维方式）记录一条简短 ADD：决策、适用条件、权衡、被拒选项——与设计技能的决策记录同构，不扩写成实施计划。
- API / 公共接口契约随改动更新。"知识只存在于某人脑子里"视为未完成。

## Definition of Done（生成代码的完成定义）

声称"完成"前逐项确认；任何一项为"否" → 继续做，不报完成：

| # | 条目 | 通过标准 |
| --- | --- | --- |
| 1 | 行为符合验收 | 实现自检表全"是" |
| 2 | 边界清晰 | 改动落在正确的模块/层；依赖方向未被破坏；无接口泄漏 |
| 3 | 模块够深 | 新抽象隐藏真实细节；无薄转发、无预留参数 |
| 4 | 命名与函数 | 名实相符；单一抽象层级；错误处理统一 |
| 5 | 测试覆盖 | 核心路径自动化；断言未被弱化 |
| 6 | 工具链 | Lint / pre-commit / CI / 日志达到第 5 节基线 |
| 7 | 文档 | consequential 改动有 ADD；接口契约已更新 |
| 8 | 证据 | 证据信封引用真实回执（测试、diff、场景） |

## 它如何骑在工作流上

```text
router（aios-workflow-router）
  └─ 选出代码生产类 Provider（rex-implement / rex-refactor-hardening / rex-code-review / rex-design）
       └─ 首先加载 rex-engineering-standards  ← 共同质量基线
            └─ Provider 执行自己的证据驱动步骤
                 └─ 完成 = Provider 证据契约 且 本 Definition of Done 同时通过
```

`pre-edit-safety-gate` 还会在第一次编辑前，按本基线核对选定的变更形态（本地修改 / 扩展复用 / 重构提取）。没有任何阶段可以 opt out——不存在"跳过质量"的路线，因为标准是 router 加载的，不靠客气。

## 参考文案

### 工程能力四阶段模型

参考对话把工程能力成长分为四个阶段，AIOS 与四阶段逐一对应：

1. **夯实单兵能力——代码质量与重构**：遵守语言范式与 Lint 规范，KISS / DRY，童子军军规，单元与集成测试给重构上保险。
2. **进化系统思维——设计模式与模块划分**：SOLID，高内聚低耦合，最小接口，对内封装细节。
3. **构建工程自动化——CI/CD 与质量治理**：Conventional Commits、Gitflow / Feature Branch，每次 commit 或 PR 自动跑 lint、静态检查、测试；结构化日志与指标监控。
4. **掌控复杂度——项目管理与交付控制**：大需求拆成可独立交付的 MVP 并预留风险缓冲；ADD、API 文档、需求跟踪矩阵，避免知识只存在于某人脑子里。

### 参考书单

| 书 | 核心价值 |
| --- | --- |
| 《Clean Code》—— Robert C. Martin | 告别"烂代码"的指引：命名、函数、异常处理与类的组织 |
| 《Refactoring》（第2版）—— Martin Fowler | 行为保持前提下小步改善内部结构，由坏味道目录驱动 |
| 《The Pragmatic Programmer》（第2版）—— Hunt / Thomas | 个人修炼指南：职业态度、工程习惯、工具选择与解决问题的思维 |
| 《Design Patterns》—— GoF | 23 种设计模式的源头（觉得抽象可先读《Head First 设计模式》） |
| 《Clean Architecture》—— Robert C. Martin | 架构的本质：划定边界、隔离依赖，业务逻辑与数据库/UI 框架解耦 |
| 《Designing Data-Intensive Applications》—— Martin Kleppmann | 分布式与后端绝佳读物：数据存储、一致性、伸缩性、容错 |
| 《A Philosophy of Software Design》—— John Ousterhout | 斯坦福教授的极简架构书：降低复杂度、深层模块、战术 vs 战略编程 |
| 《The Mythical Man-Month》—— Frederick P. Brooks Jr. | 人月神话、概念完整性、本质复杂度 vs 偶然复杂度 |
| 《Making Things Happen》—— Scott Berkun | 前微软资深项目经理的实用指南：需求定义、技术决策、风险评估、跨团队沟通 |

### 免费且合法的资源

- **《A Philosophy of Software Design》**——GitHub 搜索"A Philosophy of Software Design 中文"，有多个社群维护的优质中文翻译与深度解读
- **《Clean Architecture》**——基于 Uncle Bob 体系的开源文档与实践指南（如 GitHub 上 `clean-architecture-go`、`clean-architecture-python` 示例仓库），结合代码看架构更直观
- **《System Design Primer》**——GitHub `donnemartin/system-design-primer`（250k+ Star，内置完整中文翻译）
- **《Architecture of Open Source Applications》**——官网 aosabook.org，完全免费在线阅读
- **《Pro Git》**——git-scm.com/book/zh/v2，官方免费中文版（在线 + EPUB/PDF）
- **《Software Engineering at Google》**——abseil.io/resources/swe-book 免费英文在线版，GitHub 有社区中文翻译
- **Refactoring.Guru**——refactoring.guru，图文并茂讲解 23 种设计模式与重构手法，提供免费中文内容
- **Google Style Guides**——GitHub `google/styleguide`（C++、Python、Go、TypeScript）
- **Google Code Review Developer Guide**——如何做 Code Review 的官方指南，GitHub 有中文翻译
- **Roadmap.sh**——roadmap.sh，社区驱动的 Backend / DevOps / System Design 技能图谱
- 传统出版物也可通过市级/省级图书馆数字借阅、微信读书等合法渠道免费阅读

### 书中观点 → AIOS 机制

| 书中观点 | AIOS 机制 |
| --- | --- |
| Clean Architecture 依赖规则、边界 | 第 1 节基线 + `pre-edit-safety-gate` 变更形态核对 + `rex-design` 选项比较 |
| 深层模块、复杂度预算 | 第 2 节基线 + Definition of Done 第 2–3 行 |
| Clean Code 命名/函数/错误处理 | 第 3 节基线 + `rex-code-review` 标准轴 |
| Fowler 坏味道、行为保持的变更 | `rex-code-review` smell 基线 + `rex-refactor-hardening` 回执 |
| 程序员修炼之道 DRY/正交性 | 第 3 节基线 + `pre-edit-safety-gate` 复用优先规则 |
| 测试是重构的担保 | `rex-tdd` / `rex-strict-tdd` / `verification-loop` + DoD 第 5 行 |
| 标准即自动化（模板 + lint + pre-commit + CI） | 第 5 节工具链基线 |
| ADD、概念完整性 | 第 6 节文档基线 + 类型化决策记录 |
| 布鲁克斯：本质 vs 偶然复杂度 | 深层模块启发式；删除臆测的通用性 |

## 参见

- [工作流策略](workflow-policy.md)——回合如何被分类与设卡
- [架构](architecture.md)——本标准所保护的控制面架构
- [技能候选](skill-candidates.md)——新能力如何进入目录
