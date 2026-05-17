# Tool Log Offload + Mermaid Task Canvas — 设计

**日期**: 2026-05-17
**状态**: Phase 2 已实现（Claude hook + JSONL backfill），进入真实长任务观测
**灵感来源**: Tencent/TencentDB-Agent-Memory（参考竞品分析见 `docs/reports/competitor-memory-systems.md`）

## 目标

为 AIOS 增加 **工具调用日志 offload + Mermaid 任务状态图** 机制，
在长任务和会话恢复场景下显著降低 token 消耗（参考竞品在 SWE-bench 上节省 33%、WideSearch 节省 61%）。

## 不目标

- 不替换现有 ContextDB（事件流、checkpoint）
- 不引入向量数据库或外部 LLM 调用
- 不修改 PostToolUse 已展示给模型的工具输出（Claude Code 的钩子不支持回填）
- 不做"自动 L1 原子事实提取"（独立功能，留给后续迭代）

## 核心洞察

Claude Code 的 PostToolUse 钩子无法**追溯修改**当前会话已注入的工具输出。
真正的 token 节省发生在：

1. **后续会话恢复**：harness 中断后 resume 时，加载 Mermaid canvas（几百 token）
   而不是回放所有 l2-events.jsonl（数十万 token）
2. **跨 iteration 引用**：同一会话后续步骤通过 `node_id` grep 历史，
   而不是把整段历史注入上下文
3. **跨 session 知识沉淀**：refs 库可被未来会话查询

## Token 节省结论（落地口径）

这个方案能省 token，但不是魔法压缩，也不是当前轮即时省。

- **能省的场景**：resume / context-pack / 后续 recall，只加载 `task-canvas.mmd` 和少量 `node_id` 对应 refs。
- **不能省的场景**：工具输出已经进入当前对话上下文后，PostToolUse/offload 不能把已注入内容撤回。
- **节省上限**：取决于“原始工具日志大小 ÷ canvas+按需 refs 大小”。长日志越多、后续只需要少量节点时越明显。
- **失败条件**：如果恢复时仍然回放完整 `l2-events.jsonl` 或把所有 refs 全读回来，就不会省。
- **当前实现目标**：refs/canvas 基础设施、CLI recall、`context:pack` canvas-first 注入、solo harness resume prompt 注入、Claude PostToolUse hook、JSONL backfill 已落地；真实自动节省还需要确保后续恢复不再注入原始长日志。

简化估算：

```
传统恢复成本 ~= sum(raw tool outputs)
offload 恢复成本 ~= task-canvas.mmd + selected refs
token saved ~= 1 - (canvas + selected refs) / raw logs
```

例如 50 个工具输出、每个 8KB，传统恢复约 400KB；如果 canvas 约 8KB、只读取 2 个 refs 约 16KB，
恢复输入约 24KB，字符级降幅约 94%。实际 token 降幅会因语言、日志结构和读取 refs 数量变化。

2026-05-17 smoke：用 `aios canvas backfill` 写入 1 条 13,164B 原始 ref 后，
`task-canvas.mmd` 为 173B，字符级降幅约 98.7%（只看 canvas、不读取 ref 的恢复场景）。

## 当前实现状态（2026-05-17）

- 已实现：`scripts/lib/offload/*` 基础设施，支持 `file` / `split` refs 存储。
- 已实现：`aios internal offload capture` 从 stdin 捕获长工具输出。
- 已实现：`aios refs list|grep|read|prune` 与 `aios canvas show|path`。
- 已实现：会话内递增 `node_id`，Mermaid 使用安全节点 ID，并在 label 保留原始 `node_id` 方便 recall。
- 已实现：`config/settings.json` 的 `offload` 默认配置。
- 已实现：`aios-compress` / `aios-browser-compress` / `aios-long-running-harness` skill 增补，以及 `aios-offload-recall` skill。
- 已实现：`contextdb context:pack` 在存在 `task-canvas.mmd` 时注入 `Offload Canvas (L2 Index)`，不读取 raw refs。
- 已实现：solo harness loop/resume 将 offload canvas 注入下一轮 prompt，提示只用 `aios refs grep/read` 按需取证。
- 已实现：`aios init --agent claude` 注册 Claude `PostToolUse` offload capture hook。
- 已实现：`aios canvas backfill --input <events.jsonl>` 从通用 JSONL 工具日志生成 refs/canvas。
- 待实现：opencode/gemini 自动 hook 注册，以及 codex/gemini 专用历史日志适配器。
- 待验证：真实长任务恢复是否稳定避免 raw tool logs 进入未来 context。

## 架构（v2：client-agnostic + dual storage）

核心引擎与 client 解耦，每种 client 用自己的"喂入路径"调用统一入口。
存储层支持 `file` 与 `split` 双模式（与 memo storage 对齐）。

```
┌──────────────────────────────────────────────────────────────────┐
│  Tool Output 来源（任意 client）                                  │
│  ├─ claude-code    PostToolUse hook（自动）                       │
│  ├─ opencode       plugin tool.execute.after（自动）              │
│  ├─ codex-cli      ctx-agent backfill（Stop 时批量）              │
│  ├─ gemini-cli     Stop hook backfill（会话结束时）               │
│  └─ 通用兜底       模型主动调 `aios offload put` 存长输出         │
└────────────────────────────────┬─────────────────────────────────┘
                                 ▼
        scripts/aios.mjs internal offload capture
        (统一入口，从 stdin 读 JSON: {client, session, tool, input, output})
                                 ▼
        scripts/lib/offload/tool-offload.mjs (client-agnostic 引擎)
                                 │
                  ┌──────────────┴──────────────┐
                  ▼                             ▼
            node-id 生成                 storage 路由
                                              │
                                ┌─────────────┴─────────────┐
                                ▼                           ▼
                        file storage                 split storage
                  (单文件、人读优先)               (按月分目录、追加只写)
                                │                           │
                                └─────────────┬─────────────┘
                                              ▼
                              canvas 更新（共用 Mermaid 文本输出）

────────────── 查询路径（Recall，统一接口） ──────────────

  aios refs grep <pattern> [--session S]       ← 跨会话搜索
  aios refs read <node_id>                      ← 读取单个原始记录
  aios refs list [--session S]
  aios refs prune --keep-days N
  aios canvas show [--session S] [--format mmd|json]
  aios canvas path [--session S]
  aios canvas backfill --input <events.jsonl> --client <client> --session S
```

### Storage 布局

```
file storage（默认，人读优先）:
  .aios/offload/refs/<session>/<node_id>.md          ← frontmatter + 原文
  .aios/offload/canvas/<session>/task-canvas.json    ← 节点索引（每次重写）
  .aios/offload/canvas/<session>/task-canvas.mmd     ← Mermaid 文本

split storage（增量并发友好）:
  .aios/offload/split/refs/<session>/<YYYY-MM>/<node_id>.json
  .aios/offload/split/canvas/<session>/nodes.jsonl   ← 追加只写
  .aios/offload/split/canvas/<session>/task-canvas.mmd ← 由 jsonl 重生成
```

### Storage 选择优先级

1. CLI flag `--storage file|split`
2. 环境变量 `AIOS_OFFLOAD_STORAGE`
3. `config/settings.json` 的 `offload.storage`
4. `getActiveMemoStorage()` 复用 memo 的活动存储
5. 默认 `file`

### 各 client 喂入方式

| Client | 喂入方式 | 触发 |
|--------|---------|------|
| `claude-code` | `PostToolUse` hook → `aios internal offload capture` | 自动，每次工具调用 |
| `opencode` | `.opencode/plugins/aios-offload.ts` 注册 `tool.execute.after` | 自动，每次工具调用 |
| `codex-cli` | `aios canvas backfill --input <events.jsonl> --client codex-cli --session S` 读 JSONL 工具日志 | Stop hook / 手动 |
| `gemini-cli` | `aios canvas backfill --input <events.jsonl> --client gemini-cli --session S` 读 JSONL 工具日志 | Stop hook / 手动 |
| 通用兜底 | skill 指令引导模型自觉调 `aios offload put` | 模型自觉 |

### 数据流

#### 写入路径（PostToolUse 钩子）

```
Tool finishes → Hook receives JSON {tool_name, tool_input, tool_response}
              → 阈值检查（输出 > OFFLOAD_MIN_BYTES，默认 2048）
              → 生成 node_id（短哈希 + 序号）
              → 写入 .aios/refs/<session>/<node_id>.md（含 frontmatter）
              → 追加节点到 .aios/canvas/<session>/task-canvas.json
              → 重新生成 task-canvas.mmd（Mermaid 文本）
              → 钩子 stdout 输出一行小提示："[offloaded → <node_id>]"
```

#### 读取路径（Recall）

```
Claude 需要历史细节时：
  - 看到 canvas 中的 node_id
  - 调用 `aios refs read <node_id>` 或直接 Read 文件
  - 或用 `aios refs grep "<pattern>"` 找回相关节点
```

#### Harness 恢复路径

```
aios harness resume → 加载 .aios/offload/canvas/<session>/task-canvas.mmd 到 prompt/context-pack
                   → 不加载 l2-events.jsonl 全文
                   → 让 Claude 基于 canvas 推理下一步
                   → 需要细节时用 `aios refs read`
```

## 数据结构

### node_id 格式

```
n<seq>-<hash6>
```

例：`n0042-a3f7c1`，其中 seq 是同一 session 内递增序号，hash6 是输入参数的前 6 位 SHA-1。

### Refs 文件（`.aios/refs/<session>/<node_id>.md`）

```markdown
---
node_id: n0042-a3f7c1
session: codex-cli-20260517T...
ts: 2026-05-17T08:12:33Z
tool: Bash
input_summary: "git log --oneline -20"
exit: 0
duration_ms: 184
size_bytes: 4831
---

[原始工具输出，未压缩]
```

### Canvas JSON（`.aios/canvas/<session>/task-canvas.json`）

```json
{
  "session": "codex-cli-...",
  "started": "2026-05-17T07:00:00Z",
  "updated": "2026-05-17T08:12:33Z",
  "nodes": [
    {
      "id": "n0042-a3f7c1",
      "tool": "Bash",
      "label": "git log -20",
      "status": "ok",
      "ts": "2026-05-17T08:12:33Z",
      "ref": ".aios/refs/.../n0042-a3f7c1.md"
    }
  ],
  "edges": [
    { "from": "n0041-...", "to": "n0042-a3f7c1", "kind": "next" }
  ]
}
```

### Canvas Mermaid（`.aios/canvas/<session>/task-canvas.mmd`）

```
graph LR
    n0041["Read settings.json"] -->|next| n0042["Bash: git log -20"]
    n0042 -->|next| n0043["Edit storage.mjs"]
    classDef ok fill:#dcfce7
    classDef fail fill:#fecaca
    class n0042,n0043 ok
```

## 组件清单

### 新增脚本

| 文件 | 职责 |
|------|------|
| `scripts/lib/offload/tool-offload.mjs` | 主入口：钩子调用此处，决定是否 offload，写 refs，更新 canvas |
| `scripts/lib/offload/backfill.mjs` | JSONL 工具日志回填，复用 capture 引擎生成 refs/canvas |
| `scripts/lib/offload/node-id.mjs` | node_id 生成、解析、查找 |
| `scripts/lib/offload/mermaid-canvas.mjs` | Canvas JSON ↔ Mermaid 文本转换 |
| `scripts/lib/offload/refs-store.mjs` | refs 文件读/写/grep/prune |

### CLI 扩展

`scripts/aios.mjs` 添加子命令：

```
aios refs grep <pattern> [--session <id>] [--limit N]
aios refs read <node_id>
aios refs list [--session <id>]
aios refs prune [--keep-days N] [--keep-mb N]
aios canvas show [--session <id>] [--format mmd|json]
aios canvas path [--session <id>]    # 输出 canvas 路径
aios canvas backfill --input <events.jsonl> --client <client> [--session <id>]
aios internal offload capture        # PostToolUse 钩子调用入口
```

### 钩子注册

`.claude/settings.local.json` 增加：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "AIOS_OFFLOAD_CLIENT=claude-code node /Users/molei/codes/aios/scripts/aios.mjs internal offload capture --workspace /path/to/workspace"
          }
        ]
      }
    ]
  }
}
```

### Skill 更新

- `aios-compress`：增加"长输出 offload 提示"段落
- `aios-browser-compress`：增加"refs grep recall"段落
- `aios-long-running-harness`：增加"resume 时优先加载 canvas"段落
- 新增 `aios-offload-recall` skill：明确告诉模型何时使用 `aios refs grep`

### 配置

`config/settings.json` 增加：

```json
{
  "offload": {
    "enabled": true,
    "minBytes": 2048,
    "maxRefsPerSession": 1000,
    "keepDays": 30,
    "tools": ["Bash", "Read", "Edit", "Write"]
  }
}
```

## 阈值与默认

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `OFFLOAD_MIN_BYTES` | 2048 | 小于此大小不 offload |
| `OFFLOAD_MAX_REFS_PER_SESSION` | 1000 | 单 session 最多保留节点数 |
| `OFFLOAD_KEEP_DAYS` | 30 | refs 自动清理期限 |
| `OFFLOAD_TOOLS` | Bash, Read, Edit, Write, page.* | 监听的工具白名单 |

## 测试策略（TDD）

### 单元测试

`scripts/tests/offload-tool-offload.test.mjs`：
- node_id 生成唯一性
- 阈值过滤（< minBytes 不写）
- frontmatter 格式正确性
- canvas JSON 增量更新
- Mermaid 文本生成
- JSONL backfill 大输出写入、小输出跳过
- Claude PostToolUse payload 归一化

### 集成测试

`scripts/tests/aios-cli.test.mjs` / `scripts/tests/aios-init.test.mjs`：
- `aios refs grep` 端到端
- `aios canvas show` 输出格式
- `aios canvas backfill --input` 参数解析
- `aios init --agent claude` 写入 Stop + PostToolUse hooks

### 手动验证

1. 在测试 session 中运行多个 Bash 命令
2. 检查 `.aios/refs/<session>/` 下文件存在且 frontmatter 正确
3. 检查 `.aios/canvas/<session>/task-canvas.mmd` 可视化合理
4. 测试 `aios refs grep "test-pattern"` 能找回内容
5. 用 `aios canvas backfill --input <events.jsonl>` 对比 raw ref 与 canvas 字节数

## 安全 & 隐私

- refs 文件继承 `.aios/` 的 gitignore 规则（已在 `.gitignore` 中）
- privacy-guard 在 offload 前对内容进行 redact（如果启用）
- 钩子失败不阻塞工具执行（异常隔离）
- node_id 不包含敏感信息（仅时序 + 输入哈希）

## 性能预算

- 钩子执行 < 200ms（异步写文件，仅同步生成 node_id 和提示）
- canvas.mmd 重建 < 50ms（节点数 < 500 时）
- refs 文件平均大小 < 50KB（超大输出截断到 1MB 警告）

## 渐进式落地

1. **Phase 1**：基础设施（refs-store + node-id），CLI `aios refs *`
2. **Phase 2**：Mermaid canvas 生成器 + CLI `aios canvas *`
3. **Phase 3**：PostToolUse 钩子注册 + 钩子入口实现
4. **Phase 4**：Skill 更新 + harness resume 集成
5. **Phase 5**：性能调优 + 文档

每个 phase 独立可测、可回滚。

## 与现有系统的关系

| 已有系统 | 关系 |
|---------|------|
| ContextDB l2-events | 互补：events 记录"发生了什么"，refs 保存"完整原文"，canvas 是"状态视图" |
| ContextDB checkpoints | 互补：checkpoints 是 harness 阶段标记，canvas 是工具调用图 |
| aios-compress | 互补：compress 控制输出形式，offload 控制输入存储 |
| aios memo pin | 不冲突：pin 是手动重要事实，refs 是自动原始记录 |

## 验收标准

- [x] PostToolUse 钩子被注册且不阻塞正常流程（单测覆盖注册；真实 Claude hook 待长任务观测）
- [x] JSONL backfill 可产生 refs 文件 + canvas
- [x] `aios refs grep` 能正确召回历史
- [x] `aios canvas show` 输出合法 Mermaid
- [x] 单元测试 + 集成测试通过（targeted）
- [ ] 在真实 harness 任务中验证 token 节省（resume 场景）
- [ ] 文档更新：CLAUDE.md、相关 skill

## 后续迭代（不在本次范围）

- L1 原子事实自动提取（小模型蒸馏）
- BM25/向量混合检索
- 上下文窗口使用率感知的动态触发
- 跨 session 知识图谱
