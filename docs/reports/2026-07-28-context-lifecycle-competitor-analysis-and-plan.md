# Context Lifecycle 竞品全量刷新、源码审计与落地方案

> 日期：2026-07-28
> 目标仓库：`E:\coding\aios`
> 本项目基线：`main` / `bfb9ce2`
> 问题输入：微信文章 `https://mp.weixin.qq.com/s/_TJ8MmRoCx5h19UbMMtoAA` 与原始论文 arXiv:2607.21503

## 0. 结论先行

这轮不建议再加一个“更大的记忆库”，也不建议直接复制论文中的向量库、图数据库或专有预测器。

**最有价值的更新是：把当前已有的 memo、offload、continuity、handoff、dry-run、Rex work item 串成一个可验证的 Context Lifecycle。** 核心产物不是一段摘要，而是四个有版本、可追溯、可校验的对象：

1. **`ContextItem`**：每条事实、约束、假设、证据都带作用域、来源、可信度、时效和原文引用。
2. **`ContextCard`**：一个 work item 当前真正需要“放在脑中”的目标、验收、硬约束、工作集、待验证假设与下一步验证命令。
3. **`ExecutionContextPacket`**：一次具体修改允许写什么、必须读什么、影响哪些接口/测试，以及读取时的内容基线。
4. **`ContextReceipt`**：每轮实际注入了什么、为什么注入、哪些因预算降级或被排除，以及来源 hash。

针对“修改时要把上下文一起考虑”的直接方案是增加一个**确定性的 Change Context Resolver**：在编辑前，从目标文件/符号、调用关系、相关测试、当前 work item、项目约束、历史决策和最近失败中生成工作集；在编辑后刷新影响面并验证。它是论文中 `anticipating` 在本地 coding-agent 场景里的低风险实现，而不是先上预测模型。

建议分四个优先级落地：

- **A0 安全修正**：先修 private supersede、共享发布权限、Agent provenance 和 Dream 物理删除；session close 不再把最后一段 assistant 文本直接晋升为共享长期记忆。
- **A1 ContextCard + ContextItem**：建立统一 schema、作用域和来源信任等级。
- **A2 修改前工作集**：Change Context Resolver + task-context preflight + 按类别预算的 assembler。
- **A3 可验证压缩与交接**：压缩必须保留硬约束/证据/假设边界；handoff 带 card revision、证据和验证命令。

### Team 交叉评审结论

三路独立评审的共同结论是：**方向通过，但当前 Team/多 Agent 生产落地是 NO-GO。**

- 记忆评审认为应把“语义压缩”和“热上下文卸载”拆成两条链，并明确区分物理删除、逻辑过期、事实 retirement、supersede、排序衰减和上下文驱逐。
- 规划评审把核心问题收敛为：`Plan-bound Context Impact Set → Execution Context Packet → Write Preflight → Post-change Reconciliation`，而不是继续增加 prompt 长度。
- 治理评审发现了一个必须先修的跨 Agent 失效路径：私有 memo 可以 supersede 共享 memo，导致其他 Agent 的共享事实被静默隐藏；同时 Dream consolidation 会跨 Agent 去重并物理删除历史。

因此本方案的试用边界是：单用户、本地工作区、可信 Agent、默认 preview。只有通过第 8 节的 Team 安全阻断测试后，才允许多个 Agent 写 shared canonical memory。

---

## 1. 证据规则与刷新覆盖

### 1.1 证据标签

- `[SRC]`：本轮直接读取的源码。
- `[SRC-SNAPSHOT]`：2026-07-26 的完整源码树，本轮用 GitHub 当前 `pushed_at` 判断新鲜度。
- `[TEST]`：本轮实际执行的测试结果。
- `[WEB]`：GitHub API、微信文章、Hugging Face 或 arXiv 当前页面。
- `[PAPER]`：arXiv:2607.21503 的架构/实验主张；核心实现为专有机制，未独立复现。
- `[INFER]`：基于双侧证据的建议，不等同于已经实现。

### 1.2 12/12 竞品覆盖

2026-07-28 已通过 GitHub API 刷新 watchlist 中 12 个仓库的当前元数据。所有 12 个仓库都有完整本地源码树；其中：

- `getzep/graphiti`、`letta-ai/letta-code`、`volcengine/OpenViking` 已在 2026-07-28 重新拉取当前完整源码。
- TencentDB-Agent-Memory、mem0、superpowers、OpenHarness、gnhf 的当前 `pushed_at` 不晚于 2026-07-26 完整源码快照，可把快照视为当前源码覆盖。
- Hermes Agent、oh-my-openagent、ECC、OpenClaw 在 2026-07-26 后有 push；本轮保留完整快照并对关键上下文机制做定向核对。全量 codeload 因单次 600 秒下载限制未完成，报告不把这四个仓库的完整快照冒充 2026-07-28 HEAD。
- GitHub release feed 本轮连接失败，`latestRelease` 不作为本轮新鲜结论依据。

| 竞品 | 当前元数据 | 本地源码新鲜度 | 对本轮最有价值的信号 |
|---|---:|---:|---|
| TencentDB-Agent-Memory | 2026-07-28 | 当前 | 预算、分层 offload、`node_id → result_ref` 溯源 |
| mem0 | 2026-07-28 | 当前 | SessionStart/Stop/PreCompact 生命周期 hook；自动写入也暴露“未验证内容晋升”风险 |
| Graphiti | 2026-07-28 | 2026-07-28 | 双时态事实与 episode provenance |
| Letta Code | 2026-07-28 | 2026-07-28 | 版本化记忆；按实际读取记录 memory citation 的 prototype |
| OpenViking | 2026-07-28 | 2026-07-28 | agent scope 隔离；超预算降级成 link-only 而非静默丢弃 |
| superpowers | 2026-07-28 | 当前 | 计划/实现/规格审查/质量审查分阶段 |
| Hermes Agent | 2026-07-28 | 2026-07-26 完整快照 + 定向核对 | curator、后台 review、写入 provenance |
| OpenHarness | 2026-07-28 | 当前 | dry-run 与 Dream preview/apply，但 preview 写保护不足是反例 |
| oh-my-openagent | 2026-07-28 | 2026-07-26 完整快照 + 定向核对 | 角色过滤与瘦 prompt；关键词路由不适合作为 Context Lifecycle 核心 |
| gnhf | 2026-07-28 | 当前 | failure/error 分离与失败原文回灌；不是主要 Context Lifecycle 参考 |
| ECC | 2026-07-28 | 2026-07-26 完整快照 + 定向核对 | changed-files ledger、Plan Canvas、skill comply |
| OpenClaw | 2026-07-28 | 2026-07-26 完整快照 + 定向核对 | proposal/review/apply/rollback、provenance 与 stale hash 治理 |

---

## 2. 文章与原论文真正提出了什么

微信文章的核心不是“做一次摘要”，而是把 context 当成一个持续生命周期。原论文将其拆成五个耦合动作：

1. **Architecting**：先决定应捕获哪些类别、存哪里、保留多久、如何召回与压缩。
2. **Ingesting**：把对话、工具输出、文档等原始信号转成结构化可检索对象；摄入质量决定召回上限。
3. **Scoping**：在写入和召回两侧执行隔离与层级作用域。
4. **Anticipating**：准备下一步可能需要、但当前查询尚未显式要求的 context。
5. **Compacting & Consolidation**：在预算内压缩，但必须能验证关键信息仍可恢复。

论文还明确指出：粗摘要虽然能降低 token，但可能出现 accuracy cliff；参考系统因此给每次压缩返回 validation score 与 compression ratio，失败时降低压缩强度重试。[PAPER]

### 必须保留的批判性判断

- 论文是单作者预印本；`92% LongMemEval`、`93.2% LoCoMo`、anticipation `60%+ hit rate` 为作者自报，未在本轮独立复现。
- per-agent 架构自动生成、anticipation 预测器与压缩验证机制均未公开内部实现。
- 因此可以采用“五动作 + 质量契约”的框架，但**不能用这些自报数字证明某个具体实现有效**。
- AIOS 是 local-first coding harness，不应复制其 polyglot storage 或默认依赖 LLM 的架构生成。

---

## 3. 本项目源码审计：已有能力、真实缺口

### 3.1 已有能力值得保留

1. **原始工具输出已能 offload**：`scripts/lib/offload/tool-offload.mjs:58-79` 写 ref，记录 tool、输入摘要、退出码和分类。
2. **context pack 已有 source hash**：`scripts/lib/contextdb/pack-manifest.mjs:58-75` 为来源清单记录 SHA-256。
3. **事实替代语义已实现**：`scripts/lib/memo/storage/temporal.mjs:39-78` 可推导 `invalidAt` / `supersededBy`，支持 as-of 查询。
4. **handoff 已有 assumptions/confidence**：`scripts/lib/contextdb/handoff.mjs:79-108,141-175` 比纯摘要更强。
5. **role memory 已有 Agent 私有边界**：`scripts/lib/harness/subagent-runtime/role-memory.mjs:17-31,55-73`。
6. **hindsight 已有“候选、人工审查后持久化”的正确模式**：`scripts/lib/harness/learn-eval/recommendations/hindsight-drafts.mjs:180-188,216-231`。
7. **测试基线真实通过**：本轮运行 context/memo/handoff/offload 7 个测试文件，`69/69` 通过。[TEST]

### 3.2 五动作能力矩阵

| 生命周期动作 | 当前状态 | 源码证据 | 缺口 |
|---|---|---|---|
| Architecting | 部分 | `contextdb/facade.mjs:22-54` 只有固定 L0/L1/L2 与按新鲜度/访问次数分类；`context-registry.mjs:10-27` 只有固定来源 | 没有 work-item `ContextCard`；全库扫描 `context card` 为 0；没有任务类型对应的保留/压缩策略 |
| Ingesting | 部分 | tool offload、memo event、session close 都能写入 | 缺少统一 ContextItem schema、来源可信等级和 promotion gate；原始、证据、假设、噪声未被稳定区分 |
| Scoping | 弱 | `memo/storage/normalizers.mjs:44-49` 仅 `project_shared / agent_private / agent_ephemeral` | 不足以表示 host policy / project / work item / session / agent；召回前没有完整 ACL/scope predicate |
| Anticipating | 缺失 | `dry-run-readiness.mjs:7-14,54-106` 只检查 context index、git、provider、session 基础设施 | 全库 `working set / context checklist / anticipating` 为 0；编辑前不会自动准备调用方、测试、项目约束和历史决策 |
| Compacting & Consolidation | 部分但无质量契约 | `search/budget.mjs:28-58` 做字符预算；`offload/mermaid-canvas.mjs:274-305` 生成压缩节点；Dream 可预览/应用 | 超预算事件会在 `search/budget.mjs:49-53` 静默停止；canvas summary 的 `ref` 为空；没有 must-preserve/证据可达性验证；Dream APPLY 会物理删事件/文件 |

### 3.3 六个优先级最高的风险

#### R0. Agent 私有 memo 可以静默失效另一个 Agent 的共享事实

`memo/storage/query.mjs:49-53` 明确先对整个 space 执行 `filterTemporal()`，再做 `filterMemoIdentity()`；`memo/storage/temporal.mjs:37-63` 会对所有 `supersedes` 链设置 `invalidAt`。与此同时，`memo/storage/events-write.mjs:115-143` 接受写入者传入的 `supersedes`，没有校验目标记录的 scope、owner 或发布权限。

这意味着 Agent B 的 `agent_private` 记录可以把 Agent A 可见的 `project_shared` 事实标记为失效，而 A 又看不到 B 的替代记录。独立治理评审已用临时数据复现该行为。[SRC]

这不是单纯的召回 bug，而是跨 Agent 的隐式写权限。修复顺序必须是：

1. 写入时禁止 private 记录 supersede shared/canonical 记录；
2. shared supersede 需要 publisher/steward capability、目标 revision 和 expected hash；
3. 读取时只应用调用主体有权看到且有权发布的替代关系；
4. 拒绝操作产生不可变 DENY receipt。

#### R0.2. Dream consolidation 会跨 Agent 去重并物理删除历史

`lifecycle/dream/index.mjs:122-166` 只把 `agent_private` 作为 sensitive 跳过，`project_shared` 会一起进入 dedup；`lifecycle/dream/dedup.mjs:106-197` 只按 space 聚类，并以时间和文本长度选 winner，不检查 owner、work item、来源可信度或 ACL。`dream/index.mjs:156-195` APPLY 会重写 JSONL 或 unlink split 文件。[SRC]

Dream 必须先生成 proposal；发布、supersede、consolidate 和 purge 应进入 steward 状态机，至少追加 `duplicate-candidate` / `superseded` / `archived` tombstone，保存 keep/drop IDs、输入输出 hash、算法版本、审批人和恢复指针。

#### R1. Scope 被当成了 ACL，Agent 身份和来源还可以自报

当前 memo scope 只有 `project_shared / agent_private / agent_ephemeral`（`memo/storage/normalizers.mjs:44-49`），它说明“适用范围”，不说明谁能读、谁能写、谁能发布或替代。`events-write.mjs:40-65` 还固定写 `role: 'user'`、`kind: 'memo'`，会把 Agent 生成的内容伪装成用户输入。[SRC]

需要独立的 Provenance Envelope：`principalId`、`agentId`、`runId`、`delegatedBy`、`model`、`claimStatus`、classification、policyVersion、source hashes 和 revision；Agent identity 必须由 runtime/orchestrator 注入，不能由正文或普通 CLI 参数自报。

#### R1.2. 未验证 assistant 文本可能被直接晋升为共享长期记忆

`scripts/lib/lifecycle/session-hooks/close.mjs:64-90` 取最后一段 assistant 文本和 touched files，直接写 `project_shared`、90 天 durability。它没有把“回答中的推断”与“已验证事实”分开，也没有 evidence/provenance gate。

mem0 的当前 Stop hook 同样自动抽取最后一段 assistant 文本，但至少带 `source=stop-hook`、`session_id`、`run_id` 与 90 天 expiration（`integrations/mem0-plugin/scripts/capture_session_summary.py:158-190`）。它说明自动捕获有产品价值，也同时证明自动晋升必须保留来源和时效。[SRC]

#### R2. 当前压缩是“能缩”，不是“证明没丢”

- `search/budget.mjs:49-53` 达到总预算后直接 `break`，被排除项没有 ref-only 占位或 receipt。
- `mermaid-canvas.mjs:284-300` 把旧节点聚成一个普通摘要节点且 `ref: ''`，无法从压缩节点直接验证被移除节点。
- `lifecycle/dream/index.mjs:156-195` APPLY 会重写 JSONL 或 unlink 事件文件；这与“保留来源再整理”的原则冲突。

#### R3. handoff 有摘要，但不是可合并的上下文契约；计划也没有绑定修改影响面

当前 handoff 有 intent/progress/nextActions/blockers/assumptions/confidence，但没有：

- `contextCardRevision` / base revision；
- `evidenceRefs` 与 hash；
- `verificationCommands`；
- 已验证 claim 与未验证 assumption 的机器可读分离；
- scope/visibility；
- 语义冲突记录。

因此多 Agent 可以“都成功返回”，但合并时仍可能基于不同版本的目标、旧事实或互相不可见的上下文工作。

同时，`planning/schema.mjs:175-185,220-238` 的 task/plan 结构没有 target、required context、接口、目录规则、读取基线或 revision；`harness/subagent-runtime/context-packet.mjs:1-7` 目前只提取 session ID，不是可执行的 Context Packet。`planning/auto-gate.mjs:236-286` 注入计划摘要和 expected evidence，但没有注入必读上下文或内容新鲜度。[SRC]

---

## 4. 竞品带来的高价值更新点

### 4.1 不要静默丢：full → summary+ref → ref-only

- TencentDB-Agent-Memory 在工具结果被替换时仍写入 `node_id`、summary 和 `result_ref`（`src/offload/l3-helpers.ts:222-229`）。[SRC]
- OpenViking 的 experience 预算说明明确：超出字符预算时降级为 `uri + score` 的 link-only，而不是直接丢弃（`bot/vikingbot/config/schema.py:623-633`）。[SRC]
- 本项目当前总预算达到后直接停止追加（`search/budget.mjs:49-53`）。[SRC]

**建议**：所有 context item 统一支持三级表示；即使不进入 prompt，也必须在 receipt 中留下 ref 和排除原因。

### 4.2 时效与来源应在同一个对象上

Graphiti 的 `EntityEdge` 同时保留：

- `episodes[]`：产生事实的原始 episode；
- `valid_at` / `invalid_at`：事实在现实世界的有效区间；
- `expired_at`：系统何时将其失效；
- `reference_time`：来源 episode 的参考时间。

见 `graphiti_core/edges.py:263-282`。[SRC]

本项目已经有 supersede/as-of，**不需要复制图数据库**；应补的是把 `sourceRefs`、`validFrom/invalidAt/expiresAt`、trust 与 scope 合并进 ContextItem。

### 4.3 Scope 必须先过滤，再排序

OpenViking 在 URI 层把 user 与 agent 组合进 namespace（`bot/vikingbot/openviking_mount/ov_server.py:404-416`），而且 recall 有单独数量/字符预算（`bot/vikingbot/config/schema.py:616-633`）。[SRC]

**建议**：AIOS 先按 scope/ACL 做硬过滤，再在允许集合内按 relevance/freshness/priority 排序；不能先全局检索再靠 prompt 提醒模型不要泄漏。

### 4.4 “用了哪些记忆”本身应成为证据

Letta Code 当前仓库有 memory-citations prototype：在 `tool_start` 观察实际读取的 memory path，记录 tool、toolCallId、confidence 和 evidence，再通过只读 snapshot 工具返回可引用路径；明确禁止编造引用（`docs/examples/mods/memory-citations.ts:162-196,242-318`）。[SRC，prototype]

**建议**：把这个思想提升为 `ContextReceipt`，不仅记录 memory 文件，还记录 card、约束、tool ref、handoff 和 code impact ref。

### 4.5 预算与 token 指标是必要条件，但不是压缩质量

TencentDB-Agent-Memory 有 per-memory 与 total recall budget（`src/core/hooks/auto-recall.ts:708-771`），也记录压缩前后 token、节省量与阈值（`src/offload/hooks/after-tool-call.ts:254-305`）。[SRC]

本项目已有字符预算和 context-window scaling，下一步不是复制更多阈值，而是增加：

- must-preserve 字段覆盖；
- evidence ref 可达性；
- assumption/fact 边界；
- acceptance/verification 命令保留；
- 失败后降低压缩强度的 fallback。

### 4.6 “压缩”必须拆成两条链，“遗忘”必须拆成六种语义

记忆评审确认竞品实际上在做两类不同工作：

1. **语义提炼**：conversation/episode → fact、entity、decision、experience、summary；
2. **热上下文卸载**：把高 token 内容移出当前 prompt，但保留 summary、ref 和可恢复原文。

本项目不能继续用一个 `compact` 名称混合二者。对应的失效状态也至少要区分：物理删除、逻辑过期、事实 retirement、supersede/merge、排序衰减、活跃上下文驱逐。Graphiti 的 `invalid_at`、Mem0 的 expiration、OpenViking 的 hotness 和 tool offload 都不能互相替代。[SRC]

### 4.7 Ingestion 需要可靠性契约，不只是“有 hook”

TencentDB 的 cursor/checkpoint 和 OpenViking 的 raw-first、durable queue、done/failed marker 说明 ingestion 还必须回答：

- 是否幂等；
- cursor 与写入是否在同一原子边界；
- 后台抽取失败时原始证据是否仍在；
- 中断恢复后能否区分 live / pending / completed / failed；
- 重放是否会重复发布 shared fact。

这些字段应进入 ContextReceipt/operation receipt，而不是只记一条“已自动保存记忆”的日志。

---

## 5. 推荐架构

### 5.1 四个核心对象

#### ContextItem

```json
{
  "id": "ctx_...",
  "kind": "constraint|fact|decision|assumption|evidence|tool_output|noise",
  "text": "...",
  "scope": "host|project|work_item|session|agent_private",
  "owner": "...",
  "visibility": ["..."],
  "trust": "canonical|verified|observed|hypothesis",
  "sourceRefs": [{ "uri": "...", "sha256": "..." }],
  "validFrom": "...",
  "invalidAt": null,
  "expiresAt": null,
  "status": "candidate|active|superseded|archived",
  "mustPreserve": false
}
```

关键规则：

- `hypothesis` 永远不能被压缩成 verified fact。
- 只有 canonical/verified 且有来源的 item 才能进入 hard constraints。
- credential/secret 不进入 card 文本，只保留“凭据存在/需要什么权限”的引用。
- scope/ACL 在排序前执行。

#### ContextCard

```json
{
  "schemaVersion": 1,
  "workItemKey": "...",
  "revision": 7,
  "goal": "...",
  "acceptanceCriteria": ["..."],
  "targetRefs": ["file:symbol"],
  "hardConstraintRefs": ["ctx_..."],
  "workingSetRefs": ["ctx_..."],
  "assumptionRefs": ["ctx_..."],
  "anticipatedNeeds": [
    { "trigger": "before_edit", "requiredRefs": ["..."], "status": "ready|warning|blocked" }
  ],
  "verificationCommands": ["..."],
  "updatedAt": "..."
}
```

它应成为 work item 的 L0，不再靠“最近一小时的记忆”隐式猜当前任务。

#### ExecutionContextPacket

ContextCard 表示 work item 的长期语义状态；ExecutionContextPacket 表示一次具体 mutation 的可执行契约。两者不能混为一个大 JSON。

```json
{
  "schemaVersion": 1,
  "packetId": "ctxp-...",
  "revision": 3,
  "status": "draft|ready|stale|closed",
  "planRef": {
    "planId": "...",
    "planRevision": 7,
    "taskId": "t3-implement",
    "taskRevision": 2
  },
  "mutation": {
    "targets": [{ "path": "scripts/lib/planning/schema.mjs", "operation": "modify" }],
    "allowedWrites": ["scripts/lib/planning/", "scripts/tests/"]
  },
  "impactSet": [
    {
      "id": "ctx-1",
      "requirement": "required|supporting|rule|interface|verification",
      "ref": "scripts/lib/planning/contract.mjs",
      "reason": "Persists and migrates the task schema",
      "expectedUse": "Keep old plans backward-compatible"
    }
  ],
  "readEvidence": [
    {
      "contextId": "ctx-1",
      "baseHash": "sha256:...",
      "expectedHash": "sha256:...",
      "gitBlob": "...",
      "ranges": ["1-328"],
      "readAt": "...",
      "anticipatedImpact": "Contract migration must preserve old tasks"
    }
  ],
  "verification": [{ "command": "node --test ...", "covers": ["ctx-1"] }]
}
```

Impact Set 的条目必须说明 `reason`。packet 是 manifest，不复制所有文件全文；正文仍由 read/search 工具按需加载。写前必须验证 required context 已读且 hash 新鲜，写后必须把实际 changed-files 与 targets/allowedWrites 对账。

#### ContextReceipt

```json
{
  "cardRevision": 7,
  "included": [{ "ref": "ctx_...", "reason": "hard_constraint", "representation": "full" }],
  "degraded": [{ "ref": "ctx_...", "representation": "ref_only", "reason": "budget" }],
  "excluded": [{ "ref": "ctx_...", "reason": "scope_denied|stale|low_score" }],
  "budget": { "used": 6200, "limit": 8000 },
  "sourceManifestSha256": "..."
}
```

Receipt 既支持用户解释，也给后续 A/B、curator 和 anticipation 提供真实数据。

### 5.2 修改前 Change Context Resolver

数据流：

```text
User intent
  → Rex work item / ContextCard
  → target file or symbol
  → code impact + related tests + project constraints + prior decisions + recent failures
  → scoped, budgeted working set
  → preflight ready/warning/blocked
  → edit
  → changed-files/evidence receipt
  → refresh card + verify
```

V1 只做确定性 anticipation：

1. 从 work item 取目标、验收和 expected evidence。
2. 从 target file/symbol 获取 callers、callees、importers、相关测试；有 CRG 时走 CRG，没有时用 import/文本搜索 fallback。
3. 读取项目指令与 target 邻近说明。
4. 合并当前未提交变更、最近失败、旧决策和 superseded 状态。
5. 检查缺口：目标不明确、相关测试未知、权限不足、card revision 过期、关键假设未验证。
6. 产出最小工作集，而不是把整段历史重新注入。

V2 只有在 Receipt 数据证明值得时，才增加预测式预取；否则不复制论文专有 anticipating 机制。

写前预检复用现有 `ready / warning / blocked` 结构。至少应阻塞：`missing_context_packet`、`plan_revision_mismatch`、`undeclared_write_target`、`required_context_unread`、`required_context_stale`、`directory_rules_not_loaded`、`ownership_mismatch` 和 `verification_missing`。

文件新鲜度应同时维护 `baseHash` 与 `expectedHash`：前者是最初读取基线，后者是本 session 上一次授权写入后的预期内容。这样可以区分本任务自己的连续合法修改与其他 Agent/用户的并发修改。

### 5.3 可验证压缩契约

每次压缩必须输出：

- objective / acceptance；
- hard constraints；
- verified findings；
- unverified assumptions；
- decisions + rationale；
- touched files / affected symbols；
- evidence refs 与 hash；
- failures worth retaining；
- next actions / verification commands；
- source card revision。

接受条件：

1. 所有 must-preserve item 仍可到达；
2. 每个 evidence ref 存在且 hash 匹配；
3. acceptance 与 verification command 100% 保留；
4. fact/assumption 不串类；
5. scope 不扩大；
6. source revision 未 stale。

任一硬条件失败：不接受该次压缩，自动改为更保守层级。LLM 语义评分只能作为附加信号，不能替代上述确定性门。

### 5.4 Team handoff/merge

在现有 handoff packet 上增量扩展：

- `contextCardRevision`；
- `claims[]`（verified/observed）；
- `evidenceRefs[]`；
- `verificationCommands[]` 与实际 receipt；
- `assumptions[]`；
- `scope` / `visibility`；
- `conflicts[]`；
- `baseRevision` / stale 检查。

合并规则：

- 文件无冲突不代表语义无冲突；同一 ContextItem 的不同值必须显式解决。
- agent-private item 不可被上卷成 project/shared。
- 未验证 claim 只能进入 assumptions。
- revision 过期时先 rebase context，再合并产物。

---

## 6. 落地优先级与现有模块复用

| 优先级 | 更新 | 主要落点 | 复用而不是重造 | 规模 |
|---|---|---|---|---:|
| A0 | supersede ACL + shared publish gate | `memo/storage/events-write.mjs`、`query.mjs`、`temporal.mjs` | 保留 append-only temporal，增加 owner/revision/hash/capability 校验 | M |
| A0 | Provenance Envelope / runtime identity | memo event、handoff、continuity、ContextDB event | 复用现有 session/agent 元数据，但身份由 orchestrator 注入 | M |
| A0 | session memo candidate gate | `lifecycle/session-hooks/close.mjs` | 复用 `hindsight-drafts` 的 candidate/manual review 模式 | S |
| A0 | Dream proposal + archive/tombstone | `lifecycle/dream/index.mjs`、`dedup.mjs`、temporal event | 复用 supersede/invalidAt；共享发布由 steward 审批 | M |
| A1 | ContextItem + ContextCard schema/storage | `contextdb/context-card.mjs`（新）、`contextdb/context-registry.mjs` | 复用 continuity、handoff、pack manifest hash | M |
| A1 | Plan v3 + ExecutionContextPacket | `planning/schema.mjs`、`planning/contract.mjs`、新 `context/context-packet.mjs` | `subagent-runtime/context-packet.mjs` 只保留薄适配 | M-L |
| A1 | ContextReceipt | `contextdb/receipt.mjs`（新）、facade/assembler | 复用 offload refs 与 pack manifest | M |
| A2 | Change Context Resolver | planning/contextdb adapter + `dry-run-readiness.mjs` | 复用 Rex work item、expectedEvidence、changed-files；CRG 可用则适配 | M-L |
| A2 | pre-edit stale/write guard | `preflight-contracts.mjs` + tool execution admission | 复用 ready/warning/blocked、ownedPathPrefixes；接入 `requiresPreEditSafety` | M-L |
| A2 | Scope-first assembler | `contextdb/facade.mjs`、memo query/budget | 复用 temporal filtering、role memory、context-window scaling | M |
| A3 | Validated compaction | `offload/mermaid-canvas.mjs`、`search/budget.mjs` | 复用 ref store；增加 full→summary+ref→ref-only | M-L |
| A3 | Revisioned evidence handoff | `contextdb/handoff.mjs`、`harness/handoff.mjs`、orchestrator handoffs | 扩展现有 v2 packet，不新建平行协议 | M |

基础修复：在把 task-context preflight 接入 dry-run 前，应先修 `dry-run-readiness.mjs` 对 `.aios` 的硬编码路径，统一走 `resolveContextDbRoot()`；否则自定义 state dir 会产生错误 ready/blocked 结论。

---

## 7. 分阶段实施

### Phase 0：安全与可观测（约 1 周）

- 修复 private supersede shared 的跨 Agent 失效路径，并补 DENY receipt。
- 把 scope 与 ACL 分开；Agent identity 改由 runtime 注入，memo 不再固定伪装成 `role: user`。
- session close 改写 candidate，不直接持久化 shared durable memory；提供显式 promote。
- Dream 改为 proposal-only；由 steward 批准后追加 archive/tombstone，再按 retention 真正 GC。
- 为现有 facade/recall 生成 observation-only ContextReceipt，不改变排序结果。

### Phase 1：ContextCard V1（1 周）

- schema、revision、source hash、scope/trust/validity。
- planning schema 升级，task 增加 targets、contextRequirements、interfaces、constraints、verification 和 revision。
- 生成 ExecutionContextPacket 与 read evidence；先 shadow mode，只报告 coverage/stale，不阻塞。
- continuity/handoff/memo 旧数据兼容映射为 card sidecar；不破坏旧格式。
- card 注入为 L0；hard constraints 与 assumptions 分栏。

### Phase 2：修改前工作集（1 周）

- Change Context Resolver。
- dry-run 增加 task-context readiness。
- 将 `workflow-policy.requiresPreEditSafety` 接到统一写入 admission；覆盖 write/edit/patch/rename/delete，并明确 shell coverage gap。
- context assembler 按类别预算并记录 receipt。
- 简单 direct 任务允许 minimal card；多 Agent / security / planned 任务缺关键字段时才 blocked，避免流程过重。

### Phase 3：验证压缩与 Team merge（1-2 周）

- 三级表示与压缩 contract。
- evidence/hash/ref 可达性校验，失败自动保守回退。
- handoff 只传 packet lineage、revision、digest、claim/evidence/verification/conflict；接收端主动重算 required context hash。
- 使用 changed-files 做 planned targets/allowedWrites 与 actual changes 的事后对账。
- 在真实长任务与多 Agent 任务做 A/B，再决定是否上预测式 anticipation。

---

## 8. 验收标准

### 8.1 硬正确性

- 跨 agent/private scope 泄漏：`0`。
- Agent B 的 private memo 隐藏、替代或删除 Agent A 的 shared/private memo：`0`。
- 未持有 publish/steward capability 的 Agent 晋升或 supersede shared canonical：`0`。
- 被 supersede/invalid 的事实默认进入 active working set：`0`。
- 多 Agent 并发 append 出现丢事件、重复 seq 或索引覆盖：`0`。
- must-preserve item 压缩后可达率：`100%`。
- evidence ref 存在且 hash 匹配率：`100%`。
- acceptance criteria / verification command 保留率：`100%`。
- assumption 被晋升为 verified fact：`0`。
- Dream APPLY 在 retention 前物理删除原始证据：`0`。
- 派生摘要扩大任一输入 ACL：`0`。
- `ContextItem` 中 producer、claim status、source hash、policy version 和 revision 的完整率：`100%`。

### 8.2 协作质量

建立至少八类回放：

1. 旧事实被新事实替代；
2. 100+ turn + 大工具输出；
3. 两个 agent 私有上下文 + 一个 shared work item；
4. handoff 后继续修改且 card revision 已变化；
5. 修改中央 symbol，必须同时考虑 callers、tests、项目约束和最近失败。
6. required context 已读后被外部修改，写入必须因 stale hash 被阻止；
7. 实际 changed file 超出 packet targets/allowedWrites，必须产生 drift 并要求更新 packet；
8. 恶意网页、tool output 或 handoff 中的指令不得升级成控制指令或 shared fact。

A/B 比较：任务成功率、重复询问次数、返工次数、handoff 后恢复时间、无用注入 token、压缩后错误率。token 降低不能以成功率下降换取。

写入门指标：`required_context_coverage=100%`、`fresh_context_coverage=100%`；同时记录 `unplanned_write_rate`、`stale_write_block_count`、`packet_revision_drift_count`、`handoff_revalidation_rate` 和 `post_change_reconciliation_pass_rate`。

### 8.3 已验证基线

本轮执行：

```text
node --test \
  scripts/tests/memo-temporal.test.mjs \
  scripts/tests/memo-scope.test.mjs \
  scripts/tests/contextdb-continuity.test.mjs \
  scripts/tests/contextdb-facade.test.mjs \
  scripts/tests/handoff.test.mjs \
  scripts/tests/canvas-context-scaling.test.mjs \
  scripts/tests/offload-tool-offload.test.mjs
```

结果：`69 pass / 0 fail`。[TEST]

---

## 9. 明确不建议现在做的事

1. **不先上向量库/图数据库**：Graphiti 的价值是 temporal+provenance 语义，不是存储重量；当前 JSONL/split storage 足够承载 V1。
2. **不先让 LLM 自动生成每个 agent 的记忆架构**：成本、不确定性和审计难度高；先用显式模板和 policy。
3. **不先做预测式 anticipation**：没有 receipt/hit-rate 数据前无法证明收益；先做 deterministic impact/context checklist。
4. **不让压缩只返回一个 fuzzy score**：必须先过确定性字段、ref、hash 和 scope 门。
5. **不把更多内容塞进 prompt 当成“考虑上下文”**：目标是最小充分工作集，不是更长上下文。
6. **不自动把 Agent 输出当组织事实**：assistant summary 默认是 candidate/observed，验证后才能 promotion。

---

## 10. 最终建议

如果只做一个版本，建议叫 **Context Lifecycle V1**，范围锁定为：

> `Provenance/ACL Gate + ContextCard + ExecutionContextPacket + ContextReceipt + Change Context Resolver + Validated Compaction`

它会把当前分散但已经不错的 memo、offload、temporal、continuity、handoff、Rex、dry-run 变成闭环；同时直接解决“修改前把相关上下文一起纳入考虑、修改后保留证据与可继续性”的问题。

最不应做的是再复制一个独立 memory backend。当前真正缺的是**上下文的契约、权限边界、证据、修改工作集、新鲜度和压缩验收**。

Team 结论是分阶段 GO：单用户 shadow/preview 可以进入 Phase 0；多 Agent shared canonical memory 在 private supersede、Dream 物理删除、runtime identity、并发写和 ACL 粘性测试全部通过前维持 NO-GO。
