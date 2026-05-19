---
title: 概览
description: RexCLI (AIOS) 给你正在用的 codex / claude / gemini / opencode 加一层记忆、协作和验证能力——不换工具，不改习惯。
---

# RexCLI (AIOS)

> 给 `codex` / `claude` / `gemini` / `opencode` 加上记忆、协作和验证能力的本地 Agent 工作流层。

[3 分钟快速开始](getting-started.md){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="home_hero" data-rex-target="quick_start" }
[多 Agent 怎么用](team-ops.md){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="home_hero" data-rex-target="team_ops" }
[按场景找命令](use-cases.md){ .md-button data-rex-track="cta_click" data-rex-location="home_hero" data-rex-target="use_cases" }
[GitHub](https://github.com/rexleimo/rex-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=zh_onboarding&utm_content=home_hero_star){ .md-button data-rex-track="cta_click" data-rex-location="home_hero" data-rex-target="github_star" }

## 核心能力

| 能力 | 说明 | 命令 |
|---|---|---|
| **ContextDB** | 跨会话项目记忆，事件/检查点/上下文包持久化 | `codex` / `claude` / `gemini` / `opencode` 自动加载 |
| **Memo Storage** | Git-friendly 项目笔记；默认 append-only file 存储，也可切换到 split 文件存储 | `aios memo add "note"` / `aios memo storage status` |
| **原生路由快捷命令** | 客户端原生路由提示，single/subagent/team/harness 通道 | Claude/Gemini/OpenCode: `/team <任务>`；Codex: `/prompts:team <任务>` |
| **原生 Token 压缩** | 自研输入/输出压缩，参考 RTK/Caveman 思路，不安装竞品工具 | `context:pack --token-budget 1200 --token-strategy balanced` |
| **Model Router** | Agent Team 智能多模型调度 — 按能力、成本和历史成功率匹配最优模型 | `node scripts/aios.mjs model-router route --task "..."` |
| **Agent Team** | 多 Agent 并行协作，HUD 可视化追踪 | `aios team 3:codex "任务描述"` |
| **Solo Harness** | 单 Agent 过夜长任务，可恢复、有运行日志 | `aios harness run --objective "目标" --worktree` |
| **Perception** | 内容结果追踪 + 统计洞察 + 感知注入 | `aios perception record` / `insights` / `summary` |
| **Browser MCP** | 隐身浏览器自动化，CDP 协议 | `aios internal browser doctor` |
| **Superpowers** | 可复用工作流技能（brainstorm/plan/debug/verify） | TUI 中选择 |
| **Privacy Guard** | 敏感文件读取前自动脱敏 | `aios privacy status` |

你继续使用原有命令，工作流程完全不变——只是你的 agents 多了记忆、协作和自诊断能力。

[快速开始](getting-started.md){ .md-button .md-button--primary }
[按场景找命令](use-cases.md){ .md-button }

## 工作原理

```text
User → codex / claude / gemini / opencode
     → zsh wrapper（透明包装）
     → ctx-agent.mjs（ContextDB 集成）
        → contextdb CLI（记忆持久化）
        → 启动原生 CLI（附带上下文包）
     → browser MCP（可选浏览器自动化）
```

安装后，直接使用 `codex`、`claude`、`gemini`、`opencode` 命令即可，RexCLI 自动在后台加载项目记忆，并在客户端支持时安装路由快捷命令。

## 快速体验

```bash
# 启动 TUI
aios

# 保存适合 Git 共享的项目 memo
aios memo add "记住 auth 测试要保持严格"
aios memo storage status

# 在原生客户端内路由任务（setup 后）
# Claude/Gemini/OpenCode: /team <任务>
# Codex: /prompts:team <任务>

# 多 Agent 协作
aios team 3:codex "重构登录模块并运行测试"

# 单 Agent 过夜任务
aios harness run --objective "完成明天的交接文档" --worktree

# 智能模型路由
node scripts/aios.mjs model-router route --task "审查 auth.js 安全漏洞"

# 自研 token 压缩 ContextDB 包
cd mcp-server && npm run contextdb -- context:pack --session <session_id> --token-budget 1200 --token-strategy balanced

# 内容结果追踪（小红书等场景）
aios perception record --content-id note_001 --platform xiaohongshu --content-type note --title "测试" --metrics '{"likes":100}'

# 查看任务状态
aios team status --provider codex --watch
```

## 第一次使用？

**从这里开始：** [快速开始](getting-started.md) — 安装、配置、第一次运行，大约 3 分钟。

**已经安装好了？** 直接跳转到你需要的部分：

| 我想... | 去往 |
|---|---|
| 给 agent 添加项目记忆 | [ContextDB](contextdb.md) |
| 多个 agents 一起工作 | [Agent Team](team-ops.md) |
| 一个 agent 过夜运行 | [Solo Harness](solo-harness.md) |
| 智能路由任务 | [Model Router](model-router.md) |
| 减少 token 使用 | [Token Compression](token-compression.md) |
| 按场景找命令 | [Commands By Scenario](use-cases.md) |

## 环境要求

- Git
- Node.js 24 LTS + npm
- Windows: PowerShell 5.x 或 7

## 开发

```bash
git clone https://github.com/rexleimo/rex-cli.git
cd rex-cli
```

验证：

```bash
cd mcp-server
npm test
npm run typecheck
npm run build
```

## 文档

- [快速开始](getting-started.md) — 安装、配置、首次运行
- [Model Router](model-router.md) — Agent Team 多模型智能调度
- [ContextDB](contextdb.md) — 项目记忆系统
- [Agent Team](team-ops.md) — 多 Agent 协作指南
- [Solo Harness](solo-harness.md) — 过夜长任务指南
- [Perception](perception.md) — 内容结果追踪与洞察
- [架构](architecture.md) — 系统架构
- [故障排查](troubleshooting.md) — 常见问题
- [按场景找命令](use-cases.md) — CLI 工作流速查

## 博客精选

- [AIOS RL Training System](/blog/zh/rl-training-system/)
- [ContextDB Search Upgrade](/blog/zh/contextdb-fts-bm25-search/)
- [Windows CLI Startup Stability](/blog/zh/windows-cli-startup-stability/)
- [Orchestrate Live](/blog/zh/orchestrate-live/)
