---
title: "v5.4.3：CRG 决策检查点、Worker Journal 改名与幂等的 aios init"
description: "v5.4.3 把 code-review-graph 决策检查点接入工作流层——agent 在改文件前先看爆炸半径；solo harness 日志目录更名为 worker-journal（旧目录自动迁移）；aios init 新增 --yes/--retry/--force 实现幂等安装。"
date: 2026-08-06
tags: ["Harness CLI", "CRG", "code-review-graph", "工作流", "aios init", "发布"]
---

# v5.4.3：CRG 决策检查点、Worker Journal 改名与幂等的 `aios init`

> **快速回答：** v5.4.3 是一个小版本，让工作流层在结构上更安全。`aios-workflow-router` 与 `rex-workflow` 现在会执行 code-review-graph（CRG）决策检查点——改文件前先看影响半径、动代码前确认测试存在、每个阶段结束后验证实际变更——并在未安装 CRG 时优雅降级为 `rg` + 读文件。solo harness 日志目录从 `solo-harness` 更名为 `worker-journal`（旧目录自动迁移），`aios init` 新增 `--yes` / `--retry` / `--force` 实现幂等安装。

## 为什么需要决策检查点

不看依赖关系就动手改代码的 agent，是静默回归的头号来源。以前的流程只告诉 agent *做什么*——计划、实现、验证——却没告诉它动手前 *怎么看*。v5.4.3 通过接入四个 CRG 检查点修复了这一点：

1. **动手前** —— `get_minimal_context` 用约 100 token 给 agent 项目上下文和建议的下一步。
2. **改文件前** —— `get_impact_radius` 检查即将改动文件的爆炸半径；`query_graph(tests_for)` 确认测试存在（没有就先写测试）。
3. **查代码时** —— `semantic_search_nodes` / `query_graph` 取代盲目的 grep + 读文件，既快又省 token。
4. **每阶段结束后** —— `detect_changes` 验证实际影响与预期一致，而不是相信自述。

如果项目里没有 CRG，流程会记录这一事实并降级为 `rg` + 读文件——绝不阻塞工作流，也不伪造图谱证据。

## Worker Journal 改名

solo harness 日志目录从 `solo-harness` 更名为 `worker-journal`，与已有的模块命名（`solo-journal`）对齐。会话产物位于 `artifacts/worker-journal/`。已有的 `solo-harness` 目录在首次读取时自动迁移——无需手动操作、无数据丢失——solo worktree 临时前缀也跟随新名。

## 幂等的 `aios init`

`aios init` 现在支持：

- `--yes` —— 跳过交互确认（CI / 无人值守安装）。
- `--retry` —— 从尚未安装的组件处恢复。
- `--force` —— 即使已安装也全部重装。

这些选项由新的 `install-state` 模块支撑，跟踪各组件的安装状态，中断的安装可以恢复而不是从头再来。

## 你应该做什么

- 已安装用户：直接 `aios update`，无需其他操作。改名迁移是自动的。
- 在脚本或 CI 里跑 `aios init`：用 `--yes` 跳过交互提示。

## FAQ

### 这个版本改了 CRG 工具本身吗？

没有。code-review-graph MCP 服务完全不变；v5.4.3 改的是工作流层何时、如何调用它。不装 CRG 一切照旧。

### 我现有的 `solo-harness` 会话数据会丢吗？

不会。迁移在首次读取时改名并保留所有文件，旧名只作为遗留查找使用。

### 在哪里看细节？

[更新日志](https://cli.rexai.top/changelog/) 记录了 v5.4.3 的全部语言版本。

小版本把「想改什么」和「验证改了什么」之间的回路收紧，长期运行的 agent 工作会因此可靠得多。
