---
title: "v5.9.0 记忆系统跨客户端激活：从正则触发到提示词驱动"
description: "了解 AIOS v5.9.0 如何把记忆激活迁到确定性入口与提示词契约：会话启动自动注册、aios-memory MCP 三工具、五端触发契约投影，以及 Codex 启动弹窗的根因修复。"
date: 2026-09-02
tags: ["AIOS", "记忆系统", "MCP", "Codex", "release"]
---

# v5.9.0 记忆系统跨客户端激活：从正则触发到提示词驱动

> **快速答案：** v5.9.0 把记忆激活从正则猜测迁到三个确定性入口——会话启动自动注册 ContextDB、`aios-memory` MCP server（召回/写入/检查点）、五端 Memory Trigger Contract 投影。同时根修了 Codex 启动弹窗（trust 持久化文件从未写入），并撤销 Gemini 的 deprecated 标记。七客户端 × 五大 MCP 全绿。

## 为什么发这个版本

排查发现记忆系统的触发层建立在正则表达式上——`intent.mjs` 用正则猜意图、`complexity.mjs` 用启发式猜复杂度，正则没有让 LLM 对工具产生真正的理解。删掉正则层后暴露出真正的问题：**触发点没有迁到提示词层的显式位置**，记忆系统看起来"没启用"。

v5.9.0 完成这个重构：**确定性数据面（hook/插件自动注入）+ 语义面（提示词声明触发点）+ MCP 工具面（无 hook 客户端的确定性入口）**。

## 核心变更

- **会话生命周期接入记忆**：`aios session start` 注册 ContextDB 会话（幂等、`--session-id/--agent/--client`），启动即带出上个 handoff 与 pinned memo。
- **`aios-memory` MCP server**：`memory_recall`（统一检索）、`memory_write`（免确认落 memo）、`memory_checkpoint`（检查点进 pinned 面），为 Gemini / Hermes / WorkBuddy 等无 hook 面客户端提供确定性入口。
- **OpenCode 插件 + hook 全链路**：Claude 双 hook、Codex/Grok UserPromptSubmit 运行时验证通过；OpenCode 走插件经既有管线注入每轮召回（TUI）。
- **Memory Trigger Contract 五端投影**：新会话先召回、继续先召回、有结论立即写、做完写检查点。触发点由契约声明，相关性判断交给 LLM。
- **Codex 弹窗根修**：codex 0.148+ 把 hooks/项目信任持久化在 `~/.codex/config.toml`，AIOS 从未写入 → 每次启动重复弹。安装器现在写托管区（trust + 五大 MCP），幂等、保留用户内容，更新不再复发。
- **Gemini 恢复全量支持**：上游转向 Antigravity，但按全端一致承诺撤销 deprecated，记忆/投影/技能同步全量接好。

## 升级注意

- `aios session start --json` 输出从裸数组改为 `{ registration, lines }`。
- `opencode run`（headless）不加载项目插件（上游行为），TUI 不受影响。
- Codex 用户升级后可能最后见一次信任提示——接受一次即持久化。

## 验证

会话注册单测 5/5、codex config 单测 5/5、MCP 冒烟 4/4、客户端回归 47 pass / 0 fail；turn-recall 三端实弹；真机 E2E 幂等 reused 字节级确认。
