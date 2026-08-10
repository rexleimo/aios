---
title: "并行 coding agent 不是免费的：Git worktree 隔离文件，隔离不了状态"
description: "本周 Hacker News 讨论'Git worktrees 不是 coding agent 的隔离边界'：worktree 隔离的是文件，不是状态。多个 agent 共享计划、激活存储、token 流和 evidence 日志时，会出现和多线程代码一样的竞态——丢失更新、双重消费、静默冲突。"
date: 2026-08-02
tags: ["并行 coding agent", "git worktree", "并发", "Agent Team", "状态隔离", "开发效率"]
---

# 并行 coding agent 不是免费的：Git worktree 隔离文件，隔离不了状态

> **快速回答：** 本周 Hacker News 的帖子"Git worktrees are not an isolation boundary for coding agents"点中了大多数并行 agent 方案忽略的问题：worktree 隔离的是*文件*，不是*状态*。当多个 agent 共享同一份计划、激活存储、token 流和 evidence 日志时，你得到的是和多线程代码一样的竞态条件——丢失更新、双重消费、静默冲突。文件隔离必要但不充分；你还需要事务性状态和显式协调。

## 并行 agent 的 hype 撞上现实

并行 coding agent 现在到处都是：同时跑 Claude Code、Codex 和 OpenCode 的 tmux TUI、并行 agent 的本地 merge queue、每个 agent 一个 worktree 的团队。想法很简单——agent 便宜，那就多跑几个。

本周一个帖子给出了现实检验，核心观点是**worktree 不是隔离边界**。它说对了一件事：两个 agent 在两个 worktree 里不会破坏彼此的*源文件*，但绝对会破坏彼此的*状态*。

## worktree 隔离实际给了你什么

一个 git worktree 给每个 agent 独立的工作目录和分支。它保护：

- **源文件**——agent A 的编辑覆盖不了 agent B 的文件。
- **分支**——每个 agent 合自己的分支；冲突在合并时浮出水面。

它**不**保护：

- **激活存储**——哪个工作流处于激活状态、计划推进到哪个 token。
- **token 推进**——两个 agent 都读到"当前 token = 3"，都推进到 4。一步跑两次，另一步从没跑过。
- **evidence 和验证**——agent A 的验证日志可能被 agent B 对同一检查的运行覆盖。
- **共享缓存和锁**——同一个锁文件、同一个注册表、同一个 `.aios` 状态目录。

如果你的 agent 共享以上任何一项，worktree 给你的只是*隔离的错觉*，而底层的状态机正在像有 bug 的多线程代码一样竞态：丢失更新、双重消费、静默冲突。

## 状态级隔离长什么样

三件事区分"能正常工作的并行 agent"和"互相破坏的并行 agent"：

### 1. 事务性状态写入

状态更新必须原子且崩溃安全。如果 agent 写入中途崩溃，下一次运行要么回滚前滚，要么失败关闭——绝不信任半写的投影。AIOS v5.4.0 让激活写入事务化（写前事务、重启自动前滚、读侧一致性校验，不一致时 `stale-activation-projection` 失败）。

### 2. 共享 token 上的真锁

并行 agent 不能双重消费同一个 Command token。存储文件锁串行化推进：并发调用收到 `AIOS_REX_STORE_BUSY` 而不是静默竞态。这和 `SELECT ... FOR UPDATE` 是同一个纪律——串行化唯一不能并行化的东西：谁拥有下一步。

### 3. 显式协调，而不是隐式信任

并行需要协调层：带明确归属的独立工作包、监控（谁卡住了？）、安全恢复（worker 死了怎么办？）。AIOS 的 Agent Team 路由把工作拆成带验收标准的独立包并用 HUD 实时监控；Solo Harness 为单个长目标提供带 journal 和 stop/resume 的 worktree 隔离——两者是不同任务的不同工具。

## 经验法则

当工作能拆成**状态独立的独立包**时，用并行 agent。耦合变更保持串行——工作流策略本来就这么做（`planned` 路由，耦合变更留在同一个客户端）。如果两个 agent 必须触碰同一个激活、token 或 evidence，那你拥有的不是两个并行任务，而是一个带竞态条件的任务。

## 安全上手序列

```bash
aios init --all
aios doctor --native --verbose
```

阅读 [Agent Team 指南](https://cli.rexai.top/team-ops/)了解独立工作包和 HUD 监控，[Solo Harness 指南](https://cli.rexai.top/solo-harness/)了解带 worktree 隔离的可恢复长任务，[工作流策略](https://cli.rexai.top/workflow-policy/)了解何时耦合变更必须保持串行。

## FAQ

### 那我应该停止用 worktree 吗？

不。worktree 是好的文件级隔离机制。重点是它*不够*：在上面加事务性状态和显式协调，否则并行会在文件冲突永远不会的地方咬你。

### 怎么知道我的 agent 是否共享状态？

检查它们在 worktree 之外写了什么：共享的 `.aios` 目录、锁文件、注册表，或任何记录"我们推进到哪一步"的东西。如果两个 agent 能读写同一个文件，它们就共享状态。

### merge queue 不就是足够的协调吗？

merge queue 协调的是*代码*——分支何时合并。它不协调*状态*——谁推进计划 token、谁拥有验证。两者都需要。

### 细节在哪里看？

[更新日志](https://cli.rexai.top/changelog/)覆盖了 v5.4.0 的状态加固，发布文章[工作流迭代 v2.1](https://cli.rexai.top/blog/2026-08-v540-workflow-iteration-v21/)解释了被关闭的并发失败模式。

并行是乘数——对吞吐量如此，对破坏亦然。文件该隔离就隔离。状态也必须隔离，否则 agent 会替你隔离，以最糟糕的方式。
