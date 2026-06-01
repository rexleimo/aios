---
title: "v1.40：现已支持 6 个 AI 编程客户端"
description: "Harness CLI 从 4 个扩展到 6 个支持的客户端，新增 Antigravity CLI 和 Crush，所有客户端均获得 superpowers 工作流技能。"
date: 2026-05-31
tags: ["release", "multi-client", "antigravity", "crush", "superpowers", "AIOS"]
---

# v1.40：现已支持 6 个 AI 编程客户端

Harness CLI 迎来重大更新。v1.40 新增两个 AI 编程客户端集成 —— **Antigravity CLI** 和 **Crush**，并为**所有支持的客户端带来 superpowers 工作流技能**。

## 更新内容

### Antigravity CLI 支持

Antigravity CLI（Gemini CLI 的继任者）现在是一等公民级别的 Harness CLI 客户端，支持：

- **Skills** — 所有 AIOS 技能通过 `.gemini/skills/`（Antigravity 的原生路径）自动发现
- **原生指令** — `GEMINI.md` 包含 ContextDB、codemap 和 Browser MCP 指引
- **Team 路由** — `/team <任务>` 快捷命令触发多 agent 调度
- **Superpowers** — 头脑风暴、计划、调试、验证工作流

如果你之前使用 Gemini CLI，Antigravity 是直接替代品。相同的 skill 路径，相同的指令格式。

### Crush (charmbracelet) 支持

Crush 是 charmbracelet 团队推出的新型终端 AI 编程客户端。Harness CLI 现已支持：

- **Agent 生成器** — Crush 专属的 agent 定义，位于 `.crush/agents/`
- **模型参数** — `--model` 参数透传，支持模型选择
- **YOLO 模式** — `--yolo` 实现完全无人值守执行（无需确认提示）
- **Team 能力** — 完整的 team 调度支持

Crush 非常适合无头/CI 环境，在不需要交互提示的情况下进行 AI 编程。

### Superpowers 全面覆盖

在 v1.40 之前，superpowers 工作流技能（头脑风暴、计划、调试、TDD、验证）仅适用于 Codex 和 Claude。现在**所有 6 个客户端**都能使用 superpowers：

| 客户端 | Skills | Superpowers | Team | Agents |
|--------|--------|-------------|------|--------|
| Claude | ✅ | ✅ | ✅ | ✅ |
| Codex | ✅ | ✅ | ✅ | ✅ |
| Gemini | ✅ | ✅ | ✅ | ❌ |
| Antigravity | ✅ | ✅ | ✅ | ❌ |
| OpenCode | ✅ | ✅ | ✅ | ✅ |
| Crush | ✅ | ✅ | ✅ | ✅ |

*注意：Gemini 和 Antigravity 不支持 `agents` 能力，因为它们没有原生的 agent 文件约定。这是有意为之 —— 向无法执行的客户端发送 `agent-routing.md` 指令会产生误导。*

### 其他变更

- **移除 XHS 专属技能** — 核心 AIOS 技能现在适用于所有客户端，不再局限于小红书场景
- **OpenCode 团队支持** — OpenCode 现已获得 team/model-router/harness 指令注入
- **技能同步** — `sync-skills.mjs` 更新以支持全部 6 个客户端

## 升级方式

```bash
# macOS / Linux
curl -fsSL https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.sh | bash

# Windows PowerShell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.ps1 | iex
```

或在原地更新：`aios` → `Update` → `Doctor`。

## 后续计划

- 如果 Gemini/Antigravity 添加原生 agent 文件约定，将扩展 agent 支持
- 跨客户端 agent 迁移（在客户端之间移动 agent 定义）
- 按客户端类型的增强模型路由

完整变更日志请查看 [CHANGELOG](https://github.com/rexleimo/harness-cli/blob/main/CHANGELOG.md)。
