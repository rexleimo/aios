---
title: "Agent 安全是状态机问题：Codex 安全讨论遗漏的部分"
description: "Codex 安全讨论成为本周最大 AI 编程话题，但多数建议集中在提示注入。Agent 安全其实主要是状态机问题：激活状态原子性、并发 token 推进、evidence 真实性。v5.4.0 用写前事务、文件锁和类型化 schema 直接加固了这三处。"
date: 2026-08-02
tags: ["AI Agent 安全", "Codex", "激活状态", "并发", "evidence", "提示注入", "开发效率"]
---

# Agent 安全是状态机问题：Codex 安全讨论遗漏的部分

> **快速回答：** 本周最大的 AI 编程话题——Codex 安全讨论——拿到 500+ 赞、200+ 评论，但多数建议集中在提示注入和沙箱。这些当然重要，但日常 agent 工作流里真正咬人的失败模式是状态机问题：崩溃导致激活状态分裂、两个并发调用消费同一个 token、占位符 evidence 通过了无类型校验。Harness CLI v5.4.0 恰好加固了这三处——写前激活事务、存储文件锁、带严格 evidence-ref 校验的类型化 artifact schema。

## 大家都在讨论的那个帖子

Codex 安全帖本周登顶 Hacker News，数百条评论。关于提示注入、数据外泄和沙箱边界的讨论是健康的，但它也不完整：日常 agent 工作中人们真正遇到的攻击很少是花哨的，而是带安全后果的普通可靠性故障：

1. **状态写入中途崩溃。** 工作流以为推进了，磁盘上的文件说没有。重启后 agent 要么重复执行，要么静默丢一步。
2. **两个并发调用消费同一个 token。** 一次重试和一次定时任务竞争；两者都认为拥有这个步骤；同一个计划被推进了两次。
3. **看起来真实但实际是假的 evidence。** evidence 字段里的 `TODO` 字符串通过了非类型化 schema，计划在从未验证的声明上关闭。

这些都不是提示注入。但全部都在破坏 agent 赖以运行的*状态机*——而状态损坏正是"我说验证过了"变成"它其实从没跑过"的方式。

## 为什么状态完整性是一道安全边界

把 agent 工作流想象成状态机：计划 → 任务 → evidence → 验证 → 完成。每次转换都写状态。如果这些写入不原子、不校验，机器可以同时处于两个位置：

- **崩溃后状态分裂**——工作流日志说一件事，投影说另一件，下一次运行在错误副本上做决策。
- **并发下 token 双重消费**——两次调用都读到"当前 token = 3"，都写入"现在到 token 4"，计划的一步被静默跳过，而另一步被执行两次。
- **占位符 evidence 被当作真实证据接受**——接受任意字符串的 schema 让 `TODO: verify this` 成为任务完成的证明。

提示注入试图欺骗模型。状态损坏欺骗的是*流程本身*——而流程正是签署"完成"的一方。

## v5.4.0 实际做了什么

Harness CLI 是运行在 Claude Code、Codex、Gemini CLI、OpenCode 和 Grok Build 之上的本地优先工作流层。v5.4.0 直接加固了状态机：

### 写前激活事务

Workflow 和 Activation 投影现在通过写前事务写入（`.aios/workflow-activations/transactions/`）。写入是原子的；未完成的事务在重启时自动回滚前滚；读取会校验两个投影的一致性，不一致时失败关闭（`stale-activation-projection`），而不是信任恰好较新的那份副本。

### 推进 token 的文件锁

文件锁串行化 Command token 推进。并发调用现在收到 `AIOS_REX_STORE_BUSY`，而不是静默双重消费同一个 token——重试和定时运行可以竞争，但只有一方赢得这一步。

### 类型化 artifact schema 与严格 evidence ref

Wayfinder 和 Planning artifact 现在有类型化 schema（`wayfinder-artifact.mjs`、`planning-artifact.mjs`）：部分/受阻 artifact 不能声称拥有 Decision Ticket 或 Next Slice，Parallel Group 必须跨组唯一。Evidence ref 必须带协议前缀（`artifact:`、`receipt:`……）并拒绝 `TODO`/`TBD`/占位符值——机器拒绝在未验证声明上关闭计划。

## 早已存在的层

状态完整性是新的加固；周边门禁一直都在：

- **Privacy Guard** 在模型消费前对敏感读取脱敏（`aios privacy read --file ...`，`aios privacy status` 确认严格模式）。
- **验证门禁**把"计划了"和"验证了"分开：`verification-before-completion` 要求真实 evidence 才能关闭计划。
- **自适应工作流策略**让小改动保持 `guarded`（编辑门禁 + 聚焦验证），把有风险的多步工作升级为带持久化归属和 evidence 的 `planned`。

## 安全上手序列

```bash
aios init --all
aios doctor --native --verbose
```

阅读[工作流策略文档](https://cli.rexai.top/workflow-policy/)了解路由矩阵和验证门禁，[架构文档](https://cli.rexai.top/architecture/)了解状态如何流转，[Privacy Guard 案例](https://cli.rexai.top/case-privacy-guard/)了解安全读取敏感文件。

## FAQ

### 提示注入不是真正的威胁吗？

它是真实威胁，沙箱也很重要。但大多数采用 agent 的团队先遇到的是状态完整性失败，因为这类失败是静默且可复现的。安全讨论应该两者都包含：模型可以被欺骗，流程也可以被破坏。

### 我的编码客户端不是内部处理了吗？

客户端处理自己的会话状态。工作流层——计划、激活、evidence、验证——在客户端之外，这正是它需要自己的事务性状态的原因。这就是 v5.4.0 让其崩溃安全的部分。

### "失败关闭"对我意味着什么？

两个投影不一致时，系统停止并报告 `stale-activation-projection`，而不是基于猜测继续。你显式恢复事务，而不是事后发现某一步跑了两次或从没跑过。

### 实现细节在哪里？

[更新日志](https://cli.rexai.top/changelog/)按版本列出了 v5.4.0 加固项，发布文章[工作流迭代 v2.1](https://cli.rexai.top/blog/2026-08-v540-workflow-iteration-v21/)解释了被关闭的三类静默失败。

下一个安全头条大概还是关于提示的。真正让你损失一周的，会是那个悄悄把你的状态机推进了两次的故障。
