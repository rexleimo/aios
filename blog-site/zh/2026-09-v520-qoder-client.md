---
title: "v5.20.0：Qoder 加入 AIOS——第十个客户端，一个定义块"
description: "AIOS v5.20.0 将 Qoder 纳入第十个一等客户端：`.qoder/skills` 投影、写入 Qoder 真实读取的 settings.json 的 MCP 配置、AGENTS.md 原生上下文，以及 `-p` 无头 team 运行。"
date: 2026-09-19
tags: ["AIOS", "Qoder", "客户端", "agents", "MCP", "release", "v5.20.0"]
---

# v5.20.0：Qoder 加入 AIOS——第十个客户端，一个定义块

Qoder（阿里巴巴的 AI IDE，同时附带一个编码 agent CLI）现在是第十个一等 AIOS 客户端，与 codex、claude、gemini、opencode、hermes、grok、workbuddy、pi、zcode 并列。和注册表重构后的所有客户端一样，它只是 `scripts/lib/clients/core/definitions.mjs` 里的一个定义块——skills 投影、原生同步、MCP 落点、shell shim 与 doctor 门禁全部自动派生。

## 逐项实测，不靠假设

能力按 Qoder 真实读取的东西核验，而非看功能清单。skills 以 SKILL.md markdown 目录格式同步进 `.qoder/skills/`（用户级是 `~/.qoder/skills/`）——那才是 Qoder 的权威读取面；共享 `.agents/skills` 项目根仍会照例拿到 AIOS 的镜像同步，但 Qoder 是否扫描它未经验证，任何能力都不依赖它。指令文件是 AGENTS.md——AIOS 把托管块写在那里，Qoder 会加载它；QODER.md 是被接受的别名，AIOS 刻意不写。两个发行版都覆盖：国际版 CLI 是 `qoder`、主目录 `~/.qoder`；国内版是 `qoderclicn`、主目录 `~/.qoder-cn`。

## MCP 写进 Qoder 真正读取的文件

迁移器把 AIOS 托管的 server 投影到 Qoder 的真实配置文件——用户级 `~/.qoder/settings.json`、项目级 `.qoder/settings.json`，都是顶层 `mcpServers` JSON 命名空间。远程 HTTP MCP 通过 Qoder 自己的 CLI CRUD 注册（`qoder mcp add --scope user|local|project --transport stdio|sse|http|ws`），并且只在拿到可验证证据之后才报告注册成功。被 gitignore 的 `settings.local.json` 作用域确实存在，AIOS 不动它。

## team 与 harness 需要时无头运行

`aios init --agent qoder` 完成落地，自动检测无需额外提示就能找到 CLI。team 与 harness 的 spawn 路由以 `-p` print 模式无头驱动 Qoder，无人值守加 `--yolo`，结果解析用 `--output-format`（参数来自官方 CLI 文档）。doctor 与宿主能力报告把 Qoder 定在 L2（MCP 代理），与 zcode 同级：够做拦截与投影；限制也一并写明——Qoder 有宿主 hook，但 AIOS init 暂不注入，也没有声称做了轮次压缩。

## 模型路由：own

模型路由是 `own`：Qoder 的模型绑定账号，靠 `/model` 交互选择。没有经过验证的 headless `--model`，所以 AIOS 不向它转发端点——与 zcode、grok、workbuddy 保持同样的诚实状态，注册表里就记为空，而不是造一条通道。

## 升级

运行 `aios init --agent qoder`（或 `aios init --all`、`aios update`）即可投影 skills、迁移 MCP 配置并写入 AGENTS.md 托管块。随后重启 Qoder；如果会话已在运行，用 `/mcp reload` 让 MCP 变更生效。更新日志提供中英日韩四种语言。
