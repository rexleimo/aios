---
title: "v5.8.2：计划不再抢跑，AIOS 现在原生支持 WorkBuddy"
description: "AIOS v5.8.2 修复了子代理上报成功但缺少 task id 时计划自行推进的问题，并将 WorkBuddy 接纳为完整支持的客户端——原生指令、MCP、24/24 技能，以及通过内置 codebuddy CLI 驱动 harness。"
date: 2026-08-29
tags: ["AIOS", "发布", "计划", "workbuddy", "harness", "稳定性"]
---

# v5.8.2：计划不再抢跑，AIOS 现在原生支持 WorkBuddy

v5.8.2 有两件事落地。其一是一个安静的 bug，凡是走子代理跑计划的人都被它咬过。其二是 AIOS 现在把 WorkBuddy 当成真正的客户端，而不是事后补丁。

## 计划曾经自己往前跑

如果你通过子代理运行时跑过结构化计划，你可能注意到过一个现象：*下一个*任务在你的 Agent 真正动手之前，就已经被翻成了 `in_progress`。不是"完成"——只是悄悄被标记成进行中，于是计划看起来比实际进展得更远。

根因：`syncPlanWithIterationOutcome` 在**每次** sync 时都会调用 `markPlanTaskInProgress`。子代理运行时上报成功时并不指明它完成了哪个任务（`phase-plan-sync.mjs` 会发 `{outcome:'success', ok:true}`，但没有 `taskId`）。没有可绑定的 id，旧代码就抓了下一个 pending 任务把它提升上去。修复方式：sync 现在只记录证据，并且只在收到显式 `taskId` 时才行动。谁持有 harness loop，谁来决定 `in_progress`——sync 只是看着。

我们还删掉了死代码 `hasCommitEvidence` 辅助函数，并修复了 `hasTargetFileChanges` 里的路径匹配 bug（绝对路径之前永远匹配不上）。测试：plan-runtime 5/5，全量回归 1064/0。

## WorkBuddy 现在是头等客户端

之前 WorkBuddy 只拿到了原生指令生成，链条的其余部分没有。现在端到端接上了：

- 原生工作流 / 技能生成进入 `.workbuddy/`
- MCP 配置写入 `~/.workbuddy/mcp.json`（浏览器 / shell / 鉴权 MCP 全部迁移）
- 完整的技能同步——24/24 个目录技能全部安装
- 通过内置 `codebuddy` CLI 驱动 solo-harness：`aios harness run --provider workbuddy` 会解析出该 provider 并运行

一个注意点：`codebuddy` 二进制默认不在你的 PATH 里。把它加进你的 shell 配置：

```bash
export PATH="/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin:$PATH"
```

## 升级

```bash
aios update
```

无需配置迁移。重启你的客户端，新的 plan-runtime + WorkBuddy 集成即生效。
