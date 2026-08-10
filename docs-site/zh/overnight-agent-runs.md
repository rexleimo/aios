---
title: "怎么让编码 Agent 跑一整夜不崩、不漂移"
description: "隔夜 Agent 运行失败于崩溃、上下文漂移和不可恢复的状态。了解 Solo Harness 的 checkpoint、验证门禁和 git worktree 隔离如何让编码 Agent 工作一整夜。"
date: 2026-08-10
schema_type: techarticle
---

# 怎么让编码 Agent 跑一整夜不崩、不漂移

> **快速答案：** 隔夜 Agent 运行有三种死法：进程崩溃、上下文跑偏、工作区状态不可恢复。解法是**可恢复的 harness**：把状态 checkpoint 到磁盘、用证据门禁卡住每个里程碑、用 git worktree 隔离文件、中断后从最后被接受的 checkpoint 恢复。AIOS 的 Solo Harness（`aios harness run --objective "..." --worktree`）就是为此而生的。

## 隔夜运行为什么会失败

| 失败模式 | 发生了什么 |
| --- | --- |
| **崩溃** | 凌晨 3 点进程死了；上次保存之后的一切都丢了。 |
| **漂移** | Agent 开始做目标，然后游走到相邻任务；循环永远不收敛。 |
| **不可恢复状态** | 文件写了一半、worktree 脏了、没有任何"什么被接受了"的记录。 |

三种都是状态管理问题，不是模型问题。

## 隔夜存活四件套

1. **Checkpoint 状态**——运行把计划、证据、决策写盘，恢复时从最后被接受的里程碑继续，而不是从零开始。
2. **证据门禁**——每个里程碑必须通过确定性检查（`verification-before-completion`、doctor、契约测试）才能进入下一步。这把漂移拦在边界上，而不是早上才被发现。
3. **隔离**——运行在 [git worktree](https://cli.rexai.top/zh/solo-harness/) 里执行，并行或重复运行互不踩文件。
4. **收敛循环**——目标有显式停止条件；证据说目标完成就结束，而不是等预算耗尽。

## 启动隔夜运行

```bash
# 1. 在项目里初始化 AIOS
aios init --all

# 2. 启动可恢复、隔离的目标
aios harness run --objective "完成发布交接清单" --worktree

# 3. 早上查看状态
aios harness status
```

机器重启或进程死亡后，harness 从最后被接受的 checkpoint 恢复。失败分类与 dry-run 就绪检查见 [Solo Harness 文档](https://cli.rexai.top/zh/solo-harness/)。

## FAQ

**我的 Agent 运行没有自然终点怎么办？**
给它一个。收敛目标（"审计 src/routes/ 下每个路由是否缺少错误处理"）在证据清单完成时停止。没有停止条件，你就是在为随机游走付费。

**隔夜运行会占住终端吗？**
不会。`aios harness run` 把运行管理为可恢复目标；你可以关掉会话之后再恢复。

**必须用 worktree 隔离吗？**
只有当真并行写文件时才必须。但对单个隔夜运行，它仍然是最安全的默认——在工作被接受之前保持工作树干净。

## 下一步

读 [Solo Harness](https://cli.rexai.top/zh/solo-harness/) 看完整失败分类，或读 [Workflow Policy](https://cli.rexai.top/zh/workflow-policy/) 理解路由如何为运行把关。
