---
title: "Graph Engine 本地实现：AIOS 将 Loop Engineering 与图节点连接成可验证的 Agent 图"
description: "Graph Engine 本地实现：AIOS 如何把 Loop Engineering 工具箱（验证器、退出条件、状态文件）与图节点、边、共享状态、失败路由组合成可验证的 Agent 图，并对比 LangGraph、CrewAI、AutoGen 等生态。"
date: 2026-08-10
tags: ["Graph Engineering", "Loop Engineering", "AIOS", "Agent 编排", "本地优先", "Agent Harness"]
---

# 从 Loop Engineering 到 Graph Engineering：AIOS 是一个本地优先的 Agent Harness

> **快速答案：** "Loop Engineering 已死，Graph Engineering 永生"是个伪命题。Graph Engineering 实操手册自己的第一条铁律就是：**先把一个 loop 跑稳，再谈建图**。AIOS 是少见的把两层都做全的本地优先 Agent Harness——既有 loop 工具箱（验证器、退出条件、状态文件），也有图构建块（节点、边、共享状态、失败路由）。先让你把单个 loop 跑稳，等活儿真的需要时再把这些 loop 连成一张图。

两周前的热词是 Loop Engineering，这周是 Graph Engineering，已经有人喊出旧词已死。但站队之前，请注意图工程手册真正的主张：最重要的前置问题是——**你有没有一个已经跑稳的单体 loop？** 没有，就先别建图。图是循环的组织方式，不是循环的替代品。

这正是 AIOS 的位置。它是一个本地优先的 Agent Harness：躺在你现有编码客户端（`codex`、`claude`、`gemini`、`opencode`、`hermes`、`grok`）下面的一层，先让单个 Agent 循环变得可信，再给你把多个循环连成图的构件——全程数据不出本机。

## 第一层——loop 工具箱：先把一个循环跑稳

文章总结了两年来多 Agent 协作的杠杆所在：**更好的 verifier、更稳的退出条件、更干净的状态文件**。这正是 AIOS 在建图之前先做硬的三件事。

| Graph Engineering loop 工具箱 | AIOS 提供的对应物 |
| --- | --- |
| **更好的验证器** | 证据门禁——`verification-before-completion`、doctor 检查、带契约校验的测试证据。节点的产出不是 Agent 说"完了"就完了，必须过一道确定性检查。 |
| **更稳的退出条件** | [Workflow Policy](https://cli.rexai.top/zh/workflow-policy/) 按风险把每个请求分成 `direct` / `guarded` / `planned`，`aios plan auto-gate` 在运行时选路。循环按路由契约停止，而不是等预算耗尽。 |
| **更干净的状态文件** | [ContextDB](https://cli.rexai.top/zh/contextdb/) 把项目记忆（memo、checkpoint、可搜索包）落盘，pull-based——循环被杀掉也能从中断处恢复，不必重放整个会话。 |

再加一条 `aios harness run --objective "..." --worktree`，你就得到一个可中断恢复的长任务循环：它 checkpoint 状态、从最近一次被接受的证据继续、用 [git worktree](https://cli.rexai.top/zh/solo-harness/) 隔离运行中的文件。

这是"loop"那一半，也是大多数团队的现状：他们暂时不需要图——他们需要一个不会悄悄漂移的 loop。

## 第二层——图工具箱：把循环连成图

当活儿真的能拆成不同角色、有真并行的子任务、需要失败分支时，AIOS 直接提供 Graph Engineering 的四大核心构件，你不需要自己搭编排框架：

| Graph Engineering 构件 | AIOS 对应物 |
| --- | --- |
| **节点**——一个节点一个 loop，带契约 | `rex-harness` 节点：每个 Capability 跑一轮 Fact → Capability → Evidence，输入输出有边界；技能自带契约。 |
| **边**——靠检查结果选路，不靠感觉 | Workflow Policy 边：`direct` / `guarded` / `planned` 转换；`aios plan auto-gate --dry-run` 从结构化任务描述里挑边。 |
| **共享状态**——大家读写同一份数据 | ContextDB：所有节点读写同一份项目记忆（memo、checkpoint、可搜索包）。下游节点消费的就是上游节点提交的字段。 |
| **失败路由**——重试耗尽后控制权去哪 | 证据门禁与终止决策：验证失败变成明确的 `blocked` 结果，被显式路由（重规划、升级、或停止），而不是默默死循环。 |

## 免费获得的拓扑

图工程手册里最有价值的拓扑，在 AIOS 里不是概念，是命令。

- **扇出 / 扇入（`parallel()`）** → [`aios team 3:codex "..."`](https://cli.rexai.top/zh/team-ops/)：一次派出 N 个独立节点，屏障处等齐，收集完整结果集，过滤失败（这里的 `.filter(Boolean)` 也是一行）。
- **菱形：派发 → 归约 → 合成** → team 跑完后再做一步证据归约合并：HUD 汇报每个 Agent 的状态，合成节点只看到收集到的证据，永远不背所有人的完整上下文。
- **对抗式验证** → 证据审计：doctor、契约测试、验证门禁的存在意义，就是在某个"完成"声明被接受之前，专门尝试推翻它。
- **隔离（`git worktree`）** → `aios harness run --worktree`：并行写文件的 Agent 各用各的工作区，互不踩脚。
- **模型分层** → [`model-router`](https://cli.rexai.top/zh/model-router/)：有边界、会重复的活（抽取、分类）可以降到便宜档位，合成节点保留强模型——token 跟着判断力走，不跟着习惯走。
- **动态工作流（让模型自己画图）** → `aios plan auto-gate`：描述目标，拿到一份运行时选好路由的计划——这就是手册的"自我路由"一步。

## 本地优先是护城河

两种工程风格都在烧 token 和上下文。AIOS 让 loop 和图都留在本地：

- 引擎本身跑在你的机器上（没有远程 Agent 云）；
- ContextDB 记忆留在项目目录里；
- RTK / Caveman / Headroom 在进程内、本地压缩 token 流；
- 浏览器和隐私守卫也是本地运行。

图之所以可读，是因为它读写的那份状态就摆在你能看见的地方——`.aios/context-db/`、memo、证据回执——而不是躺在某个远程会话日志里。

## 结论

Loop Engineering 没有死，它变成了 Graph Engineering 的节点定义。真正的进阶路径是：稳定一个 loop → 给它定契约 → 用带条件的边连起来 → 共享状态 → 路由失败。AIOS 把这条路径做成了一个本地优先的 Agent Harness：`aios harness` 管 loop，`aios team` 和 `aios plan auto-gate` 管图，ContextDB 管共享状态，证据门禁管失败路由——全部在你已经在用的编码客户端之下。

如果你还在"一个跑不稳的 loop"阶段，就从那里开始：`aios init --all`，然后 `aios doctor --native --verbose`。等 loop 稳了，图还在原地等你。

## FAQ

**Loop Engineering 死了吗？**
没有——它变成了 Graph Engineering 的节点定义。图工程手册要求先有稳定单循环再建图，而 AIOS 正是先把那个循环做硬（验证器、退出条件、状态文件）。

**我需要建图吗？**
只有当任务能拆成不同角色、有真并行子任务、且你负担得起失败路由时，才需要。否则稳定 loop 更便宜更快——而且 AIOS 两层都给你。

**AIOS 会把数据发到云端吗？**
不会。引擎、ContextDB 记忆、token 压缩（RTK / Caveman / Headroom）、浏览器和隐私守卫全部本地运行，数据不出机器。

**怎么开始？**
先 `aios init --all`，再 `aios doctor --native --verbose`。先用一个稳定 loop 起步（`aios harness run --objective "..."`），等任务真的能拆开时再加团队（`aios team`）。完整的 Graph Engineering 映射见[架构文档](https://cli.rexai.top/zh/architecture/)。
