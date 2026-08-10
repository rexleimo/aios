---
title: "v1.50.0：统一 AIOS 搜索覆盖记忆、文档、计划和代码"
description: "AIOS v1.50.0 为所有支持的 coding client 提供统一搜索入口，覆盖项目记忆、pinned memo、文档、计划和代码，并保留作用域隔离。"
date: 2026-06-04
tags: ["release", "search", "contextdb", "memory", "multi-client", "AIOS"]
---

# v1.50.0：统一 AIOS 搜索覆盖记忆、文档、计划和代码

Agent 的智力经常不是输在模型本身，而是输在重复找上下文：计划在一个文件里，pinned memo 在另一个地方，文档没有先读，最后直接 grep 代码，却不知道当初为什么这样实现。

AIOS v1.50.0 把这条路径合并成一个搜索面。现在每个支持的客户端都可以用同一条命令搜索项目记忆、pinned memo、文档、计划和代码。

## 主命令

在仓库根目录运行：

```bash
node scripts/aios.mjs search "native client guidance" --agent codex-cli --json
```

`--agent` 很关键。它告诉 AIOS 当前是谁在搜索，这样系统可以安全地把全局项目记忆和客户端私有记忆放在同一个搜索流程里处理。

支持的 runtime client id：

- `codex-cli`
- `claude-code`
- `gemini-cli`
- `antigravity-cli`
- `opencode-cli`
- `crush-cli`

## 只搜索需要的来源

刚开始任务时可以宽搜；定位问题后，应该缩小来源范围。

```bash
node scripts/aios.mjs search "release blocker" --source memory,plans
node scripts/aios.mjs search "browser MCP" --source docs,code --limit 8
node scripts/aios.mjs search "private scratch" --scope agent_private --agent claude-code
```

可用来源包括 `memory`、`plans`、`docs`、`code` 和 `all`。

## 记忆可见性规则

v1.50.0 把“跨客户端共享”和“身份隔离”分开处理：

- `project_shared` 对所有客户端可见。
- `agent_private` 只有匹配 `--agent <runtime-client-id>` 时可见。
- 不匹配的客户端搜索不到私有记录。

所以你从 Codex 切到 Claude 或 OpenCode，不会丢掉关键的全局项目记忆；但每个客户端自己的 scratch memo 仍然保持隔离。

## 所有客户端接收同一套指令

搜索工作流会写入每个客户端实际读取的 native instruction 文件：

| Client | 指令入口 |
| --- | --- |
| Codex | `AGENTS.md` |
| Claude | `CLAUDE.md` |
| Gemini | `GEMINI.md` |
| Antigravity | `GEMINI.md` |
| OpenCode | `AGENTS.md` |
| Crush | `AGENTS.md` |

Antigravity 和 Crush 在本次发布里仍然是 live execution 的 `pending-smoke` 状态，但静态搜索指令已经通过同一份 client registry 生成和验证。

## 推荐的 Agent 使用方式

在大范围读文件之前，先问 AIOS search：

```bash
node scripts/aios.mjs search "what did we decide about search visibility" --agent codex-cli
```

然后再收窄：

```bash
node scripts/aios.mjs search "agent_private" --source memory,docs --agent codex-cli --json
```

先用记忆和文档层判断方向，再进入代码搜索。这样可以减少重复探索，也能让跨会话项目决策持续被 agent 看见。

## 资源完整性检查

发布前一起验证这些公共入口：

```bash
npm run check:site-sync
node --test scripts/tests/native-agent-guidance.test.mjs scripts/tests/client-registry.test.mjs scripts/tests/native-source-tree.test.mjs scripts/tests/search.test.mjs
git diff --check
```

如果本地安装了 MkDocs，再构建两个站点：

```bash
mkdocs build --strict
mkdocs build -f mkdocs.blog.yml --strict
```

参考文档见 [ContextDB 搜索说明](https://cli.rexai.top/zh/contextdb/#统一项目搜索v1500)。
