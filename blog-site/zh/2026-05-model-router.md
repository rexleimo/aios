---
title: "Model Router：别再猜该用哪个 AI 模型了"
description: "一个调度层，能读懂你的任务描述并自动选择最合适的 AI 模型。再也不用死记硬背模型特长。"
date: 2026-05-08
tags: ["model-router", "多模型", "Agent Team", "AIOS"]
---

# Model Router：别再猜该用哪个 AI 模型了

你一定有过这种感觉：手头有个任务，但不确定该用哪个 AI 模型。Claude Opus？DeepSeek？GPT-5.5？每个模型各有所长，选错了浪费时间和钱。

**如果路由能自动完成呢？**

Model Router 读取你的任务描述，检测工作类型，然后把它派发给最擅长这类工作的模型。

## 解决什么问题

没有 Model Router 时，路由是这样的：

| 你说 | 用哪个模型？ | 为什么纠结 |
|---|---|---|
| "搭一个落地页" | ??? | 这是前端？UI？设计？ |
| "审查这段代码的安全性" | ??? | Claude Opus？GPT-5.5？ |
| "修复线上故障" | ??? | 这是运维，不是写代码 |
| "实现一个登录接口" | ??? | 应该用 DeepSeek，但也不一定？ |

你得记住每个模型的特长，还要手动切换 CLI。有了 Model Router，你只需要描述任务：

```bash
node scripts/aios.mjs model-router route \
  --task "搭建一个漂亮的落地页组件" \
  --explain
```

结果：`frontend → kimi-k2.6`（因为"落地页"、"组件"、"漂亮"暗示了前端工作）。

## 它怎么知道该选什么

Model Router 在你的任务描述中寻找**信号**——那些暗示你正在做什么类型工作的关键词：

| 你提到 | 检测为 | 路由到 | 原因 |
|---|---|---|---|
| "browser"、"upload"、"screenshot" | 浏览器自动化 | GPT-5.5 | 工具调用推理最强 |
| "security"、"vulnerability"、"auth" | 安全审查 | Claude Opus | 审查能力最强 |
| "frontend"、"UI"、"component" | 前端工作 | Kimi K2.6 | UI 任务最擅长 |
| "production"、"incident"、"logs" | 自愈运维 | MiniMax-M2.7 | 专为运维恢复设计 |
| "long document"、"research" | 研究 | Gemini-3-Pro | 100 万 token 上下文窗口 |
| "implement"、常规编码 | 代码实现 | DeepSeek-V4 | 便宜又快 |

在任何路由命令后加 `--explain`，就能看到匹配了哪些信号以及为什么。

## 前后对比

以下是 Balanced v2 路由器带来的变化：

| 任务 | 之前（旧路由器） | 之后（Balanced v2） |
|---|---|---|
| "打开小红书上传图片" | implementation → DeepSeek | browser-automation → GPT-5.5 |
| "搭建一个漂亮的落地页" | implementation → DeepSeek | frontend → Kimi K2.6 |
| "修复线上登录故障" | research → Gemini | self-healing → MiniMax-M2.7 |
| "实现一个新的登录接口" | implementation → DeepSeek | implementation → DeepSeek（正确！） |

核心思路：**普通实现任务保持低成本**（DeepSeek），但明显需要专业模型的任务会自动升级。

## 路由配置

三种模式控制路由的激进程度：

| 配置 | 什么时候用 | 效果 |
|---|---|---|
| `balanced`（默认） | 大部分工作 | 强信号才升级；普通编码保持低成本 |
| `premium` | 高风险或不确定的任务 | 更愿意使用昂贵模型 |
| `budget` | 成本敏感的工作 | 倾向便宜模型，除非任务确实需要强力模型 |

```bash
# 单条命令指定
node scripts/aios.mjs model-router route --task "..." --profile premium --explain

# 或者为整个会话设置
export AIOS_MODEL_ROUTER_PROFILE=premium
```

## 试试看

```bash
# 查看所有可用模型
node scripts/aios.mjs model-router list

# 路由一个任务并查看原因
node scripts/aios.mjs model-router route \
  --task "你的任务描述" \
  --profile balanced \
  --explain

# 查看最近的路由记录
node scripts/aios.mjs model-router stats
```

## 与 Agent Team 配合

Model Router 已内置到 Agent Team——团队运行的每个阶段会自动路由到最优模型。不需要任何配置。

---

*Model Router 是 [RexCLI](https://cli.rexai.top) 的一部分。查看[完整文档](https://cli.rexai.top/zh/model-router/)了解所有模型、规则和配置选项。*
