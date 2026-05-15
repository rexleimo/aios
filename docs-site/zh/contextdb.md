---
title: ContextDB
description: 会话模型、token 压缩上下文包、五步流程与命令示例。
---

# ContextDB 运行机制

## 快速答案（AI 搜索）

ContextDB 是面向多 CLI agent 的文件系统会话层。从 v1.13 开始，ContextDB 使用 **拉取（pull）模式**：不再每次会话启动注入 ~30KB 上下文（耗时 ~5 分钟），而是注入 ~350 字节的 **registry 指针**，agent 按需加载。

### Context Registry（上下文注册表）

```
Agent 启动 → 读取配置文件（CLAUDE.md / AGENTS.md / GEMINI.md）
          → 看到标记：<!-- AIOS: memory/context-db/index.json -->
          → 读取 memory/context-db/index.json（注册表）
          → 根据任务类型决定加载什么

任务："修 auth bug"    → 只加载 handoff（1KB）
任务："分析小红书数据"  → 加载 handoff + perception（~4KB）
任务："排查崩溃"       → 加载 handoff + 完整历史（~20KB）
```

### 之前 vs 之后

| | 之前（推送） | 之后（拉取） |
|---|---|---|
| 启动注入量 | ~30KB（~12K tokens） | ~350 字节 |
| 启动等待 | ~5 分钟 | 近乎即时 |
| 上下文加载 | 每次都全量 | 按需、任务感知 |
| 跨 agent 记忆 | 各自独立 | 共享 ContextDB |

### 初始化

```bash
aios init              # 一次性设置所有已安装的 agent
```

## 标准 5 步

运行时，ContextDB 可执行以下序列：

1. `init` - 确保 DB 文件夹和 sidecar 索引存在。
2. `session:new` 或 `session:latest` - 按 `agent + project` 解析 session。
3. `event:add` - 存储用户/model/工具事件。
4. `checkpoint` - 写入阶段摘要、状态和下一步操作。
5. `context:pack` - 导出 markdown 包供下次 CLI 调用使用。

## 交互模式 vs One-shot 模式

- 交互模式通常在启动 CLI 前运行步骤 `1, 2, 5`。
- One-shot 模式在单个命令中运行完整 `1..5`。

## 启动自动路由提示

被包装的交互式客户端（`codex`、`claude`、`gemini`、`opencode`）会收到一段保守的启动路由提示。它要求 agent 普通任务保持 `single`，只有任务明确需要更强执行通道时才自触发 AIOS 命令：

- `single`：继续在当前客户端执行。
- `subagent`：单个主域，但需要阶段编排或验证门禁。
- `team`：使用 GroupChat Runtime —— 基于轮次的并行 agent，共享对话历史并自动 re-plan。
- `harness`：明确的长任务、过夜任务、可恢复任务、checkpoint 密集目标。

## 原生路由快捷命令

`aios setup` 和 `aios update --components native` 也会安装受管理的路由快捷命令文件。需要强制指定执行通道时，可在已启动的客户端里直接输入：

| 客户端 | 快捷形式 | 受管理文件 |
|---|---|---|
| Codex | `/prompts:single <任务>`、`/prompts:subagent <任务>`、`/prompts:team <任务>`、`/prompts:harness <任务>` | `~/.codex/prompts/{single,subagent,team,harness}.md` |
| Claude Code | `/single <任务>`、`/subagent <任务>`、`/team <任务>`、`/harness <任务>` | `~/.claude/commands/{single,subagent,team,harness}.md` |
| Gemini CLI | `/single <任务>`、`/subagent <任务>`、`/team <任务>`、`/harness <任务>` | `~/.gemini/commands/{single,subagent,team,harness}.toml` |
| OpenCode | `/single <任务>`、`/subagent <任务>`、`/team <任务>`、`/harness <任务>` | `~/.config/opencode/commands/{single,subagent,team,harness}.md` |

Codex 使用自己的 custom prompt 命名空间（`/prompts:<name>`），不是顶层 `/single` 命令；OpenAI 已标记 custom prompts 为 deprecated，但目前仍可用。如果快捷命令缺失或漂移，运行 `aios doctor --native --fix`。

控制项：

```bash
export CTXDB_INTERACTIVE_AUTO_ROUTE=0      # 关闭启动路由提示
export CTXDB_HARNESS_PROVIDER=codex       # codex|claude|gemini|opencode
export CTXDB_HARNESS_MAX_ITERATIONS=8     # 注入的 harness 循环预算
```

注入的 `harness` 命令会带 `--workspace <project-root>`，确保 session artifact 写入当前项目，而不是 AIOS 安装目录。

## Fail-Open Packing

如果 `contextdb context:pack` 失败，`ctx-agent` 默认会**告警并继续运行**（不注入上下文，也不让 CLI 整体起不来）。

如果你希望打包失败直接中断（严格模式）：

```bash
export CTXDB_PACK_STRICT=1
```

注意：shell wrapper（`codex`/`claude`/`gemini`）默认会 fail-open，即便设置了 `CTXDB_PACK_STRICT=1` 也不会让交互式会话直接"起不来"。如果你希望包装层也严格执行：

```bash
export CTXDB_PACK_STRICT_INTERACTIVE=1
```

## 手动命令示例

```bash
cd mcp-server
npm run contextdb -- init
npm run contextdb -- session:new --agent codex-cli --project demo --goal "implement feature"
npm run contextdb -- event:add --session <id> --role user --kind prompt --text "start"
npm run contextdb -- checkpoint --session <id> --summary "phase done" --status running --next "write tests|implement"
npm run contextdb -- context:pack --session <id> --out memory/context-db/exports/<id>-context.md
npm run contextdb -- index:sync --stats --jsonl-out memory/context-db/exports/index-sync-stats.jsonl
npm run contextdb -- index:rebuild
```

## Workspace Memory（`aios memo`）

当你希望在 CLI 流程里维护可持续的操作员记忆时，使用 `aios memo`。
persona/user profile 是全局层：agent 的稳定人设与用户偏好可以跨项目复用，而项目事实仍留在当前项目的 ContextDB。

存储边界：

- `memo add/list/search`：在 ContextDB 的 `workspace-memory--<space>` 会话中写入/读取 memo 事件
- `memo recall`：调用 ContextDB `recall:sessions` 做跨会话项目召回
- `memo pin show/set/add`：读写 `memory/context-db/sessions/workspace-memory--<space>/pinned.md`
- `memo persona ...` 和 `memo user ...`：全局文件层（默认 `~/.aios/SOUL.md` 与 `~/.aios/USER.md`）

示例：

```bash
aios memo use release-train
aios memo add "Need strict pre-PR gate before merge #quality"
aios memo pin add "Never run destructive git commands without explicit approval."
aios memo list --limit 10
aios memo search "pre-PR" --limit 5
aios memo recall "release gate" --limit 5
aios memo persona init
aios memo persona add "Response style: concise, direct, evidence-first"
aios memo user init
aios memo user add "Preferred language: zh-CN + technical English terms"
```

### Persona / User Profile 记忆

当你希望所有被包装的 coding agent 都稳定理解“自己是谁、如何工作、服务谁”，但不想在每个项目 prompt 里重复这段设定时，使用这一层。

- `persona` 存 agent 基线：身份、人设、语气、工程标准、安全姿态。
- `user` 存用户稳定偏好：语言、交付风格、长期优先级。
- `ctx-agent` 构建 Memory prelude 的顺序是：persona、user profile、workspace memo。
- persona/user 文件在写入与注入前都会经过不安全 prompt-injection 类内容扫描。
- 每个身份文件都有容量限制，避免启动 prompt 失控。

命令：

```bash
aios memo persona init
aios memo persona set "Identity: pragmatic AI engineering partner"
aios memo persona add "Response style: concise, direct, evidence-first"
aios memo persona show
aios memo persona path

aios memo user init
aios memo user set "Preferred language: zh-CN + technical English terms"
aios memo user add "Delivery preference: implementation first, concise review second"
aios memo user show
aios memo user path
```

配置：

| 变量 | 用途 | 默认值 |
|---|---|---|
| `AIOS_IDENTITY_HOME` | 全局身份文件目录 | `~/.aios` |
| `AIOS_PERSONA_PATH` | 显式 persona 文件路径 | `~/.aios/SOUL.md` |
| `AIOS_USER_PROFILE_PATH` | 显式 user profile 文件路径 | `~/.aios/USER.md` |
| `AIOS_PERSONA_MAX_CHARS` | persona 容量限制 | `2400` |
| `AIOS_USER_PROFILE_MAX_CHARS` | user profile 容量限制 | `2400` |

## 懒加载启动（P0） {#lazy-load}

ContextDB 现在支持交互式 CLI 会话的**懒加载模式**。不再在每次启动时运行完整的 `context:pack`（2~5 秒），而是让包装器加载轻量缓存的 Facade（< 50 ms），并让 Agent 在需要时自主发现记忆。

### 工作原理

1. **快速 Facade 读取** — 启动时加载 `memory/context-db/.facade.json`（缓存的会话摘要）。
2. **精简提示词注入** — 注入一个 < 150 token 的 Facade 提示，告知 Agent：
   - ContextDB 存在
   - 完整历史记录的位置
   - 何时加载它
3. **后台 Bootstrap** — Fork 一个分离的进程，在后台异步重建完整的上下文包。
4. **运行时触发机制** — 当 Agent 收到用户输入时，按短路顺序评估三个信号：
   - **A. 意图检测** — 关键词如 "remember"、"之前"、"continue"、"resume"
   - **B. 任务复杂度** — 多步骤、跨域、orchestrate/team 类语言
   - **C. RL 策略门控** — 未来集成 `rl-core` 进行学习后的加载决策

### 启用 / 禁用

懒加载在交互式会话中**默认开启**。

```bash
# 退出（每次启动时即时打包）
export CTXDB_LAZY_LOAD=0

# 显式启用
export CTXDB_LAZY_LOAD=1
```

One-shot 模式（`--prompt`）不受此设置影响，始终使用即时路径。

### Facade JSON

Facade 旁路缓存会在每次成功打包后自动生成：

```json
{
  "version": 1,
  "generatedAt": "2026-04-19T10:00:00Z",
  "ttlSeconds": 3600,
  "sessionId": "claude-code-20260419T095454-e6eb600d",
  "goal": "Shared context session for claude-code on aios",
  "status": "running",
  "lastCheckpointSummary": "...",
  "keyRefs": ["scripts/ctx-agent-core.mjs"],
  "contextPacketPath": "memory/context-db/exports/latest-claude-code-context.md",
  "hasStalePack": false
}
```

如果 Facade 缺失或过期，将自动回退到从最新会话头信息生成新的 Facade。

## Token 压缩快速开始 {#token-compression}

当 session 历史有价值，但下一次 CLI 启动只适合注入一个有上限的上下文窗口时，使用 token 压缩。`balanced` 策略会优先保留最近事件、错误、文件路径、命令和 next action 信号；先压缩重复日志、大块输出和 stack trace；只有预算仍放不下时才丢弃低优先级事件。预算特别小时可用 `aggressive`，需要旧版尾部窗口行为时用 `legacy`。

```bash
npm run contextdb -- context:pack \
  --session <id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced \
  --out memory/context-db/exports/<id>-compressed.md
```

生成的上下文包会在 `Event Window` 行报告 `tokenBudget`、`tokenUsed`、`rawTokenUsed`、`compressed`、`dropped`、`truncated`，方便确认压缩是否先于删除事件生效。

<figure class="rex-visual">
  <img src="../assets/visual-token-compression-wireframe.svg" alt="ContextDB token 压缩线框图：原始会话历史、预算感知压缩、更小的上下文包">
  <figcaption>Token 压缩不是少记，而是先保留高信号信息、压缩噪音输出，再把更小的上下文包交给下一次 agent 运行。</figcaption>
</figure>

## 上下文包控制（P0）

`context:pack` 支持 token-aware 压缩和事件过滤。这是 AIOS 原生输入压缩，不需要安装 RTK 或 shell hook：

```bash
npm run contextdb -- context:pack \
  --session <id> \
  --limit 60 \
  --token-budget 1200 \
  --token-strategy balanced \
  --kinds prompt,response,error \
  --refs core.ts,cli.ts
```

- `--token-budget`：按估算 token 控制 L2 事件体积。
- `--token-strategy`：`legacy|balanced|aggressive`（带预算时默认 `balanced`，除非需要旧行为，否则推荐使用）。
- `balanced`：压缩重复日志、长输出和 stack trace，同时保护最新事件和高信号错误/文件路径。
- `aggressive`：在小预算下使用更严格的行数与长度限制，优先保留可回忆信号。
- `legacy`：保留旧版尾部窗口选择逻辑，不做压缩。
- `--kinds` / `--refs`：只打包匹配事件。
- 默认会对重复事件做去重。

`balanced` 会压缩重复行、堆栈噪声和低信号事件文本，同时保留关键错误、文件路径、命令信号与最新状态。上下文包会输出 `strategy`、`rawTokenUsed`、`compressed`、`dropped`、`truncated`，便于审计省 token 效果。

## 检索命令（P1）

ContextDB 提供 SQLite 支撑的 sidecar 索引检索：

```bash
npm run contextdb -- search --query "auth race" --project demo --kinds response --refs auth.ts
npm run contextdb -- timeline --session <id> --limit 30
npm run contextdb -- event:get --id <sessionId>#<seq>
npm run contextdb -- index:sync --stats
npm run contextdb -- index:rebuild
```

- `search`：按索引查询事件。
- `timeline`：合并 event/checkpoint 时间线。
- `event:get`：按稳定 ID 获取单条事件。
- `index:sync`：从真源会话文件增量同步到 sidecar 索引。
- `index:rebuild`：从 `sessions/*` 真源文件重建 SQLite 索引。
- 默认排序路径：SQLite FTS5 `MATCH` + `bm25(...)`（覆盖 `kind/text/refs`）。
- 兼容性回退：如果当前环境不可用 FTS，`search` 会自动回退到 lexical 匹配。

## 增量同步 + refs 规范化（P1.5）

ContextDB 现在在 SQLite sidecar 中维护规范化 `event_refs` 表。  
`--refs` 过滤改为基于该表做规范化 refs 精确匹配，减少字符串包含匹配带来的误命中。

```bash
npm run contextdb -- index:sync --stats
npm run contextdb -- index:sync --force --stats
npm run contextdb -- index:sync --stats --jsonl-out memory/context-db/exports/index-sync-stats.jsonl
```

- `--stats`：输出 sessions/events/checkpoints 的 `scanned/upserted` 计数、耗时、throttle skip 和 force 标记。
- `--jsonl-out`：每次同步追加一条 JSONL 记录（含时间戳），方便做趋势分析。
- 仅在 sidecar 缺失/损坏或需要完整 schema 重建时使用 `index:rebuild`。

## refs 查询性能基准

可使用内置脚本监控 refs 查询延迟并做回归门禁：

```bash
cd mcp-server
npm run bench:contextdb:refs -- --events 2000 --refs-pool 200 --queries 300 --warmup 30 --json-out test-results/contextdb-refs-bench.local.json
npm run bench:contextdb:refs:ci
npm run bench:contextdb:refs:gate
```

- `bench:contextdb:refs`：本地可调数据集基准。
- `bench:contextdb:refs:ci`：标准 CI 数据集。
- `bench:contextdb:refs:gate`：当延迟/命中率阈值不达标时返回失败。

## 可选语义检索（P2）

语义模式是可选能力；不可用时会自动回退到 lexical 检索。

```bash
export CONTEXTDB_SEMANTIC=1
export CONTEXTDB_SEMANTIC_PROVIDER=token
npm run contextdb -- search --query "issue auth" --project demo --semantic
```

- `--semantic`：请求语义重排。
- `CONTEXTDB_SEMANTIC_PROVIDER=token`：本地 token overlap 重排，不走网络。
- 未知或不可用 provider 会自动回退到 lexical 路径。
- 语义重排基于"当前 query 的 lexical 候选集"执行，而非仅按最近事件取样，避免旧但精确的命中被默认过滤。

## 存储布局

ContextDB 将真源数据保存在 session 文件中，并使用 sidecar 索引提升速度：

```text
memory/context-db/
  sessions/<session_id>/*        # 真正数据源（source of truth）
  index/context.db               # SQLite sidecar（可重建）
  index/sessions.jsonl           # 兼容索引
  index/events.jsonl             # 兼容索引
  index/checkpoints.jsonl        # 兼容索引
```

## Session ID 格式

Session ID 使用以下格式：

`<agent>-<YYYYMMDDTHHMMSS>-<random>`

这保持了时间顺序清晰，避免碰撞。

## 常见问答

### ContextDB 是云数据库吗？

不是。它默认写入当前工作区下的本地文件系统。

### 为什么我在 `codex /new` 或 `claude/gemini /clear` 后"记忆没了"？

这些命令会重置 **CLI 内部的对话状态**。ContextDB 的数据仍然在磁盘上，但包装层只会在 **启动 CLI 进程时** 注入一次 context packet。

恢复方式：

- 推荐：退出 CLI，然后在 shell 里重新执行 `codex` / `claude` / `gemini` / `opencode`（包装会重新 `context:pack` 并注入）。
- 如果必须在同一进程里继续：在新对话第一句让模型先读取最新快照：
  - `@memory/context-db/exports/latest-codex-cli-context.md`
  - `@memory/context-db/exports/latest-claude-code-context.md`
  - `@memory/context-db/exports/latest-gemini-cli-context.md`

如果客户端不支持 `@file` 引用，请把文件内容粘贴为首条消息。

### Codex、Claude、Gemini 会共享上下文吗？

会。只要它们运行在同一个已包裹工作区（优先使用同一个 git 根目录；没有 git 根目录时则使用同一个当前目录），就会共享同一份 `memory/context-db/`。

### 怎么做跨 CLI 接力？

保持同一项目会话，切换 CLI 前执行 `context:pack`。
