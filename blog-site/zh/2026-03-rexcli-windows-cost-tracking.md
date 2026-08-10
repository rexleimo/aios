---
title: "RexCli 最新更新：Windows 原生支持 + 实时成本追踪"
description: "RexCli 带来重大更新：完整的 Windows 工作流支持、实时 API 成本追踪、OpenCode Agent 集成，让 AI 开发更高效、更透明"
date: 2026-03-16
tags: [RexCli, Windows, Cost Tracking, OpenCode, AI Development]
---

# RexCli 最新更新：Windows 原生支持 + 实时成本追踪

我们很高兴地宣布 RexCli 的几项重大更新，这些功能让 AI 辅助开发变得更加高效和透明。

## Windows 原生工作流支持

RexCli 现在完全支持 Windows 环境！我们解决了路径处理、命令行参数分割等 Windows 特有的问题，让 Windows 开发者也能享受流畅的 AI 辅助开发体验。

**关键改进：**
- 原生 Windows 路径处理（`C:\Users\...` 格式）
- 修复 cmd 环境下的 CLI 启动问题
- 避免 Windows Codex 参数分割错误
- 非 git 工作区的优雅降级支持

相关文档：[Windows 使用指南](/zh/windows-guide/)

## 实时成本追踪（Cost Telemetry）

新增的成本遥测功能让你实时了解 API 调用的成本。在执行长时间运行的任务时，RexCli 会自动追踪并显示：

- 实时 token 使用量
- API 调用成本统计
- 任务执行预算控制
- 成本超限预警

这对于需要控制 AI 使用成本的团队来说是一个重要功能。你可以在 `aios orchestrate` 命令中看到实时的成本数据。

## OpenCode Agent 支持

RexCli 现在集成了 OpenCode Agent 支持，让你可以：

- 使用 OpenCode 生态的 agent 能力
- 更灵活的 agent 编排和调度

## 相关链接

- Docs: `/getting-started/`
- Repo: <https://github.com/rexleimo/aios>
