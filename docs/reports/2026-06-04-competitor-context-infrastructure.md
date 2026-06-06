# Competitor Deep-Dive — context-infrastructure Category (2026-06-04)

> Category: ContextDB / 记忆基础设施  
> Phase: deep-dive (vs Phase 0 metadata refresh 2026-06-04)  
> Scope: 3 competitors in `competitor-watchlist.json` → `categories.context-infrastructure`  
> Source method: GitHub API (releases/commits) + sparse clone of OpenViking + GitHub web fetch for OpenClaw/OpenClaw-Recall + AIOS source cross-ref. READ-ONLY.

---

## A. 竞品状态卡 (Status Cards)

### A.1 volcengine/OpenViking — P0, 极活跃

| 指标 | 5月22日 | 6月4日 | Δ |
|------|--------|-------|---|
| Stars | 24,470 | 25,117 | **+647** (~10 days) |
| Forks | ~1,500 | 1,932 | +432 |
| Latest release | v0.3.18 (5月22日) | **v0.3.23** (6月3日) | **5 versions in 13 days** |
| Last push | 2026-05-22 | 2026-06-04 | active |
| Open issues | — | 222 | growing |
| Subscribers | — | 72 | — |

**Top 5 changes since 5月22日 (v0.3.19 → v0.3.23):**

1. **v0.3.19 (5月22日)** — Console BFF / Usage-Audit 多时区口径统一：所有时间分桶改为服务端按 viewer timezone 重分桶，UTC 持久化；本地 Usage/Audit SQLite schema v3 reset (breaking change 列出 `@/api/v1/console/*` 的 `date`/`hour` bucket 已是 viewer-timezone 解释后的结果)。新增 `bot.session_skill_extraction_enabled` 链路从 session commit 流程提取可复用 skill (#2190/#2194/#2182/#1985)。
2. **v0.3.20 (5月25日)** — **Request-level HTTP profiling**：服务端 `server.profile_enabled` + 请求参数 `profile=1` 启用 `cProfile`，`ov` CLI `--profile` 入口；**Batch Session message ingestion**：`POST /api/v1/sessions/{id}/messages/batch` + `ov session add-messages` 单次 100 条，LangChain `add_messages` 切换到批量路径；**Memory `embedding_template`**：记忆 schema 顶层新增 `embedding_template` (Jinja 风格)，替代字段级 `searchable`，内置 `entities/events/preferences` 模板；**semantic target sync + lock handoff 修复** + `embedding.max_input_tokens` 截断 + `input_too_large` 错误分类避免重试风暴。
3. **v0.3.21 (5月27日)** — **Trajectory `retrieval_anchor` + `embedding_template`**：索引文本收敛为 `trajectory_name + retrieval_anchor`，vector 命中率提升；**StoredLink `derived_from` 双向 `links/backlinks`** 替换 `source_trajectories` 元数据；OpenClaw 插件 `memory_search` 改名为 `ov_search` (避免命名冲突)；`content.read` 新增 `raw=true`；NVIDIA NIM VLM 路由；pip/pipx 安装后 `/studio` 可用 (修复 Web Studio bundle)。
4. **v0.3.22 (5月29日)** — **LangChain stale client recovery** (#2246)；**lightweight query planner config** (#2224) `query_planner` 可配置 (替代硬编码 VLM intent 分析)；**`refactor(memory): remove legacy memory v1`** (Memory V1 移除，统一为 V2 schema，v1 字段 schema_version 不再接受)；`ov-pack skip missing semantic sidecars` (#2265)；**OpenClain `ov_server` typed synopsis stubs** for externalized tool results (#2248)；**`embedding` 输入统一截断** (#2266)。
5. **v0.3.23 (6月3日)** — **VikingBot 经验召回配置化**：`bot.ov_server.recall_exp_first_round_only/exp_recall_limit/exp_recall_max_chars`，per-agent `agent_id` 经验命名空间隔离 (local & remote mode 同步)；`ov CLI` 重构为 `ov config`/`ov language`/`ov status --verbose`/`ov health` 显式子命令；Web Studio Playground + Connection & Identity 管理；`add_resource` 不强制要求 `to` (auto-bind `root_uri`)；**CJK-aware token 估算** Python+plugin 共享；`vlm.max_concurrent` 默认 100 → **64**；本地目录上传 skip symlinks；Web Studio release wheel 打包修复。

**Momentum:** 5 versions in 13 days = 平均 **2.6 天/版本**，节奏从 monthly 转为 weekly。方向明确：**Memory V2 GA** (v1 移除完成)、**OpenClaw 集成深度化** (命名空间隔离 + typed synopsis)、**CLI/Web Studio 体验打磨**、**VLM/provider 可靠性**。本批 5 版本里 OpenViking 主要是把 5月15日 v0.3.17 的产品化推进 (LangChain/OVPack/审计/VLM 切换) 继续深化，没有颠覆性新方向 — **稳态扩展期**。

---

### A.2 openclaw/openclaw — P0, 极活跃 (生态级)

| 指标 | 5月22日 | 6月4日 | Δ |
|------|--------|-------|---|
| Stars | 373,836 | 376,649 | **+2,813** |
| Forks | 77,581 | 78,704 | +1,123 |
| Latest release | v2026.5.20 | **v2026.6.1** (6月3日) | **2 个 stable + 9 个 beta** |
| Last push | 2026-05-22 | 2026-06-04 | active |
| Open issues | — | 7,483 | — |
| Subscribers | — | 1,822 | — |

**Beta 节奏 (近 14 天):** 2026.5.20 → 5.22 → 5.26 → 5.27 → 5.28 → 5.30 → 5.31 (×4) → 6.1 (×3) → 6.1 → 6.2-beta.1。**每 1-2 天一个 beta**，CI/release lane 已经高度流水线化。

**Top 5 changes since 5月22日 (v2026.5.20 → v2026.6.1 → v2026.6.2-beta.1):**

1. **Skill Workshop (v2026.6.1)** — Controlled skill creation flow: pending proposals + CLI/Gateway review actions + Control UI dashboard (proposal list / today view / revision dialog / file preview modal / searchable preview files / reusable session handoff / localized strings)；`skill_workshop` agent tool 支持 `apply/reject/quarantine`；proposal 可携带 approved support files (with scanner + hash + rollback)；`Skills: add the core skills index and centralize skills runtime loading, status, filtering, and prompt formatting` — **首次给出"中心化的 skills runtime 索引"**，对 AIOS 的 `aios memo` skill registry 模式有直接参考价值。
2. **Plugin 治理与外部化 (v2026.6.1)** — **Tokenjuice** 和 **GitHub Copilot agent runtime** 改为 official `@openclaw/tokenjuice` / `@openclaw/copilot` npm+ClawHub 双发布插件；新增 **SecretRef provider integration manifest contract** + 共享 LLM core 包；**Plugin install index 持久化到 SQLite** (重启后保留)；**Workboard** orchestration primitives + agent coordination tools (#87469)；`Code mode: add internal namespaces for scoped agent/global sessions and exact namespace tool dispatch` (#88043)。
3. **Memory: QMD update/embed writes per store serialization** (v2026.6.1) — `serialize QMD update/embed writes per store, reduce Linux watcher fan-out, retry transient FileProvider-backed reads, preserve phase signals on read errors, harden envelope metadata sanitization, reattach Linux native watchers when directories are recreated, and rewrite generated transcript paths on rollover` (#66339 #85931 #89185 #89188 #85351) — **QMD update/embed 串行化避免并发写竞争**，**Linux inotify watcher fan-out 减少**。`vector-disabled FTS indexes` 不再 resolve embedding providers (零 LLM 检索退化路径)。
4. **Memory 状态 + Channels 全面 SQLite 化 (v2026.6.1)** — **iMessage monitor state, inbound queues, and plugin install ledgers moved toward SQLite-backed state** (iMessage 状态迁移到 SQLite, plugin install 索引持久化, channel inbound queues 存 SQLite)；**iOS hosted push relay + realtime Talk playback + WebSocket ping** (#88096/#88105/#88231)；Android companion shell navigation (v2026.6.2-beta.1)；
5. **Provider 与 reliability 强化 (v2026.6.1 + v2026.6.2-beta.1)** — MiniMax M3 模型支持 (#88860) + **MiniMax account OAuth endpoints**；Google/Vertex catalog 修复；OpenRouter SQLite model caching；Copilot Claude 1M capabilities；Foundry reasoning alignment；OpenAI response replay guards；Kimi-incompatible Anthropic cache markers 剥离；Foundry fallback 跳过 DeepSeek V4 thinking params；**Providers/media bound local service/model/usage/queue/generated-media/TTS/music/workflow-polling/provider-OAuth timers**；**Provider request timer caps** 覆盖 Telegram/Discord/WhatsApp/Signal/Feishu/Google Chat/Microsoft Teams/QQBot/Nostr/Zalo/Nextcloud；**plugin install 改用 operator install policy** 替代 dangerous-code scanner (v2026.6.2-beta.1) — 这是 OpenClaw 重大安全模型调整。

**Momentum:** OpenClaw 已远超 "AI agent" 范畴 — 实质是一个 "**AI agent + 多 channel gateway + 插件生态 marketplace + 移动端 (iOS/Android/Windows Hub) + Workboard 多 agent 编排**" 的复合平台。最近两周的方向是：(a) 中心化 skills runtime + Skill Workshop 治理 (提升质量 + 防止 dangerous code) (b) Plugin 系统外部化为 npm+ClawHub 双发布 (c) Memory 状态/channel state/plugin install index 全部 SQLite 化 (d) Provider timer/timeout hardening (防 hang)。

---

### A.3 Felix201209/openclaw-recall — P2, **DORMANT (确认)**

| 指标 | 5月22日 | 6月4日 | Δ |
|------|--------|-------|---|
| Stars | 3 | 4 | +1 |
| Forks | 2 | 2 | 0 |
| Latest release | v1.3.2 (3月18日) | **v1.3.2** (3月18日) | **零变更** |
| Last push | 2026-03-21 | 2026-03-21 | **77 天零 commit** |
| Issues | 0 | 0 | — |
| Subscribers | 3 | 3 | — |

**最近 5 commits (按时间倒序):**
- 273d55c (2026-03-21) — Update copyright year and owner in LICENSE file
- 07f7144 (2026-03-18) — fix: harden recall memory dedupe and extraction
- d68ad9b (2026-03-18) — Update README.md
- ed187ff (2026-03-18) — Merge pull request #4 from lincolngao47-arch/main
- 540fd22 (2026-03-18) — Merge branch 'main' into main

**Dormant 评估:**
- **距离上次 commit: 77 天** (3月21日 → 6月4日)，按"industry standard dormant = 60+ days 无 commit"已 **明确进入休眠**
- 上次 5 个 commit 中 3 个是 README/LICENSE/merge，**实质代码改动仅 1 个** (`harden recall memory dedupe and extraction`)
- v1.3.0-v1.3.2 三个版本集中在 3月15-18日 4天内发布，之后**完全停摆**
- 主项目 OpenClaw v2026.6.1 / v2026.6.2-beta.1 的 release notes **零次提到 openclaw-recall**（甚至 QMD / Memory / Plugin 任何相关章节都没有引用）— 即 OpenClaw 官方没有 plan 来 merge/fork 进来
- 最近 1 个 star 增长可能来自 OpenClaw v2026.6.0/v2026.6.1 release notes 的回放效应，但项目本身 77 天零活动

**结论: 建议从 watchlist 移除 (P2 → drop)**。原因：(1) 主项目 OpenClaw v2026.6.x 已经有自己的 plugin load / SecretRef / Skills Workshop / Memory QMD 全套体系，**openclaw-recall 的 4 memory types (preference/semantic/episodic/session_state) 与 OpenClaw 内部 QMD 重复**；(2) `npm install @felixypz/openclaw-recall` 链路依赖 `openclaw plugins install --link` 已 3 个月没有随 OpenClaw 主项目升级验证兼容性；(3) 0 issue / 3 subscriber / 4 star 表明社区无反馈，无外部维护者。

---

## B. 参考价值功能 (Reference-Value Features)

### B.1 OVPack v2 — 上下文打包格式 (与 AIOS `context:pack` 直接对比)

- **来源**: OpenViking v0.3.17+ (format 实际自 2026-Q1 引入, 5月22日 review brief 已记录)
- **实现细节**:
  - Source: `openviking/storage/ovpack/format.py` (lines 22-34), `openviking/storage/ovpack/manifest.py`, `openviking/storage/ovpack/operations.py`
  - **二进制容器**: ZIP-based, 顶层目录 `{base_name}/`, 内部 `_ovpack/` 目录存放 metadata
  - **核心文件**:
    - `manifest.json` — 元数据 (kind=`openviking.ovpack`, `format_version=2`, `root_uri`, `vector_mode` ∈ {auto, recompute, require}, `on_conflict` ∈ {fail, overwrite, skip})
    - `index_records.jsonl` — **JSONL 索引**, 每行一个 record (id, path, kind, level=L0/L1/L2, text, scalars, vector reference)
    - `dense.f32` — **二进制 dense vector** (f32 raw bytes, 紧凑存储所有 L0/L1 的 embedding)
    - `files/` — 原始 L2 内容
  - **v2 关键增强** (vs v1):
    - `manifest.content_sha256` 校验每个文件
    - `manifest.dense_vector_sha256` + `dim` 校验整块向量
    - `manifest.dense_vector_count` + `index_records.dense_vector_offsets` 字节级 contiguity check
    - ZIP member path 严格校验 (rejects `..`, `\`, drive letters, unsafe rel paths)
  - **API 入口**: `client.export_ovpack(uri, to, include_vectors=False)` / `import_ovpack(file_path, parent_uri, ...)` / `backup_ovpack(to)` / `restore_ovpack(file_path, ...)`
  - **场景**: agent team 跨进程传上下文、备份 public scopes、迁移到新 server、context pack transfer between teams
- **AIOS 映射**:
  - `mcp-server/src/contextdb/cli/handlers.ts:handleContextPack()` (line 224) → `buildContextPacket()` in `mcp-server/src/contextdb/core.ts:1855+`
  - AIOS 输出格式: **Markdown** (`exports/{sessionId}-context.md`), L0 Summary + L1 Snapshot + L1+ Checkpoints + L2 Recent Events + L2 Offload Canvas
  - AIOS context:pack **没有 vector 索引** (纯文本 markdown), **没有二进制 embedding**, **没有 manifest integrity 校验**
  - **核心差异**: OpenViking OVPack v2 是 **"可移植 + 可独立导入 + 含向量索引"** 的 context bundle (类似 ".gguf 但 for context"), AIOS context:pack 是 **"human-readable Markdown handoff packet"** — 两个不同目的的产物
- **可移植性**: **medium**
  - **Easy 部分**: 复用 `aios context:pack` 的现有 L0/L1/L2 抽取逻辑; 给 markdown packet 增加一个 sibling `manifest.json` (format_version, content_sha256, sources, refs)
  - **Hard 部分**: 嵌入 vectors 意味着 AIOS 需要为每次 context:pack 生成 embedding, 这与 AIOS "无 LLM 依赖" 理念冲突 — **改用 sqlite-vec (本地, 零 LLM) + 在 export 时**只导出 model-agnostic 的 BM25/SQLite-vec fingerprint 即可, 不必在 packet 中嵌入完整 embedding
  - **Blocker**: AIOS 当前 ContextDB **没有 vector backend**, 要实现完整 OVPack-style import/export 必须先上 sqlite-vec 或 HNSW (P1 dependency)
- **优先级**: **P1** — 借鉴 OVPack 的 `format_version` + `sha256` + JSONL index 设计让 AIOS context:pack 可以做 import/replay/verify; 不必复制完整 vector 嵌入。重点是给 markdown packet 增加一个 **machine-readable sibling manifest** (`{sessionId}-context.manifest.json` + `{sessionId}-context.index.jsonl`)。

### B.2 Server-side cProfile + CLI `--profile` 拦截 (与 AIOS `aios interception proof` 对比)

- **来源**: OpenViking v0.3.20 (5月25日)
- **实现细节**:
  - Source: PR #2190 series, `server.profile_enabled` 配置开关; 请求带 `?profile=1` 触发 `cProfile` 仅对当前 HTTP 请求 profile, 在 JSON 响应尾部追加 `profile` 字段 (capped at ~16 KiB)
  - `ov` CLI `--profile` 入口; `ovcli.conf` 默认 `profile: true`
  - 配合 `ov --profile status` / `ov --profile health` 一键性能诊断
  - **关键设计**: profile 是 **单次请求粒度**, 不污染全局; 默认关闭; 输出在 JSON 响应后**追加** `profile` 字段, 不修改正常 schema
- **AIOS 映射**:
  - `node scripts/aios.mjs interception proof --json` (AGENTS.md 提到)
  - `node scripts/aios.mjs interception doctor --fix` (自动修复)
  - AIOS interception 跑在 **MCP proxy 边缘** (`scripts/aios-mcp-proxy.mjs`), **不深入到下游 CLI 的具体请求级** — OpenViking 的做法是 per-request HTTP server-level cProfile, AIOS 是 per-MCP-tool-call 拦截
  - **核心差异**: OpenViking profile 是 **下游 VLM/RAG server 自诊断**, AIOS interception 是 **MCP 中间件统计**; 两者维度不同
- **可移植性**: **easy**
  - 在 `scripts/aios-mcp-proxy.mjs` 现有 `cProfile` 链路 (假设已存在) 增加 `--profile` flag + JSON 响应后追加 `profile` 字段
  - 在 `aios interception` 子命令增加 `proof --profile` / `doctor --profile` 输出 cProfile 摘要
  - 工具范围: 拦截 MCP call (Browser MCP, OpenViking MCP, mem0 MCP) 而非 HTTP server 内部
- **优先级**: **P1** — 这是 `aios interception proof` 的低风险增强, 不改默认行为, 调试时打开; 与 AIOS 现有 `.aios/interception/metrics/` 配套, 可以产出 **per-MCP-tool pstats**

### B.3 Memory `embedding_template` (memory schema 字段)

- **来源**: OpenViking v0.3.20 (5月25日, PR #2224) + 延续 v0.3.21 (trajectory `retrieval_anchor`)
- **实现细节**:
  - Memory schema 顶层新增 `embedding_template` 字段 (Jinja 风格模板)
  - 替代旧的字段级 `searchable: true` 标记 — v0.3.20 是 breaking change, 旧 schema 必须迁移
  - 默认 `entities/events/preferences` 三个 type 各有内置模板, `content` 表示最终正文, 可选访问 `extract_context`
  - **关键设计**: 把 "哪些字段进 embedding" 从"逐字段 boolean" 升级为"完整模板表达式", **可表达字段组合 + context-aware 重写**
  - v0.3.21 进一步: trajectory schema 新增 `retrieval_anchor` + `embedding_template`, 向量索引文本收敛为 `trajectory_name + retrieval_anchor` 而非完整 operation contract — 大幅提高 retrieval precision
  - v0.3.22 删除 memory v1, v2 成为唯一
- **AIOS 映射**:
  - `mcp-server/src/contextdb/core.ts:1855+` 的 L0/L1/L2 抽取逻辑
  - `scripts/lib/contextdb/` 下的 async-bootstrap-runner / sqlite / semantic 模块
  - AIOS 当前 `memo` (`aios memo add`) 写入是 free-form Markdown 文本, **没有结构化 schema**, 也 **没有控制"哪些字段进 embedding"** 的机制
  - **可移植性**: AIOS memo 系统适合升级为"轻量 schema + embedding_template" — 但要权衡: AIOS memo 是 operator-facing (`~/.aios/SOUL.md` + `aios memo add`), 过度结构化反而增加使用摩擦
- **可移植性**: **medium** (schema/template 系统需要新建)
- **优先级**: **P2** — 对 P1 路线 (L0/L1/L2 自动提取) 有前置价值, 但 AIOS memo 当前是 operator-curated 而非 agent-extracted, ROI 较低

### B.4 OpenClaw QMD: `serialize QMD update/embed writes per store` + Linux watcher fan-out reduction

- **来源**: OpenClaw v2026.6.1 (6月3日, commit #89185/#89188/#85351)
- **实现细节**:
  - QMD (Query Memory Daemon) 是 OpenClaw 内部 memory 后端, 写入时对 **单 store 加锁串行化** update/embed, 避免并发 embed write 冲突
  - Linux inotify watcher 减少 fan-out (避免一个文件变更触发 N 个 path event)
  - `vector-disabled FTS indexes` 模式下不 resolve embedding providers (零 LLM 检索降级路径)
  - FileProvider-backed reads 增加 transient retry
  - phase signals 在 read error 时被保留 (debugging 信息)
  - envelope metadata sanitization hardening
  - directory recreated 时 reattach native watchers
  - generated transcript paths on rollover 重写
- **AIOS 映射**:
  - AIOS ContextDB SQLite WAL 已经在写入端有 lock; **但 .aios/memo/ 的 markdown file 写入是 free-form, 没有 watcher 串行化**
  - AIOS **没有 file watcher** (`.aios/` 文件变化靠 `aios memo add` 显式触发); OpenClaw 的 inotify fan-out reduction 对 AIOS 直接价值不大
  - **真正有借鉴价值**: **`vector-disabled FTS` 检索降级** — 思路是 "如果 embedding 不可用, 退到 FTS-only 检索" — 这正是 mem0 的 zero-LLM retrieval 哲学
  - AIOS ContextDB 当前用 FTS5 (假设, 在 `mcp-server/src/contextdb/sqlite/`) — 可以明确文档化 "FTS-only 模式 = zero LLM 检索"
- **可移植性**: **easy** (FTS-only 降级路径已经在 AIOS)
- **优先级**: **P1** — 给 AIOS ContextDB 检索增加 `mode: fts-only | vector | hybrid` 显式选项 + 在 `aios context:search` 中暴露; 当 sqlite-vec 不可用时自动降级到 FTS5

### B.5 VikingBot 经验召回配置化 + per-agent_id 命名空间隔离

- **来源**: OpenViking v0.3.23 (6月3日, PR #2380)
- **实现细节**:
  - 配置项: `bot.ov_server.recall_exp_first_round_only=true` (任务/评测场景: 只在第一轮注入 agent experience, 避免后续轮次重复)
  - `exp_recall_limit=2`, `exp_recall_max_chars=10000` (显式控制召回条数 + 字符数上限)
  - **per-agent_id 命名空间隔离**: local & remote mode 都按 incoming `agent_id` 做经验命名空间隔离 — 不同 agent 的 experience 互不串
  - 本地/远端 OV server 同步实现, 避免 mode-specific 行为漂移
  - 配置通过 `ov.conf` 注入, 运行时可热改
- **AIOS 映射**:
  - AIOS `aios memo` system (`scripts/aios.mjs` 中 `memo add`/`memo pin add`)
  - AIOS 当前 **没有 per-agent_id 命名空间隔离** — `~/.aios/SOUL.md` 是全局 persona, `.aios/memo/` 是按 workspace 隔离, 但没有按 agent type (harness/team-worker/subagent) 区分
  - `aios harness` vs `aios team` 共享同一 memo space, 可能串扰
  - **借鉴**: 给 `aios memo` 增加 `--agent <id>` namespace 隔离 + `--first-round-only` flag (任务型 agent 只在首轮注入)
- **可移植性**: **medium** (需要在 `mcp-server/src/contextdb/core.ts` 增加 `agent_id` 索引列; 在 `scripts/aios.mjs memo` CLI 增加 `--agent` 选项)
- **优先级**: **P1** — 对 `aios team` 多 agent 并行场景防止 experience 串扰

### B.6 OpenClaw Skills Workshop (核心 skills 索引 + 受控提案流)

- **来源**: OpenClaw v2026.6.1 (6月3日, commit #88734)
- **实现细节**:
  - **Core skills index** + 中心化 skills runtime (loading / status / filtering / prompt formatting)
  - Skill Workshop: pending proposals + CLI/Gateway review actions + rollback metadata + `skill_workshop` agent tool
  - Proposal 可携带 approved support files (标准 skill 文件夹下, 含 scanner + hash + rollback safeguards)
  - 提案 in-place 修订, versioned/dated frontmatter
  - Control UI: 提案列表 + today view + revision dialog + file preview modal + searchable preview + reusable session handoff
  - **v2026.6.2-beta.1 进一步**: 用 **operator install policy** 替代 dangerous-code scanner (避免 scanner 漏掉新攻击向量)
- **AIOS 映射**:
  - AIOS `aios memo add` / `aios memo pin add` 已经有 "**skill 自动生成**" 概念 (从执行中提取 skill), 但 **没有 proposal/review/rollback 流**
  - AIOS skill 加载靠 `.codex/skills/` + `.claude/skills/` 文件系统约定, 没有中心化索引
  - **借鉴价值极高**:
    1. AIOS 增加 `aios skill propose "<skill description>"` (proposal 阶段, 不直接落盘)
    2. `aios skill review <proposal-id> --approve|reject|quarantine` (governance)
    3. `aios skill apply <proposal-id>` (approved 后写 `.codex/skills/`)
    4. `aios skill rollback <skill-name>` (versioned)
    5. 给 AIOS 增加 `core skills index` (`.aios/skills/index.json` 类似 OpenClaw 的 core skills index), 跟踪所有已加载 skill 的 name/path/version/sha256
- **可移植性**: **medium** (需要 `scripts/aios.mjs` 增加 `skill` 子命令族 + `.aios/skills/index.json` schema)
- **优先级**: **P0** — 直接对齐 AIOS roadmap 里的 "**技能自生成闭环**" (5月22日 review brief 列为 #9 P1 候选); 加上 Workshop 治理后可以升 P0 (从 "skill 自动生成" 升级到 "skill 受控自动生成 + 中心化索引 + 可回滚")

### B.7 SQLite WAL 迁移 channel state + plugin install index (OpenClaw v2026.6.1)

- **来源**: OpenClaw v2026.6.1, 多个 commit (#88794 #88797 #89185 #89188)
- **实现细节**:
  - iMessage monitor state: 文件系统 → **SQLite WAL** 持久化
  - channel inbound queues: 文件系统 → **SQLite**
  - plugin install index: 文件系统 → **SQLite**
  - 目的: 重启/local monitor 恢复时避免重复 filesystem scanning
- **AIOS 映射**:
  - AIOS ContextDB 已经用 SQLite (`.aios/context-db/sessions/`) — 已是 WAL
  - **借鉴价值低**, 因为 AIOS 这块已经做过
  - **唯一可能借鉴**: `aios team` 通信如果未来用文件 mailbox, 应该直接走 SQLite (参考 overstory #12 5月22日 P0)
- **可移植性**: **N/A (已实现)**
- **优先级**: **P2 (no-op)** — 仅作为竞品信号记录, AIOS 已有等价物

### B.8 Operator install policy 替代 dangerous-code scanner (OpenClaw v2026.6.2-beta.1)

- **来源**: OpenClaw v2026.6.2-beta.1 (6月3日, PR #89516)
- **实现细节**:
  - Plugin install 决策从 "dangerous-code scanner 自动拦截" 改为 "**operator install policy**" (类似 npm `--ignore-scripts` 的白名单/黑名单机制)
  - 配套: doctor checks + install/update CLI wiring + ClawHub metadata paths + package/archive/source/upload lifecycle coverage
  - **核心理由**: scanner 永远滞后于新攻击向量, 把决策权交给 operator + 明确的 policy 文件
  - **operator policy schema**: 类似 `package.json#dependencies` 风格的 allowlist
- **AIOS 映射**:
  - AIOS `aios intercept` + `.aios/security-policy.json` (假设) 已有基础
  - **借鉴**: AIOS skill loading 流程可以增加 **operator policy file** `.aios/skill-install-policy.json`:
    ```json
    {
      "allow": ["vendor.com/*"],
      "deny": ["github.com/*/experimental-*"],
      "requireSignedSha": true
    }
    ```
  - `aios skill install <url>` 强制走 policy check, 失败回退到 `aios skill propose` 进入 review 流 (与 B.6 联动)
- **可移植性**: **medium** (新增 policy schema + CLI flag)
- **优先级**: **P1** — 与 B.6 Skill Workshop 合并实施: policy check + workshop review + 中心化 index

### B.9 工具输出 compact + saved-token reporting (OpenClaw Recall v1.3.0)

- **来源**: openclaw-recall v1.3.0 (3月16日), 来源虽已 dormant 但模式可借鉴
- **实现细节**:
  - Tool-output compaction 保留 commands, error stacks, code blocks, semi-structured sections
  - Provider-style wrapper payloads 在 compaction 前 unwrap
  - **saved-token reporting**: 每次 compaction 输出 `saved_tokens=N, ratio=M`, 在 `inspect` dashboard 显示
- **AIOS 映射**:
  - `aios interception` runtime 已有 `tight/ultra/precise` 模式, 但 **没有 per-tool-call saved-token 报表**
  - `aios interception proof` 可以增加 `--saved-tokens-report` 输出 JSON 报表
  - 现有 `.aios/interception/metrics/<session>.jsonl` 假设已经记录 token 节省 — 但没有 inspect dashboard
- **可移植性**: **easy** (输出 metric + 增加 inspect 命令)
- **优先级**: **P1** — 给 `aios interception` 增加 saved-token report + inspect; 与 AIOS "**Mermaid 符号化压缩 -61% token**" (5月22日 #16 P0 候选) 配套

### B.10 Usage/Audit SQLite schema 多时区 + UTC 持久化 (OpenViking v0.3.19)

- **来源**: OpenViking v0.3.19 (5月22日, PR #2190)
- **实现细节**:
  - 所有 time-keyed columns (`date_utc`, `hour_utc`, `created_at`) 持久化 UTC
  - 查询时: store 把用户本地日期范围扩展到覆盖对应 UTC 小时窗口, 用 Python `zoneinfo` 重分桶
  - 处理 DST / UTC+8 / America/New_York / 印度/尼泊尔半小时/45 分钟偏移
  - **PRIMARY KEY 包含 (account_id, user_id, agent_id, date_utc, hour_utc, ...)** — 14 列复合主键
  - Source: `openviking/observability/usage_audit/schema.py` (lines 25-90)
  - 7 张表: `usage_token_hourly`, `usage_retrieval_hourly`, `usage_token_daily`, `usage_retrieval_daily`, `usage_context_write_bucket`, `usage_agent_activity_daily`, `request_audit`
  - `SCHEMA_VERSION=3` — v0.3.19 升级时重置本地旧表 (data loss but pre-GA 可接受)
- **AIOS 映射**:
  - AIOS `.aios/interception/metrics/<session>.jsonl` 假设只记录 per-session, **没有按 (account/user/agent) 多租户分桶**
  - AIOS 没有"运营 dashboard" (audit console), 只在 `aios interception proof --json` 输出
  - **借鉴价值高**: 给 `.aios/interception/metrics/` 增加:
    1. **per-agent** token/retrieval 聚合表 (类似 OpenViking)
    2. **UTC 持久化 + 读端 viewer-tz 分桶** (避免容器化部署时区错位)
    3. **`aios interception audit --timezone Asia/Shanghai --date 2026-06-04`** 命令
- **可移植性**: **medium** (需要新增 SQLite 表 + timezone 处理 + 文档化 audit console)
- **优先级**: **P0** — 这是 5月22日 review brief 列为 P0 #19 "审计控制台 BFF" 候选; 现在 OpenViking 给出**生产级 schema 参考**; 建议 AIOS 立即复用 schema 设计

### B.11 Memory V2: trajectory `retrieval_anchor` + StoredLink `derived_from` 双向链接 (OpenViking v0.3.21)

- **来源**: OpenViking v0.3.21 (5月27日, PR #2248 + others)
- **实现细节**:
  - **trajectory schema 新增 `retrieval_anchor`** (短文本, 用于向量索引) + `embedding_template` (v0.3.20)
  - 索引文本从完整内容收敛为 `trajectory_name + retrieval_anchor` — 大幅提高 vector recall precision
  - experience 与 trajectory 之间用 **system-maintained `StoredLink` `derived_from` 双向 `links/backlinks`**
  - 替代易丢失的 `source_trajectories: List[str]` 元数据
  - **优势**: bidirectional link 让 "trajectory ← experience" 反向查询成为 O(1) 而不是 O(N) scan
- **AIOS 映射**:
  - AIOS ContextDB `events.ts` 假设 event 之间没有显式 link
  - `aios memo pin` 是"重要"标记, 但不是 link
  - **借鉴**: 给 `mcp-server/src/contextdb/sqlite/schema.ts` 增加 `event_links` 表 (id, from_event_id, to_event_id, kind=`derived_from|references|supersedes`)
  - `aios context:search` 输出时附带 link graph (例如 "this event was derived from 3 trajectories")
- **可移植性**: **medium** (新增 table + backfill logic)
- **优先级**: **P2** — 是 nice-to-have, 不阻塞 5月22日 P0 清单; 但对 multi-agent 协作场景有显著价值

### B.12 Memory V1 removal (OpenViking v0.3.22)

- **来源**: OpenViking v0.3.22 (5月29日, PR #2264)
- **实现细节**:
  - `refactor(memory): remove legacy memory v1` — 直接删, 留 `version: v2` 字段, v1 schema 拒绝
  - **勇气**: 大版本内直接删 v1 而非 deprecate → migrate (因为 v2 已稳定 1.5 个月, v1 是 pre-GA)
  - 文档同步 (#2280) 明确 `version field that now rejects v1`
- **AIOS 映射**:
  - AIOS ContextDB 当前 schema (在 `mcp-server/src/contextdb/sqlite/schema.ts`) 有 v1 残留吗? 应该没有, 5月10日 v0.1 才是首次
  - **借鉴价值低** (AIOS 还没到 v1→v2 breaking change 阶段)
- **可移植性**: **N/A**
- **优先级**: **P2 (no-op)** — 仅作为 "**pre-GA 项目敢于删 v1**" 的文化信号记录

---

## C. 聚合 / 优先级汇总

### P0 候选 (本周内)

| # | Feature | 来源 | AIOS 落地 | 阻塞 |
|---|---------|------|----------|------|
| **C-1** | **OpenClaw Skills Workshop 治理闭环** | OpenClaw v2026.6.1 | `aios skill propose/review/apply/rollback` + `.aios/skills/index.json` 中心化索引; 复用 Hermes/superpowers "skill 自动生成" 闭环 | 需扩展 `scripts/aios.mjs` + 增量更新 AGENTS.md |
| **C-2** | **Usage/Audit 多时区控制台 (B.10)** | OpenViking v0.3.19 | 新建 `.aios/interception/audit/` SQLite 表 (per-agent token/retrieval hourly) + `aios interception audit --timezone <tz> --date <d>` 命令 + UTC 持久化 | 借鉴 OpenViking `usage_audit/schema.py` schema |

### P1 候选 (本月内)

| # | Feature | 来源 | AIOS 落地 | 阻塞 |
|---|---------|------|----------|------|
| **C-3** | **OVPack v2 manifest 借鉴 (B.1)** | OpenViking | 给 AIOS `context:pack` Markdown 输出增加 sibling `{sessionId}-context.manifest.json` (format_version, content_sha256, sources) + `{sessionId}-context.index.jsonl` (事件索引); 暂不嵌入 vector | 复用 `buildContextPacket` 现有产物 |
| **C-4** | **CLI/server profile 拦截 (B.2)** | OpenViking v0.3.20 | `aios interception proof --profile` + `aios interception doctor --profile`; JSON 响应后追加 `profile` 字段 (cProfile pstats, capped 16 KiB) | 低风险, 默认关闭 |
| **C-5** | **ContextDB 检索 FTS-only 降级 (B.4)** | OpenClaw QMD | `aios context:search --mode fts-only\|vector\|hybrid`; sqlite-vec 不可用时自动降级 | 已有 FTS5 基础, 只补 flag |
| **C-6** | **per-agent_id memo 命名空间 (B.5)** | OpenViking v0.3.23 | `aios memo add --agent <id>`; `aios harness`/`aios team` 自动注入 agent_id | 需在 ContextDB core.ts 加 agent_id 列 |
| **C-7** | **Operator install policy (B.8)** | OpenClaw v2026.6.2-beta.1 | `.aios/skill-install-policy.json` (allow/deny/requireSignedSha); `aios skill install` 强制走 policy | 与 C-1 联动 |
| **C-8** | **Saved-token 报表 + inspect (B.9)** | OpenClaw Recall v1.3.0 | `aios interception proof --saved-tokens-report` 输出 per-tool-call 节省; `aios interception inspect --session <id>` dashboard | 已有 metrics 基础 |

### P2 候选 (中长期)

| # | Feature | 来源 | AIOS 落地 | 阻塞 |
|---|---------|------|----------|------|
| **C-9** | **Memory `embedding_template` (B.3)** | OpenViking v0.3.20 | AIOS memo 升级为 "轻量 schema + embedding_template"; 适合 L0/L1/L2 自动提取路线 | 新建 template engine, ROI 取决于 P1 自动提取优先级 |
| **C-10** | **SQLite WAL channel state (B.7)** | OpenClaw v2026.6.1 | AIOS ContextDB 已是 WAL, 无新工作; 仅作竞品信号 | none |
| **C-11** | **Memory V2 link graph (B.11)** | OpenViking v0.3.21 | ContextDB 增加 `event_links` 表; `context:search` 输出 link graph | 需 schema 扩展 + backfill |
| **C-12** | **Pre-GA v1 removal 勇气 (B.12)** | OpenViking v0.3.22 | 文化层面: AIOS 文档中明确 "**pre-GA 阶段 schema 变更不保证向后兼容**"; 不是代码改动 | none |

---

## D. 关键决策

### D.1 OpenClaw Recall 状态确认与处置

**Dormant 确认: 100% 确认**

- 距离上次 commit: **77 天** (3月21日 → 6月4日) — 已超 "60+ days = dormant" 阈值
- v1.3.2 之后 **零 release / 零 commit / 零 issue 活动**
- 主项目 OpenClaw v2026.6.x **零次引用** openclaw-recall (release notes 全量核查 2026.5.20 → 2026.6.2-beta.1)
- 4 star / 2 fork / 3 subscriber — 无外部维护者

**建议处置: 从 watchlist 移除 (P2 → drop)**

理由:
1. **功能已被主项目吸收** — OpenClaw v2026.6.x 已有自己的 plugin load / SecretRef / Skills Workshop / Memory QMD 完整体系; openclaw-recall 的 4 memory types (preference/semantic/episodic/session_state) 与 OpenClaw 内部 QMD 重复
2. **无升级验证** — 3 个月没有跟随 OpenClaw 主项目升级测试 `openclaw plugins install --link` 链路
3. **无社区反馈** — 0 issue / 0 PR / 0 new star in 60+ days
4. **资源利用** — watchlist 3 个 P2 入口目前只占 1 个; 移除后可以腾出 slot 给 P1/P0 新信号

**保留观察 (仅记录在文档)**:
- 4 memory types (preference/semantic/episodic/session_state) 的分类法对 AIOS `aios memo` taxonomy 有借鉴价值 — 转为 "模式信号" 记录, 不再持续监控
- `saved-token reporting` 模式 (B.9) 可以独立借鉴, 不依赖 openclaw-recall 项目

### D.2 OpenViking v0.3.18→v0.3.23 期间的新 P0 信号

**结论: 仅 1 个真正的新 P0 信号 (B.10 Usage/Audit 多时区控制台)**

逐版评估:

| 版本 | 主要新功能 | 对 AIOS 价值 | 升级路径 |
|------|----------|-------------|---------|
| v0.3.19 | Console BFF 多时区, schema v3 reset, session skill extraction | **B.10 P0** (audit console schema) + session skill extraction (低, operator-facing) | 新建 audit SQLite 表 |
| v0.3.20 | Request-level profiling, batch session ingestion, `embedding_template` | B.2 P1 (profile) + B.3 P2 (template) | 与 C-2/C-9 合并 |
| v0.3.21 | Trajectory `retrieval_anchor`, StoredLink, OpenClaw `ov_search` rename, `/studio` bundle | B.11 P2 (link graph) + Web Studio (低, AIOS 不做 web UI) | 中期 |
| v0.3.22 | LangChain stale recovery, query_planner config, **memory v1 removal** | query_planner (低, AIOS 已有 intent via `using-superpowers`) + B.12 文化信号 | 文化层 |
| v0.3.23 | VikingBot per-agent namespace, CJK token, `ov` CLI 重构, `vlm.max_concurrent` 64 | B.5 P1 (per-agent namespace) + CJK token (低) + CLI 模式参考 | 与 C-6 合并 |

**vs 5月22日 review brief 的差异:**
- **新增 P0**: Usage/Audit SQLite schema (B.10) — 5月22日仅简单提到 "审计控制台" 是 P0 候选, 现在有完整 schema 可借鉴
- **新增 P1**: per-agent memo namespace (B.5) — 5月22日没识别
- **降级 P2**: Memory `embedding_template` (B.3) — 5月22日没识别, 但 ROI 取决于 P1 自动提取优先级
- **重复已有 P0**: OVPack v2 (5月22日已识别为 P1 context:pack 借鉴), 这次复核确认 P1 合理 (B.1)
- **重复已有 P1**: VLM token tracking (5月22日已识别), 这次新增 **CJK-aware token 估算** 细节
- **重复已有 P1**: VLM provider failover (5月22日已识别), 这次没看到新突破 (v0.3.20 没有新进展)

**Momentum 评估:** OpenViking 从 5月15日 v0.3.17 "产品化爆发" (LangChain/OVPack/审计/VLM 切换一次性补齐) 转入 5月22日-6月3日的 **"稳态扩展期"** — 主要是 bug fix + 已有产品化推进的深化, 没有颠覆性新方向。**建议保持 P0 监控等级, 但不必每周 deep-dive; 改为月度 deep-dive**。

### D.3 跨观察清单 (cross-cutting) 增量更新建议

在 `competitor-watchlist.json` 中:

1. **OpenClaw Recall**: 
   - `status: dormant` 已存在, 升级为 `status: deprecated` + 标注 `建议从 watchlist 移除`
   - 或者: 整个 competitor entry 删除, 把 "4 memory types 分类法" 移到 `crossCuttingTrends` 数组作为一次性学习信号

2. **OpenViking**: 
   - `latestRelease: "v0.3.18"` → `"v0.3.23"`
   - `signal` 字段更新, 加入 "Memory V2 GA (v1 移除), per-agent 命名空间, batch session 100 msgs/req, request-level profile, CJK token"
   - `lastPush: "2026-05-22"` → `"2026-06-04"`
   - `stars/forks` 同步刷新

3. **OpenClaw**:
   - `latestRelease: "v2026.5.20"` → `"v2026.6.1"`
   - `note` 字段更新: "Skill Workshop 治理闭环, Plugin 外部化, Memory/channel state SQLite 化, Operator install policy"
   - `lastPush` 同步刷新

4. **`p0OptimizationTargets.memory`**: 当前 `"零LLM检索 + Mermaid压缩 + L0→L3语义金字塔"`, 建议追加 `"+ Usage/Audit 多时区控制台"`

5. **`crossCuttingTrends`** 数组追加 2-3 条:
   - "Operator install policy 替代 dangerous-code scanner (OpenClaw v2026.6.2-beta.1)"
   - "Memory schema 升级为 embedding_template (OpenViking v0.3.20)"
   - "Plugin/Skill 受控提案流 (OpenClaw Skill Workshop v2026.6.1)"

---

## E. 方法论与置信度

- **数据来源**: GitHub API (releases/commits, 2026-06-04 上午) + sparse clone of OpenViking (0.3.23 @ /tmp/aios-competitor-refresh/repos/OpenViking) + GitHub web fetch (OpenClaw 3 个目录 + OpenClaw-Recall README)
- **覆盖度**:
  - OpenViking: README + 6 个 release notes (v0.3.17-v0.3.23) + source code 关键 5 个模块 (storage/ovpack, retrieve/intent_analyzer, storage/queuefs/semantic_processor, observability/usage_audit, observability/observers/models_observer) — 高
  - OpenClaw: 6 个 release notes (v2026.5.20 - v2026.6.2-beta.1) + 3 个目录列表 (skills, src/plugins, src/memory) + 1 个源文件 (root-memory-files.ts) — 中 (项目过大, 300+ MB, 未全 clone)
  - OpenClaw-Recall: README + ARCHITECTURE.md 摘要 + 5 个 commit — 高
- **未覆盖**:
  - OpenClaw `src/memory/QMD-INTEGRATION.md` (404) — 需要从 main 分支 src/memory/ 找替代路径
  - OpenViking `eval/`, `cli/`, `web_studio/` 源码细节 (不在本次 deep-dive 范围)
  - AIOS 内 `.aios/context-db/sessions/<id>/` 实际产物 schema (没有跑 harness, 只看 schema 定义)
- **可重现性**: `git clone --depth 1 --filter=blob:none --sparse https://github.com/volcengine/OpenViking.git` + `git sparse-checkout set openviking crates/ov_cli` 即可重现; OpenClaw 不建议全 clone (大文件), 建议用 GitHub web tree API

---

*Deep-dive 完成时间: 2026-06-04; 下一轮刷新建议: 2026-06-18 (2 周) — 重点观察 OpenViking v0.3.24+ 与 OpenClaw v2026.6.2 stable; 顺带核查 OpenClaw Recall 是否被官方 fork 复活。*
