---
title: "Token Intelligence 分层架构：ContextDB、RTK、Caveman 与 Headroom MCP"
description: "理解 Harness CLI 当前的 token intelligence：pull-based ContextDB、本地 RTK/Caveman 压缩，以及显式 Headroom MCP 检索。"
date: 2026-05-12
tags: ["AIOS", "token intelligence", "ContextDB", "RTK", "Caveman", "Headroom MCP"]
---

# Token Intelligence 分层架构：ContextDB、RTK、Caveman 与 Headroom MCP

> **快速答案：** Harness CLI 把 token 效率拆成多个层次：ContextDB 保存并按需取回有边界的项目上下文；RTK 和 Caveman 在本地压缩命令与输出；Headroom MCP 在后续步骤确实需要时提供显式的 compress/retrieve 工具调用。这些层次互补，Headroom 不是对每个模型请求的透明拦截。

长时间 Agent 任务容易被日志、浏览器样板内容和重复历史挤满。解决方案不是一个万能开关，而是明确哪些内容要保存、哪些内容可以压缩、下一步需要取回哪些证据。

## 各层负责什么

| 层 | 职责 | 边界 |
| --- | --- | --- |
| ContextDB | 保存项目事实、事件、refs 和 handoff，按需检索 | Pull-based，不要求每次注入完整历史 |
| RTK | 在本地压缩支持的 CLI 输出 | 只处理命令输出，不能替代验证 |
| Caveman | 通过提示/skill 让 Agent 输出保持简洁 | 不能丢掉错误、路径、命令和风险提示 |
| Headroom MCP | 为后续步骤显式压缩和取回材料 | 按需 tool call，不是透明拦截 |

推荐使用统一初始化：

```bash
aios init --all
aios doctor --native --verbose
```

可选压缩工具和 Headroom MCP 的安装授权应分开处理。

## ContextDB 是记忆边界

ContextDB 适合保存稳定项目事实、选定任务状态和有用 handoff。可以按 token budget 生成有边界的 context pack：

```bash
cd mcp-server
npm run contextdb -- context:pack --session <session_id> --token-budget 1200 --token-strategy balanced
```

通过搜索和 refs 过滤取回下一步真正需要的证据。registry marker 只说明上下文注册信息存在，不代表完整历史会自动注入每一次 prompt。

## 压缩不能损失证据

有用的压缩结果仍应保留：

- 准确命令、文件路径和时间；
- 最新状态；
- 错误、警告和验证缺口；
- 可以取回原文的引用。

目标是用更小上下文做出同样质量的决策，而不是为了短而短。构建成功也只证明构建，不证明外部 provider、浏览器会话或人工批准。

## 常见问题

### 是否必须安装所有层？

不需要。先使用 ContextDB；日志噪声大时再增加本地命令/输出压缩；后续步骤需要显式压缩和取回时再使用 Headroom MCP。

### Headroom 会自动改写当前模型请求吗？

不会。它是显式 MCP 工具面，由调用方决定压缩或取回什么，并保留原始引用。

### 当前命令去哪里看？

阅读[Token Intelligence](https://cli.rexai.top/zh/token-compression/)、[ContextDB](https://cli.rexai.top/zh/contextdb/)和[故障排查](https://cli.rexai.top/zh/troubleshooting/)。[工作流策略](https://cli.rexai.top/zh/workflow-policy/)说明 token 工作如何进入编辑和验证门禁。
