---
title: "v5.15.0：Pi 获得真正的 MCP 能力"
description: "AIOS v5.15.0 为 Pi 扩展新增只读 aios_codemap_search 工具，在 install 时把 AIOS 托管的 MCP servers 桥接进 Pi，并给 skills doctor 的旧布局告警配上了安全的清理路径。"
date: 2026-09-14
tags: ["AIOS", "Pi", "MCP", "codemap", "release", "v5.15.0"]
---

# v5.15.0：Pi 获得真正的 MCP 能力

v5.14.0 把 Pi 变成 AIOS 的一等客户端，但还差一块：Pi 核心没有 MCP 面，其他客户端通过 MCP 拿到的结构化代码与记忆工具，Pi 都看不见。v5.15.0 补上这块，并收尾两个小遗留。

## Pi 扩展内置 codemap 检索

Pi 扩展新增只读 `aios_codemap_search` 工具，复用所有客户端共用的 `search --source code` 路径。Pi agent 编辑代码前可以直接查文件、符号与调用者；install/update 自动带到用户侧，无需额外步骤。

## MCP 桥接：servers 写进 Pi 全局 mcp.json

`aios init --agent pi` 现在会安装 pinned 的 MCP-client 适配器扩展，并把 AIOS 托管的 servers 播种到 Pi 全局 `mcp.json`：`code-review-graph` 优先，已知项目根时追加跟随会话的 `aios-memory`。三条安全规则由合并逻辑本身保证，不靠提示词：

- 用户编辑过的 server 永不覆盖——保留并报名字；
- `mcp.json` 非法 JSON 时 fail-closed，不重写文件；
- 网络失败降级为告警——离线机器仍有扩展和项目级 `.mcp.json` 路径。

## 与 doctor 告警配对的清理

skills doctor 此前会对旧布局残留告警（旧版本把 AIOS 托管 skill 写进共享 `~/.agents/skills` 根，导致 Pi 同名扫描冲突）。v5.15.0 补上配对清理：`removeLegacySharedRootInstalls` 只删除带 AIOS `managedBy` metadata 的目录，用户自有 skill 永不触碰，支持 dry-run 预览——只列出会删什么，不落盘。

## 升级

重新执行 `aios init --agent pi`（或 `aios update`）即可拿到适配器与播种的 servers。安装包可从 v5.15.0 release assets 获取；更新日志提供中英日韩四种语言。
