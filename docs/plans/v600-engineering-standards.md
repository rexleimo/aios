# Work Item: AIOS 6.0 — Engineering Standards（工程标准内建）

> Status: in progress (2026-09-21)
> Owner session: 一次 planned 工作项，直接顺序执行（无并行域）

## 背景与问题

用户痛点：AIOS 各客户端"生成的代码质量不够好"，产出不够规范。
参考材料（`~/Downloads/blank.pdf`，Gemini 对话《提升项目管理与工程能力指南》）给出两条关键结论：

1. 工程能力四阶段：代码规范与设计模式 → 软件架构与工程哲学 → 工程交付与 DevOps → 项目管理与团队协同；
2. 落地建议：读书要对照真实项目走查；**从工具链切入——建立开箱即用模板，内置 Lint、Pre-commit Hooks、CI、测试框架，把工程标准转化为自动化流程**。

书单（9 本）：Clean Code、Refactoring 2、The Pragmatic Programmer 2、Design Patterns (GoF)、
Clean Architecture、DDIA、A Philosophy of Software Design、The Mythical Man-Month、Making Things Happen。

## 目标

1. 把上述书籍的核心观点**融入框架**：成为 AIOS 工作流中一等公民的工程质量基线，而不是一篇给人看的文档；
2. 版本升级为 **6.0.0**；
3. **博客与站点**（docs-site + mkdocs 构建的 site/）发布这次能力，四种语言（en/zh/ja/ko，check-site-sync 强制 parity）；
4. **附上参考文案**：书单、核心观点、免费资源、四阶段模型、"书中观点 → AIOS 机制"映射。

## 缺口分析（框架现状 vs 书籍观点）

| 书籍观点 | 框架现状 | 缺口 |
|---|---|---|
| Fowler 坏味道（Refactoring） | `rex-code-review` smell 基线已覆盖 | 无 |
| 测试担保 | rex-tdd / strict-tdd / test-design / verification-loop | 无 |
| 变更安全 | pre-edit-safety-gate | 无 |
| Clean Architecture 依赖规则/边界 | rex-design 只有通用选项比较 | **缺架构边界规则** |
| 深层模块/复杂度（PoSD） | 无 | **缺** |
| Clean Code 正向基线 | 只有 smell（负向） | **缺正向 checklist** |
| 工具链自动化（Lint/Pre-commit/CI） | 无生成侧要求 | **缺工具链基线** |
| ADD 文档 | 无 | **缺文档基线** |

## 执行清单

### A. 框架集成（本仓库）
- [x] A1 新技能 `skill-sources/aios-engineering-standards/SKILL.md`：
  架构边界（Clean Architecture 依赖规则、高内聚低耦合、最小接口）、深层模块（PoSD）、
  Clean Code 正向基线、DRY/正交性、测试基线、工具链基线（Lint+Pre-commit+CI）、
  ADD 文档基线、Definition of Done 清单。明确不替代 rex-* Provider，是共同质量基线。
- [x] A2 `aios-workflow-router` 接线：代码生产类 Provider（rex-implement /
  rex-refactor-hardening / rex-code-review / rex-design）执行前加载本标准。
- [x] A3 `pre-edit-safety-gate` 接线：变更形态决策后对照本标准基线。
- [x] A4 `node scripts/sync-skills.mjs` 投影到各客户端技能根；`node scripts/check-skills-sync.mjs` 校验。

### B. 版本 6.0
- [x] B1 `VERSION` → 6.0.0
- [x] B2 `CHANGELOG.md` 增加 [6.0.0] 条目
- [x] B3 `docs-site/changelog.md`（+zh/ja/ko）增加 v6.0.0 条目

### C. 站点（docs-site + site/）
- [x] C1 `docs-site/engineering-standards.md`（+zh/ja/ko）：公开标准页 + 参考文案
  （四阶段模型、9 本书单与核心价值、免费资源、观点→机制映射）
- [x] C2 `mkdocs.yml` nav 增加 "Engineering Standards" + zh/ja/ko 标签翻译
- [x] C3 `mkdocs build`（.venv-docs）strict 验证通过（social 插件因本机缺 libcairo 用临时配置跳过，CI 不受影响；site/ 未被 git 跟踪，由 CI 构建）

### D. 博客（4 语言，check-site-sync 强制）
- [x] D1 `blog-site/2026-09-v600-engineering-standards.md`（en）+ zh/ja/ko（含 4 语言 index 登记）：
  主题 "AIOS 6.0: from generating code to engineering software"，
  必须传达：AIOS 已具备软件开发能力，比"只会生成代码的传统智能体"更高级
  （标准内建、边界规则、DoD 门、证据链、工具链基线）；附参考文案。

### E. 验证
- [x] E1 `node scripts/check-site-sync.mjs` → OK（含修复 5.20.0 遗留的 3 处 locale drift 链接）
- [x] E2 受影响测试全过：skills-sync、check-site-sync、public-content-contract、release-pipeline、pages-workflow、install-policy、client-list-derivation、native-sync、site-redesign（130+ 例）
- [x] E3 本地 commit（Conventional Commit）

## 消息口径（用户指定）

对外的核心信息：**AIOS 已经不只是"生成代码的智能体"——它把软件工程标准
（Clean Code / SOLID / Clean Architecture / 深层模块 / 测试担保 / 工具链）
做成框架内建的强制基线，生成物从"能跑"进阶到"规范、可维护、有证据"。**
