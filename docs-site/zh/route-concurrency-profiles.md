---
title: 路由与并发档位
description: 用最少变量选择 AIOS 的交互路由与并发执行配置。
---

# 路由与并发档位

如果你不想记很多环境变量，只想快速选一个“可用档位”，用这一页就够了。

## 核心变量

- `CTXDB_INTERACTIVE_AUTO_ROUTE`：是否开启交互自动路由（`single/subagent/team/harness`）
- `CTXDB_CODEX_DISABLE_MCP`：包装后的 `codex` 是否跳过 MCP 启动（`1` = 启动更快，但该次会话不使用 MCP 工具）
- `CTXDB_HARNESS_PROVIDER`：注入的 `harness` 路由使用哪个 provider（`codex|claude|gemini|opencode|hermes|grok|hermes|grok`；默认当前 CLI）
- `CTXDB_HARNESS_MAX_ITERATIONS`：注入的 `harness` 路由迭代预算（默认 `8`）
- `CTXDB_TEAM_WORKERS`：`aios team ...` 的并行 worker 数
- `AIOS_SUBAGENT_CONCURRENCY`：`aios orchestrate --execute live` 的并行执行数，以及 GroupChat 每轮并行 speaker 数（默认 `3`）
- `aios work`：一条命令并行调度——默认 live（并发 `3`，走 `AIOS_SUBAGENT_CONCURRENCY`），`--serial` 强制 `1`，`--dry-run` 预览 DAG
- `AIOS_SUBAGENT_TIMEOUT_MS`：live 执行中每个 agent turn 的超时毫秒数（默认 `600000` = 10 分钟）
- `AIOS_ALLOW_UNKNOWN_CAPABILITIES`：跳过 live 执行的能力预检门禁（`1` = 接受风险）

## 推荐档位

### 1) 默认均衡（推荐）

```bash
export CTXDB_INTERACTIVE_AUTO_ROUTE=1
export CTXDB_CODEX_DISABLE_MCP=1
export CTXDB_HARNESS_MAX_ITERATIONS=8
export CTXDB_TEAM_WORKERS=3
export AIOS_SUBAGENT_CONCURRENCY=3
export AIOS_SUBAGENT_TIMEOUT_MS=600000
```

适合日常开发：保留并发吞吐，同时减少 MCP 冷启动卡顿。

### 2) 高吞吐

```bash
export CTXDB_INTERACTIVE_AUTO_ROUTE=1
export CTXDB_CODEX_DISABLE_MCP=1
export CTXDB_HARNESS_MAX_ITERATIONS=12
export CTXDB_TEAM_WORKERS=4
export AIOS_SUBAGENT_CONCURRENCY=4
```

适合任务域较独立、需要更高并发时使用。若冲突/重试明显增多，建议回退到 `3 + 3`。

### 3) 调试稳态

```bash
export CTXDB_INTERACTIVE_AUTO_ROUTE=0
export CTXDB_CODEX_DISABLE_MCP=1
export CTXDB_HARNESS_MAX_ITERATIONS=4
export CTXDB_TEAM_WORKERS=1
export AIOS_SUBAGENT_CONCURRENCY=1
```

适合故障排查和稳定复现，减少并发噪音。

## 一键切换别名（可选）

```bash
alias rex-par3='export CTXDB_INTERACTIVE_AUTO_ROUTE=1 CTXDB_CODEX_DISABLE_MCP=1 CTXDB_HARNESS_MAX_ITERATIONS=8 CTXDB_TEAM_WORKERS=3 AIOS_SUBAGENT_CONCURRENCY=3'
alias rex-par4='export CTXDB_INTERACTIVE_AUTO_ROUTE=1 CTXDB_CODEX_DISABLE_MCP=1 CTXDB_HARNESS_MAX_ITERATIONS=12 CTXDB_TEAM_WORKERS=4 AIOS_SUBAGENT_CONCURRENCY=4'
alias rex-debug='export CTXDB_INTERACTIVE_AUTO_ROUTE=0 CTXDB_CODEX_DISABLE_MCP=1 CTXDB_HARNESS_MAX_ITERATIONS=4 CTXDB_TEAM_WORKERS=1 AIOS_SUBAGENT_CONCURRENCY=1'
```

然后执行：

```bash
rex-par3
codex
```

## 说明

- 变量修改只影响**新启动会话**；请重启 `codex/claude/gemini/opencode` 生效。
- 真正控制并发数的是 `CTXDB_TEAM_WORKERS` 和 `AIOS_SUBAGENT_CONCURRENCY`，不是 `CTXDB_INTERACTIVE_AUTO_ROUTE`。
- 在 GroupChat live 模式下，`AIOS_SUBAGENT_CONCURRENCY` 控制每轮有多少 agent 并行发言。每个 agent 都可以看到之前所有轮次的完整共享对话历史。
- Harness 自触发是单 provider 循环，不是并行 team。只有当你希望注入的 harness provider 不同于当前 CLI 时，才设置 `CTXDB_HARNESS_PROVIDER`。
- `AIOS_ALLOW_UNKNOWN_CAPABILITIES=1` 会绕过 live 执行的能力预检门禁。当你信任任务范围并希望跳过 dry-run 先决要求时使用。
- 如需使用 MCP 工具（如 context7/figma），可临时启动：

```bash
CTXDB_CODEX_DISABLE_MCP=0 codex
```
