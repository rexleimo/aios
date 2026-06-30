---
title: "Hermes Agent 正式成为 AIOS 一等公民客户端"
description: "Harness CLI 现在把 Hermes Agent (Nous Research) 注册为一等公民 AIOS 客户端，并通过 MCP 桥接服务器暴露 5 个核心工具，让 Hermes 用户直接享受 AIOS 的上下文记忆、Doctor 健康检查、Token 压缩、Skill 验证和 Skill 安装能力。"
date: 2026-06-30
tags: ["Hermes Agent", "AIOS", "MCP", "客户端", "Skills", "Token Compression"]
---

# Hermes Agent 正式成为 AIOS 一等公民客户端

Hermes Agent（Nous Research 开源的 CLI AI Agent）现在和 Codex CLI、Claude Code、Gemini CLI、OpenCode、Crush 并列——成为 Harness CLI (AIOS) 的第七个一等公民客户端。

这不是简单地在配置文件里加一行。这次集成的核心是 **MCP 桥接服务器**——把 AIOS 最有价值的 5 个能力直接暴露为 Hermes 可以调用的 MCP 工具。

## 为什么 Hermes Agent 需要这个

Hermes Agent 已经有 `session_search`、`memory`、`delegate_task`、`skill_manage`、`cronjob` 这些内置工具。但跟其他 AIOS 客户端一样，它在三个方向上缺少系统性支持：

1. **策略化上下文召回** — Hermes 可以搜索历史会话，但没有按 token budget 做优先级裁剪的能力。长会话中上下文窗口会被大量历史淹没。
2. **环境健康自检** — MCP 配置错了、Node 版本不对、skill 目录残缺……这些小问题会默默拖垮整个工作流，但 Hermes 没有自动检测和修复手段。
3. **大型输出压缩** — 浏览器截图、长 shell 输出、HTML dumps 这些东西直接进 context window 很浪费，但 Hermes 没有中间拦截层。

AIOS 的 MCP 桥接直接补上了这三块。

## 5 个 MCP 工具详解

`scripts/aios-mcp-server.mjs` 是新增的 MCP 桥接服务器，暴露 5 个工具：

### aios_context_pack

按 token budget 策略化压缩上下文。支持三种策略：

| 策略 | 行为 | 适用场景 |
|------|------|----------|
| `legacy` | 尾部截断 | 简单场景，不关心优先级 |
| `balanced` | 优先级排序后裁剪 | 日常使用，保留最重要信息 |
| `aggressive` | 只保留关键信号 | harness/checkpoint 模式，极致压缩 |

```bash
# 在 Hermes 中使用 MCP 工具
aios_context_pack(query="auth bug fix history", token_budget=2000, strategy="balanced")
```

### aios_doctor_suite

系统健康检查，覆盖 MCP 配置、Node 版本、ContextDB 状态、skill 目录和客户端连通性。支持 `--fix` 自动修复。

```bash
aios_doctor_suite(workspace="/path/to/project", fix=true)
```

### aios_intercept_compress

大型工具输出压缩。三档压缩模式：

| 模式 | 压缩程度 | 适用场景 |
|------|----------|----------|
| `tight` | 平衡压缩 | 默认模式 |
| `ultra` | 最大压缩 | harness/checkpoint |
| `precise` | 最少压缩 | 安全关键、不可损操作 |

```bash
aios_intercept_compress(text="<raw browser output>", mode="tight", tool_name="page.screenshot")
```

### aios_skill_validate

验证 Hermes/AIOS skill 目录结构完整性——检查 SKILL.md frontmatter 必须字段（name、description、version、author）、内容完整性和引用文件存在性。

```bash
aios_skill_validate(skill_path="/path/to/.hermes/skills/my-skill")
```

### aios_skill_install

从 AIOS skill-sources 目录安装 skill 到 Hermes 的 `.hermes/skills/` 目录。支持 `copy`（便携）和 `link`（本地开发）两种安装模式。

```bash
aios_skill_install(skill_name="context-pack", install_mode="copy")
```

## 客户端注册详情

Hermes 在 `CLIENT_DEFINITIONS` 中注册的关键信息：

| 属性 | 值 | 说明 |
|------|----|------|
| capabilities | skills, native, harness, superpowers | 暂不含 team/agents |
| commandName | hermes | CLI 命令名 |
| runtimeClientId | hermes-agent | 运行时标识 |
| projectSkillRoot | `.hermes/skills` | Skill 安装目录 |
| instructionFileName | AGENTS.md | Hermes 自动加载项目根 AGENTS.md |
| modelArgFlag | `--model` | 模型选择参数 |
| unattendedArgs | 空 | Hermes 没有 `--yolo` 模式 |

MCP 配置双作用域：

| 作用域 | 文件 | 说明 |
|--------|------|------|
| 项目级 | `.mcp.json` | 与 Claude Code 共享 |
| 用户级 | `config.yaml` (under `~/.hermes/`) | Hermes YAML 配置 |

## 如何启用

### Step 1: 确保 AIOS 已安装

```bash
# 检查 AIOS 是否已安装
aios doctor
```

### Step 2: 运行 Setup

```bash
aios          # TUI → 选择 Setup → 选择包含 hermes 的客户端
```

或直接：

```bash
aios setup --client hermes
```

### Step 3: 验证 MCP 桥接

```bash
aios doctor --fix
# Doctor 会自动注册 aios-mcp-server 到 Hermes 的 MCP 配置
```

### Step 4: 在 Hermes 中使用

启动 Hermes 并在项目中打开会话，AIOS 的 5 个 MCP 工具会自动可用：

```bash
hermes
# 在对话中：@aios_context_pack query="..." token_budget=2000 strategy="balanced"
```

## 与其他客户端的差异

| 特性 | Codex/Claude | Hermes |
|------|-------------|--------|
| Skills 目录 | `.codex/skills` / `.claude/skills` | `.hermes/skills` |
| 指令文件 | AGENTS.md / CLAUDE.md | AGENTS.md（共享） |
| 无人值守模式 | `--yolo` / `--dangerously-skip-permissions` | 无（使用 `delegate_task`） |
| MCP 配置 | JSON / TOML | JSON + YAML 双作用域 |
| Team 编排 | 支持 | 暂不支持（未来扩展） |

## 接下来做什么

- **提炼 Hermes 原生 skill** — 从 AIOS skill-sources 提炼 `context-pack`、`hermes-doctor` 等 skill 到 `.hermes/skills/` 格式
- **Team 编排扩展** — Hermes 的 `delegate_task` 已经支持子代理派发，未来可以接入 AIOS 的多客户端 team 编排
- **ACP 子代理桥接** — Hermes 支持 ACP（如 Copilot CLI），可以与 AIOS 的 `delegate_task` 融合实现跨客户端编排

---

阅读 [AIOS 官方文档](https://cli.rexai.top/zh/) 获取完整使用指南，或查看 [Agent 治理文章](/blog/zh/2026-06-agent-governance/) 了解 AIOS 如何保证多客户端工作流的安全性。
