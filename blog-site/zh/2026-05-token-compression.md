---
title: "Token 压缩：把几个月的 Agent 记忆塞进一个 Prompt"
description: "ContextDB 现在能在 token 预算内压缩你的 agent 历史记录——保留重要的，丢弃不重要的。"
date: 2026-05-12
tags: ["ContextDB", "token compression", "AI 记忆", "RexCLI"]
---

# Token 压缩：把几个月的 Agent 记忆塞进一个 Prompt

AI agent 记忆存在一个矛盾：你希望 agent 记住所有事，但 AI 模型能一次性处理的文本量有严格限制。历史越多，能塞进去的就越少。

**Token 压缩解决了这个问题。** 它保留重要内容，压缩其余部分，让你的历史记录适应你控制的预算。

## 一张图看懂问题

```
你的 agent 完整历史：50,000 tokens
    ↓
AI 模型的上下文窗口：4,000 tokens
    ↓
没有压缩时会发生什么：只有最后 4,000 tokens 活下来
    （更早的一切都消失了——包括重要决策和错误）
```

老方法是**尾部窗口**——只保留最近的事件，丢弃其他所有内容。可预测，但浪费：它可能丢掉昨天的一个关键错误，却保留了 5 分钟前的一段冗长日志。

## 压缩怎么工作

新方法更聪明：

1. **保留**重要内容：错误、决策、文件路径、最近状态
2. **压缩**噪音内容：重复日志、堆栈跟踪、冗长输出
3. **丢弃**低优先级内容——只有在压缩不够时才这么做

```bash
npm run contextdb -- context:pack \
  --session <id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
```

### 结果

以前是这样：
```
❌ 老方法：保留最近 20 条事件 → 第 5 条事件里的关键 bug 丢了
```

现在是这样：
```
✅ 新方法：保留全部 80 条事件，压缩噪音 → 那个 bug 还在
```

## 三种策略

| 策略 | 什么时候用 | 做什么 |
|---|---|---|
| `balanced` | 默认 | 压缩噪音，保留信号。日常使用最佳。 |
| `aggressive` | 极小预算 | 在紧张限制下最大化压缩。 |
| `legacy` | 兼容性 | 旧的尾部窗口行为。只在需要时使用。 |

**从 `balanced` 开始。** 90% 的场景它都是正确选择。

## 什么会被保护

这些内容**永远不会被丢弃**：

- 错误信息和失败信号
- 文件路径和命令输出
- 最近状态和决策
- 下一步行动信号

这些内容**优先被压缩**（缩短，不一定会丢弃）：

- 重复的日志行
- 堆栈跟踪
- 冗长的工具输出

数据包包含遥测信息，你可以看到确切发生了什么：多少 token 是原始的，多少被压缩了，多少事件被丢弃了。

## 什么时候最需要它

Token 压缩在这些场景下大放异彩：

- 拥有数月历史的**长期项目**
- 共享同一个 ContextDB 的**多个 agent**
- 产生大量日志的**过夜 harness 运行**
- 需要紧凑上下文时**在 agent 之间切换**

它与懒加载启动配合得特别好——你的 agent 以一个微小摘要瞬间启动，只在需要时才加载压缩后的完整历史。

## 试试看

```bash
npm run contextdb -- context:pack \
  --session <你的-session-id> \
  --token-budget 1200 \
  --token-strategy balanced \
  --out memory/context-db/exports/compressed.md
```

然后检查输出——你会看到节省了多少 token 的汇总。

---

*Token 压缩已内置在 [ContextDB](https://cli.rexai.top/zh/contextdb/) 中，是 [RexCLI](https://cli.rexai.top) 的一部分。不需要额外工具。*
