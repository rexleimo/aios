---
title: "Codemap：给你的 AI Agent 一张代码地图"
description: "一行命令将 Tree-sitter 知识图谱注入所有编程 agent — opencode、codex、claude、gemini。Agent 不再盲目 grep，而是基于真实代码结构做决策：调用者、依赖、测试覆盖和影响半径。"
date: 2026-05-21
tags: ["codemap", "code-review-graph", "CRG", "知识图谱", "AIOS"]
---

# Codemap：给你的 AI Agent 一张代码地图

AI 编程 agent 写代码很棒。但它们在理解代码*连接关系*方面很差。它们 grep 文件名，读几个文件，然后猜测变更的影响。你付的 token 有一半花在了盲目探索上。

**Codemap 改变了这一点。** 它为你的整个代码库构建一个 Tree-sitter 知识图谱——每个函数、每个 import、每个调用关系——并通过 MCP 工具提供给所有 agent。一行命令，覆盖所有客户端。

## 问题：Agent 是盲人

当 agent 接到"修复 auth 超时 bug"这样的任务时，没有 Codemap 的情况如下：

```
Agent 读 README
  → grep "auth" → 18 个文件中 47 处匹配
  → 读 5 个文件（可能是错的）
  → 猜测要改哪个函数
  → 写代码
  → 再读更多文件来验证（仍然是猜）
  → 提交——祈祷不会坏掉
```

每次"读文件"都消耗 token。每次"猜测影响"都增加风险。这就是 agent 有时候会弄坏它们不知道存在的东西的原因。

## 解决方案：代码的知识图谱

安装 Codemap 后，同样的任务变成：

```
Agent 调用 get_minimal_context(task="修复 auth 超时 bug")
  → 项目结构、风险评估、相关模块——瞬间返回
Agent 调用 query_graph(pattern="callers_of", target="authenticate")
  → 12 个调用者——不能直接改签名，需要包装层
Agent 调用 get_impact_radius()
  → 影响 3 个文件，2 个测试覆盖——可控
Agent 修改代码
Agent 调用 detect_changes()
  → 确认实际影响符合预期——没有遗漏
Agent 自信提交
```

**不再盲目探索。不再猜测。每个决策都有结构支撑。**

## 一行命令，所有客户端

```bash
aios internal codemap install
```

这一条命令：

1. 检查前置条件（`uv`/`uvx`）
2. 构建初始图谱（5-15 秒）
3. 注入 CRG MCP 配置到 opencode、codex、claude、gemini
4. 安装 opencode 自动更新插件
5. 更新 AGENTS.md 添加决策指引

仅此而已。从此每个 agent 会话都获得图谱优先的代码探索能力。

```bash
# 健康检查
aios internal codemap doctor

# 从零重建
aios internal codemap build

# 快速增量更新（<2 秒）
aios internal codemap update

# 查看图谱内容
aios internal codemap status
```

## Agent 能看到什么

Codemap 提供 28 个 MCP 工具。最重要的如下：

| 工具 | 替代什么 |
|------|---------|
| `semantic_search_nodes` | grep — 按名称*和语义*找代码 |
| `query_graph` | 逐文件阅读来理解调用链 |
| `get_impact_radius` | 猜测什么会坏掉 |
| `detect_changes` | 手动 diff 审查 |
| `get_affected_flows` | 猜测哪些功能受影响 |
| `get_minimal_context` | 读 README + ls + 探索 |

## 实际效果

在真实仓库中，Codemap 相比基于 grep 的探索实现了 4.9x 到 27.3x 的 token 缩减，平均 8.2x。但真正的价值不只是成本——而是 agent 行为的改变。

没有 Codemap 时，agent 的 60-80% token 花在*理解*代码库上。有 Codemap 后，这个比例急剧下降。agent 的 token 花在*做实际工作*上——这才是你付费的目的。

## 深度集成

Codemap 不是独立插件。它融入每个 AIOS 工作流：

- **`aios doctor`** 在全局健康检查中检测 Codemap 状态
- **Solo Harness** 在过夜任务的工作树中自动构建图谱
- **Agent Team** 调度包含变更影响分析，每个 worker 都知道影响半径
- **技能**（search-first、debug-hub、code-review）优先使用 CRG 工具而非 grep

## 试试看

```bash
# 安装（一行命令）
aios internal codemap install

# 验证
aios internal codemap doctor

# 让你的 agent 带着地图而不是手电筒探索代码
```

[完整文档 →](/zh/codemap/){ .md-button }
