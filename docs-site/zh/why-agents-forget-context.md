---
title: "为什么你的 AI 编码 Agent 会跨会话失忆（以及怎么修）"
description: "编码 Agent 每次会话都从空窗口开始，所以会忘记昨天的决策。用本地项目记忆（ContextDB）给 Claude Code、Codex、Gemini CLI、OpenCode 补上持久记忆，且不把数据发给服务器。"
date: 2026-08-10
schema_type: techarticle
---

# 为什么你的 AI 编码 Agent 会跨会话失忆（以及怎么修）

> **快速答案：** 编码 Agent 跨会话失忆，是因为每个新会话都从空提示窗口开始——昨天的决策、文件地图、约束都不在对话里。解法是**本地项目记忆**：把决策、checkpoint、可搜索上下文落盘在项目里，让 Agent 在需要时按需拉取。AIOS 用 ContextDB 实现这一点——一个 pull-based 记忆库，对 `codex`、`claude`、`gemini`、`opencode`、`hermes`、`grok` 全部可用，且不把项目数据发给服务器。

## 问题：每个会话都是一个全新的失忆者

在昨天工作过的项目里打开 `codex` 或 `claude`。Agent 不记得：

- 你拍板的架构决策；
- 你强制的命名约定；
- 你正在追的那个失败的测试；
- "永远不要动生成的 dist 目录"这个约束。

它只能重新读文件、重新问你、或者——最糟——做一个与上周决策矛盾的决定。这不是模型质量问题，是**上下文可用性问题**：信息明明在仓库里，但没有任何机制在正确的时间把它带进对话。

## 为什么"把 README 全粘进去"不是解法

朴素的 workaround——把整个项目上下文粘进每条提示——会因为一个简单的原因失败：上下文是预算。一份 1 万行的项目摘要会淹没模型的注意力预算，还烧掉大量 token。你需要的是**选择性召回**：在正确的时刻、从知道项目决策的仓库里，取出正确的那几百个 token。

## 解法：pull-based 本地项目记忆（ContextDB）

AIOS 的 [ContextDB](https://cli.rexai.top/zh/contextdb/) 是项目本地的记忆库，三个部件：

| 部件 | 作用 |
| --- | --- |
| **Memo** | 保存持久决策或约束：`aios memo add "认证测试必须保持严格"`，之后任意会话 `aios memo search "认证"` 都能查到。 |
| **Checkpoint** | 记录会话状态，恢复的 run 从上次停下的地方继续，而不是从零开始。 |
| **可搜索包** | 把相关上下文（文档、计划、决策）打包成有边界、可搜索的单元，Agent 按需拉取。 |

ContextDB 是 **pull-based**：不会注入每条提示。Agent 在任务需要时搜索或召回相关材料——提示预算保持小，记忆跨会话保持持久。

## 两分钟上手

```bash
# 1. 在项目根目录安装并初始化
curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash
source ~/.zshrc
aios init --all

# 2. 验证 ContextDB 与客户端同步
aios doctor --native --verbose

# 3. 开始保存决策
aios memo add "认证测试必须保持严格"
aios memo search "认证"
```

然后在同一项目里打开 `codex`、`claude`、`gemini`、`opencode`、`hermes` 或 `grok`——Agent 会在关键时刻找到记忆。

## 会把代码发到服务器吗？

不会。ContextDB 把所有内容存在项目内的 `.aios/context-db/`。引擎、记忆、token 压缩（RTK / Caveman / Headroom）、浏览器全部本地运行，数据不出机器。细节见[隐私守卫案例](https://cli.rexai.top/zh/case-privacy-guard/)。

## FAQ

**为什么同一个项目里 Agent 还是会忘记？**
因为每个 CLI 会话都从全新的提示窗口开始。会话里没有任何东西关联到昨天的决策——这正是项目记忆要解决的。

**ContextDB 是向量数据库吗？**
不是。ContextDB 存的是结构化、可搜索的项目记忆（memo、checkpoint、包），带显式治理——你决定什么被记住、什么被清理。

**Claude Code 能用吗？**
能。ContextDB 与客户端无关：通过同一个项目标记服务 codex、claude、gemini、opencode、hermes、grok。

## 下一步

读完整的 [ContextDB 文档](https://cli.rexai.top/zh/contextdb/)，或从[快速开始](https://cli.rexai.top/zh/getting-started/)让记忆今天就跑起来。
