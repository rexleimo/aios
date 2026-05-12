---
title: "ContextDB Token 压缩：更小的上下文包，更稳的回忆能力"
description: "ContextDB context:pack 现在支持在 token 预算内先压缩噪音事件历史，再丢弃低优先级事件，并提供 balanced / aggressive 策略和打包指标。"
date: 2026-05-12
tags: ["ContextDB", "token compression", "context pack", "AI memory", "RexCLI"]
---

# ContextDB Token 压缩：更小的上下文包，更稳的回忆能力

长时间 agent 会话会留下有价值的记忆，但原始历史也会很快变贵。每一次 prompt、工具日志、stack trace、checkpoint 都原样打包，下一次 agent 启动就会为大量噪音付 token。

## 快速答案

ContextDB `context:pack` 现在支持 **token 压缩**。给它一个 token 预算和策略，它会先压缩噪音事件文本，再开始丢弃低优先级事件。最新事件、错误、文件路径、命令和 next action 信号会被优先保护，所以上下文包变小后仍然保留关键线索。

[查看官方 ContextDB 文档](https://cli.rexai.top/zh/contextdb/#token-compression){ .md-button .md-button--primary }

## 现在就用

```bash
npm run contextdb -- context:pack \
  --session <id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced \
  --out memory/context-db/exports/<id>-compressed.md
```

日常默认用 `balanced`。预算特别小时切到 `aggressive`；如果你要复现旧版尾部窗口行为，用 `legacy`。

## 这次更新改变了什么

以前有预算的上下文包更像一个尾部窗口：从最近事件开始保留，预算满了就停。这个逻辑稳定，但可能保留近期噪音输出，同时丢掉更早的高信号事件。

新的流程更细：

1. 估算候选事件窗口的原始 token 成本。
2. 在安全时压缩重复日志、大块输出和 stack trace。
3. 根据新近程度、角色、错误、文件引用、命令和 next action 给事件打分。
4. 只有压缩后仍超预算时，才丢弃低优先级事件。
5. 截断幸存事件是最后兜底。

## 策略选择

| 策略 | 适合场景 | 行为 |
|---|---|---|
| `balanced` | 日常默认 | 压缩噪音文本，同时保护最新和高信号事件。 |
| `aggressive` | 很小的 token 预算 | 使用更严格的行数和长度限制，再决定是否丢弃事件。 |
| `legacy` | 兼容性排查 | 保留旧版 tail-only 选择逻辑，不做压缩。 |

上下文包的 `Event Window` 行还会显示 `tokenBudget`、`tokenUsed`、`rawTokenUsed`、`compressed`、`dropped`、`truncated`。你可以直接看到预算是靠压缩省下来的，还是靠删除事件省下来的。

## 为什么重要

当你在 RexCLI 里跑多 agent 协作或长任务 harness 时，token 压缩特别有用。agent 仍然能看到最近失败、改过的文件和下一步行动，但不用为重复日志全量付费。

它也和懒加载启动互补：交互式会话可以先用小 facade 快速启动，真正需要深层记忆时，再加载压缩后的 context packet。

## FAQ

### 压缩会替代 ContextDB search 吗？

不会。Search 用来找特定历史事件；token 压缩用于在选定 session 窗口后，构造下一次 prompt packet。

### 重要错误会不会被压没？

默认策略会保护高信号关键词、文件路径、错误和最新事件。如果安全检查发现压缩版本丢失了太多信号，ContextDB 会保留该事件的原文。

### 团队流程里应该写哪个命令？

推荐 `--token-budget` 搭配 `--token-strategy balanced`。这是稳定默认值；需要更小预算时再改 `aggressive`，排查兼容性时再用 `legacy`。
