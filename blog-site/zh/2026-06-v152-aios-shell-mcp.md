---
title: "v1.52.0：通过 MCP 实现确定性的 Shell 输出压缩"
description: "AIOS v1.52.0 引入 aios_shell — 一个 MCP 工具，为所有 AIOS 客户端提供 99% 压缩率的确定性 shell 输出压缩，同时带来了 shim 自愈和敏感命令守卫功能。"
date: 2026-06-11
tags: ["release", "token-compression", "shell", "MCP", "multi-client", "shim"]
---

# v1.52.0：通过 MCP 实现确定性的 Shell 输出压缩

Shell 命令是 AI agent 会话中最大的不可控 token 消耗源。一次 `git diff`、一个 `find` 命令、一次测试运行，都可能向上下文窗口倾泻数万 token —— 而其中大部分是噪音。

问题不是压缩输出。引擎早在 v1.12 就能做到 99% 的压缩率。问题是**拦截**：如何让每个 shell 命令都稳定地流过压缩层，支持所有 AIOS 客户端，而不依赖宿主特定的 hook 或 PATH 劫持？

v1.52.0 用一个新的 MCP 工具回答了这个问题：`aios_shell`。

## 旧方案：Hook + Shim

在这个版本之前，shell 输出压缩依赖两种机制：

1. **原生 shim**（`~/.aios/bin/codex`）— 拦截 CLI 启动，路由到 AIOS bridge。只有在 shim 在 PATH 内且 shell 环境正确 source 时才生效。
2. **Claude PreToolUse hook** — 在执行前重写 Bash 命令。仅 Claude 可用，且只匹配白名单命令（`git`、`ls`、`cat` 等）。

两种机制都很脆弱。当 `AIOS_ROOT_DIR` 指向过期的临时目录时 shim 会失败。当 agent 使用管道、重定向或不在白名单里的命令时 hook 会跳过。对于 Codex、OpenCode、Gemini、Crush、Antigravity —— 根本没有 shell 拦截。

## 新方案：MCP Shell 工具

`aios_shell` 是一个标准 MCP 工具，以 `aios-shell` 别名注册在全部 9 个客户端配置中：

```
agent → aios_shell MCP 工具 → MCP proxy → 压缩 → compact packet
```

核心洞察：**这个工具本身不做压缩**。它只负责执行 shell 命令并返回原始输出。压缩由 MCP proxy 层（`json-rpc-proxy.mjs`）自动完成，这层已经拦截过浏览器 MCP server 的 `tools/call` 响应。压缩 `page.screenshot` 输出的同一引擎，现在也压缩 `git log` 的输出。

```bash
# 之前：原始输出淹没上下文
agent → Bash 工具 → 30638 bytes → context window

# 之后：压缩 packet，原始输出保存为 ref
agent → aios_shell → MCP proxy → 411 bytes (98.7% 压缩) + ref 召回
```

## 三层防线

此版本实现了三层独立的拦截机制。如果任意一层失效，下一层会兜底：

| 层级 | 机制 | 覆盖客户端 |
|------|------|------------|
| 1. MCP 工具 | `aios_shell` 通过 MCP proxy | 全部（MCP 协议） |
| 2. Shim + Hook | PATH 劫持 + Claude hook | Claude（hook），全部（shim 启动）|
| 3. 提示词 | AGENTS.md 引导使用 `--stat`、`--short`、`head -20` | 全部 |

## Shim 自愈

原生 shim 现在包含自愈探测流程：

1. 检查环境变量 `AIOS_ROOT_DIR`
2. 检查 baked-in 回退路径
3. 探测 `~/.rexcil/aios`
4. 探测 `~/cool.cnb/rex-ai-boot`

如果全部探测失败 —— shim 直接 `exec` 真实客户端二进制文件，不再 `exit 127` 导致进程僵死。

## 敏感命令守卫

命令重写引擎现在拦截 `git push` 和 `npm publish`，标记为"需要宿主权限审查"，不再静默允许执行。

## 验证

```bash
node scripts/aios.mjs interception proof --json
# saved_bytes: 25875, saving_ratio: 0.993, 所有客户端合规
```

```bash
node scripts/aios.mjs interception doctor --fix
# 9 个配置文件已更新，aios-shell 已注册到所有客户端
```

## 变更摘要

- 新增：`scripts/shell-mcp-server.mjs` — 独立的 shell 执行 MCP server
- 新增：`aios-shell` 别名注册到 `.mcp.json`、`.codex/config.toml`、`.gemini/settings.json`、`opencode.json`、`crush.json`
- 变更：shim 自愈机制，多路径探测 + fail-open 到真实客户端
- 变更：`git push` / `npm publish` 需宿主权限审查
- 变更：Claude PreToolUse hook 改用 envelope 包装命令，不再强制 auto-allow
