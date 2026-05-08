---
title: 概览
description: 先按任务找到命令，再深入 ContextDB、Agent Team、浏览器自动化和技能系统。
---

# RexCLI

> 不换工具，不改习惯。给你正在用的 `codex` / `claude` / `gemini` 加一层记忆、协作和验证能力。

[3 分钟快速开始](getting-started.md){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="home_hero" data-rex-target="quick_start" }
[多 Agent 怎么用](team-ops.md){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="home_hero" data-rex-target="team_ops" }
[按场景找命令](use-cases.md){ .md-button data-rex-track="cta_click" data-rex-location="home_hero" data-rex-target="use_cases" }
[GitHub](https://github.com/rexleimo/rex-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=zh_onboarding&utm_content=home_hero_star){ .md-button data-rex-track="cta_click" data-rex-location="home_hero" data-rex-target="github_star" }

<figure class="rex-visual">
  <img src="../assets/visual-new-user-path.svg" alt="RexCLI 新手三步路径：安装 Doctor、启用项目记忆、按需开启多 Agent">
  <figcaption>新用户先走最短路径：安装并跑 Doctor，给项目开启记忆；只有任务可拆、验收清楚时再开多 Agent。</figcaption>
</figure>

## 核心功能

<div class="feature-grid">
  <a href="contextdb/" class="feature-card feature-card--memory">
    <div class="feature-card__icon">🧠</div>
    <div class="feature-card__title">ContextDB</div>
    <div class="feature-card__desc">项目级记忆层。事件、检查点和上下文包在终端重启后依然持久化。</div>
    <span class="feature-card__link">了解更多 →</span>
  </a>
  <a href="superpowers/" class="feature-card feature-card--workflow">
    <div class="feature-card__icon">⚡</div>
    <div class="feature-card__title">Superpowers</div>
    <div class="feature-card__desc">可复用的自动化技能。通过引导式工作流进行头脑风暴、规划、调试、验证和部署。</div>
    <span class="feature-card__link">了解更多 →</span>
  </a>
  <a href="team-ops/" class="feature-card feature-card--team">
    <div class="feature-card__icon">👥</div>
    <div class="feature-card__title">Agent Team</div>
    <div class="feature-card__desc">将可拆分的任务分发给多个 CLI 工作进程并通过 HUD 追踪。协调 Agents，而非制造混乱。</div>
    <span class="feature-card__link">了解更多 →</span>
  </a>
  <a href="solo-harness/" class="feature-card feature-card--tool">
    <div class="feature-card__icon">🌙</div>
    <div class="feature-card__title">单 Agent 夜跑</div>
    <div class="feature-card__desc">长时间运行的单 Agent 任务，支持运行日志、恢复/停止控制和工作目录隔离。</div>
    <span class="feature-card__link">了解更多 →</span>
  </a>
  <a href="debug-hub/" class="feature-card feature-card--debug">
    <div class="feature-card__icon">🐛</div>
    <div class="feature-card__title">debug-hub</div>
    <div class="feature-card__desc">MCP 原生调试日志服务。让 coding agent 查询自己的运行时日志并自我诊断。</div>
    <span class="feature-card__link">了解更多 →</span>
  </a>
  <a href="model-router/" class="feature-card feature-card--memory">
    <div class="feature-card__icon">🧭</div>
    <div class="feature-card__title">Model Router</div>
    <div class="feature-card__desc">智能模型调度，为 Agent Team 匹配最优模型。按能力、成本和历史成功率决策。</div>
    <span class="feature-card__link">了解更多 →</span>
  </a>
  <a href="troubleshooting/" class="feature-card feature-card--tool">
    <div class="feature-card__icon">🌐</div>
    <div class="feature-card__title">Browser MCP</div>
    <div class="feature-card__desc">隐形浏览器自动化，基于 CDP。内置人类行为模拟和反检测功能。</div>
    <span class="feature-card__link">了解更多 →</span>
  </a>
</div>

## 重点推荐：debug-hub

**让 coding agent 学会自己查日志。** debug-hub 是专为 agent 设计的 MCP 原生调试日志服务，把日志和调用链暴露为 agent 可直接调用的工具——不用人类再去翻终端、grep 输出、手动关联错误。

| | |
|---|---|
| **Agent 可用的 MCP 工具** | `search_logs`、`get_trace`、`list_traces`、`get_stats`、`clear_logs` |
| **三种 SDK** | Node.js、Browser、Go，一致的 API |
| **零依赖** | `~/.debug-hub/` 文件存储，不需要数据库、不需要 Docker |
| **内嵌 Web UI** | 暗色主题 Dashboard，SSE 实时推送 |

```bash
cd packages/debug-hub && npm install && npm run dev
# HTTP API + Web UI: http://localhost:39200，MCP 走 stdio
```

[查看完整公告 →](/blog/zh/2026-05-debug-hub-mcp/){ .md-button .md-button--primary }
[快速开始](debug-hub.md){ .md-button }

## 先选你要做什么

| 你现在想做 | 先看 | 最短命令 |
|---|---|---|
| 只想装好并打开 TUI | [快速开始](getting-started.md) | `aios` |
| 让 agent 记住项目上下文 | [ContextDB](contextdb.md) | `touch .contextdb-enable && codex` |
| **让 agent 自己查日志** | **[debug-hub 博客](/blog/zh/2026-05-debug-hub-mcp/)** | `cd packages/debug-hub && npm run dev` |
| 让一个 agent 过夜跑 | [单 Agent 夜跑](solo-harness.md) | `aios harness run --objective "整理明早交接清单" --worktree` |
| 多个 agent 一起做任务 | [多 Agent 实战](team-ops.md) | `aios team 3:codex "实现 X 并跑测试"` |
| 看任务跑到哪了 | [HUD 指南](hud-guide.md) | `aios team status --provider codex --watch` |
| 浏览器自动化出问题 | [故障排查](troubleshooting.md) | `aios internal browser doctor --fix` |

## RexCLI 到底是什么

RexCLI 不是新的 coding agent。它是一个本地优先的能力层：

1. **记忆层 ContextDB**：把事件、checkpoint、上下文包保存在当前项目里，重启终端后还能续上。
2. **工作流层 Superpowers**：把需求拆成计划、按证据调试、完成前做验证。
3. **协作层 Agent Team**：把明确可拆分的任务交给多个 CLI worker，并用 HUD 追踪状态。
4. **可观测层 debug-hub**：把 agent 运行时日志和调用链暴露为 MCP 工具，让 agent 自主排查错误。
5. **工具层 Browser MCP + Privacy Guard**：让 agent 可以安全使用浏览器、读取敏感配置前先脱敏。

如果是单 agent 的长任务，[单 Agent 夜跑](solo-harness.md) 会在 ContextDB 之上补上 run journal、resume/stop 控制和可选 worktree 隔离。

一句话：你还是运行 `codex`、`claude`、`gemini`，RexCLI 负责让它们更有记忆、更会协作、更少瞎猜。

## 新用户推荐路径

### 第一天：先跑通

```bash
curl -fsSL https://github.com/rexleimo/rex-cli/releases/latest/download/aios-install.sh | bash
source ~/.zshrc
aios
```

在 TUI 里选择 **Setup**，完成后跑 **Doctor**。

### 第二步：在项目里启用记忆

```bash
cd /path/to/your/project
touch .contextdb-enable
codex
```

以后在这个项目里启动 `codex` / `claude` / `gemini`，RexCLI 会自动接上项目上下文。

### 第三步：遇到可拆任务再用多 Agent

```bash
aios team 3:codex "把登录模块重构掉，并在完成前运行相关测试"
aios team status --provider codex --watch
```

如果任务还不清楚，先用普通交互式 `codex` 让它分析；只有明确能拆分时再开 `team`。

## 常见误区

- **不是所有任务都要多 Agent**：单文件修复、小 bug、需求还不清楚时，先单 agent。
- **不是所有变量都要配置**：新用户先用 `aios` TUI，别一上来记环境变量。
- **不是只看功能列表**：先按"我要做什么"找命令，再去看模块参考。
- **不要忽略 Doctor**：安装、浏览器、skills、native 配置问题，先跑诊断再改。

## 发布说明与深度文章

- [debug-hub：MCP 原生调试日志服务](/blog/zh/2026-05-debug-hub-mcp/)：让 coding agent 通过 MCP 工具直接查询自身运行时日志。
- [AIOS RL Training System](/blog/zh/rl-training-system/)：多环境训练控制平面与 rollout 模型。
- [ContextDB Search Upgrade](/blog/zh/contextdb-fts-bm25-search/)：FTS5 + BM25 检索路径和语义重排行为。
- [Windows CLI Startup Stability](/blog/zh/windows-cli-startup-stability/)：包装器启动修复与 Windows 启动稳定性。
- [Orchestrate Live](/blog/zh/orchestrate-live/)：live 编排门禁与执行流程。

## 下一步阅读

- [快速开始](getting-started.md)：安装、Setup、Doctor、第一次运行。
- [按场景找命令](use-cases.md)：按"我想做什么"查入口。
- [多 Agent 实战](team-ops.md)：什么时候开团队、怎么监控、怎么收尾。
- [单 Agent 夜跑](solo-harness.md)：怎么让一个 agent 过夜跑、查看状态、停止和恢复。
- [ContextDB](contextdb.md)：理解记忆如何跨会话持久化。
- [故障排查](troubleshooting.md)：安装、浏览器、live 执行失败时先看这里。
