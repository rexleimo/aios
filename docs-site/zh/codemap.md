---
title: 代码审查图谱 (Codemap)
description: 一个基于 Tree-sitter 的结构化知识图谱，让编程 agent 在每一步决策时都能看到调用者、依赖关系、测试覆盖和影响半径。
---

# 代码审查图谱 (Codemap)

> **快速答案：** Codemap 在本地建立仓库结构图，让 Agent 在修改前查询调用者、依赖、导入关系、受影响流程和测试覆盖。它适合架构、影响半径和最终审查节点，但不能替代测试。

## Codemap 首先回答什么？

一次变更前，图谱应帮助回答三个问题：会影响什么、哪些流程依赖它、目标已有哪类测试覆盖？如果图谱服务不可用，要明确使用定向仓库搜索作为回退，并把这一点写入验证证据。

**一句话：** Codemap 为你的代码库构建 Tree-sitter 知识图谱，作为 MCP 工具注入到所有编码 agent 中。agent 不再盲目 grep 文件，而是做有依据的决策——知道谁调用了什么，什么测试覆盖了什么，改了什么会影响什么。

无需外部服务，无需云端。就是 `.code-review-graph/` 里的一个本地 SQLite 图。

## 为什么需要 Codemap？

没有 Codemap 时，agent 这样探索代码：

```
Agent 读 README → grep "auth" → 盲读 3 个文件 → 猜测影响 → 改代码 → 再读更多文件验证 → 可能漏掉调用者 → 返工
```

有 Codemap 后：

```
Agent 查图谱 → 知道调用者/依赖/测试 → 计算影响半径 → 有依据地修改 → 查图验证 → 自信提交
```

**实测 token 缩减：** 在真实仓库中达到 4.9x–27.3x，平均 8.2x。更重要的是，它改变了 agent 决策的*质量*。

## 一行命令安装

```bash
aios internal codemap install
```

就这一条命令，会：

1. 检查 `uv` 是否可用（CRG 通过 `uvx` 运行，零全局安装）
2. 构建初始图谱（大部分项目 5-15 秒）
3. 将 CRG MCP 服务注入所有检测到的客户端（opencode / codex / claude / gemini）
4. 安装 opencode 自动更新插件（如检测到 opencode）
5. 更新 `AGENTS.md` 添加图谱优先的决策指引

```bash
# 健康检查
aios internal codemap doctor

# 自动修复
aios internal codemap doctor --fix

# 从零重建图谱
aios internal codemap build

# 增量更新（只解析变动文件，<2秒）
aios internal codemap update

# 查看图谱统计
aios internal codemap status

# 干净卸载（保留 .code-review-graph/）
aios internal codemap uninstall
```

## Agent 如何使用

安装后，每次 agent 会话都会加载 AGENTS.md 中的决策检查点：

### 决策检查点（必须执行）

| 时机 | 调用 | 原因 |
|------|------|------|
| 做任何事之前 | `get_minimal_context(task="...")` | 了解项目上下文 + 下一步建议 |
| 修改代码之前 | `get_impact_radius(detail_level="minimal")` | 检查影响半径；高风险则重新评估方案 |
| 修改代码之前 | `query_graph(pattern="tests_for", target="...")` | 确认有测试覆盖；没有则先写测试 |
| 修改代码之后 | `detect_changes(detail_level="minimal")` | 验证实际影响是否符合预期 |
| 提交之前 | `get_affected_flows()` + `get_suggested_questions()` | 最终安全检查 |

### 搜索规则

- 找代码：`semantic_search_nodes` 优先于 grep
- 理清关系：`query_graph`（callers_of/callees_of/tests_for）优先于读文件
- 代码审查：`detect_changes` → `get_review_context` 优先于通读文件

始终从 `detail_level="minimal"` 开始；仅在不够时升级到 "standard"。

## 核心工具

Codemap 提供 28 个 MCP 工具 + 5 个提示词。以下是最常用的：

| 工具 | 功能 | 使用场景 |
|------|------|---------|
| `get_minimal_context` | 返回项目结构、风险等级、相关模块、下一步建议 | 每次会话开始 |
| `get_impact_radius` | 展示变更影响的所有对象 | 写代码之前 |
| `detect_changes` | 风险评分的变更分析 | 修改代码之后 |
| `query_graph` | 追踪任意符号的调用者、被调者、导入、测试 | 理解代码关系 |
| `semantic_search_nodes` | 按名称或语义搜索函数/类 | 定位代码（替代 grep） |
| `get_review_context` | 代码审查用的聚焦源码片段 | 提交前审查 |
| `get_affected_flows` | 哪些执行路径受影响 | 影响分析 |

### `query_graph` 模式

| 模式 | 返回 |
|------|------|
| `callers_of` | 调用目标函数的所有函数 |
| `callees_of` | 目标函数调用的所有函数 |
| `imports_of` | 文件/模块的导入 |
| `importers_of` | 导入了某文件/模块的所有文件 |
| `tests_for` | 覆盖目标的测试 |
| `inheritors_of` | 继承目标类的所有类 |

## 深度集成

Codemap 不是独立工具——它已融入 AIOS 工作流：

- **Doctor 套件：** `doctor:codemap` 关卡在每次 `aios doctor` 中检查图谱健康、MCP 配置和状态文件
- **Harness：** 独立 harness 在工作树中自动构建图谱（当 Codemap 处于激活状态时）
- **Agent Team：** 团队调度中包含 CRG `detect-changes` 分析，每个 worker 都了解变更影响
- **技能：** search-first、debug-hub、requesting-code-review 技能优先使用 CRG 工具而不是 grep/glob

## 架构

```
aios internal codemap install
  ├─ 检查 uv/uvx 可用性
  ├─ 运行 uvx code-review-graph build       → .code-review-graph/ (SQLite)
  ├─ 注入 MCP 配置到所有客户端               → .mcp.json / ~/.claude.json / 等
  ├─ 安装 opencode 自动更新插件              → ~/.config/opencode/plugins/crg-plugin.ts
  ├─ 写入状态文件                            → .aios/codemap.json
  ├─ 更新 AGENTS.md 决策指引
  └─ 同步 aios-codemap-ops 技能到客户端目录
```

所有图谱数据保留在本地。CRG 通过 stdio MCP 运行——无 HTTP 服务器，无外部网络调用（除了首次安装时 `uvx` 的一次性包解析）。

## 卸载

```bash
aios internal codemap uninstall
```

移除 MCP 配置条目、状态文件和 AGENTS.md 段落。保留 `.code-review-graph/`——你的图谱数据永不删除。

预览模式：

```bash
aios internal codemap uninstall --dry-run
```

## 常见问题

### Codemap 会把仓库代码发送到外部服务吗？

不会。图谱数据和 stdio MCP 运行时保留在本地；首次安装时的包解析是独立的安装依赖。

### 图谱结果能证明修改一定安全吗？

不能。它负责缩小影响范围；测试、构建和人工审查仍然是完成证据。

## 官方文档

继续阅读[架构](architecture.md)、[工作流策略](workflow-policy.md)和[故障排查](troubleshooting.md)。
