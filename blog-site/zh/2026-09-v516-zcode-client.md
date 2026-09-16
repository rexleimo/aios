---
title: "v5.16.0：ZCode 加入 AIOS——并且拥有真正的子代理"
description: "AIOS v5.16.0 将 ZCode 纳入一等客户端：共享根 skills、AGENTS.md 原生上下文、team 路由、strict-schema 的 MCP 桥接，并通过 inline plugin 把 rex 角色卡安装为可执行的 ZCode 子代理；同批修复了 Pi 的能力链。"
date: 2026-09-16
tags: ["AIOS", "ZCode", "客户端", "agents", "MCP", "release", "v5.16.0"]
---

# v5.16.0：ZCode 加入 AIOS——并且拥有真正的子代理

ZCode（智谱 AI 的桌面编程应用）现在是第九个一等 AIOS 客户端。和注册表重构后的所有客户端一样，它只是 `scripts/lib/clients/core/definitions.mjs` 里的一个定义块——skills 投影、原生同步、拦截、shell shim 与 doctor 门禁全部自动派生。

## 逐项实测，不靠假设

能力按真实应用逐项核验，而非看功能清单。ZCode 原生扫描共享的 `.agents/skills` 根，所以 AIOS 投影到这里（不留重复副本）；指令文件是 AGENTS.md；team 路由用 `--mode yolo` 无头驱动捆绑 CLI。ZCode 0.16.5 确实缺两样：没有 `--model` 参数（模型路由保持为空，直到上游补上），也没有项目级子代理定义。

## 子代理从插件这扇门进来

缺失的子代理能力很要紧——直到找到 ZCode 确实有的那扇门：plugin 的 `agents/*.md` 目录会被当作可执行子代理（官方 document-skills 插件就是实证）。v5.16.0 把 rex 角色卡片物化为 `~/.aios/zcode-plugin` 下的 `aios-agents` inline plugin，并通过用户级 `plugins.dirs` 配置注册——无需 GUI 点击。`doctor:zcode-agents` 门禁报告 manifest 有效性、agent 漂移与注册状态。

## strict-schema 陷阱

ZCode 会静默丢弃带未知配置项的 MCP server。JSON 迁移器现在理解它嵌套的 `mcp.servers` 命名空间，并把三个 AIOS 托管 server 归一化到 ZCode 的 strict schema（`startupTimeoutSec` 秒 → `timeoutMs` 毫秒、字段白名单）；用户自有 server 原样保留。

## 让检测真正工作的 shim

ZCode 的 CLI 藏在应用 bundle 里、不在 PATH 上。AIOS 注册表驱动的原生 shim 加上针对捆绑 `zcode.cjs` 的启动器解决了检测与派发——`zcode --version` 经 shim 链路端到端验证。

## 本版本还包含

Pi 能力链修复：`aios-bridge` 加入播种给 Pi 的 MCP servers；harness 新增长驻 `--transport rpc` 驱动；新增 `doctor:pi-bridge` 门禁；`aios memo checkpoint` 可从 CLI 钉里程碑；Pi 项目 skills 迁移到共享 `.agents/skills` 根并配套旧布局清理。

## 升级

运行 `aios init --agent zcode`（或 `aios update`）即可投影 skills、注册 agents 插件并安装 shim。提示：无头运行 ZCode 需要先一次性执行 `zcode login`。更新日志提供中英日韩四种语言。
