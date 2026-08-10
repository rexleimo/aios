---
title: "多 Agent 代码评审：真正有用的并行编码 Agent"
description: "并行编码 Agent 做代码评审，常常败在状态共享糟糕、重复劳动、合并未经核验的结果。了解带证据门禁、HUD 状态和 worktree 隔离的 Agent 团队如何让多 Agent 评审变得可靠。"
date: 2026-08-10
schema_type: techarticle
---

# 多 Agent 代码评审：真正有用的并行编码 Agent

> **快速答案：** 并行编码 Agent 帮上代码评审的忙，只有当三件事成立时：工作被拆成独立节点、每个节点写自己的隔离 worktree、合并步骤消费的是被核验的证据而不是原始意见。AIOS 的 Agent Team（`aios team 3:codex "评审 auth 模块"`）一次派出 N 个并行 Agent、在屏障处等待、返回可过滤可合成的结果集——全程带 HUD 状态和证据门禁。

## 为什么朴素的并行 Agent 会失败

不加协调地往同一个代码库派三个 Agent，会产生：

- **重复劳动**——没人划分范围，三个都审同一批文件。
- **状态冲突**——两个 Agent 往同一棵树写冲突的改动。
- **无法核验的结果**——每个 Agent 返回的自由文本意见无法被检查。

图工程的教训直接适用：并行节点需要契约、隔离，以及一个能容忍缺失输入的合并步骤。

## 可靠模式：扇出、隔离、验证、合并

1. **划分范围**——每个 Agent 拿到有边界的任务（按模块、按路由、按风险类别）。
2. **隔离工作**——每个 Agent 在自己的 git worktree 里运行，写作者永不冲突。
3. **屏障处等待**——团队等齐所有结果；失败的 Agent 变成 `null` 而不是拖垮整个批次。
4. **过滤合并**——丢掉失败、去重发现、让合成节点基于收集到的证据写最终评审。

## 跑一次多 Agent 评审

```bash
# 1. 初始化 AIOS
aios init --all

# 2. 在独立范围上扇出三个 Agent
aios team 3:codex "评审 auth 模块：检查校验、会话处理、测试覆盖"

# 3. 跟踪状态与证据
aios team status

# 4. 行动前合并并验证
aios doctor --native --verbose
```

每个 Agent 带证据向团队 HUD 汇报；合成步骤只看被核验的结果。worker 约定与 watchdog 行为见 [Agent Team 文档](https://cli.rexai.top/zh/team-ops/)。

## FAQ

**并行 Agent 开多少个合适？**
从 2–3 个开始。并发上限由核数和任务可切分程度决定。只有子任务真正独立时，更多 Agent 才有帮助。

**一个 Agent 失败了怎么办？**
它变成失败结果而不是阻塞整批——过滤掉并重派那个节点；如果剩余节点覆盖范围，接受部分结果集也行。

**并行 Agent 需要各自的分支吗？**
worktree 隔离是安全默认：每个 Agent 有自己的 checkout，只有被接受的证据合并回去。

## 下一步

读 [Agent Team](https://cli.rexai.top/zh/team-ops/) 看完整命令面，或读[并行编码 Agent 文章](https://cli.rexai.top/zh/blog/2026-08-parallel-coding-agents/)看"worktree 隔离文件但不隔离状态"的实战笔记。
