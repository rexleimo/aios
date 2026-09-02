---
title: v5.9.0 — 记忆系统跨客户端激活：从正则触发到提示词驱动
date: 2026-09-02
description: "会话启动自动注册 ContextDB、aios-memory MCP 三工具（召回/写入/检查点）、OpenCode 插件、五端记忆触发契约投影、Codex hooks 信任持久化修复、Gemini 恢复全量支持"
---

# v5.9.0 — 记忆系统跨客户端激活：从正则触发到提示词驱动

> 2026-09-02 · 七客户端 × 五大 MCP 全绿的发布

## 为什么发这个版本

上一版（v5.8.2）完成了 WorkBuddy 客户端支持。但我们在排查中发现一个架构级问题：

**记忆系统的触发层建立在正则表达式上。** `intent.mjs` 用正则猜意图、`complexity.mjs` 用启发式猜复杂度——正则没有让 LLM 对工具产生真正的理解，实际效果不佳。我们把正则触发层删掉之后，发现新的问题：**删掉隐式触发，没有把触发点迁到提示词层的显式位置**，记忆系统看起来就"没启用"了。

v5.9.0 就是这个重构的完成：**确定性数据面（hook/插件自动取数注入）+ 语义面（提示词声明触发点）+ MCP 工具面（无 hook 客户端的确定性入口）**。

## 核心变更

### 1. 会话生命周期接入记忆（方案 A：记忆随工作流入口启用）

`aios session start` 现在会注册 ContextDB 会话（幂等、可注入、失败降级），`--session-id/--agent/--client` 全参数化。会话开始自动带出上个会话的 handoff 和 pinned memo，`session: (new)` 时代结束。

### 2. 全新 `aios-memory` MCP server

三个工具，为没有 hook 面的客户端（Gemini / Hermes / WorkBuddy）提供确定性入口：

- `memory_recall` — 统一检索（memo + contextdb + plans），写完立刻能搜到
- `memory_write` — 结论/修复/偏好落 memo，免确认（本地可回滚）
- `memory_checkpoint` — 检查点进 pinned 面，下次会话启动可见

### 3. OpenCode 插件 + Claude/Codex/Grok hook 全链路

Claude 的 SessionStart + UserPromptSubmit 双 hook、Codex/Grok 的 UserPromptSubmit hook 原本就通；新增 OpenCode 插件（会话生命周期 + 每轮召回走既有 hook 管线 + system 注入）。Turn-recall 运行时验证通过。

### 4. Memory Trigger Contract 五端投影

AGENTS.md / CLAUDE.md / GEMINI.md 各自注入一致的触发契约：新会话先召回、继续/恢复先召回、有结论立即写、做完写检查点、不确定就记。**正则死了，触发权交给 LLM，但触发点由契约明确声明。**

### 5. Codex 启动弹窗根因修复（重灾区）

Codex 0.148+ 引入 hooks 信任机制，信任状态持久化在 `~/.codex/config.toml`——AIOS 从来没写过这个文件，项目永远 untrusted，**每次启动都弹、每次更新都复发**。现在安装器自动写入托管区（trust + 五大 MCP），幂等、保留用户内容。**装完即好，更新不再复发。**

### 6. Gemini 恢复全量支持

上游停止迭代 Gemini CLI（转向 Antigravity），但按项目承诺——所有端一致支持——撤销 deprecated 标记：MCP 记忆、指令投影、skill 同步全量接入。

### 7. 五大 MCP × 七客户端全绿

code-review-graph / mcp-browser-use / aios-auth-tools / aios-shell / aios-memory，在 Claude、Hermes、Gemini、WorkBuddy、Grok、Codex、OpenCode 七端全部注册到位（含 aios-shell workspace 漂移修正）。

## 升级注意

- `aios session start --json` 输出从裸数组改为 `{ registration, lines }`
- WorkBuddy CLI 用户：桌面应用自带的 CLI 不在 PATH，需要 shim（本版文档已说明）
- `opencode run`（headless）不加载项目插件是上游行为；TUI 会话不受影响
- Codex 用户升级后若仍弹一次信任提示，接受一次即可——现在能持久化了

## 验证

- 会话注册单测 5/5、codex config 单测 5/5、MCP 冒烟 4/4、客户端回归 47 pass / 0 fail
- Turn-recall 运行时验证（Claude/Codex/Grok hook 链路实弹）
- 真机 E2E：手工遗留段收编、幂等 reused、字节级确认
