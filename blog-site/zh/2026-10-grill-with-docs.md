---
title: "v6.3.0：/grill 成为真命令，盘问会自己落盘，pi 自己挑 MCP 承载"
description: "v6.3.0 补上 aihero /grill-with-docs 模式照出的两个缺口：/grill 现在真正注册进客户端、斜杠补全能找到它；rex-requirements 盘问把确认的术语和决策直接写进 CONTEXT.md 和 ADR。同一版本还让 pi MCP 桥按已装的 pi 版本自选承载，pi 0.99+ 上的 builtin/adapter 启动警告就此终结。"
date: 2026-10-01
tags: ["AIOS", "v6.3.0", "grill", "skills", "rex-requirements", "pi", "mcp", "adr", "context-md", "release"]
---

# v6.3.0：/grill 成为真命令，盘问会自己落盘，pi 自己挑 MCP 承载

> **Quick Answer：** 一个版本修两件事。第一，AIOS 的需求盘问命令 `/grill` 在工作流核心里是真的，但哪儿都没注册——没有客户端补全它，也只有 Claude Code 的 hook 在解析它。现在它是注册进七个客户端的薄 skill，而且背后的盘问纪律补上了缺的半边：确认的领域术语实时进 `CONTEXT.md` 词汇表，落定的决策变成 `docs/adr/` 下的轻量 ADR。第二，pi 0.99+ 自带内置 MCP 扩展，与单独安装的 `pi-mcp-adapter` 撞车、每次启动都打警告。安装器现在读 pi 版本自选承载：新 pi 走内置，adapter 只作旧版回退——而两者读的是同一份 `mcp.json`。

## 问题：一条打不出来的命令，一场会失忆的盘问

aihero.dev 有一篇讲 `/grill-with-docs` 的文章：agent 就方案盘问你，并把学到的东西记录下来——术语进 `CONTEXT.md`，决策进 ADR。把它对照我们自己的实现，记分并不体面。

**盘问这一半，我们早就有。** `rex-requirements` 在制作过程中内嵌盘问——一次只问一个决策性问题，每题带推荐默认值，三轮澄清预算把没人回答的线头转成记录在案的假设而不是卡死。它从来没做的是**写下来**：仓库里若有 `CONTEXT.md` 它会读，但没有任何东西会写；盘问中活下来的决策躺在易逝的计划状态里，而不是躺在未来会话不靠记忆召回成功也能看到的文档里。

**命令这一半更糟。** `/grill`——连同 `/plan`、`/spec`、`/tickets` 全家——只是一种文本约定：工作流核心里的一条正则、AGENTS.md 里的一份声明协议、Claude Code 里接好的一条 UserPromptSubmit hook。在 ZCode 里输入 `/grill`，补全什么都不会给，因为没有东西被注册过。命令族刻意做成客户端无关，代价是只有带 hook 的客户端才能确定性地看见它。

而在跑 pi 0.99+ 的机器上还有第三件烦心事：pi 在 2026-09-29 自带了内置 `mcp` 扩展，AIOS 仍在它上面装第三方的 `pi-mcp-adapter`，两者都注册 `/mcp`，pi 每次启动都打印 `[Extension issues]` 警告，然后悄悄选了 adapter。

## 改了什么

### /grill 现在是注册过的 skill

`skill-sources/grill/SKILL.md` 是一个薄入口：声明 `explicit-intent: grill`、执行 rex-requirements 流程、执行其写回规则。它刻意不含任何流程细节——两处不一致时以 rex-requirements 为准——纪律只活在一处。构建把它物化到每个仓库面（`.codex/skills`、`.claude/skills`、`.agents/skills`……），并装进 frontmatter 承诺的七个客户端家目录：zcode、codex、claude、pi、qoder、hermes、workbuddy。新开会话，输入 `/`，它就在那里。

### 盘问会自己落盘

`rex-requirements` 在「记录验收标准」和「找到第一个切片」之间新增了一步：**当场写回仓库**。你的回答一确立一个领域术语，agent 立即把它 upsert 进仓库根的 `CONTEXT.md` 词汇表——一行定义、一行为什么，你手写的内容绝不重写。一个决策熬过澄清预算、或你明确拍板，它就变成 `docs/adr/NNNN-<slug>.md`——背景、决策、后果，编号递增不重用。边界写死在规则里：记录在案的假设是未验证的，永远不变成 ADR；已裁决的决策才落。

这不是第二套记忆系统。跨会话记忆仍然走 ContextDB 车道——pull-based、强大、召不回时无声。`CONTEXT.md` 和 ADR 是互补车道：跟代码一起版本化，每个未来的 agent 和人类不用开口就能看见。不同的问题，不同的存储。

### pi 按自己的版本挑 MCP 承载

`resolvePiMcpMode()` 读 `pi --version`，pi ≥ 0.99.0 返回 `builtin`，否则返回 `adapter`——版本检测失败也落在 `adapter`，永远安全的旧路径，所以离线机器和旧版 pi 逐字节照旧。两个载体读同一份 `~/.pi/agent/mcp.json`，AIOS 托管的服务器条目与载体无关，你的服务器一个都不用动。新 pi 上安装器不再装 adapter；已装着的 adapter 只会被**报告**（`installed-conflicts`，info 级提示，附可选的 `pi remove npm:pi-mcp-adapter`）——绝不替你卸载，因为卸载会改变会话行为。`aios doctor` 同步分流，在新 pi 上不再误报「Pi 无法加载 MCP 服务器」——那里由内置扩展服务 `mcp.json`，好好的。

## 升级提示

- `/grill` 无需迁移：重跑 `aios init`（或拉取后重新同步 skill）它就出现；在那之前旧的文本约定路径照常可用。
- `CONTEXT.md` / `docs/adr/` 首次使用时创建，应当随项目一起提交——它们的价值就在于随代码版本化。
- pi ≥ 0.99.0 上的启动警告是信息级且无害，adapter 照常工作。移除它（`pi remove npm:pi-mcp-adapter`）是可选项，移除后恢复内置 MCP；找个顺手的时候看一眼 `pi mcp list` 再做。
