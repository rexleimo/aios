# Context Registry Architecture

## 1. Current Architecture (Before)

### 1.1 Overall Runtime Flow

```
USER types: claude / codex / gemini / opencode
  │
  ▼
┌──────────────────────────────────────────────────────┐
│  scripts/contextdb-shell-bridge.mjs    (867 lines)    │
│                                                       │
│  1. Parse args (agent, command, passthrough)          │
│  2. Detect workspace root (git root)                  │
│  3. Detect runner (ctx-agent.mjs)                     │
│  4. Check: blocked subcommand? wrap mode?             │
│  5. Interactive? → build auto-prompt (routing policy) │
│  6. Decision: WRAP or PASSTHROUGH?                    │
└──────────┬──────────────────────────┬────────────────┘
           │ WRAP                     │ PASSTHROUGH
           ▼                          ▼
  ┌─────────────────────┐    ┌──────────────────┐
  │  ctx-agent.mjs       │    │  direct spawn    │
  │  (2229 lines)        │    │  codex / claude  │
  │                      │    │  gemini / opencode│
  │  Build context:      │    └──────────────────┘
  │  ├ memoryPrelude     │         (no ContextDB)
  │  │  ├ persona        │
  │  │  ├ user profile   │
  │  │  ├ workspace mem  │
  │  │  └ perception     │
  │  ├ persistenceInstr  │
  │  ├ contextText       │  ← full ContextDB packet
  │  │   (session events,│    (20KB if existing)
  │  │    checkpoints,   │
  │  │    handoff)       │
  │  └ taskRouterGuide   │
  │                      │
  │  Total: ~30KB        │
  │  Inject via:         │
  │  --append-system-prompt (claude)
  │  --prompt prefix (others)  │
  │                      │
  │  Launch agent:       │
  │  claude / codex /    │
  │  gemini / opencode   │
  │                      │
  │  Register save guard │
  │  (exit handler)      │
  └─────────────────────┘
```

### 1.2 What Gets Injected (~30KB total)

| Layer | Content | Size | Source |
|-------|---------|------|--------|
| memoryPrelude.persona | Agent identity (SOUL.md) | ~0.4KB | `~/.aios/SOUL.md` |
| memoryPrelude.user | User preferences (USER.md) | ~0.4KB | `~/.aios/USER.md` |
| memoryPrelude.workspace | Pinned memos + recent notes | ~4KB | `memory/workspace-memory/` |
| memoryPrelude.perception | XHS analytics + strategy | ~3KB | Workspace memory |
| persistenceInstructions | How to use aios memo | ~0.5KB | Hardcoded in ctx-agent-core |
| contextText (if session exists) | Full session events + checkpoints | ~20KB | ContextDB session |
| taskRouterGuide | Routing policy + commands | ~2KB | Hardcoded + dynamic |
| Agent config file | CLAUDE.md / AGENTS.md / GEMINI.md | ~13KB | Project root |

**Total system prompt before user sees anything: ~44KB → ~12K tokens**

### 1.3 Per-Client Path

```
               bridge intercepts
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
     claude       codex        gemini     opencode
        │            │            │           │
        ▼            ▼            ▼           ▼
   ctx-agent    ctx-agent    ctx-agent    ctx-agent
   inject via   inject via   inject via   inject via
   --append-    prompt       prompt       prompt
   system-      prefix       prefix       prefix
   prompt
        │            │            │           │
        ▼            ▼            ▼           ▼
   CLAUDE.md    AGENTS.md    (none)      (none)
   auto-read    auto-read    no auto-    no auto-
                             read file   read file
```

Key asymmetry: **Claude and Codex auto-read a config file; Gemini and OpenCode don't.**

### 1.4 Save Guard (How sessions persist)

```
Agent exits
  │
  ▼
process.on('exit') in ctx-agent.mjs
  │
  ▼
spawn: node ctx-agent.mjs --checkpoint-status completed
  │
  ▼
Writes checkpoint to ContextDB session
```

**Problem**: save guard only fires when running through ctx-agent wrapper. Direct `claude` invocation = no save guard.

---

## 2. Target Architecture (After)

### 2.1 Overall Runtime Flow

```
USER types: claude / codex / gemini / opencode
  │
  ▼
┌──────────────────────────────────────────────────────┐
│  scripts/contextdb-shell-bridge.mjs  (THINNED ~150L) │
│                                                       │
│  1. Detect workspace root                             │
│  2. Check: blocked subcommand? → passthrough          │
│  3. Write index.json (session ID, status, sources)    │
│  4. Check: marker exists in config file?              │
│     ├ YES → passthrough (agent self-manages)         │
│     └ NO  → inject ~200 bytes pointer + passthrough  │
│  5. Register save guard if agent lacks hooks          │
└──────────┬────────────────────────────────────────────┘
           │ (almost always passthrough)
           ▼
  ┌──────────────────────────────────────┐
  │  Agent starts                         │
  │  Reads its config file:               │
  │  ├ Claude:  CLAUDE.md                 │
  │  ├ Codex:   AGENTS.md                 │
  │  ├ Gemini:  GEMINI.md                 │
  │  └ OpenCode: AGENTS.md                │
  │                                       │
  │  Config contains:                     │
  │  <!-- AIOS: memory/context-db/index.json -->  │
  │                                       │
  │  Agent reads index.json → sees:       │
  │  {                                    │
  │    "session": "xxx",                  │
  │    "status": "blocked",               │
  │    "sources": [                       │
  │      {"id":"handoff", "cost":"1KB",   │
  │       "path":"...", "tags":["cont"]}, │
  │      {"id":"perception","cost":"3KB", │
  │       "path":"...","tags":["xhs"]},   │
  │      ...                              │
  │    ]                                  │
  │  }                                    │
  │                                       │
  │  Agent decides what to load based     │
  │  on the user's task.                  │
  │                                       │
  │  Coding task → handoff only           │
  │  XHS task   → handoff + perception   │
  │  Debug task → handoff + history      │
  └──────────────────────────────────────┘
```

### 2.2 What Gets Injected (~200 bytes)

```
Session: claude-code-xxx | Status: blocked
Index: memory/context-db/index.json
Task: <user's actual prompt>
```

That's it. Everything else is on disk, loaded on demand by the agent.

### 2.3 Context Registry (index.json)

```json
{
  "session": "claude-code-20260306T012122-6dd38e48",
  "status": "blocked",
  "updated": "2026-05-15T08:00:00.000Z",
  "sources": [
    {
      "id": "handoff",
      "cost": "~1KB",
      "priority": "high",
      "path": "memory/context-db/sessions/xxx/handoff.json",
      "description": "Previous session intent, progress, blockers, next actions",
      "tags": ["continuity", "all-tasks"]
    },
    {
      "id": "workspace-memory",
      "cost": "~2KB",
      "priority": "medium",
      "path": "memory/workspace-memory/default/pinned.md",
      "description": "Pinned memos and recent workspace notes",
      "tags": ["memory", "workspace"]
    },
    {
      "id": "perception",
      "cost": "~3KB",
      "priority": "low",
      "path": "memory/context-db/exports/latest-perception.md",
      "description": "XHS content analytics and strategy recommendations",
      "tags": ["analytics", "xhs"]
    },
    {
      "id": "task-router",
      "cost": "~2KB",
      "priority": "medium",
      "path": "memory/context-db/exports/latest-router.md",
      "description": "AIOS task routing guide with trigger commands",
      "tags": ["routing", "aios", "all-tasks"]
    },
    {
      "id": "session-history",
      "cost": "~20KB",
      "priority": "low",
      "path": "memory/context-db/exports/latest-claude-code-context.md",
      "description": "Full session events, checkpoints, and assistant responses",
      "tags": ["history", "debugging"]
    }
  ]
}
```

### 2.4 Per-Client Closure (How each completes the business loop)

```
                    Claude          Codex         Gemini        OpenCode
                    ──────          ─────         ──────        ────────
Config file:        CLAUDE.md       AGENTS.md     GEMINI.md     AGENTS.md
Auto-read by agent: ✅ YES          ✅ YES        ✅ YES        ✅ YES

aios init writes:   CLAUDE.md       AGENTS.md     GEMINI.md     AGENTS.md
  (adds marker)     + settings.json               + settings.json

Hook support:        ✅ Stop        ❌ none       ✅ Stop        ❌ none
Save guard via:      hook           bridge        hook          bridge

After aios init:
  Daily coding:      no bridge      bridge for    no bridge     bridge for
                     needed         save guard    needed        save guard
                     
  Team/Harness:      ctx-agent      ctx-agent     ctx-agent     ctx-agent
                     (always)       (always)      (always)      (always)
```

### 2.5 Session Lifecycle (Cross-Client)

```
Session 1 Start
  ├─ bridge writes index.json
  ├─ agent reads CLAUDE.md → sees marker
  ├─ agent reads index.json → "no prior session, fresh start"
  ├─ agent works on user's task
  └─ agent exits
       ├─ Claude/Gemini: Stop hook → writes checkpoint + handoff
       └─ Codex/OpenCode: bridge exit handler → writes checkpoint + handoff

Session 2 Start (next day, user opens new terminal)
  ├─ bridge writes index.json (updated with new session ID, same continuity)
  ├─ agent reads CLAUDE.md → sees marker
  ├─ agent reads index.json → sees handoff source
  ├─ agent reads handoff.json → "Continue from previous state. Blocked on X."
  ├─ agent picks up where Session 1 left off
  └─ ...
```

---

## 3. What Changes

### 3.1 Files to Create

| File | Purpose |
|------|---------|
| `scripts/lib/contextdb/context-registry.mjs` | Build/write index.json, resolve sources |
| `scripts/aios-init.mjs` | `aios init` command entry point |
| `memory/context-db/index.json` | Context registry (written by bridge, read by agents) |

### 3.2 Files to Modify

| File | Change |
|------|--------|
| `scripts/contextdb-shell-bridge.mjs` | Thin from 867L to ~150L: remove full context building, remove buildInteractiveAutoPrompt, keep workspace detection + index writing + passthrough logic |
| `scripts/ctx-agent-core.mjs` | Remove from injection chain: buildMemoryPrelude, buildPersistenceInstructions, buildTaskRouterGuide, buildInteractiveRouteAutoPrompt. Keep: facade/index generation, routing orchestration. |
| `AGENTS.md` | Add "Context System" section teaching agents how to use the registry |
| `CLAUDE.md` | Deduplicate vs AGENTS.md, keep Claude-specific MCP patterns only |
| `.gemini/AIOS.md` | Deprecated: Gemini now reads GEMINI.md. Content migrated there. |
| `.opencode/AIOS.md` | Deprecated: OpenCode reads AGENTS.md. Content migrated there. |

### 3.3 What Gets Removed

| Function | Reason |
|----------|--------|
| `buildMemoryPrelude()` injection path | Moved to registry sources (on-disk, pull) |
| `buildPersistenceInstructions()` | Moved to AGENTS.md (static knowledge) |
| `buildTaskRouterGuide()` | Moved to AGENTS.md (static knowledge) |
| `buildInteractiveAutoPrompt()` | Moved to AGENTS.md (static knowledge) + index.json (dynamic routing info) |
| Full contextText injection (~20KB) | Moved to registry source (on-disk, pull) |

---

## 4. aios init — One Command

用户只需一条命令，所有初始化一次性完成。现在散落在 bridge/ctx-agent 各处的 init 逻辑全部收拢。

### 4.1 当前初始化分散在哪里

| 初始化步骤 | 当前位置 | 触发时机 |
|---|---|---|
| workspace 创建 + skill index 构建 | `ctx-agent-core.mjs` → `initWorkspace()` | 每次 bridge 启动 |
| persona 层初始化 | `ctx-agent-core.mjs` → `ensurePersonaLayer()` | 每次 bridge 启动 |
| user profile 层初始化 | `ctx-agent-core.mjs` → `ensurePersonaLayer('user')` | 每次 bridge 启动 |
| workspace memory session | `ctx-agent-core.mjs` → `ensureWorkspaceMemorySession()` | 每次 bridge 启动 |
| facade 生成 | `ctx-agent-core.mjs` → `generateFacadeFromSession()` | 每次 bridge 启动 |
| bootstrap task 创建 | `ctx-agent-core.mjs` → `ensureBootstrapTask()` | 首次运行 |
| ContextDB init event | `ctx-agent-core.mjs` → `ctx(workspace, 'init', [])` | 每次 bridge 启动 |
| marker 写入 agent 配置 | 无（本次新增） | — |
| hook 配置写入 | 无（本次新增） | — |

**问题**：每次 bridge 启动都跑一遍 memory layer init，但这是一次性操作。

### 4.2 合并后的 aios init

```
aios init                     # 检测环境，初始化所有
aios init --agent claude      # 只初始化指定 agent
aios init --all               # 强制所有四个
aios init --dry-run           # 预览会做什么，不实际写入
```

**一次性操作：**
1. Workspace 创建 + skill index 构建
2. Persona / user profile 层初始化
3. Workspace memory session 创建
4. Bootstrap task 创建（首次）
5. Marker 写入 agent 配置文件（CLAUDE.md / AGENTS.md / GEMINI.md）
6. Hook 配置写入 settings.json（Claude/Gemini）
7. 幂等：重复运行不会重复写入

### 4.3 bridge 彻底解放

```
现在: bridge 每次启动跑 initWorkspace + ensureMemoryLayers + ensureBootstrapTask + ...
以后: aios init 跑过一次后，bridge 只做:
  1. 检测 workspace
  2. 写 index.json
  3. 透传
```

---

## 5. User-Facing Changes

### 5.1 新用户上手

```
npm install -g rex-cli
cd my-project
aios init              # 一次性
claude                 # bridge 检测到 marker，透传，秒启动
```

### 5.2 存量用户迁移

```
cd existing-project
aios init --dry-run    # 先看看会改什么
aios init              # 执行
claude                 # 日常使用不变，但启动从 5 分钟变 3 秒
```

`aios init` 只在配置文件**头部加一行 marker**，不动其余内容：

```markdown
<!-- AIOS: memory/context-db/index.json -->
# 用户原有的内容...
```

### 5.3 行为变化

| 场景 | 现在 | 以后 |
|---|---|---|
| 首次启动等待 | ~5 分钟（注入 30KB） | ~3 秒（注入 200 bytes） |
| 会话连续性 | 自动注入 handoff | agent 按需读 index.json → handoff |
| 感知数据 | 每次都注入（干扰 coding） | agent 只在相关任务时读取 |
| 跨 agent 记忆 | 各自独立 | 共享同一套 ContextDB |
| 不用 bridge 直接 `claude` | 无 ContextDB | agent 自读 CLAUDE.md → index.json |

---

## 6. Documentation Plan

### 6.1 新增 / 更新

| 文档 | 内容 | 受众 |
|---|---|---|
| `docs-site/getting-started.md` | 加入 `aios init` 步骤 | 新用户 |
| `docs-site/contextdb.md` | Context Registry 架构、index.json 格式 | 进阶用户 |
| `AGENTS.md` | 新增 "Context System" 章节 | Agent（四个客户端共享） |
| `CLAUDE.md` | 精简去重，只保留 Claude 特有 MCP 模式 | Claude Code |

### 6.2 不需要改的

- `docs-site/debug-hub.md` — debug-hub 独立于 ContextDB 注入
- `docs-site/solo-harness.md` — harness 仍走 ctx-agent
- `docs-site/model-router.md` — model-router 独立于上下文注入

---

## 7. Implementation Plan

### Phase 1: Foundation

| # | 任务 | 产出 |
|---|---|---|
| 1.1 | 创建 `scripts/lib/contextdb/context-registry.mjs` | writeIndex(), readIndex(), resolveSources() |
| 1.2 | 创建 `scripts/aios-init.mjs` | aios init CLI，合并所有 init 逻辑 + marker 写入 + hook 配置 |
| 1.3 | 更新 `AGENTS.md` | 新增 "Context System" 章节 |
| 1.4 | 写 `memory/context-db/index.json` 模板 | 首次 bridge 运行自动生成 |

### Phase 2: Bridge 瘦身

| # | 任务 | 产出 |
|---|---|---|
| 2.1 | bridge 新增 writeIndex() 调用 | 每次启动写 index.json |
| 2.2 | bridge 新增 marker 检测 | 检测到 marker → 跳过注入，透传 |
| 2.3 | bridge 去掉 buildInteractiveAutoPrompt | 删除函数及调用 |
| 2.4 | bridge 保留：workspace 检测 + passthrough + save guard（仅 Codex/OpenCode） | bridge ~150L |

### Phase 3: ctx-agent-core 清理

| # | 任务 |
|---|---|
| 3.1 | 移除注入链路上的 buildMemoryPrelude 调用 |
| 3.2 | 移除 buildPersistenceInstructions 注入 |
| 3.3 | 移除 buildTaskRouterGuide 注入 |
| 3.4 | 保留：facade 生成、routing orchestration、oneshot context packet |

### Phase 4: 清理与文档

| # | 任务 |
|---|---|
| 4.1 | `.gemini/AIOS.md` → 内容迁移到 `GEMINI.md`，旧文件标记 deprecated |
| 4.2 | `.opencode/AIOS.md` → 内容迁移到 `AGENTS.md`，旧文件标记 deprecated |
| 4.3 | `CLAUDE.md` 精简（去重 AGENTS.md） |
| 4.4 | 更新 `docs-site/` 所有相关文档 |
| 4.5 | `CHANGELOG.md` + 发版说明 |

### Phase 5: 验证

| # | 任务 |
|---|---|
| 5.1 | 新用户路径：install → aios init → claude 秒启动 |
| 5.2 | 存量用户路径：aios init → 原有工作流不受影响 |
| 5.3 | 4 agent 全场景：交互、oneshot、team、harness |
| 5.4 | 性能对比：启动延迟 before/after，注入量 before/after |
