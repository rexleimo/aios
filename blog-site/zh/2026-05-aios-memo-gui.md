---
title: "aios memo GUI：把 Agent 的记忆变成一张活的图谱"
description: "ContextDB 可视化界面来了 — 用交互式节点图探索会话、检查点和记忆关系。"
date: 2026-05-15
tags: ["aios memo", "ContextDB", "GUI", "可视化", "记忆图谱", "AIOS"]
image: "assets/aios-memo-gui-screenshot.png"
---

# aios memo GUI：把 Agent 的记忆变成一张活的图谱

你的编码 Agent 已经连续工作好几周了。它写了代码、修了 bug、做了决策。但这些历史到底长什么样？

**现在你可以看见了。**

aios memo GUI 是 ContextDB 的可视化界面 — 它把 Agent 的会话历史变成一个交互式节点图，让你探索什么时候发生了什么，以及它们之间如何关联。

<figure>
  <img src="assets/aios-memo-gui-screenshot.png" alt="aios memo GUI 以交互式节点图展示 ContextDB，右侧有会话详情面板">
  <figcaption>aios memo GUI：你的项目记忆，可视化呈现。</figcaption>
</figure>

## 你在看什么

上面的截图展示了 aios memo GUI 中的 **ContextDB 视图**。每个部分代表什么：

**图谱（左侧）：**
- 每个**节点**是项目记忆的一部分 — 一个会话、一个检查点、一个文件引用
- **节点之间的连线**展示关系："这个检查点来自那个会话"，"这个文件在那个事件中被引用"
- **紫色节点**是你项目中实际文件的引用

**详情面板（右侧）：**
- 点击任意节点查看完整详情
- 展示指标如信任分数和风险等级
- 列出父会话和证据引用
- 显示源文件路径

**顶栏：**
- 快速统计：有多少节点、会话、检查点和风险
- 筛选标签：全部、会话、检查点、事件、风险
- 搜索：按名称查找特定节点

## 为什么这很重要

在有 GUI 之前，理解 Agent 的历史意味着：

- 在 `memory/context-db/sessions/` 目录里翻文件
- 运行 CLI 命令然后读 JSON 输出
- 在脑子里把会话、检查点、事件串联起来

**现在你只需看一眼就行。**

想知道 Agent 上周二在干什么？点击会话节点。想看某个检查点期间碰了哪些文件？顺着连线走。想找被标记的风险？切换到"风险"标签。

## 快速上手

aios memo GUI 直接读取你现有的 ContextDB 数据。如果你已经在项目中设置了 Harness CLI 并启用了 `.contextdb-enable`，你的数据已经就绪。

1. 打开 GUI，指向你的项目
2. 点击 **Load** 导入 ContextDB 数据
3. 探索图谱 — 点击节点、追踪连线、使用搜索

图谱加载项目的全部记忆：会话、检查点、事件、文件引用、风险标记和交接记录。ContextDB 记录的一切，现在一目了然。

## 你能做什么

### 跨会话追踪 bug

点击风险节点，顺着连线回到首次检测到该风险的会话和检查点。看清楚 Agent 当时在做什么，问题是怎么出现的。

### 理解记忆血脉

看会话如何连接：哪个检查点生成了下一个会话，哪些文件在多个会话中被引用，上下文如何在 Agent 之间交接。

### 审计 Agent 行为

每个节点上的信任分数和风险等级给你快速的健康检查。按"风险"筛选只看被标记的条目，然后逐个排查。

### 搜索特定事件

用搜索栏按文件名、会话 ID 或任何文本内容查找节点。不用再 grep JSONL 文件了。

## 更大的图景

aios memo GUI 是 **ContextDB** 生态系统的一部分 — 这个记忆系统让你的编码 Agent 跨会话记忆。ContextDB 在后台自动运行（记录事件、创建检查点、构建上下文包），GUI 则给你一个人类可读的视图。

它不只是好看 — 它很实用。当你调试一个偏离轨道的 Agent、试图理解决策原因、或审计夜间 harness 运行的结果时，可视化图谱比任何日志文件都能更快地讲述故事。

## 试试看

如果你已经在使用 Harness CLI 并启用了 ContextDB，你的数据已经准备好了。打开 aios memo GUI 开始探索。

刚接触 Harness CLI？从 [快速上手指南](https://cli.rexai.top/zh/getting-started/) 开始，在项目中启用 ContextDB，然后回来看看你的 Agent 记忆长什么样。

---

*aios memo GUI 是 [Harness CLI](https://cli.rexai.top) 生态的一部分。[开始使用](https://cli.rexai.top/zh/getting-started/)或[阅读 ContextDB 文档](https://cli.rexai.top/zh/contextdb/)，了解更多关于 Agent 记忆的内容。*
