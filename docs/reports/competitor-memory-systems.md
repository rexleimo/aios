# 竞品库：Agent Memory 系统

> 收录对 AIOS 有参考价值的外部 Agent 记忆/上下文压缩方案。
> 最后更新: 2026-05-22 | 并行Agent分析刷新
>
> **权威清单**：以 `docs/reports/competitor-watchlist.json`（schema v3，2026-07-09）为准。
> 记忆轨现跟踪：TencentDB / mem0 / Graphiti（取代 zep 壳）/ Letta Code（取代 letta 主仓）/ OpenViking。
> 本文保留历史 deep-dive 细节，元数据与优先级以 watchlist 为准。

---

## TencentDB-Agent-Memory

- **仓库**: https://github.com/Tencent/TencentDB-Agent-Memory
- **收录日期**: 2026-05-17
- **最后刷新**: 2026-05-22
- **Stars**: 3,299 | **Forks**: 250 | **最后推送**: 2026-05-18
- **最新版本**: v0.3.4 (2026-05-13) | **贡献者**: 2 (Yuntong8888, Maxwell-Code07)
- **许可证**: MIT
- **集成目标**: OpenClaw plugin / Hermes Gateway（Docker）
- **存储后端**: SQLite + sqlite-vec（本地，开箱即用）

### 核心主张

> "Symbolic short-term memory + Layered long-term memory"
> 拒绝平铺存储，拥抱分层与符号化。

### 实测数据（连续长任务，非单轮）

| 场景 | 成功率提升 | Token 节省 |
|------|-----------|-----------|
| WideSearch | +51.52% | **−61.38%** |
| SWE-bench（50 连续任务） | +9.93% | −33.09% |
| AA-LCR | +7.95% | −30.98% |
| PersonaMem 准确率 | 48% → 76% | — |

---

### 为什么能省这么多 Token？

#### 1. 短期记忆：符号化压缩（Mermaid Canvas）

传统做法把所有工具调用日志（搜索结果、代码、错误栈）全部塞进上下文，
几十万 token 的冗余是常态。

TencentDB 的做法：

```
原始工具日志（数十万 token）
    ↓ 1. 全文 offload 到外部文件 refs/*.md
    ↓ 2. 提取关系 → Mermaid 图（带 node_id）
    ↓ 3. 只把 Mermaid 图注入上下文（几百 token）
    ↓ 4. 需要细节时，Agent 用 node_id grep 原始文件
```

**关键洞察**：LLM 推理只需要"任务状态图"，不需要原始日志。
Mermaid 语法对 LLM 可解析，对人类可读，信息密度极高。

触发阈值可配置：
- `offload.mildOffloadRatio = 0.5`（上下文窗口 50% 时轻度压缩）
- `offload.aggressiveCompressRatio = 0.85`（85% 时激进压缩）
- `offload.mmdMaxTokenRatio = 0.2`（Mermaid 图最多占 20% 上下文）

#### 2. 长期记忆：L0→L3 语义金字塔（避免平铺向量堆）

```
L0 原始对话（全文，存 DB）
  ↓ 每 N 轮触发 L1 提取
L1 原子事实（atomic facts，JSONL）
  ↓ 场景聚合
L2 场景块（Scenario，Markdown）
  ↓ 人格蒸馏
L3 用户画像（Persona，persona.md）
```

日常推理只读 L3（几百 token），需要细节时按需下钻到 L1/L0。
平铺向量库的问题是"召回即全量"，这里是"召回即摘要，细节按需"。

#### 3. 无损可追溯（不是有损摘要）

每一层都保留 `node_id` / `result_ref` 指针，可以从 Persona 一路追溯到原始对话。
这解决了传统摘要"省了 token 但丢了证据"的问题。

#### 4. 混合检索（BM25 + 向量 + RRF 融合）

召回时不依赖单一策略，关键词命中 + 语义相似度融合，减少"召回噪声"注入上下文。

---

### 架构亮点

| 特性 | 说明 |
|------|------|
| 白盒可调试 | L2/L3 是普通 Markdown，可直接打开检查 |
| 零配置启动 | SQLite 本地后端，无需外部服务 |
| 渐进式披露 | 上层摘要 + 下层证据，按需展开 |
| 技能生成 | 从执行轨迹自动提炼可复用 Skill/SOP（Roadmap） |
| 跨 Agent 迁移 | 记忆可跨框架导入导出（Roadmap） |

---

### 工程化亮点

| 能力 | 说明 |
|------|------|
| OpenClaw 插件 | 安装即用，自动捕获/提取/召回 |
| Hermes Gateway 适配器 | TdaiCore + HostAdapter，解耦宿主框架 |
| Agent 工具 | `tdai_memory_search` / `tdai_conversation_search` 供 Agent 主动查询 |
| 调试路径 | `~/.openclaw/memory-tdai/` 下可逐层检查 Persona→Scenario→Atom→Conversation |
| 热身策略 | 新会话从 turn 1 触发提取，指数退避（1→2→4…）直到 everyNConversations |
| 空闲提取 | 用户空闲 `l1IdleTimeoutSeconds`（默认 600s）后触发 L1，不浪费对话中延迟 |
| L2 防抖 | 同一会话两次 L2 间隔 ≥ `l2MinIntervalSeconds`（默认 900s） |

### Roadmap（方向参考）

- [x] 长期个性化记忆 L0→L3
- [x] 短期上下文压缩（offload + Mermaid canvas）
- [x] 本地 SQLite + 腾讯云向量数据库后端
- [x] OpenClaw / Hermes 集成
- [ ] 便携记忆：跨 Agent / 跨框架 / 跨设备导入导出与实时迁移
- [ ] 自动 Skill 生成
- [ ] 可视化调试与记忆可观测性 Dashboard

---

### 与 AIOS 的对比

| 维度 | TencentDB-Agent-Memory | AIOS 当前方案 |
|------|----------------------|--------------|
| 短期压缩 | Mermaid Canvas + offload | aios-compress（prompt 级别输出压缩） |
| 长期记忆 | L0→L3 金字塔 + SQLite | JSON 文件 + ContextDB |
| 检索 | BM25 + 向量 + RRF | 文件读取 + 手动索引 |
| Token 节省机制 | 工具日志 offload（最大效益来源） | 输出压缩 + 语义快照优先 |
| 可调试性 | Markdown 文件，白盒 | JSON 文件，白盒 |
| 集成方式 | OpenClaw plugin / Docker | Claude Code 原生 |

**最大差距**：AIOS 目前没有"工具调用日志 offload + Mermaid 状态图"机制。
这是 TencentDB 节省 61% token 的核心来源，值得借鉴。

---

### 可借鉴的具体思路

1. **工具日志 offload**：长任务中把 bash/browser 工具的原始输出写到 `.aios/refs/` 文件，
   上下文只保留摘要 + `node_id`，需要时 grep 回来。

2. **Mermaid 任务状态图**：harness 执行时维护一个 Mermaid 图表示任务进度，
   替代冗长的 JSONL checkpoint 注入。

3. **L1 原子事实提取**：每 N 轮对话后，用小模型提取关键事实存 JSONL，
   而不是把整段对话塞进 context-pack。

4. **触发阈值配置**：根据上下文窗口使用率动态决定压缩力度，
   而不是固定的 tight/ultra 模式。

5. **Agent 主动查询工具**：暴露 `tdai_memory_search` 类工具让 Agent 按需召回，
   而非仅靠自动注入——AIOS 可在 MCP 层增加类似工具。

6. **空闲触发 + 热身退避**：不阻塞对话流，空闲时做提取，
   新会话指数退避——比 AIOS 当前"每次都全量 pack"更轻量。

---

---

## mem0

- **仓库**: https://github.com/mem0ai/mem0
- **收录日期**: 2026-05-17
- **最后刷新**: 2026-05-22
- **Stars**: 56,240 | **Forks**: 6,402 | **最后推送**: 2026-05-19
- **最新版本**: cli-v0.2.5 (2026-05-14) | **贡献者**: 310 (Dev-Khant, deshraj, taranjeet 等)
- **许可证**: Apache 2.0
- **集成目标**: Python/Node SDK、Self-Hosted Server、Cloud SaaS
- **存储后端**: 22 种向量数据库（Qdrant 默认）+ SQLite（历史记录）

### 核心主张

> "Single-pass ADD-only memory extraction"
> 记忆提取只做一次 LLM 调用，检索完全不用 LLM。

### 实测数据（V3 算法，2026-04）

| Benchmark | 旧算法 | V3 新算法 | Token 消耗 | 延迟 p50 |
|-----------|--------|-----------|-----------|---------|
| LoCoMo | 71.4 | **91.6** (+20.2) | 7.0K | 0.88s |
| LongMemEval | 67.8 | **94.8** (+27.0) | 6.8K | 1.09s |
| BEAM (1M) | — | **64.1** | 6.7K | 1.00s |
| BEAM (10M) | — | **48.6** | 6.9K | 1.05s |

### 为什么能省 Token？

#### 1. 单次 LLM 提取（V3 ADD-only Pipeline）

旧算法需要 LLM 判断 ADD/UPDATE/DELETE，多次调用。
V3 改为纯累积式：一次 LLM 调用提取事实并直接 ADD，不做 UPDATE/DELETE。
去重由 MD5 hash 在 CPU 侧完成，不消耗 LLM token。

**关键洞察**：记忆管理不需要 LLM 做复杂决策，累积式写入 + CPU 去重就够了。

#### 2. 无 LLM 检索

检索阶段完全不用 LLM 调用，纯向量 + BM25 + 实体融合评分。
平均检索 token 消耗仅 6.7-7.0K。

#### 3. 多信号融合检索（语义 + BM25 + 实体增强）

```
查询 → 词形还原 + 实体提取
     → 语义向量搜索（over-fetch 4x）
     → BM25 关键词搜索
     → 实体增强（查询实体 → 实体库搜索 → 关联记忆加分，spread-attenuated）
     → 加性评分融合：combined = (semantic + bm25 + entity_boost) / max
     → 阈值过滤 + top-k 截断
     → 可选 Reranker
```

### 架构亮点

| 特性 | 说明 |
|------|------|
| 三层作用域 | user_id / agent_id / run_id，可叠加 |
| 独立实体层 | 实体向量库，跨记忆链接，检索增强用 |
| Agent 自助注册 | `mem0 init --agent` 5 秒获取 API key |
| Framework 集成 | Langgraph、CrewAI、Vercel AI SDK 等 |
| 记忆类型枚举 | semantic / episodic / procedural（当前仅 procedural 有专门逻辑）|

### 与 AIOS 的对比

| 维度 | mem0 | AIOS |
|------|------|------|
| 记忆存储 | 向量数据库 + SQLite | JSON 文件 (ContextDB) |
| Token 优化 | 单次 LLM 架构 + 无 LLM 检索 | 输入压缩 + 输出压缩 |
| 检索 | 语义 + BM25 + 实体三信号融合 | ContextDB pull-based 索引 |
| 实体关联 | 独立实体向量库 | 无独立实体层 |
| 记忆更新 | 累积式 ADD-only（V3） | Git-friendly 存储，手动/脚本管理 |
| 规模化 | 支持 1M-10M token 级记忆 | 面向单用户桌面场景 |

### 可借鉴思路

1. **ADD-only 累积写入**：AIOS 的 memo/ContextDB 可以借鉴"只追加不修改"策略，
   减少复杂的合并/更新逻辑，用 CPU 去重替代 LLM 判断。

2. **实体提取 + 关联**：从对话中提取实体（人物、项目、概念），
   跨记忆链接，检索时做实体增强——比纯文本搜索更精准。

3. **多信号融合检索**：AIOS 当前只有文件读取，可以增加 BM25 索引层，
   不需要向量数据库也能提升检索质量。

---

## Zep

- **仓库**: https://github.com/getzep/zep
- **收录日期**: 2026-05-17
- **最后刷新**: 2026-05-22
- **Stars**: 4,584 | **Forks**: 627 | **最后推送**: 2026-04-09 (主库较安静)
- **最新版本**: zep-python v3.22.0 (2026-05-04) | **贡献者**: 20
- **许可证**: Apache 2.0（核心引擎 Graphiti 也 Apache 2.0）
- **集成目标**: Python/TS/Go SDK、REST API、MCP Server
- **存储后端**: Neo4j（默认）/ FalkorDB / Kuzu / Amazon Neptune

### 核心主张

> "Temporal Knowledge Graph for Agent Memory"
> 事实不删除，只失效。时序知识图谱驱动记忆管理。

### 实测数据

| 配置 | 准确率 | 中位延迟 | 上下文 Token |
|------|--------|----------|-------------|
| Zep + GPT-4o | **71.2%** | 2.58s | ~1.6K |
| 全上下文 + GPT-4o | 60.2% | 28.9s | ~115K |
| Zep + GPT-4o-mini | **63.8%** | 3.20s | ~1.6K |
| 全上下文 + GPT-4o-mini | 55.4% | 31.3s | ~115K |

**Token 压缩比 < 2%**（1.6K vs 115K），同时准确率更高。

### 为什么能省这么多 Token？

#### 1. 时序知识图谱替代原始历史

不是把对话历史塞进上下文，而是用图谱摘要替代：
- **Entities（实体/节点）**：人物、产品、概念，附叙事摘要
- **Facts（事实/边）**：关系三元组 + `valid_at` / `invalid_at` 时间窗口
- **Episodes（溯源）**：原始输入逐字存储，所有事实可溯源

检索时只返回相关的实体摘要 + 事实，而不是整个对话历史。

#### 2. 四时间戳事实失效机制

每条事实有四个时间戳：`created_at`、`valid_at`、`invalid_at`、`expired_at`。
新信息与旧事实矛盾时，旧事实不删除，只标记 `invalid_at`。
这解决了"记忆冲突"问题，同时保留完整时序证据。

#### 3. Context Block 自动组装

自动组合用户摘要 + 相关事实 + 实体 + 溯源，仅用最近 2 条消息作为查询锚点。
P95 延迟 < 200ms。

### 架构亮点

| 特性 | 说明 |
|------|------|
| 时序推理核心 | 四时间戳事实失效，天然支持"以前是X，现在是Y" |
| 自定义本体 | Pydantic 模型定义实体/边类型 |
| 增量构建 | 无需批量重算，新信息即时融入图谱 |
| MCP Server | 支持 Claude/Cursor 等 MCP 客户端 |
| Graphiti 开源核心 | 可完全自建，不依赖 SaaS |
| 论文支撑 | arXiv:2501.13956 |

### 与 AIOS 的对比

| 维度 | Zep | AIOS |
|------|-----|------|
| 记忆结构 | 时序知识图谱（实体-关系-事实） | JSON 文件系统 |
| Token 优化 | 架构级（图谱摘要 <2% token） | Prompt 级（输出纪律 ~60%） |
| 时序推理 | 核心能力，四时间戳事实失效 | 无内置时序支持 |
| 检索 | 语义 + BM25 + 图遍历混合 | 无内置检索 |
| 存储 | 图数据库（Neo4j 等） | 文件系统 JSON |
| LLM 依赖 | 摄入和抽取依赖 LLM | 无内置 LLM 调用 |

### 可借鉴思路

1. **事实失效而非删除**：AIOS 的 memo 可以增加 `valid_at` / `invalid_at` 字段，
   当用户偏好改变时标记旧条目失效，而不是覆盖。

2. **图谱式记忆结构**：当前 AIOS 记忆是扁平 JSON，可以考虑增加实体-关系建模，
   至少在 memo 层面记录"谁-做了什么-和谁"的关系。

3. **Context Block 模式**：自动组装"摘要 + 最近事实 + 相关实体"的紧凑上下文块，
   替代把整个记忆文件加载进上下文。

---

## Letta（原 MemGPT）

- **仓库**: https://github.com/letta-ai/letta
- **收录日期**: 2026-05-17
- **最后刷新**: 2026-05-22
- **Stars**: 22,831 | **Forks**: 2,432 | **最后推送**: 2026-05-14
- **最新版本**: v0.16.8 (2026-05-14) | **贡献者**: 140
- **子项目监控**: claude-subconscious (2,606★), letta-code (2,114★), agent-file (1,032★)
- **许可证**: Apache 2.0
- **集成目标**: Python/TS SDK、REST API、CLI、MCP Server
- **存储后端**: SQLite（默认）/ PostgreSQL + pgvector（生产）/ ChromaDB（向量）

### 核心主张

> "OS-style virtual memory management for LLMs"
> 上下文窗口 = RAM，外部存储 = 磁盘，智能调度突破窗口限制。

### 实测数据

**MemGPT 论文**（arXiv:2310.08560）：

| Benchmark | 结果 |
|-----------|------|
| Multi-Session Chat | GPT-4 + MemGPT 记忆召回比固定上下文提升 **~2 倍** |
| 文档 QA | 超窗口长文档保持全上下文性能 **>80%**，仅用一小部分上下文窗口 |
| 记忆操作准确率 | page-in/page-out/search 正确率 **>90%** |

**Sleep-Time Agent 论文**（arXiv:2503.01477）：

| 指标 | 结果 |
|------|------|
| 长程 benchmark 性能 | 显著提升 |
| per-interaction token 成本 | 降低最多 **3 倍** |

### 为什么能省 Token？

#### 1. 三层记忆体系（Core / Recall / Archival）

```
[Core Memory]    ← 上下文窗口内，即时读写（类似 RAM/L1 缓存）
    ↓ page_in / page_out
[Recall Memory]  ← 对话历史，可搜索（类似 L2 缓存）
    ↓ search / archive
[Archival Memory] ← 持久存储，语义搜索（类似磁盘/SSD）
```

Agent 自主决定什么留在 Core（即时可用），什么下沉到 Archival。
Core Memory 划分为具名 block（`human`、`persona`、`scratchpad`），
每个 block 可编辑，字符限制 20K-100K。

#### 2. 自动摘要压缩

当 step 用量超过 `context_window * 0.9`（90% 阈值）时自动触发摘要压缩。
压缩前先警告 agent，提示其将重要信息保存到 core/archival memory。

#### 3. Sleep-Time Agent（核心创新）

```
唤醒期 Agent ←→ 共享记忆空间 ←→ 休眠期 Agent
  (实时交互)                    (空闲时后台运行)
```

- 休眠期 Agent 有独立系统提示、独立 LLM 后端（可用更便宜模型）
- 执行：回顾近期交互、合并关联记忆、归档过时信息、重组上下文
- 触发方式：空闲超时 / cron 定时 / API 手动
- **效果**：长程性能提升 + per-interaction token 成本降低最多 3 倍

**关键洞察**：记忆整理不需要占用用户交互时间，空闲时用便宜模型做即可。

### 架构亮点

| 特性 | 说明 |
|------|------|
| Memory Blocks | 具名可编辑 block，跨 agent 可共享 |
| Agent 自主管理 | 通过工具函数（`core_memory_replace`、`archival_memory_search` 等）自控记忆 |
| Sleep-Time Agent | 离线记忆整理，唤醒期上下文保持干净 |
| MCP 集成 | 内置 MCP server/tool 支持 |
| 多后端 | SQLite/PostgreSQL/ChromaDB/Pinecone/Qdrant/Redis |
| 论文支撑 | arXiv:2310.08560 + arXiv:2503.01477 |

### 与 AIOS 的对比

| 维度 | Letta | AIOS |
|------|-------|------|
| 记忆管理 | Agent 自主（push + pull） | 按需拉取（pull-based registry） |
| 记忆层次 | Core / Recall / Archival 三层 | ContextDB 单层 + JSON 文件 |
| Token 优化 | 摘要压缩 + 语义分页 + 休眠期整理 | 输入/输出压缩 |
| 离线整理 | Sleep-Time Agent（核心创新） | 无 |
| 存储 | PostgreSQL + pgvector（生产级） | JSON 文件 |
| 上下文预算 | Block 字符限制（20K-100K） | 无硬性预算 |

### 可借鉴思路

1. **Memory Block 机制**：AIOS 的 memo pin 可以改为具名 block，
   每个有字符上限，超出时需要 agent 主动整理——防止无限膨胀。

2. **Sleep-Time 离线整理**：AIOS harness 的 `--checkpoint` 已经在会话间保存状态，
   可以增加一个"空闲时自动整理"步骤，用便宜模型做摘要、合并、归档。

3. **90% 阈值自动摘要**：AIOS 可以监测上下文使用率，
   接近窗口上限时自动触发 offload + 摘要，而不是等到 session 崩溃。

4. **Agent 自主记忆管理工具**：暴露 `memory_replace`、`memory_search` 等 MCP 工具，
   让 agent 主动决定保留/归档什么——当前 AIOS 的记忆管理全是脚本驱动的。

---

## 四家竞品横向对比 (2026-05-22 刷新)

| 维度 | TencentDB | mem0 | Zep | Letta | AIOS |
|------|-----------|------|-----|-------|------|
| Stars | 3,299 | **56,240** | 4,584 | 22,831 | N/A |
| 核心创新 | Mermaid 符号化 + L0-L3 分层 | 单次 LLM 提取 + ADD-only | 时序知识图谱 + 事实失效 | 虚拟内存 + Sleep-Time | 输入/输出压缩 |
| 最大 Token 节省 | 61% | N/A（架构级优化） | >98%（1.6K vs 115K） | 3x per-interaction | ~60% 输出 |
| 记忆结构 | 语义金字塔 | 向量 + 实体 | 知识图谱 | 三层虚拟内存 | JSON 文件 |
| 检索方式 | BM25+向量+RRF | 语义+BM25+实体 | 语义+BM25+图遍历 | 纯向量搜索 | 文件读取 |
| 离线整理 | 空闲触发 L1 | 无 | 无 | Sleep-Time Agent | 无 |
| 存储 | SQLite | 22 种向量DB | Neo4j 等图DB | SQLite/PostgreSQL | JSON 文件 |
| LLM 依赖 | 提取用 | 提取用 | 摄入+抽取用 | 摘要用 | 无 |
| 自托管 | 完全本地 | 可选 | Graphiti 可 | 可选 | 完全本地 |
| 活跃度 | 活跃(v0.3.4) | **极活跃**(310贡献者) | 主库安静(4月) | 活跃(v0.16.8) | v1.20.4 |

### AIOS 最值得借鉴的 Top 5 (2026-05-22 更新)

1. **工具日志 offload + Mermaid 状态图**（来自 TencentDB）— 已有设计 spec
2. **零LLM检索管道**（来自 mem0）— 写入一次LLM提取，检索纯向量/关键词，大幅降低延迟
3. **语义金字塔 L0→L3 分层压缩**（来自 TencentDB）— 对齐 aios-compress 三级到渐进披露
4. **Sleep-Time 离线整理**（来自 Letta）— 用便宜模型空闲时做摘要/合并/归档
5. **事实失效而非删除**（来自 Zep）— memo 增加 `valid_at` / `invalid_at`，支持时序推理
