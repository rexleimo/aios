---
title: ContextDB
description: How your agent remembers things across sessions — explained from the ground up.
---

# ContextDB 上下文数据库

**简述：** ContextDB 是一个本地记忆系统，为你的编码 Agent 工作。它记住过去会话中发生的事情，让你的 Agent 能够在中断处继续。

不依赖云，不依赖数据库服务器。只需项目文件夹中的文件。

## 上下文注册表（拉取式上下文）

从 v1.13 开始，ContextDB 使用**拉取式**模型。与其在每次会话启动时注入约 30KB 的上下文（需要约 5 分钟），系统现在只注入约 350 字节的**注册表指针**，然后由 Agent 按需加载所需内容。

### 工作原理

```
Agent 启动 → 读取配置文件 (CLAUDE.md / AGENTS.md / GEMINI.md)
           → 看到标记：<!-- AIOS: .aios/context-db/index.json -->
           → 读取 .aios/context-db/index.json（注册表）
           → 根据任务决定加载什么

任务："修复认证 bug"     → 加载 handoff (1KB) 保持连续性
任务："分析小红书数据"  → 加载 handoff + perception (~4KB)
任务："调试崩溃"        → 加载 handoff + session history (~20KB)
```

### 注册表索引 (index.json)

```json
{
  "session": "claude-code-20260515T...",
  "status": "running",
  "sources": [
    {"id": "handoff", "cost": "~1KB", "priority": "high",
     "path": ".aios/context-db/sessions/xxx/handoff.json"},
    {"id": "session-history", "cost": "~20KB", "priority": "low",
     "path": ".aios/context-db/exports/latest-claude-code-context.md"},
    {"id": "perception", "cost": "~3KB", "priority": "low",
     "path": ".aios/context-db/exports/latest-perception.md"}
  ]
}
```

### 新旧对比

| | 旧（推送） | 新（拉取） |
|---|---|---|
| 启动时注入 | ~30KB (~12K tokens) | ~350 bytes |
| 启动等待 | ~5 分钟 | 瞬时 |
| 上下文加载 | 每次加载所有内容 | 按需，基于任务 |
| 跨 Agent 记忆 | 每个 Agent 隔离 | 共享 ContextDB |

### 安装

```bash
aios init              # 一次性为所有已安装的 Agent 设置
```

`aios init` 命令将注册表标记添加到每个 Agent 的配置文件，并配置保存保护，以便会话自动持久化。

## 为什么这很重要？

以下是 ContextDB 解决的问题：

```
第 1 天：你和 Agent 一起开发一个功能。进展顺利。
第 2 天：你再次打开终端。你的 Agent 完全不知道昨天发生了什么。
         你不得不从头解释一切。再来一次。
```

ContextDB 解决了这个问题。当你在启用 ContextDB 的项目中启动 Agent 时，它会自动从之前的会话加载上下文。

## 工作原理（简单版）

把 ContextDB 想象成 Agent 的**实验记录本**：

1. **事件** — 每次你或 Agent 做什么，都会被记录
2. **检查点** — 在重要时刻，保存一份摘要
3. **上下文包** — 当新会话启动时，所有相关历史被打包并提供给 Agent

```
┌─────────────────────────────────────────┐
│  你的项目                               │
│  ├── .contextdb-enable                  │
│  └── .aios/context-db/                  │
│      ├── sessions/                      │  ← 记录的事件
│      ├── index/                         │  ← 搜索索引
│      └── exports/                       │  ← 上下文包
└─────────────────────────────────────────┘
```

所有内容都保存在你的项目文件夹中。不会发送到任何地方。

## 快速开始

### 为项目启用记忆

```bash
cd /path/to/your/project
touch .contextdb-enable
codex
```

就这样。从现在起，这个项目中的每个会话都会被记录。

### 会记住什么？

| 类型 | 示例 |
|---|---|
| 你发送的提示 | "重构认证模块" |
| Agent 写的代码 | 创建或修改的文件 |
| 遇到的错误 | 堆栈跟踪、构建失败 |
| 作出的决策 | "使用 Redis 进行缓存而不是 Memcached" |
| 剩余待办事项 | "仍需编写集成测试" |

### 会话如何工作

每次启动 Agent 时，ContextDB 都会创建一个新的**会话**。会话相互链接，以便 Agent 能够看到完整的历史。

会话 ID 格式：`claude-code-20260419T095454-e6eb600d`（Agent 名称 + 时间戳 + 随机 ID）。

## 使用 Memo 记忆

ContextDB 是自动的，但有时你想**手动**保存重要笔记。这就是 Memo 的用途。
项目备忘录现在使用 Git 友好的规范存储在 `.aios/memo/` 下：`file` 是默认的追加式 JSONL 后端，而 `split` 每个备忘录事件存储一个 JSON 文件。ContextDB 镜像仅用于兼容性/缓存。

### 快速 Memo 命令

```bash
# 保存关于这个项目的笔记
aios memo add "此项目使用严格的 TypeScript — 禁止 any 类型"

# 固定重要内容（始终可见）
aios memo pin add "永远不要直接推送到 main 分支"

# 搜索你的笔记
aios memo search "typescript"
aios memo search "testing"

# 检查或切换存储实现
aios memo storage status
aios memo storage use split
aios memo storage use file
aios memo storage rebuild
aios memo storage doctor
```

`aios memo storage rebuild` 是仅重建派生查询文件的完整重建；它不会重写规范备忘录记录。

### 跨会话回忆

```bash
# 从过去的会话中查找关于某个主题的笔记
aios memo recall "数据库迁移" --limit 5
```

### Persona：设置 Agent 的风格

希望你的 Agent 始终以某种方式回应？设置一个 persona：

```bash
aios memo persona init
aios memo persona add "回复风格：简洁、直接、证据优先"
aios memo persona add "总是解释 WHY，而不只是 WHAT"
```

### 用户个人资料：设置你的偏好

告诉 Agent 关于你自己的信息：

```bash
aios memo user init
aios memo user add "首选语言：zh-CN + 技术英语术语"
aios memo user add "我是一名高级工程师 — 跳过入门解释"
```

Persona 和用户个人资料是**全局的** — 它们适用于你所有项目。

## 搜索你的历史

ContextDB 构建一个搜索索引，以便你（和你的 Agent）能够找到过去的工作：

```bash
# 搜索过去的事件
npm run contextdb -- search --query "认证 bug" --project my-app

# 查看发生了什么的时间线
npm run contextdb -- timeline --session <session-id> --limit 30
```

搜索在底层使用 SQLite 进行全文搜索（FTS5 + BM25 排名）。

### 增量同步 + refs 规范化

ContextDB 在 SQLite sidecar 中维护一个规范化的 `event_refs` 表。  
`--refs` 过滤现在使用规范化 refs 精确匹配来减少来自子字符串匹配的误报。

```bash
npm run contextdb -- index:sync --stats
npm run contextdb -- index:sync --force --stats
npm run contextdb -- index:sync --stats --jsonl-out .aios/context-db/exports/index-sync-stats.jsonl
```

- `--stats`：输出 sessions/events/checkpoints 的 scanned/upserted 计数、耗时、节流跳过和强制标志。
- `--jsonl-out`：每次执行追加一条 JSON 记录（带时间戳）用于趋势分析。
- 仅当 sidecar 丢失/损坏或需要完整模式重建时才使用 `index:rebuild`。

### refs 查询性能基准

使用内置脚本监控 refs 查询延迟并运行回归门控：

```bash
cd mcp-server
npm run bench:contextdb:refs -- --events 2000 --refs-pool 200 --queries 300 --warmup 30 --json-out test-results/contextdb-refs-bench.local.json
npm run bench:contextdb:refs:ci
npm run bench:contextdb:refs:gate
```

### 可选的语义搜索

语义模式是可选的；当不可用时，它会自动回退到词汇搜索。

```bash
export CONTEXTDB_SEMANTIC=1
export CONTEXTDB_SEMANTIC_PROVIDER=token
npm run contextdb -- search --query "问题 认证" --project demo --semantic
```

## Token 压缩（保持上下文精简）

你的历史越多，上下文包就越大。Token 压缩使其可控。

### 为什么重要

AI 模型有**上下文窗口限制**。如果你的项目历史太长，它将无法容纳。Token 压缩：

1. 保留最重要的信息（最近的工作、错误、决策）
2. 压缩或删除不太重要的内容（重复的日志、冗长的输出）
3. 将所有内容压缩到你控制的预算范围内

### 如何使用

```bash
npm run contextdb -- context:pack \
  --session <id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
```

### 策略

| 策略 | 何时使用 |
|---|---|
| `balanced` | 默认。保留最近 + 重要的，压缩其余 |
| `aggressive` | 非常小的预算。最大压缩 |
| `legacy` | 旧行为。只保留末尾 |

## 延迟加载（快速启动）

上下文注册表已经默认使启动接近瞬时（~350 字节注入）。对于需要完整上下文的会话，延迟加载进一步优化：

- 启动时：只注入注册表指针
- Agent 读取注册表并按需加载所需内容
- 后台进程在需要时重建完整上下文包

延迟加载在交互式会话中默认**开启**。要强制完整上下文加载：

```bash
export CTXDB_LAZY_LOAD=0  # 启动时加载所有内容（较慢但完整）
```

当 `aios init` 已运行时，自动使用 slim 模式 — Agent 通过注册表管理自己的上下文。对于未包装的 Agent 或旧版设置，保留完整注入作为后备。

## 路由快捷方式

当你在运行中的 Agent 内部时，你可以选择如何处理任务：

| 快捷方式 | 含义 |
|---|---|
| `/single <任务>` | 在当前 Agent 中处理（默认） |
| `/subagent <任务>` | 分阶段编排与验证 |
| `/team <任务>` | 分发给多个 Agent |
| `/harness <任务>` | 长时间通宵运行 |

这些在设置期间自动安装。如果它们丢失了：

```bash
aios doctor --native --fix
```

## 高级：手动命令

## 高级：配置

| 变量 | 作用 | 默认值 |
|---|---|---|
| `CTXDB_PACK_STRICT` | 如果无法构建上下文包则失败 | `0`（警告并继续） |
| `CTXDB_LAZY_LOAD` | 启用快速启动与延迟加载 | `1`（开启） |
| `CTXDB_INTERACTIVE_AUTO_ROUTE` | 启动时显示路由快捷方式 | `1`（开启） |
| `CTXDB_HARNESS_PROVIDER` | harness 运行的默认 Agent | `codex` |
| `CTXDB_HARNESS_MAX_ITERATIONS` | harness 运行的最大循环次数 | `8` |
| `AIOS_IDENTITY_HOME` | persona/user 文件的目录 | `~/.aios` |
| `AIOS_PERSONA_MAX_CHARS` | persona 文件的最大大小 | `2400` |

## 常见问题

### ContextDB 是云数据库吗？

不是。它只是你项目 `.aios/context-db/` 文件夹中的文件。没有任何内容离开你的机器。

### 为什么在 `/new` 或 `/clear` 后上下文会消失？

这些命令重置的是**终端内对话**，但 ContextDB 仍在磁盘上。要恢复上下文：

1. 退出 Agent 并重新启动 — 包装器自动重新加载上下文
2. 或者让 Agent 读取最新的快照：`@.aios/context-db/exports/latest-*-context.md`

### 不同的 Agent 会共享相同的记忆吗？

是的。如果你在同一个项目中先运行 `codex` 然后运行 `claude`，它们读写相同的 ContextDB。Claude 会知道 Codex 之前做了什么。

### 我可以关闭它吗？

可以。只需从项目根目录删除 `.contextdb-enable`。现有数据保留在磁盘上，但新会话不会被记录。

### `.aios/context-db/` 文件夹是什么？

```
.aios/context-db/
  sessions/          # 会话文件（信息来源）
  index/             # SQLite 搜索索引（自动重建）
  exports/           # Agent 读取的上下文包
```

你可以安全地删除 `index/` — 它会自动重建。除非你想擦除历史，否则不要删除 `sessions/`。

## 下一步去哪里

- [快速开始](getting-started.md) — 如果你还没有设置
- [多 Agent 实战](team-ops.md) — 当一个 Agent 不够时
- [单 Agent 夜跑](solo-harness.md) — 让 Agent 通宵工作
- [自研 Token 压缩](token-compression.md) — 深入了解如何保持上下文精简
- [故障排查](troubleshooting.md) — 修复常见 ContextDB 问题
