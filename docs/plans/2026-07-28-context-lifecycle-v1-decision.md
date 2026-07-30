# Context Lifecycle V1：可验证工作上下文

> **实施状态纠错：本文件是进入实施的设计决策，不是完成证明。S1/S2 当前仅有 library/test 实现，未接生产调用链；RC/GO 已撤回。权威状态见 `docs/reports/2026-07-28-context-lifecycle-v1-corrective-audit.md`。**

> 决策状态：推荐批准 S0～S2 进入实施
> 产品边界：单用户、本地工作区、可信 Agent
> Team 边界：shared-canonical 写入保持关闭
> 基线：`main@bfb9ce2`，148 个定向测试通过

## 一句话定位

> 让 AIOS 在计划型或高风险修改前准备并核验最小充分上下文，在修改后留下可追溯、可恢复、可继续的证据链，同时不替换现有 ContextDB、memo、planning、offload、continuity 和 handoff。

## 最终版本范围

本版本只建设三个用户可感知的能力组。

### 1. 安全的记忆写入

用户得到的结果：Agent 产生的推断不会再被静默当作共享事实，私有记录不能影响其他 Agent 的共享事实，Dream 不会提前物理删除历史证据。

本版本包含：

- runtime 注入真实 producer / principal / session / run 来源；
- scope 与 ACL 分离；
- private → shared/canonical supersede 禁止；
- shared publish、supersede 和 promotion 需要明确 capability、revision 与 expected hash；
- session close 只生成 candidate，经过人工或 steward promotion 才进入共享记忆；
- Dream 改为 proposal → tombstone/archive → retention GC，不再直接删除原始记录。

### 2. 可审计的修改上下文

用户得到的结果：计划型或高风险修改能够说明“准备改什么、必须读什么、实际读了什么、内容是否过期、允许写哪里、改完是否越界”。

本版本包含：

- planning task 增加可选 target、allowed writes、required context、reason、verification 和 revision；
- 基于当前 plan/work item 生成 Context Impact Set；
- ContextDB 生成 `ExecutionContextPacket`，不复制文件全文；
- 复用 source hash、offload ref 和 Rex evidence 构建 `ContextReceipt`；
- shadow 模式 stale-read/write preflight；
- 复用 changed-files，并以 Git diff 作为保守补充，完成 planned-vs-actual 对账；
- direct/read-only 任务保持当前轻量路径，不强制创建持久化 packet。

### 3. 可恢复的连续性

用户得到的结果：预算不足、恢复会话或 handoff 时，不再静默丢失相关上下文的存在性和来源。

本版本包含：

- 上下文表示支持 `full → summary+ref → ref-only`；
- 只有存在真实、可解析 source ref 的内容才能降级为 ref-only；
- 每个 included/degraded/excluded 项都有 reason 和 hash；
- 现有 ContextDB handoff 增加可选 base revision、context revision、packet ref、receipt ref 和 verification refs；
- continuity、handoff 和现有 ContextDB packet 保持可读，不新增第二套 handoff 协议。

## 本版本明确不做

- 不新增向量数据库、图数据库或远程 memory service；
- 不新建通用 ContextItem/ContextCard 数据库；
- 不重写 ContextDB，不搬迁 memo 数据；
- 不做预测式 anticipation 或 learned prefetch；
- 不做通用异步 ingestion queue/replay 框架；
- 不宣称已经实现完整“验证式语义压缩”；
- 不自动把 Agent 输出晋升为 shared canonical fact；
- 不开启 Team shared-canonical 写入；
- 不另建平行的 context handoff 或 packet 协议。

完整语义压缩只有在 ContextReceipt 积累了足够真实任务，并且 must-preserve、trust、evidence reachability 和 omission 数据完整后，才能重新进入版本评审。

## 能力集成裁决

### 可以直接复用

| 当前能力 | 本版本用途 | 为什么不需要重造 |
|---|---|---|
| ContextDB pack/source SHA-256 | Packet freshness、receipt lineage | 已有稳定 hash 与 manifest |
| offload raw ref / node_id | summary+ref、ref-only 恢复原文 | 原始结果已有唯一 owner |
| Rex expectedEvidence / receipt ref | Packet verification 引用 | 不复制 Rex evidence 协议 |
| changed-files ledger | 修改后 planned-vs-actual 对账 | 行格式和公开输出可保留 |
| ready/warning/blocked verdict | task-context preflight | 不新增第二套 gate 结果 |
| continuity 与 handoff | revisioned lineage | 只增加可选字段和适配 |
| hindsight candidate/review | session summary promotion | 已有正确的候选→审核模式 |

### 需要适配后集成

| 能力 | 主要归属 | 兼容方式 |
|---|---|---|
| runtime provenance、ACL、publish/supersede gate | `memo/storage/**` + runtime identity | 新字段 additive；旧记录按 `legacy/observed` 读取，不批量重写 |
| session-close candidate | `lifecycle/session-hooks/close.mjs` | 命令保留，返回 candidate 状态，不再声称已写 shared memo |
| Dream proposal/tombstone | `lifecycle/dream/**` | preview 保留；apply 改成逻辑状态转换 |
| 最小任务上下文契约 | `planning/schema.mjs`、`contract.mjs` | plan v1/v2 继续可读；首次新写时使用 additive 字段 |
| ExecutionContextPacket / ContextReceipt | ContextDB 的窄扩展 | 新 sidecar；不是 canonical source；关闭后可忽略 |
| stale preflight / reconciliation | `lifecycle/preflight-contracts.mjs` | 先 shadow；只对受控 write/edit/patch/rename/delete 评估 |
| budget representation | ContextDB assembler + `offload/**` | 原始 ref 仍归 offload；无 ref 时不得伪造降级 |
| handoff lineage | 现有 `contextdb/handoff.mjs` | v2 reader/render 保持；新增字段可选 |

### 只观察，暂不进入版本

- 通用可靠摄入队列、cursor、checkpoint 和 replay；
- 完整验证式语义压缩；
- 预测式 anticipation；
- Team shared-canonical 和语义冲突自动合并。

### 明确拒绝

- 以图数据库作为 Context Lifecycle 核心；
- 新向量库、远程记忆服务或 polyglot memory backend；
- LLM 自动生成每个 Agent 的记忆架构；
- fuzzy score 作为唯一压缩验收；
- universal ContextItem store；
- big-bang 数据迁移；
- 第二套 handoff/context packet 协议。

## 架构调整

### 所有权

| 领域 | 唯一 owner | 本版本职责 |
|---|---|---|
| durable fact、temporal、publish、supersede | memo | 来源、权限、事实失效与共享发布策略 |
| objective、acceptance、targets、required context、verification | planning / Rex work item | 声明修改意图和上下文要求 |
| ExecutionContextPacket、ContextReceipt、read-time normalized view | ContextDB | 装配、持久化派生 sidecar、查询与审计 |
| raw tool/file content 与 recoverable ref | offload | 原文和引用，不复制到 packet/receipt |
| preflight 与 write admission | lifecycle/preflight | freshness、ownership、target、revision 判断 |
| actual changes | changed-files + Git diff | 修改后保守对账 |
| handoff lineage | 现有 ContextDB handoff | revision/ref/evidence 的 additive 扩展 |

### 数据流

```text
Rex work item / plan
  → targets、allowed writes、required context、verification
  → Context Impact Set
  → ContextDB 组装 ExecutionContextPacket
  → 实际 read evidence + base/expected hash
  → shadow preflight
  → 现有 write/edit/patch/rename/delete 路径
  → changed-files + Git diff 对账
  → ContextReceipt
  → 现有 continuity / handoff
```

### 兼容策略

采用：

```text
read-old/read-new
  → shadow derive
  → new writes additive
  → no eager rewrite
```

- 旧 memo、plan v1/v2、continuity v1、handoff v1/v2、ContextDB session packet 继续可读；
- 新对象只保存 sidecar/ref/hash，不成为原始内容唯一副本；
- lifecycle mode 关闭后回到现有读取和执行路径；
- mode=`observe` 时不改变 prompt、排序、write admission、memo/handoff canonical state；
- 仅两个安全修复允许有意改变旧行为：private 不再影响 shared，Dream 不再提前物理删除。

## 发布顺序

### S0——安全前置

- 修复 private/shared supersede；
- runtime provenance 与 publish gate；
- session-close candidate；
- Dream proposal/tombstone；
- 补齐安全和兼容测试。

**完成门**：所有跨 Agent hide/leak/delete/publish 场景为 0 violation；现有 148 个定向测试继续通过。

### S1——只观察的 Packet 与 Receipt

- plan/work-item additive context fields；
- ExecutionContextPacket；
- ContextReceipt；
- source ref/hash 解析；
- mode=`observe`，不改变现有结果。

**完成门**：旧路径结果一致率 100%；canonical state 非预期修改为 0；派生成功率和 dangling-ref 结果可报告。

### S2——Shadow Preflight 与修改后对账

- required/fresh/target/ownership/revision 检查；
- 记录 `would_warn` / `would_block`；
- changed-files + Git diff 对账；
- full/summary+ref/ref-only 表示决策；
- 最小 handoff lineage。

**完成门**：合成 stale、undeclared target 和 ownership 场景检出率 100%；误报率达标前不进入真正阻断。

### S3——后续条件式 enforcement，不属于本轮默认实施承诺

只有 S1/S2 的真实任务数据满足门槛后，才从 `observe → warn → selective enforce`，且只覆盖 planned/high-risk、受控 mutation adapter。Team shared-canonical 仍保持关闭。

## 竞品组合最终裁决

未来不再对 12 个项目做定期全量刷新。

### 核心参考：3 个

| 项目 | 唯一问题 | 刷新方式 |
|---|---|---|
| TencentDB-Agent-Memory | 超预算时如何降级表示，同时保留 raw ref 和来源链 | 事件触发；季度只查元数据 |
| oh-my-openagent | active work 恢复、session lineage 与 stale-write 防护 | 事件触发；季度只查元数据 |
| OpenClaw | proposal→review→apply/rollback/quarantine 的治理与 stale hash | 事件触发；季度只查元数据 |

### 专项参考：2 个

| 项目 | 唯一问题 | 刷新方式 |
|---|---|---|
| Graphiti | 双时态事实与 episode provenance 如何建模 | 相关 schema 变化时；半年元数据检查 |
| Letta Code | 如何基于模型实际读取生成不可伪造的 context citation/receipt | citations 机制变化时；半年元数据检查 |

### 归档参考：5 个

| 项目 | 归档理由 |
|---|---|
| mem0 | 生命周期 hook 信号已经吸收，自动晋升还是反例；大仓持续跟踪收益低 |
| OpenViking | namespace/ref-only 信号已被更聚焦来源覆盖；AGPL/服务化架构不进入版本 |
| superpowers | 方法论已吸收，Rex 已是唯一控制面 |
| Hermes Agent | 已有专门能力映射，curator/治理与 OpenClaw 重叠 |
| OpenHarness | readiness 已吸收，纯 prompt preview 作为反例保留即可 |

归档项目保留 2026-07-28 证据快照，不再定期刷新。

### 移出主动观察：2 个

| 项目 | 移出理由 |
|---|---|
| gnhf | consecutiveFailures abort 已吸收；其余是 Git-specific repair 或无上限退避反例 |
| ECC | skill compliance / changed-files 与 Rex evidence、reconciliation 和 stale-write 参考重复 |

## 验收与回滚

### 硬门

- private/Agent B 隐藏、替代或删除其他主体记录：`0`；
- 未授权 shared canonical publish/supersede/purge：`0`；
- session assistant 文本未经 promotion 进入 shared recall：`0`；
- Dream retention 前物理删除：`0`；
- 新 shared candidate provenance 完整率：`100%`；
- mode=`off` 时，除安全修复外，旧命令、旧数据和现有执行行为保持一致；
- degraded item 的真实 ref/hash 可解析率：`100%`；
- direct/read-only 工作流不被强制计划或阻断；
- stale/undeclared/ownership 合成场景 shadow 检出率：`100%`。

### 回滚

```text
selective enforce → warn → observe → off
```

- sidecar 可忽略，不需要 reverse migration；
- 原始 ContextDB/memo/offload 数据不删除、不批量重写；
- compaction/packet/receipt 失败时回到现有 full/ref 路径；
- 回滚不能重新开启 private supersede shared、未授权 publish 或 Dream 提前物理删除。

## 已验证基线

主流程已独立重跑：

- context/memo/handoff/offload：`69 pass / 0 fail`；
- planning/workflow/preflight：`40 pass / 0 fail`；
- MCP ContextDB compatibility：`39 pass / 0 fail`；
- 合计：`148 pass / 0 fail`。

## 推荐决定

批准 **Context Lifecycle V1：可验证工作上下文** 进入 S0～S2。

本轮不直接承诺 S3 enforcement、完整语义压缩或 Team shared-canonical。先用兼容的 sidecar、observe 和 shadow 数据证明价值，再决定是否升级阻断和更强智能能力。
