---
title: 博客中心
description: Harness CLI（AIOS）工程与增长博客：记忆系统、单 Agent harness、Agent Team、浏览器自动化和自研 token 压缩。
---

# 博客中心

聚焦 AI 记忆系统、单 Agent harness 工作流、Agent Team 与自动化子代理规划的工程与增长文章。

## 从这里开始

刚接触 Harness CLI？从这里开始：

- [发布文章](launch-post.md) — 为什么做这个，它解决什么问题
- [CLI 对比](cli-comparison-post.md) — 加了这层之后有什么变化
- [自动化作战手册](automation-playbook-post.md) — 日常使用的实用模式

## 最新文章

- [Codemap：给你的 AI Agent 一张代码地图](2026-05-codemap-crg.md)
- [ContextDB Token 压缩：更小的上下文包，更稳的回忆能力](2026-05-token-compression.md)
- [自研 Token 压缩：为什么 Harness CLI 不安装 RTK 或 Caveman](2026-05-native-token-compression.md)
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
