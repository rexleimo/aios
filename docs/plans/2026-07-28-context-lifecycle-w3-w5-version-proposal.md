# Context Lifecycle V1 - W3/W4/W5 独立版本提案

> 状态：decision-ready proposal
> 适用基线：`main@bfb9ce2` 与当前仓库中的 ContextDB、memo、planning、offload、continuity、handoff、dry-run、changed-files 能力
> 决策范围：W3 版本定位、W4 目标架构与兼容迁移、W5 shadow-mode rollout / 验收 / rollback
> 实施范围：本提案不实施产品代码
> 架构硬约束：不重写 ContextDB，不迁出其文件真相源，不另建 memory backend，不引入向量库、图数据库或远程记忆服务

## 0. 推荐决策

### 版本名

**Context Lifecycle V1 - Verified Work Context**

### 一句话定位

> **让 AIOS 在每次计划内修改前准备并校验最小充分上下文，在修改后留下可追溯、可继续、可回滚的证据链，同时保持现有 ContextDB、memo 和 CLI 的存储与使用方式。**

### 默认发布边界

- **GO**：单用户、本地工作区、可信 Agent；先 observation/shadow，再对 planned/high-risk 写入选择性 enforcement。
- **CONDITIONAL GO**：revisioned handoff 与 validated compaction；只有确定性完整性门通过才生效，失败自动回退到现有全文/ref 路径。
- **NO-GO**：Team 的 shared canonical memory 写入；本版本最多提供 shadow/read-only 验证，默认保持关闭。
- **不可协商项**：安全修复不依赖 prompt 提醒；ACL、supersede、revision、source hash 与 write admission 必须在模型文本之下执行。

## 1. 当前能力锁定：只做增量，不换底座

下一版本不是从空白设计。下表中的现有能力是非回归基线，也是每个新增契约的复用点。

| 当前能力 | 当前 owner / 证据 | 本版本只增加什么 |
|---|---|---|
| ContextDB 文件真相源、session lock、事件/检查点、搜索、timeline、可重建 SQLite sidecar | `mcp-server/src/contextdb/core.ts:1091-1158,1312-1502,2363-2521`；`mcp-server/src/contextdb/sqlite/schema.ts` | 在同一 `resolveContextDbRoot()` 下增加派生 sidecar 与可选 envelope；不替换现有事件、检查点、索引或 CLI |
| 显式 `context:pack`、smart/tail recall、token budget、保守压缩回退 | `mcp-server/src/contextdb/core.ts:599-631,691-908,1633-1895`；`mcp-server/src/contextdb/cli/args.ts:14-31` | 把已有选择/降级结果变成可审计 receipt；`context:pack` 仍是显式报告，不自动注入 prompt |
| memo append-only temporal、as-of、supersede 与 scope | `scripts/lib/memo/storage/temporal.mjs`；`normalizers.mjs:44-49`；`query.mjs` | 在现有写入/读取边界补 provenance、ACL 与 supersede authorization；不搬迁 memo 数据 |
| plan v2、任务/验收、adaptive workflow、`requiresPreEditSafety` | `scripts/lib/planning/schema.mjs`；`contract.mjs`；`workflow-policy.mjs:178-207,401-435` | 对 plan/task 增加可选 revision、target、required context、verification 字段，并提供 v1/v2 读适配 |
| ready/warning/blocked、ownership prefix 与 dry-run | `scripts/lib/lifecycle/preflight-contracts.mjs`；`scripts/lib/harness/solo-runtime/dry-run-readiness.mjs` | 增加 task-context verdict；复用现有 verdict，不建立第二套 gate |
| tool output 原文 ref、输入摘要、exit class 与 canvas | `scripts/lib/offload/tool-offload.mjs:40-88` | 复用 ref 作为 evidence source；增加 representation/omission receipt，不复制原文 |
| pack source hash | `scripts/lib/contextdb/pack-manifest.mjs:56-76` | source hash 成为 packet freshness 与 receipt lineage 的输入 |
| continuity、handoff、role memory 与 changed-files | `scripts/lib/contextdb/continuity.mjs`；`contextdb/handoff.mjs`；`harness/subagent-runtime/role-memory.mjs`；`session/changed-files.mjs` | 增加 revision/evidence/verification/reconciliation；保留原文件和读取方式 |
| candidate + manual review 模式 | `scripts/lib/harness/learn-eval/recommendations/hindsight-drafts.mjs:180-188,216-231` | session close 与 shared publish 复用 candidate/promotion，而不是直接晋升 Agent 文本 |

### 1.1 不变式

1. `.aios/context-db/sessions/**` 仍是 ContextDB canonical state；`index/context.db` 仍只是可重建缓存。
2. `.aios/memo/**` 仍由 memo 模块拥有；Context Lifecycle 只做 read-time normalization 和写入授权，不复制成第二份 memory。
3. `AIOS_PROJECT_STATE_DIR` 与 legacy `memory/context-db` 继续通过 `resolveContextDbRoot()` 解析。
4. `contextdb init/session:new/event:add/checkpoint/context:pack/search/recall:sessions/timeline/index:*` 不重命名、不移除参数。
5. ordinary startup 不自动注入 session history、handoff 或完整 ContextDB report；packet 是控制面 manifest，不是新的大 prompt。

---

## 2. W3 - Version positioning

### 2.1 最多三个用户可见能力组

| 用户可见能力组 | 用户得到的结果 | 本版本包含 | 复用的当前能力 |
|---|---|---|---|
| **1. 任务上下文卡（Know what matters）** | 在动手前看到目标、验收、修改目标、必须读取的规则/接口/测试、未验证假设和验证命令；简单任务保持轻量 | `ContextCard`、确定性 Change Context Resolver、最小工作集、scope-first/category budget | Rex work item、plan v2、ContextDB search/refs、facade L0/L1/L2、dry-run |
| **2. 可解释的修改护栏（Know why it is safe）** | 看到本次修改允许写什么、实际读了什么、是否 stale、哪些内容因预算降级，以及修改后是否越界 | `ExecutionContextPacket`、read evidence、shadow/warn/enforce preflight、post-change reconciliation、`ContextReceipt` | `requiresPreEditSafety`、ready/warning/blocked、owned path、changed-files、pack hash、token stats |
| **3. 可信连续性（Resume without guessing）** | resume/handoff/compaction 后仍能找回目标、硬约束、事实与假设边界、证据和下一条验证命令 | revisioned handoff、full -> summary+ref -> ref-only、validated compaction、stale handoff revalidation | continuity v1、ContextDB handoff v2、offload ref、现有保守压缩 fallback |

以下是三个能力组的**平台安全前置条件**，不伪装成第四个功能组：

- runtime-bound provenance 与真实 producer；
- scope 与 ACL 分离；
- private 不能 supersede/hide/delete shared；
- session close 只生成 candidate；
- Dream 默认 proposal/tombstone，不在 retention 前物理删除证据。

### 2.2 严格 in-scope

1. 单用户本地工作区中的 ContextCard、ExecutionContextPacket、ContextReceipt。
2. 基于目标文件/符号、import/caller、相关测试、项目规则、当前 diff、最近失败和历史决策的**确定性** resolver。
3. planned/high-risk mutation 的 required/fresh context preflight 与 actual changed-files reconciliation。
4. provenance/ACL/supersede/shared-publish/Dream/session-close 安全前置修复。
5. 在现有 handoff 与 compaction 路径上增加 revision、hash、evidence、omission reason 和 fallback。
6. 旧 ContextDB、memo、continuity、handoff、plan v1/v2 数据的 lazy read adapter。

### 2.3 明确 non-goals 与后续触发条件

| 本版本不做 | 原因 | 允许后续重开决策的触发条件 |
|---|---|---|
| 重写 ContextDB 或另建 memory backend | 当前 filesystem canonical + SQLite sidecar 已提供持久化、检索、锁与重建能力；缺口是契约和治理 | 只有现有真相源在真实规模下无法满足已量化的一致性/恢复 SLO，且先有迁移 RFC 与双读回滚证明 |
| 向量库、图数据库或远程服务 | 不解决 provenance、ACL、stale write 和 compaction fidelity | 固定回放证明 lexical/ref/CRG fallback 的 required-context recall 低于目标，且新依赖有 local-first fallback |
| 预测式 anticipation 或 LLM 自动生成 memory 架构 | 当前没有 receipt 数据证明收益，且不可审计 | 至少 500 个已标注 packet/receipt；确定性 resolver 的关键 miss rate >10%，预测器能显著改善且零权限回归 |
| 自动把 Agent 输出晋升为 shared canonical fact | 未验证文本不能成为组织事实 | proposal/review/publish 状态机、authenticated capability、expected revision 与 adversarial tests 全通过 |
| 全 shell 命令的通用 mutation 拦截 | 当前无法诚实保证覆盖所有 shell 副作用 | shell mutation classifier/allowlist 有独立覆盖证明；此前 Team/high-risk enforcement 不得声称覆盖 shell |
| Team shared canonical 默认开启 | 并发、ACL stickiness、publisher identity 与 cross-agent non-interference 尚未证明 | 第 5.5 节 Team gate 全部通过，且显式管理员 opt-in |

### 2.4 单用户与 Team readiness 边界

- **本版本 GA 对象**：一个用户、一个本地 workspace、可信 Agent；可以有串行或受控委派，但 shared canonical publish 保持人工/授权门。
- **Team 可试用对象**：revisioned handoff、packet revalidation、read-only/shared candidate 的 shadow 评估。
- **Team 禁止对象**：未经 steward capability 的 shared publish/supersede/consolidate/purge，以及任何跨 Agent destructive dedup。
- Team gate 未通过不会阻塞单用户版本发布，也不会被改写成“beta 已默认安全”。

### 2.5 兼容承诺

> 旧命令和旧数据继续可读；新结构按需派生、无 eager rewrite；关闭 lifecycle mode 后立即回到现有读取、pack、memo 和写入路径。唯一不承诺保留的是已确认不安全的行为，例如 private supersede shared、未验证 session summary 自动晋升和 Dream 提前物理删除。

---

## 3. W4 - Target architecture and compatibility strategy

### 3.1 架构原则

1. **ContextDB extension, not replacement**：所有新持久化 sidecar 都位于现有 `resolveContextDbRoot()`；不出现第二个 database/service。
2. **ContextItem is a normalized view, not a new repository**：memo、ContextDB event/checkpoint、plan、handoff、offload ref 保留原 owner；assembler 在读取时映射为统一契约。
3. **Ref-first**：Card 和 Packet 保存 source ref/hash/range/reason，不复制文件全文、memo 全文或 tool output。
4. **Pull-based**：resolver 先产出 required refs；runtime 再通过现有 read/search/ref 工具读取具体证据。`context:pack` 不自动进入 prompt。
5. **Derived state is disposable**：card/packet/receipt 索引可重建或忽略；canonical source 不因 shadow 计算被改写。
6. **One handoff protocol**：`scripts/lib/contextdb/handoff.mjs` 是 lineage owner；harness v1 仅保留输入/输出 adapter，不再形成第二个持久化协议。

### 3.2 Canonical ownership map

下表中的“新增模块”是对现有目录的窄扩展，不是新 backend。

| 对象/职责 | Canonical owner | Writer | Reader | Canonical/derived state | Enforcement point |
|---|---|---|---|---|---|
| ContextDB session event/checkpoint 与索引 | 现有 `mcp-server/src/contextdb/core.ts`、`paths.ts`、`sqlite/**` | 现有 ContextDB CLI/runtime | search、timeline、pack、Context Lifecycle adapters | 现有 session JSON/JSONL 为 canonical；SQLite 为 cache | session lock、append/index rebuild；不重写 |
| `ContextItem` + `ProvenanceEnvelope` 契约 | 新增 `scripts/lib/contextdb/context-item.mjs` + `scripts/lib/specs/context-item.schema.json` | 各现有 source adapter 在 read/write boundary 归一化；不集中复制 | assembler、ACL filter、receipt、handoff | in-memory normalized view；新记录可带 additive envelope，旧记录保持原位 | memo write/query、runtime identity、source hash validation |
| `ContextCard` | 新增 `scripts/lib/contextdb/context-card.mjs` | planning/work-item update、reconciliation | dry-run、resolver、handoff、status | `<contextDb>/work-items/<stable-key>/context-card.json`；同一文件 revision + atomic write | card revision CAS；hard constraint 只能引用 verified/canonical item |
| `ExecutionContextPacket` | 新增 `scripts/lib/contextdb/execution-context-packet.mjs` | resolver/assembler per mutation | preflight、write admission、reconciliation、subagent adapter | `<contextDb>/sessions/<sessionId>/context/packets/<packetId>.json`；manifest，不含文件全文 | required read/hash、allowed writes、plan/card revision |
| `ContextReceipt` 与 compaction receipt | 新增 `scripts/lib/contextdb/receipt.mjs` | assembler、preflight、mutation reconciliation、compaction/handoff | status/audit/metrics/rollback | `<contextDb>/sessions/<sessionId>/context/receipts.jsonl` append-only | operation id/idempotency；输入输出 hash；included/degraded/excluded reason |
| compaction transform | 现有 `mcp-server/src/contextdb/core.ts` token selection、`scripts/lib/search/budget.mjs`、`scripts/lib/offload/**` | 现有 pack/offload/compaction caller | packet、handoff、explicit report | 原文仍在现有 event/ref store；receipt 只记 transform lineage | must-preserve/evidence/ACL/revision validator；失败用原文或 ref |
| handoff lineage | 现有 `scripts/lib/contextdb/handoff.mjs` 升级为 additive v3 | session/orchestrator handoff writer | receiver、continuity、harness adapters | 仍是 `<contextDb>/sessions/<sessionId>/handoff.json` | base/card revision、evidence hash、scope/visibility、conflict/revalidation |
| work-item intent 与 task revision | 现有 `scripts/lib/planning/schema.mjs`、`contract.mjs` | Rex/planning commands | card builder、resolver、preflight | 现有 `docs/plans/**` + `.aios/planning/active.json` | plan/task revision；v1/v2 lazy adapter |
| readiness 与 mutation admission | 现有 `scripts/lib/lifecycle/preflight-contracts.mjs`，由 write/edit/patch/rename/delete adapters 调用 | packet evaluator | workflow runtime、harness | verdict/receipt；不建存储 | security rules fail-closed；selective enforcement 按第 3.4 节 |
| actual changed-files | 现有 `scripts/lib/session/changed-files.mjs` | mutation hooks | reconciliation、handoff | 现有 `.aios/sessions/<sessionId>/changed-files.jsonl` | actual vs targets/allowedWrites；本版本不搬路径 |
| `subagent-runtime/context-packet.mjs` | **仅 adapter** | 不创建 canonical packet | 读取 packet ref/session id，投影给 subagent | 无独立 state/schema | 不得绕过 canonical preflight 或自定义第二套 packet |

### 3.3 对象边界

#### ContextItem / ProvenanceEnvelope

- 统一表达 `kind`、`scope`、`classification`、`claimStatus`、producer、validity、source refs/hash、revision 与 must-preserve。
- 它是对现有记录的**规范化投影**：`sourceRef` 永远指回 memo event、ContextDB event/checkpoint、plan、handoff 或 offload ref。
- 旧记录缺 provenance 时标记 `producer=legacy`、`claimStatus=observed`；仍可读取，但不能自动成为 hard constraint 或 shared canonical replacement。
- scope 决定相关性；ACL/capability 独立决定 read/publish/supersede/compact/archive/purge。

#### ContextCard

- work item 的长期控制面：goal、acceptance、targets、hard constraint refs、working set refs、assumption refs、verification commands、revision。
- Card 不包含历史 dump；直接任务可以生成不落盘的 minimal card，planned task 才持久化 revisioned card。
- continuity v1 只能映射为 observed summary/next actions，不能自动产生 verified hard constraint。

#### ExecutionContextPacket

- 单次 mutation 的短期 manifest：plan/card revision、target/operation、allowed writes、required/supporting/rule/interface/verification refs、actual read evidence、base/expected hash。
- `baseHash` 表示最初读取基线，`expectedHash` 表示本 session 上一次授权写入后的预期内容，从而区分自己的连续修改与外部并发修改。
- Packet 不替换当前 `context:pack` report；前者用于 admission，后者保留显式调试/导出用途。

#### ContextReceipt

- 记录“实际用了什么”，而不是仅记录“resolver 推荐了什么”。
- 每项必须有 `ref`、reason、representation (`full|summary_ref|ref_only|excluded`) 与 source hash；排除必须说明 `scope_denied|stale|budget|low_score|missing` 等原因。
- receipt 不复制 secret/raw output；敏感内容只保存受控 ref 与 hash，classification/ACL 继承最严格输入。

#### Handoff v3

在当前 `contextdb/handoff.mjs` v2 字段上 additive 增加：

- `handoffId`、`baseRevision`、`contextCardRevision`、`packetId`；
- `claims[]`（verified/observed）、`evidenceRefs[]`、`verificationCommands[]` 与 verification receipts；
- `scope`、`visibility`、`conflicts[]`、`sourceHash`。

`harness/handoff.mjs` v1 与 `agent-handoff.schema.json` 保留为 legacy projection adapter；不写第二份 handoff 文件。

### 3.4 数据流与执行边界

```text
Rex work item / plan v1-v3 adapter
  -> ContextCard (goal, acceptance, targets, constraints, revision)
  -> deterministic Change Context Resolver
       -> ContextDB search/event/checkpoint refs
       -> memo temporal view (scope + ACL first)
       -> target/import/caller/test/rule/current-diff/recent-failure refs
       -> offload evidence refs
  -> budgeted working set + candidate receipt
  -> explicit reads -> baseHash/expectedHash/read ranges
  -> ExecutionContextPacket
  -> preflight ready | warning | blocked
  -> existing write/edit/patch/rename/delete path
  -> existing changed-files ledger
  -> post-change reconciliation
  -> actual ContextReceipt + ContextCard revision
  -> existing handoff / continuity / validated compaction
```

Prompt boundary：Card/Packet 只决定“应读取哪些 ref、写入是否可放行”；ordinary startup 不加载历史，`context:pack` 不自动注入，tool/web/handoff 文本始终作为 untrusted data。

### 3.5 Fail-open / fail-closed matrix

| 场景 | observe/shadow | enforce | 原因与 fallback |
|---|---|---|---|
| read-only search/status，Card/Packet 缺失 | fail-open 到现有 search/status，记录 warning | fail-open，但 ACL deny 始终 fail-closed | 不让派生控制面破坏读取兼容 |
| direct/简单 guarded task 缺持久化 Card | 生成 ephemeral minimal card，不改变行为 | warning；不因非计划任务强制持久化 | 避免所有小改动流程过重 |
| planned/high-risk mutation 缺 packet/target/required read/fresh hash | 只记 `would_block` | **fail-closed** | 可切回 warn/off；不执行未声明或 stale 写入 |
| private -> shared supersede、未授权 shared publish/purge | **fail-closed** | **fail-closed** | 安全修复不因 lifecycle mode=off 恢复不安全行为 |
| receipt 写入失败 | 旧流程继续，记录本地 error | planned/high-risk 写入 fail-closed；普通任务 fail-open | enforce 必须有可审计结果 |
| validated compaction 任一确定性门失败 | 候选结果不被使用 | fail-open 到 full 或 summary+ref；绝不删除原文 | 压缩失败应损失节省量，不损失事实 |
| handoff revision/hash stale | 记录 would-revalidate | fail-closed 接受 canonical claim；要求 refresh/rebase | 可以读取为 untrusted note，但不能合并为新事实 |
| Team shared canonical gate 未通过 | shadow/read-only | **功能保持 disabled** | 不以单用户成功推断 Team 安全 |
| unsupported shell mutation | 明确标记 coverage gap | 不计入 enforcement 覆盖；Team/high-risk 路由必须改走受控 adapter 或阻塞 | 不声称不存在的通用拦截能力 |

### 3.6 兼容与 lazy migration

总策略：**read-old/read-new -> shadow derive -> new writes additive -> no eager rewrite**。

| 现有数据/接口 | 读取策略 | 新写策略 | rollback 行为 |
|---|---|---|---|
| ContextDB `meta/l1/l2/state/continuity` v1 | 原 reader 不变；adapter 生成 ContextItem/Card refs | 原文件继续写；可选 provenance envelope/sidecar additive | lifecycle=off 后忽略 sidecar；SQLite 可 `index:rebuild` |
| SQLite `index/context.db` | 仍只做 cache；缺新列时 additive migration/backfill | 新索引字段可空，canonical JSON/JSONL 先成功 | 删除/rebuild sidecar，不触碰 session source |
| legacy `memory/context-db` 与 custom state dir | 统一 `resolveContextDbRoot(..., preferLegacyExisting)` | 写回已解析的同一 root | 不改变路径；先修 dry-run 的 `.aios` 硬编码再 rollout |
| memo schema v1 | read-time 映射；缺 producer 为 legacy/observed | 新 event additive provenance/expected revision；原 temporal 字段保留 | 旧 reader 忽略新字段；memo 不复制/不回填 |
| 已存在的 unauthorized supersede link | 不删历史；读取时只应用被授权且对主体可见的 edge，并生成 audit finding | 新写在 target scope/owner/capability/revision/hash 处拒绝 | 可关闭新 recall ranking，但不能恢复不安全 edge 生效 |
| plan v1/v2 | 现有 v1 -> v2 逻辑后再补 v3 defaults：revision=1、targets/contextRequirements=[] | 新 planned work 写 schema v3/additive task 字段 | 旧字段保留；旧 reader 可忽略 extra fields |
| continuity v1 | 映射为 Card observed summary、touched files、next actions | continuity 文件继续由 checkpoint 写 | 删除 Card sidecar即可回原行为 |
| ContextDB handoff v2 | v3 normalizer 接受 v2，缺字段为 null/observed | 同一 `handoff.json` 保留 v2 字段并添加 v3 字段 | legacy projection 继续可读；不需要第二份文件 |
| harness handoff v1 | adapter 映射到 canonical v3 / 从 v3 投影 v1 | 不再拥有独立持久化 | 关闭新 adapter 后仍可读取旧 v1 payload |
| offload refs/canvas | 原 ref 路径与内容不变 | receipt 只引用 node/ref/hash | 关闭 receipt 不影响 raw ref |
| public CLI | 原命令/参数/默认输出保持；新增选项只能 additive | feature mode 通过 config/env 显式控制 | mode=off 即回旧路径；不要求数据 downgrade |

迁移顺序：

1. 先让新 reader 读取旧/新格式，并加入 fixtures。
2. 再启用只读 normalization 与 sidecar derivation。
3. shadow 期只写 `mode=shadow` receipt，不改 prompt、排序、admission、memo、handoff canonical state。
4. 通过 gate 后才让新写入带 additive revision/provenance 字段。
5. 不做 bulk backfill；首次访问/首次新写时 lazy materialize Card/Packet。

---

## 4. W5 - Shadow-mode rollout and acceptance gates

### 4.1 统一控制面

目标配置是现有 `config/settings.json` 的 additive section，并允许环境变量覆盖；配置只控制行为，不保存业务数据。

```json
{
  "contextLifecycle": {
    "mode": "off|observe|warn|enforce",
    "compactionMode": "legacy|observe|validated",
    "teamSharedCanonical": false
  }
}
```

建议环境变量：

- `AIOS_CONTEXT_LIFECYCLE_MODE=off|observe|warn|enforce`
- `AIOS_CONTEXT_COMPACTION_MODE=legacy|observe|validated`
- `AIOS_TEAM_SHARED_CANONICAL=0|1`

`off` 必须是常数时间 kill switch；P0 安全规则例外，不得通过该开关恢复 private supersede shared、未授权 publish 或 destructive Dream。

### 4.2 Shadow 的精确定义

同一次 mutation 使用同一个输入 snapshot：

1. **A/legacy path** 按当前逻辑正常执行。
2. **B/candidate path** 运行 scope/ACL filter、resolver、Card/Packet 构建、preflight 与 representation 选择。
3. B 在 observe 阶段不得改变 prompt 内容、context 排序、写入 admission、memo/handoff 状态或 compaction 结果。
4. 唯一新增持久化是 `mode=shadow` receipt，记录 input hashes、A/B decision diff、`would_warn/would_block`、reason、latency 和 policy version；不复制敏感正文。
5. post-change 用实际 changed-files 回放 B 的 reconciliation，得到 false-negative/false-positive 标注来源。
6. 如果 A/B 使用的 source hash 在比较前后发生变化，本样本标记 `invalidated_by_concurrency`，不进入准确率统计。

### 4.3 分阶段 rollout

| 阶段 | Enable / disable | 数据与兼容行为 | 指标与进入下一阶段的门 | Rollback |
|---|---|---|---|---|
| **S0 安全前置** | lifecycle=`off`；Team shared=`0`；Dream shared apply 禁用 | 修 private/shared supersede、runtime producer、session-close candidate、Dream proposal/tombstone；旧记录不重写 | 安全场景全部 0 violation；现有 69-test baseline 全绿 | 关闭 shared writer/session auto-promotion/Dream apply；安全 deny 不回滚到旧漏洞 |
| **S1 Observation-only objects** | lifecycle=`observe`；compaction=`legacy` | 派生 ContextItem/Card/Packet/Receipt；A path 完全不变；不注入 prompt | >=200 个 mutation 样本、>=20 个真实任务；旧结果一致率 100%；派生成功率 >=99.5%；canonical state diff=0 | lifecycle=`off`；忽略或保留派生 sidecar，不删 source |
| **S2 Shadow preflight + reconciliation** | lifecycle=`observe`；开启 `would_block` 与 changed-files 对账 | 不阻塞；记录 required/fresh/target/ownership/revision 命中 | 所有合成 stale/undeclared/ownership case 检出率 100%；人工标注 false-positive <=1%；未知原因必须降为 warning | 关闭 shadow evaluator；保留 receipt 供分析 |
| **S3 Warn -> selective enforce** | 先 `warn` 100%，再 `enforce` 5% -> 25% -> 100% 的 planned/high-risk writes；Team shared=`0` | direct/simple 仍为 minimal/warn；仅受控 write/edit/patch/rename/delete admission；validated compaction 独立过门 | enforced write 的 required/fresh coverage=100%；security false-negative=0；false block <=1%；receipt 成功率 >=99.9%；固定回放成功率下降 <=1pp | `enforce -> warn -> observe -> off`；compaction=`legacy`；在途 write 不重试、不反向改数据 |
| **S4 Team/shared canonical（版本后置 gate）** | 仅显式 `AIOS_TEAM_SHARED_CANONICAL=1`，且管理员/steward opt-in | proposal/review/publish/CAS；private scratch 与 shared canonical 分离 | 第 4.5 节所有 Team gate 同时通过；任一未过则保持 NO-GO | 立即设为 0，停止 shared mutation；已有 records 只读，不物理删除、不自动降级 |

### 4.4 Selective enforcement 范围

只有同时满足以下条件才进入 S3 enforcement：

1. workflow decision 为 `planned`，或 `requiresPreEditSafety=true`；
2. mutation 通过受控 write/edit/patch/rename/delete adapter；
3. Packet 的 plan/card revision 与当前 revision 一致；
4. 所有 `required` refs 已读取且 `expectedHash` 新鲜；
5. target 位于 `targets` 或 `allowedWrites`；
6. verification 非空；
7. receipt 可持久化。

其他 direct/read-only 操作保持现有行为或 warning。未经覆盖的 shell mutation 不得计入“100% enforcement”。

### 4.5 Go/no-go 验收

#### A. 当前行为与兼容

- 报告中冻结的 69 个 context/memo/handoff/offload focused tests：`69 pass / 0 fail`，且新增代码后必须继续通过。
- `contextdb` 现有公开命令、默认参数、legacy/custom state path fixtures 全部通过。
- plan v1/v2、memo v1、continuity v1、handoff v1/v2 fixtures 的读取成功率：`100%`。
- mode=`off` 时，除 P0 安全修复外，prompt、search result order、pack output、write admission 与 baseline 一致。
- ordinary startup 自动注入完整 history/handoff/context pack 的次数：`0`。

#### B. 安全与一致性硬门

- cross-agent/private scope 泄漏：`0`。
- Agent B private record 隐藏、supersede、compact 或删除 Agent A shared/private record：`0`。
- 无 publish/steward capability 的 shared canonical promotion/supersede/purge：`0`。
- derived summary/compaction 扩大 source ACL 或降低 classification：`0`。
- Agent/web/tool/handoff 文本被当成 authenticated control instruction：`0`。
- 未验证 assistant claim 被晋升为 verified/shared fact：`0`。
- Dream 在 retention/legal-hold 门前物理删除 canonical evidence：`0`。
- ContextDB/memo 并发 append 丢事件、重复 seq、覆盖 index pointer：`0`（至少 8 writers x 1,000 operations stress replay）。

#### C. Packet / preflight / reconciliation

- enforced planned/high-risk write 的 `required_context_coverage`：`100%`。
- enforced planned/high-risk write 的 `fresh_context_coverage`：`100%`。
- stale required file、plan/card revision drift、undeclared target、ownership mismatch 的合成场景检出率：`100%`。
- actual changed file 超出 target/allowedWrites 但未生成 drift receipt：`0`。
- receipt 中 included/degraded/excluded 项缺 ref/reason/representation/source hash：`0`。
- shadow false-positive：`<=1%`；出现任何无法解释的 hard-block reason 时不得升级 enforcement。

#### D. Compaction / handoff

- must-preserve item 在压缩后可达率：`100%`。
- acceptance criteria 与 verification command 保留率：`100%`。
- evidence ref 存在且 hash 匹配率：`100%`。
- fact/assumption 串类：`0`；否定词、权限边界和 unverified 标签丢失：`0`。
- compaction gate 失败后回退到 full/summary+ref/ref-only 且原文仍可达：`100%`。
- stale handoff/card revision 被检测并要求 revalidation：`100%`。
- handoff merge 只因“文件无冲突”而吞掉语义冲突：`0`。

#### E. 产品与性能非劣化

- 固定任务回放成功率相对 baseline 下降不超过 `1 percentage point`；token 降低不能交换成功率。
- shadow/warn 控制面本地新增延迟：不含显式文件读取/tool execution 时 `p95 <= 500 ms`，且 end-to-end `p95` 增幅 `<=10%`。
- 用户为通过错误 gate 而重复读取/重复询问的次数不得高于 baseline；若升高，回到 shadow 调整 resolver。
- Team gate 不得用单用户指标代替。

### 4.6 必测回放集与预命名测试

至少覆盖：

1. 旧事实被新事实合法 supersede。
2. private -> shared supersede 被拒绝且 shared 对其他 Agent 仍可见。
3. 100+ turn + 大工具输出，预算降级仍留下 ref/reason。
4. 两个 Agent 私有上下文 + 一个 shared work item，ACL sticky。
5. required file 读取后被外部修改，写前 stale block。
6. actual changed-files 超出 Packet，post-change drift。
7. handoff 后 Card revision 变化，接收方 revalidate。
8. 修改中央 symbol 时 callers/tests/rules/recent failure 被纳入 required/supporting set。
9. tool/web/handoff prompt injection 只作为 untrusted data。
10. compaction 丢失否定词、assumption label 或 verification command 时自动 fallback。
11. custom `AIOS_PROJECT_STATE_DIR` 与 legacy `memory/context-db`。
12. mode 从 enforce 降到 off 后旧命令/旧数据立即可用。

实施时预命名测试 owner：

- `scripts/tests/memo-governance.test.mjs`
- `scripts/tests/context-lifecycle-compat.test.mjs`
- `scripts/tests/context-lifecycle-shadow.test.mjs`
- `scripts/tests/context-lifecycle-preflight.test.mjs`
- `scripts/tests/context-lifecycle-compaction.test.mjs`
- `scripts/tests/context-lifecycle-handoff.test.mjs`
- `mcp-server` ContextDB concurrent append / sidecar rebuild tests

---

## 5. Rollback contract

### 5.1 自动降级触发器

| 触发 | 自动动作 | 保留状态 |
|---|---|---|
| 任一 confidentiality/integrity/ACL violation | Team shared=0；enforce -> observe；停止 shared mutation | source、deny receipt、审计证据全部保留 |
| old data/CLI unreadable 或 canonical corruption | lifecycle=off；停止新 writer；必要时 `index:rebuild` | session/memo canonical files不改写 |
| shadow/enforce false block >1%，或出现无法解释 hard block | enforce -> warn/observe | packet/receipt 保留用于复盘 |
| receipt failure >0.1% 或 preflight availability <99.9% | selective enforce -> warn | legacy write path继续；planned/high-risk 不做自动重试 |
| p95 超过 500 ms 或 end-to-end 增幅 >10% | 关闭 resolver 扩展，回到 explicit refs/legacy readiness | source refs 与现有 search 不变 |
| compaction 任一 fidelity/hash/ACL/revision gate 失败 | compaction=`legacy`；使用 full 或现有 ref | 原始 event/ref 与失败 receipt 保留 |
| handoff revision/hash stale | 不接纳 canonical claims；读取为 untrusted note | 原 handoff 文件不重写，等待 refresh |

### 5.2 回滚顺序

1. 先把 `teamSharedCanonical=false`。
2. `AIOS_CONTEXT_LIFECYCLE_MODE=enforce -> warn -> observe -> off`，停止新的 admission 影响。
3. `AIOS_CONTEXT_COMPACTION_MODE=legacy`，停止使用候选压缩结果。
4. 让 reader 忽略 Card/Packet/Receipt sidecar；不删除它们，除非人工确认只是 derived state。
5. 若 SQLite schema/cache 异常，关闭连接并从现有 session files 执行 `contextdb index:rebuild`。
6. 验证旧 commands、旧 fixtures、memo temporal 与 handoff/continuity baseline。
7. 只在证据明确后恢复到 observe；不从 off 直接跳回 enforce。

### 5.3 回滚不变量

- 不需要 data downgrade、reverse migration 或批量重写。
- rollback 不删除 ContextCard/Packet/Receipt，也不把它们当 canonical source。
- rollback 不撤销安全 deny：private supersede shared、未授权 publish/purge、提前物理删除不能重新开启。
- 新字段全部 additive；旧 reader 可忽略，旧 source ref 仍可解析。
- 任何 rollback 都不能把 candidate/observed claim 提升为 verified/shared。

---

## 6. 决策检查表

- [x] 一句话定位独立于竞品名称。
- [x] 用户可见能力组恰好 3 个。
- [x] 每项能力都映射到现有模块，不要求 ContextDB rewrite。
- [x] ContextItem 是 read model，不是新 memory store。
- [x] ContextDB filesystem canonical 与 SQLite rebuildable cache 保持不变。
- [x] public commands、旧数据、custom/legacy state path 有兼容策略。
- [x] shadow mode 不改变 prompt、admission 或 canonical memory。
- [x] planned/high-risk selective enforcement 与 direct/simple compatibility 分开。
- [x] Team shared canonical 默认 NO-GO，具备独立安全/并发门。
- [x] 每一 rollout stage 有控制、指标、门和 rollback。
- [x] rollback 无 destructive reverse migration，且不恢复已知不安全行为。

## 7. 最终建议

批准 **Context Lifecycle V1 - Verified Work Context** 进入 S0-S2 实施；只有 shadow 数据满足第 4.5 节门槛后才进入 S3。单用户 local-first 是本版本交付边界，Team shared canonical 留在关闭状态，不能作为赶版本的 scope 兜底。
