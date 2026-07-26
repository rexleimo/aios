---
title: Harness CLI — 本地优先的 AI 编码 Agent 工作流
description: 为 Claude Code、Codex、Gemini CLI、OpenCode、Hermes、Grok 增加项目记忆、自适应路由、多 Agent 协作与验证，不替换你现有的编码客户端。
---

# Harness CLI (AIOS)

Harness CLI 是一个本地优先的 Agent 工作流层。它保留你已经在使用的 codex、claude、gemini、opencode、hermes 或 grok（Grok Build），再补上跨会话项目记忆、并行协作、可恢复运行和验证门禁。

[30 秒安装](getting-started.md){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="home_hero" data-rex-target="quick_start" }
[GitHub](https://github.com/rexleimo/harness-cli){ .md-button data-rex-track="cta_click" data-rex-location="home_hero" data-rex-target="github" }

[按场景选择](use-cases.md) · [工作流策略](workflow-policy.md) · [架构](architecture.md) · [博客](/blog/zh/)

## 一句话回答

如果你需要让 Agent 在不同会话和不同客户端之间共享项目事实、把独立工作交给多个 Agent，或让长任务能够暂停后继续，Harness CLI 提供了这些能力的本地工作流层。它不会替换底层编码客户端，也不会把所有历史自动塞进每个提示。

## 核心能力

| 能力 | 作用 | 起点 |
|---|---|---|
| **ContextDB** | 按需读取的项目记忆、memo、检查点和上下文包 | aios init / [ContextDB](contextdb.md) |
| **Workflow Policy** | 用 noop、direct、guarded、planned 选择风险匹配的路径 | [工作流策略](workflow-policy.md) |
| **Agent Team** | 有治理和 HUD 证据的独立任务并行协作 | aios team / [Agent Team](team-ops.md) |
| **Solo Harness** | 带运行日志和恢复入口的长任务 | aios harness run / [Solo Harness](solo-harness.md) |
| **RTK / Caveman** | 分别处理本地输出噪声和响应表达长度 | [Token Intelligence](token-compression.md) |
| **Headroom MCP** | 通过支持的 MCP 客户端显式压缩和取回内容 | [Token Intelligence](token-compression.md) |
| **Verification / Privacy** | 诊断、测试、质量门禁和敏感内容脱敏 | [故障排查](troubleshooting.md) |

## 现在就做

~~~bash
# 在项目根目录初始化客户端指引和项目标记。
aios init --all

# 查看原生同步、运行时和安全检查结果。
aios doctor --native --verbose
~~~

项目标记指向 .aios/context-db/index.json。ContextDB 使用 pull-based 读取：Agent 需要时搜索相关资料，而不是每次启动都读取完整历史。

## 选择正确路径

| 你的目标 | 推荐入口 |
|---|---|
| 先问一个问题或查看资料 | [Workflow Policy](workflow-policy.md) 的 direct |
| 做一个小而清晰的本地改动 | guarded + [Verification](troubleshooting.md) |
| 多步骤、跨文件或需要恢复的工作 | planned / [Solo Harness](solo-harness.md) |
| 两个以上互不依赖的工作包 | [Agent Team](team-ops.md) |
| 阶段性编排和质量证据 | [Use Cases](use-cases.md) |

## 运行时边界

~~~text
用户
  -> codex / claude / gemini / opencode / hermes / grok
  -> native guidance + .aios/context-db/index.json
  -> ContextDB 按需搜索 / memo / checkpoint
  -> Team、Solo Harness、Orchestrate（按任务需要）
  -> browser-use CDP（浏览器任务需要时）
~~~

Playwright MCP 保留为兼容路径；当前浏览器文档默认使用 browser-use CDP。RTK、Caveman 和 Headroom MCP 也各有独立的安装、授权和验证边界。

## 第一次使用

1. 阅读 [快速开始](getting-started.md)，执行 aios init --all。
2. 执行 aios doctor --native --verbose，根据证据处理警告。
3. 在项目中启动一个支持的客户端。
4. 需要长期记忆时阅读 [ContextDB](contextdb.md)，需要选择路径时阅读 [工作流策略](workflow-policy.md)。

## 相关入口

- [Windows 指南](windows-guide.md) - PowerShell 安装和恢复。
- [架构](architecture.md) - 运行时层和兼容性边界。
- [案例库](case-library.md) - 可复现的跨客户端、浏览器和隐私案例。
- [友情链接](friends.md) - 生态和相关项目。
- [博客](/blog/zh/) - 工作流教程、版本说明和技术深挖。

## 博客精选

- [4.0.0 自适应工作流策略](/blog/zh/2026-07-v400-adaptive-workflow-policy/)
- [如何选择 Agent 工作流](/blog/zh/2026-07-choose-agent-workflow/)
- [从裸 CLI 到可靠工作流](/blog/zh/2026-07-raw-cli-to-reliable-workflow/)
- [ContextDB Search Upgrade](/blog/zh/contextdb-fts-bm25-search/)

## 更多核心文章

- [AIOS RL Training System](/blog/zh/rl-training-system/)
- [ContextDB Search Upgrade](/blog/zh/contextdb-fts-bm25-search/)
- [Windows CLI Startup Stability](/blog/zh/windows-cli-startup-stability/)
- [Orchestrate Live](/blog/zh/orchestrate-live/)
