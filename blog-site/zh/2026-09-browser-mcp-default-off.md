---
title: "v6.1.0：浏览器 MCP 默认关闭——安装时三选一，之后随时切换"
description: "v6.1.0 不再在每台机器上自动启用浏览器 MCP。安装时你在 none / playwright / bsk 三个互斥模式中选一个，AIOS 只装配你选的那个引擎。默认是「最轻」的那个：关。"
date: 2026-09-23
tags: ["AIOS", "browser-mcp", "memory", "default-off", "release", "v6.1.0"]
---

# v6.1.0：浏览器 MCP 默认关闭——安装时三选一，之后随时切换

> **一句话速览：** 过去浏览器自动化是默认开启的——每台机器都会装配一整套浏览器 MCP，而每个客户端的浏览器 MCP 都会拉起一个 Chrome，框架还不一定放得掉。v6.1.0 把默认改成「关」：安装时你在 **`none`**、**`playwright`**、**`bsk`** 三个互斥模式里选一个，AIOS 只装配你选的那个引擎。这个选择写进你的 settings，之后一条命令就能改，而每个客户端背后的 writer 都会端到端地尊重它。因为默认是「最轻」的那个，装好之后默认就更轻、更安静。

## 问题：开了就关不掉的自动化

工作流本来就能驱动浏览器。缺的不是能力，是**成本**——以及谁为这个成本买单。

1. **从不浏览的机器也在替浏览器买单。** 浏览器 MCP 在 materialize `.mcp.json` 时默认就是开启的，所以你一旦装上 AIOS，不管你用不用，配置里都住着一个浏览器运行期。
2. **内存成本真实且在复利。** 一次排查发现，真正的大头不是那 ~75 个 agent 进程，而是 **7 个 `browser-mcp` 各自拉起的 Chrome**——每个数百 MB——却大量空闲，而你那些根本没点过页面的会话也要跟着背。
3. **死掉的客户端无法自己回收。** 交互式 `ctx-agent` 走的是 `spawnSync` 壳，它自己没法醒来去收尸。所以浏览器一旦起来，框架里没有任何机制能释放它，也没有「空闲释放」这回事。
4. **没有出口。** 想用「浏览器自动化」的人得手动去生成的配置里删——而真实用户很少这么干。

这次修复要做的，是：让浏览器变成「可选」，需要时每个 agent 依旧完全隔离运行，并给用户一个开关，而不是让他去翻配置手动删。

## v6.1.0 改了什么

### 1. 默认情况下不装浏览器 MCP

浏览器 MCP 不再在安装时自动启用，默认是 **`none`**——在你这个操作者开口之前，浏览器相关内容一个字都不写进配置。把「最重」的那个设为默认，是有意为之：你想浏览时再进，否则一分钱成本不花。

这不是「浏览器自动化 可选」，而是「浏览器自动化 必须显式」。需要时它一应俱全；不需要时，框架绝不悄悄自己打开。

### 2. 安装时三选一，三个模式互斥

安装时（或之后任何时候）你只能选一个：

| 模式 | 给你什么 | 什么时候选 |
| --- | --- | --- |
| **`none`**（默认） | 完全不装浏览器 MCP，零 Chrome、零浏览器别名。 | 绝大多数用户。浏览器是「用到的时候才去点」的工具，不是常驻。 |
| **`playwright`** | 仓库内 Node/Playwright 运行期（每个 agent 独立拉起）+ launch snippet。 | 你需要程序化的浏览器控制，以及 Playwright 给你的隔离性。 |
| **`bsk`** | 真人会话式自动化：复用你已登录的 Chrome + 浏览器扩展 + 本地 daemon。 | 你需要真人会话——有人作为真人回答请求、驱动浏览器。 |

三者由结构保证互斥——只有你选的那个引擎会被写进客户端，切换时会清掉旧的别名、移除旧条目。

### 3. 模式接缝：writer 端到端尊重你的选择

整件事建在一个所有 writer 共享的接缝 `mcp-mode.mjs` 上：

- `browserManagedServer` 对 `none` 和 `bsk` 返回 `null`，于是**浏览器别名被丢弃**、**旧条目被清除**，落到每个客户端的配置里——包括 Cod TOML、OpenCode、Hermes YAML、ZCode、Gemini，以及共享的迁移路径。
- **仅 Playwright 的运行期检查**被闸门卡住：只有 `playwright` 模式才跑。选 `none`/`bsk` 直接跳过仓库内 Node/Playwright 安装器。
- 每个 writer 都从 settings 里解析模式（`resolveBrowserMode`）并按其 materialize，所以这个选择在所有客户端里保持一致。

### 4. 一条命令随时改

模式只是 settings 里的一条数据，所以你永远不会被锁死：

```bash
aios internal browser switch playwright   # 也可以是：bsk | none
```

这条命令会对**所有客户端**重新 materialize——它跑的是安装步骤用的同一个 `mcp-migrate` 流程，所以你现有客户端一步到位换上新引擎。切到 `bsk` 时，AIOS 会打印三步引导（CLI → 装扩展并 Connect → 运行）和 `browser_*` → `bsk` 的工具映射表；切回 `playwright`，引导就消失。

### 5. BSK：只告警、绝不硬崩的连通基线

BSK 是真人会话式浏览器自动化——它通过浏览器扩展和本地 daemon 复用你已登录的 Chrome，与 Playwright 互斥。因为它要 CLI、daemon、扩展三者在同一版本上对齐，v6.1.0 提供了一个 `bsk-doctor` 去检查连通基线，而不是假装已连通：

```bash
aios internal browser bsk-doctor
```

- 它读 `bsk status --json`，把 `version_skew:false` 视为健康基线（CLI/daemon/扩展全部同版）。
- 如果 `bsk` CLI 不存在，它**只告警**（owner 动作：跑 `install.ps1 --browser bsk`）然后继续，绝不硬崩会话。
- 如果 daemon 还没连通，它会让你去点「Connect」，然后照常进行。

这是有意的：一个会硬失败的 doctor 会把「还没连」变成「硬阻塞」。浏览器 doctor 应该提醒，而不是拦你。

## 为什么这让它不只是个普通 agent

一个普通 coding agent 会在你安装的那一刻把所有能力都装上，而且装上就关不掉——Chrome 常驻、别名躺在你的配置里，还没有干净的关闭方式。AIOS 早就在跑工程流程、遵守证据契约，但**「默认装什么」从来不是一个操作者决策**——它只是默认开着。

v6.1.0 补上了这块缺口：**安装本身变成了一个决策，而不是意外。** 你选择浏览器引擎，框架只 materialize 你要的那个、其余一律不写，writer 在所有客户端里保持一致，而你想改的时候一条命令搞定。这正是「把所有东西都打开的 agent」和「只打开你要求打开的东西的 agent」之间的区别。

## 参考资料

- 安装时的提问、`switch` 命令、BSK 引导都在 `scripts/lib/components/browser/`（`mcp-mode.mjs`、`switch.mjs`、`prompt.mjs`、`bsk-writer.mjs`）。
- `bsk-doctor` 连通基线和全套测试在 `scripts/tests/bsk-writer.test.mjs`（14 个用例）加 browser/mcp writer 测试。
- 完整发布计划、范围，以及 6.1.0 的版本决策（minor → `6.1.0`）在 `docs/plans/release-6-1-0-browser-default-off-and-lighter-sessions.md`。
- 验证：57 个目标测试通过（其中接线守卫 W1–W6 保证每个新增 CLI 命令都能被真正触达），真实命令 `aios internal browser switch bsk` 会 materialize 全部九个客户端并端到端打印引导。
