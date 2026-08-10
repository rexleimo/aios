---
title: "ContextDB 懒加载：从 5 秒启动到 Agent 自主发现"
description: "我们废弃了启动时的完整 Pack 注入，采用 <50ms 的 Facade 加载、后台异步 Bootstrap 和运行时触发编排，让 Agent 在需要时才加载记忆。"
date: 2026-04-19
tags: [ContextDB, 懒加载, Agent 记忆, AIOS, 性能]
---

# ContextDB 懒加载：从 5 秒启动到 Agent 自主发现

每次打开 AIOS 封装的 CLI 时，ContextDB 都会执行完整的 `init → session → pack → inject` 流水线。这意味着在输入第一个字符之前，你需要等待 2~5 秒。对于只想简单聊几句或修改一行的用户来说，这是不必要的摩擦。

今天我们发布了**懒加载路径**，将启动时间缩短到 50ms 以内，同时保留了按需获取完整记忆的能力。

## 问题

- **冷启动慢** — `context:pack` 每次都会重建完整的会话 Markdown
- **认知噪音** — 即使执行简单任务，也会注入大量上下文包
- **强制连续** — 每次会话都被视为前一次会话的延续，即使两者无关

## 解决方案：三层架构

### 第一层 — 启动时 Facade 提示 (<50ms)

我们不再打包整个历史记录，而是加载轻量的 `memory/context-db/.facade.json` 旁路缓存：

```json
{
  "sessionId": "claude-code-20260419T095454-e6eb600d",
  "goal": "Shared context session for claude-code on aios",
  "status": "running",
  "lastCheckpointSummary": "Browser MCP weak-model remediation complete",
  "keyRefs": ["scripts/ctx-agent-core.mjs"],
  "contextPacketPath": "memory/context-db/exports/latest-claude-code-context.md"
}
```

这会变成少于 150 个 token 的提示，通过 `--append-system-prompt` 注入：

> "本项目使用 ContextDB 管理会话记忆。最新会话：... 完整历史记录位于：... 需要先前上下文时自行加载。"

### 第二层 — 后台异步 Bootstrap

当你开始输入时，一个分离的进程会在后台重建完整的上下文包：

```
启动 ──► 加载 Facade (20ms)
    ──► 注入提示并启动 CLI
    ──► [后台] contextdb init → pack → 更新 facade
```

下次打开 CLI 时，Facade 已经是最新的，循环继续。

### 第三层 — 运行时触发编排 (A → B → C)

当 Agent 收到用户输入时，它会短路评估三个信号：

| 信号 | 检查内容 | 触发示例 |
|------|---------|---------|
| **A. 意图** | 记忆相关关键词 | "remember", "之前", "continue", "resume" |
| **B. 复杂度** | 任务结构指标 | "first do X then Y", "orchestrate a team" |
| **C. RL 策略** | 学习后的加载决策 | 未来：`rl-core` 策略模型 |

任一信号触发，Agent 就通过 `@file` 或工具使用加载完整历史 — **无需包装器介入**。

## 架构

```
┌──────────────────────────────────────┐
│  启动 (<50ms)                        │
│  1. 加载 .facade.json                │
│  2. 注入 Facade 提示                  │
│  3. 启动 CLI                         │
│  4. [后台] 异步 Bootstrap             │
└──────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────┐
│  运行时 (Agent 轮次)                  │
│  用户输入 → 意图 → 复杂度 → RL       │
│  任一 true → Agent 加载历史文件      │
└──────────────────────────────────────┘
```

## 关键设计决策

- **默认开启** — `CTXDB_LAZY_LOAD` 默认为 `1`。设置为 `CTXDB_LAZY_LOAD=0` 可恢复即时 Pack
- **保留 One-shot** — `--prompt` 模式始终使用完整即时路径（Agent 需要立即获得上下文）
- **失败开放** — 如果 Facade 缺失或过期，则从会话头部即时生成；如果异步 Bootstrap 失败，则记录警告并继续
- **无动态注入** — 当前 CLI 架构在启动时固定系统提示，因此将加载责任转移给 Agent 本身

## 变更内容

| 文件 | 作用 |
|------|------|
| `scripts/lib/contextdb/facade.mjs` | 加载 Facade JSON、验证 TTL、回退生成 |
| `scripts/lib/contextdb/async-bootstrap.mjs` | 即发即弃的 Pack + Facade 更新 |
| `scripts/lib/contextdb/async-bootstrap-runner.mjs` | 用于分离后台进程的独立 CLI 运行器 |
| `scripts/lib/contextdb/trigger/intent.mjs` | 正则/关键词意图检测 |
| `scripts/lib/contextdb/trigger/complexity.mjs` | 启发式任务复杂度评分 |
| `scripts/lib/contextdb/trigger/orchestrator.mjs` | A→B→C 短路触发评估 |
| `scripts/ctx-agent-core.mjs` | `runCtxAgent` 中的懒加载分支 |

## 验证

### 新测试
- `contextdb-facade.test.mjs` — 4 个测试（命中、缺失、过期、回退生成）
- `trigger-intent.test.mjs` — 6 个测试（回忆、继续、引用、元、中性、否定）
- `trigger-complexity.test.mjs` — 4 个测试（多步骤、跨域、编排、简单）
- `trigger-orchestrator.test.mjs` — 4 个测试（意图触发、否定抑制、复杂度触发、未触发）
- `async-bootstrap.test.mjs` — 1 个测试（Pack 后写入 Facade）
- `contextdb-lazy-load.test.mjs` — 5 个测试（辅助函数、集成）

### 回归测试
- `ctx-agent-core.test.mjs` — 现有 24 个测试全部通过，使用 `CTXDB_LAZY_LOAD=0` 退出懒加载

## 后续计划

1. **RL 策略集成** — 训练 `rl-core` 策略，使用真实奖励信号优化 "load memory?" 决策
2. **遥测** — 跟踪触发精度、加载延迟和任务完成收益，持续改进阈值
3. **模型层级预设** — 针对弱模型和强模型设置不同的触发灵敏度

---

**试试看：** 在有会话历史的项目中打开 AIOS 封装的 CLI。你应该会看到 `Context packet: (lazy-load; agent self-discovers memory)` 而不是通常的 Pack 路径。告诉 Agent "继续上次的工作"，观察它按需加载历史记录。

## 相关文档

- [ContextDB](https://cli.rexai.top/zh/contextdb/)
- [Quick Start](https://cli.rexai.top/zh/getting-started/) — 30 秒安装 AIOS
- [Workflow Policy](https://cli.rexai.top/zh/workflow-policy/) — direct / guarded / planned 路由
