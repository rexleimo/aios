---
title: 博客中心
description: Harness CLI（AIOS）工程与增长博客：记忆系统、单 Agent harness、Agent Team、浏览器自动化、工作流策略和多客户端实践。
---

# 博客中心

聚焦 AI 记忆系统、单 Agent harness 工作流、Agent Team 与自动化子代理规划的工程与增长文章。

## 从这里开始

刚接触 Harness CLI？从这里开始：

- [发布文章](launch-post.md) — 为什么做这个，它解决什么问题
- [CLI 对比](cli-comparison-post.md) — 加了这层之后有什么变化
- [自动化作战手册](automation-playbook-post.md) — 日常使用的实用模式
- [v4.0 自适应工作流策略](2026-07-v400-adaptive-workflow-policy.md) — 路由和计划如何选择
- [AI Agent 工作流怎么选](2026-07-choose-agent-workflow.md) — 决策表与实战示例
- [从 CLI 命令到可靠工作流](2026-07-raw-cli-to-reliable-workflow.md) — 让自动化可复用、可恢复

## 最新文章

- [v5.4.0：工作流迭代 v2.1 — Activation 安全、类型化 Evidence 契约与全量 Skill 审查](2026-08-v540-workflow-iteration-v21.md)
- [v4.0 自适应工作流策略：Harness CLI 如何选择合适的工程流程](2026-07-v400-adaptive-workflow-policy.md)
- [AI Agent 工作流怎么选？Harness CLI 路由决策指南](2026-07-choose-agent-workflow.md)
- [从零散 CLI 命令到可靠的 AI Agent 工作流](2026-07-raw-cli-to-reliable-workflow.md)
- [v3.6.0：用 Headroom 与 Ponytail 构建更稳的 Token 智能工作流](2026-07-headroom-token-intelligence.md)
- [v3.2.0：Harness 可靠性与技能生命周期升级](2026-07-v320-harness-reliability-upgrade.md)
- [Grok Build 正式成为 AIOS 一等公民客户端](2026-07-grok-build-aios-client.md)
- [Hermes Agent 正式成为 AIOS 一等公民客户端](2026-06-hermes-agent-aios-client.md)
- [v2.0.2：更安全的技能健康记录与更干净的 Crush 配置](2026-06-v202-ecc-uplift.md)
- [Agent 治理：让 Team live 运行先证明自己](2026-06-agent-governance.md)
- [v1.52.0：通过 MCP 实现确定性的 Shell 输出压缩](2026-06-v152-aios-shell-mcp.md)
- [v1.50.1：全客户端 Token 压缩合规](2026-06-v1501-token-compression-compliance.md)
- [v1.50.0：统一 AIOS 搜索覆盖记忆、文档、计划和代码](2026-06-v150-unified-aios-search.md)
- [Codemap：给你的 AI Agent 一张代码地图](2026-05-codemap-crg.md)
- [ContextDB Token 压缩：更小的上下文包，更稳的回忆能力](2026-05-token-compression.md)
- [aios memo GUI：把 Agent 的记忆变成一张活的图谱](2026-05-aios-memo-gui.md)
- [Model Router：Agent Team 的智能多模型调度层](2026-05-model-router.md)
- [Solo Harness：让一个 Agent 过夜跑，但你依然可控](2026-04-solo-harness.md)
- [debug-hub：让 Agent 自己查日志](2026-05-debug-hub-mcp.md)
- [Browser MCP 弱模型升级：语义快照 + 文本点击](2026-04-browser-mcp-weak-model-upgrade.md)
- [高级设计技能页面制作：把模糊提示词变成可生产 UI](advanced-design-skills-page-building.md)
- [Harness CLI TUI 重构：基于 React Ink 的现代终端交互](2026-04-rexcli-ink-tui-refactor.md)
- [Windows 启动稳定性更新：cmd 包装器下的 CLI 启动更稳了](windows-cli-startup-stability.md)

## 深度文章

- [AIOS RL 训练系统：从合成 BUG 修复到多环境联合学习](rl-training-system.md)
- [ContextDB 检索升级：FTS5/BM25 + 增量索引同步（P1.5）](contextdb-fts-bm25-search.md)
- [Orchestrate Live：Subagent Runtime 正式可用](orchestrate-live.md)

## FAQ

### 想看记忆系统相关内容，先读哪篇？
如果关心 prompt 预算，先看 [ContextDB Token 压缩](2026-05-token-compression.md)；如果关心检索，再看 [ContextDB 检索升级：FTS5/BM25 + 增量索引同步（P1.5）](contextdb-fts-bm25-search.md)，最后回到官方文档 `/contextdb/`。

### 想看单 Agent 夜跑，先读哪篇？
先看 [Solo Harness：让一个 Agent 过夜跑，但你依然可控](2026-04-solo-harness.md)，再回到官方文档 [单 Agent 夜跑](https://cli.rexai.top/zh/solo-harness/)。

### Agent Team 和子代理编排更新看哪里？
重点看 [Orchestrate Live：Subagent Runtime 正式可用](orchestrate-live.md)。

### Harness CLI 是新的 coding agent 吗？
不是。它是一个本地优先的能力层，给你正在用的 `codex` / `claude` / `gemini` / `opencode` 加上记忆、协作和验证能力——不换工具，不改习惯。
