---
title: "Grok Build 正式成为 AIOS 一等公民客户端"
description: "AIOS 现已将 xAI Grok Build 注册为一等公民 AIOS 客户端：skills、agents、native 同步、Codex 形态 TOML MCP、team/harness，runtime id 为 grok-build。"
date: 2026-07-09
tags: ["Grok Build", "AIOS", "MCP", "客户端", "Skills", "xAI"]
---

# Grok Build 正式成为 AIOS 一等公民客户端

xAI **Grok Build**（`grok` CLI）现已与 Codex CLI、Claude Code、Gemini CLI、OpenCode、Hermes Agent 并列，成为 AIOS 的一等公民 AIOS 客户端。

这不是配置文件里的一行提及。Grok Build 接入了驱动 native sync、skills 安装、codemap MCP 注入、`ctx-agent` 交互/one-shot，以及 solo harness / team provider 的同一套 client registry。

## 为什么需要一等公民支持

Grok Build 本身已具备强 TUI 编码能力：项目规则（`AGENTS.md`）、skills（`.grok/skills` 与 `.agents/skills`）、MCP（`~/.grok/config.toml`）、subagents、headless `-p`，以及 `--always-approve` 无人值守模式。

仓库侧此前缺少系统性 AIOS 集成：

1. **客户端身份** — 无 `CLIENT_DEFINITIONS` 条目，skills/native/harness 无法解析 `grok` / `grok-build`
2. **Native 投影** — 从未在 `.grok/` 下写出 AIOS managed blocks 与 skill 根
3. **编排** — team / harness / `ctx-agent --agent` 没有可用的 Grok 调用形状
4. **文档** — 官方站、changelog、blog 仍只列旧客户端集合

## 注册信息

| 字段 | 值 | 说明 |
|------|-----|------|
| clientId | `grok` | `--client` / `--provider` 短名 |
| commandName | `grok` | PATH 二进制 |
| runtimeClientId | `grok-build` | `--agent` 与 ContextDB runtime id |
| capabilities | skills, agents, superpowers, native, team, harness | 完整一等能力集 |
| projectSkillRoot | `.grok/skills` | markdown-directory skills |
| agentTargetRoot | `.grok/agents` | 项目 agent 定义 |
| instructionFileName | `AGENTS.md` | 与 Codex / OpenCode / Hermes 共用 |
| unattendedArgs | `--always-approve` | 无人值守 / harness |

### MCP（Codex 形态 TOML）

| 作用域 | 文件 |
|--------|------|
| Home | `~/.grok/config.toml`（可用 `GROK_HOME` 覆盖） |
| Project | `.grok/config.toml` |

## 如何启用

```bash
# 安装 Grok Build
curl -fsSL https://x.ai/cli/install.sh | bash

# 初始化 AIOS
node scripts/aios.mjs init --agent grok

# 交互 / one-shot / harness
node scripts/ctx-agent.mjs --agent grok-build --workspace .
node scripts/aios.mjs harness run --objective "长任务" --provider grok --worktree
```

## 设计取舍

- MCP 对齐 Codex 的 TOML `mcp_servers`，复用现有注入逻辑
- 指令文件共用 `AGENTS.md`，避免多文件漂移
- runtime id 使用产品名 `grok-build`
- 无人值守以当前 CLI 的 `--always-approve` 为准

## 相关链接

- [Changelog v3.4.0](https://cli.rexai.top/zh/changelog/)
- [Quick Start](https://cli.rexai.top/zh/getting-started/)
- [Hermes 客户端博文](/blog/zh/2026-06-hermes-agent-aios-client/)
