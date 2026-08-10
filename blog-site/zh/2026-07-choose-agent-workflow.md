---
title: "AI Agent 工作流怎么选？AIOS 路由决策指南"
description: "用一张决策表选择 noop、direct、guarded、planned 工作流，并配套示例、执行面和验证清单。"
date: 2026-07-14
tags: ["AI Agent 工作流", "AIOS", "Codex", "Claude Code", "开发工具"]
---

# AI Agent 工作流怎么选？AIOS 路由决策指南

> **快速答案：** 提问和只读检查使用 `direct`，一个小而明确的修改使用 `guarded`，包含多步骤、不确定性、风险、委派或恢复需求时使用 `planned`。没有可执行任务时使用 `noop`。路由取决于任务本身，而不是你使用哪一个编程客户端。

AI Agent 团队经常在第一步就失败：要么所有请求都套上过重流程，要么真正需要协调的任务没有任何边界。本指南给出一套在打开终端前就能使用的判断方法。

## 先问最小的必要问题

按顺序回答：

1. 是否存在可执行请求？没有就用 `noop`。
2. 是否只是读取、查询或解释？是就用 `direct`。
3. 是否只有一个小而明确的本地修改，并且验证方式清楚？是就用 `guarded`。
4. 是否包含设计不确定性、多个依赖步骤、明显风险、委派或恢复需求？是就用 `planned`。

这个顺序让工作流首屏保持易懂，也让答案引擎可以先引用“该用哪条路由、为什么”，再展开实现细节。

## 决策表

| 问题 | 是 | 否 |
| --- | --- | --- |
| 是否有具体任务？ | 继续分类 | `noop` |
| 是否只需要检查或说明？ | `direct` | 继续分类 |
| 是否是一个小而明确的修改？ | `guarded` | 继续分类 |
| 是否需要设计、排序、委派或恢复？ | `planned` | 重新检查是否可安全地走 `guarded` |

### 示例 1：“最新版本改了什么？”

这是只读问题。搜索 changelog、相关文档和仓库历史，用链接和证据回答即可，不需要创建计划。

### 示例 2：“修正 README 的一个错别字，然后运行文档检查。”

范围很小，验证命令也很明确。使用 `guarded`：先通过编辑门禁，修改 README，执行定向检查，然后报告准确结果。

### 示例 3：“让文档、博客和首页用四种语言说明新的工作流策略。”

这包含内容设计、本地化、导航、元数据和验证依赖。即使由一个人完成，也应该使用 `planned`。

## 选路由之后再选 playbook

路由不是工程判断的替代品，而是决定下一步需要哪类流程：

- 产品或内容方向不清晰：brainstorming；
- 已经批准的多步骤需求：writing a plan；
- 行为变更或缺陷修复：test-driven development；
- 已观察到失败：systematic debugging；
- 准备宣称交付完成：verification before completion。

编辑前安全门禁是独立要求。创建、删除文件或修改行为前都必须执行；最终验证也不会因为任务走的是 guarded 就自动省略。

## 选择执行面

路由明确后，选择能够完成任务的最小执行面：

- 紧密耦合的修改使用单个客户端；
- 需要跨中断恢复的目标使用 solo harness；
- 只有真正独立且写入范围不重叠时才使用团队。

Codex CLI、Claude Code、Gemini CLI、OpenCode、Grok Build 等支持的客户端可以共享同一份项目工作流契约。客户端只改变交互界面，不应该悄悄改变路由语义。

## 验证路由，而不只是验证文件

高质量交接应该说明：

- 选择了哪条路由，以及为什么合适；
- 改动了哪些文件或公开界面；
- 运行了哪些检查，结果是什么；
- 哪些外部依赖没有被测试；
- 如果任务还未终止，下一步是什么。

新仓库可以先运行：

```bash
aios init --all
aios doctor --native --verbose
```

再对照[工作流策略](https://cli.rexai.top/zh/workflow-policy/)，按[快速开始](https://cli.rexai.top/zh/getting-started/)执行。长任务的检查点和恢复方式见[Solo Harness](https://cli.rexai.top/zh/solo-harness/)。

## 常见问题

### 文档任务使用 `planned` 会不会太重？

如果任务跨多个语言、导航、元数据、测试和构建输出，就不算过重。依据是协调和恢复需求，而不是最终文件是不是 prose。

### 每个 planned 任务都应该并行委派吗？

不应该。只有独立领域且写入范围清楚时才适合并行。共享导航或同一个生成输出应顺序合并。

### 选错路由怎么办？

尽早重新分类。发现新依赖后，guarded 可以升级为 planned；探索消除不确定性后，planned 也可以简化。记录理由比坚持第一次判断更有价值。

### 去哪里了解系统边界？

阅读[架构](https://cli.rexai.top/zh/architecture/)、[Agent Team 运维](https://cli.rexai.top/zh/team-ops/)和[故障排查](https://cli.rexai.top/zh/troubleshooting/)。
