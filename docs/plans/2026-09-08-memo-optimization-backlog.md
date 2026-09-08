# Memo 优化 Backlog（单一真源）

- **日期**: 2026-09-08
- **目的**: 把散落在多份报告里的 memo/记忆优化项合并为一份带优先级与验收标准的 backlog，防止重复评估已完成项（Context Lifecycle V1 曾因完成状态分散而误判完成并撤回，见 `docs/reports/2026-07-28-context-lifecycle-v1-final.md`）。
- **来源合并**: `docs/reports/2026-09-05-competitor-orchestration-analysis.md`（P0-3）、`docs/reports/competitor-watchlist.json`（`p0OptimizationTargets.memo`）、`docs/reports/2026-07-28-context-lifecycle-v1-final.md`（十条件硬门）、`docs/reports/2026-08-01-memory-hygiene-survey.md`、`docs/superpowers/specs/2026-05-10-memory-system-optimization-design.md`、`docs/superpowers/specs/2026-05-17-tool-offload-mermaid-canvas-design.md`、`docs/reports/competitor-memory-systems.md`、2026-09-08 外部竞品调研（mem0 / Letta / Zep-Graphiti / TencentDB / claude-mem / Cursor Memories / Gemini /memory inbox）。
- **维护规则**: 完成一项就把状态改为 已完成 + 证据链接；新增候选项必须回答本文件尚未覆盖的问题；本文件是 memo 轨唯一状态源，报告只写增量。

## 一、已建成（不再立项，勿重复评估）

| 能力 | 证据 | 对标 |
| --- | --- | --- |
| 双时态事实失效（append-only + supersedes，读时派生 invalidAt/supersededBy，--include-invalid 可回溯） | `scripts/lib/memo/storage/temporal.mjs` | Zep/Graphiti 四时间戳 |
| 候选治理（promote/reject/expire + 会话关闭产生候选，append-only 决策日志） | `scripts/lib/memo/storage/candidates.mjs` | Cursor Memories 先批后存、Gemini /memory inbox |
| Provenance 骨架（producer 五型、claimStatus 四态、runtime identity、sha256） | `scripts/lib/memo/storage/provenance.mjs` | Zep episode 溯源 |
| Recall feedback 回路（impressions + useful marks → 逐事件调权） | `scripts/lib/memo/storage/feedback.mjs`、CLI `memo useful` | Letta self-editing 的反馈信号 |
| Persona / user profile 分层（含内容安全扫描） | `scripts/lib/memo/persona.mjs`、`safety.mjs` | Letta memory blocks（human/persona） |
| Workspace 多 space 共享记忆 | `scripts/lib/memo/workspace-memory.mjs` | 2026-05-10 设计 Phase 1 |
| Autodream Phase A（手动 preview/apply 整理） | `scripts/lib/memo/autodream.mjs` | Letta sleep-time（手动版） |
| 私有记忆读时 TTL（AIOS_AGENT_PRIVATE_TTL_DAYS，默认 30 天） | `scripts/lib/memo/storage/query.mjs:34-59` | mem0 TTL 剪枝 |
| Recall AB 评测框架（13 条事实链 × 3 arm，含 CJK 段） | `scripts/lib/memo/eval/recall-ab.mjs` | — |
| sqlite sidecar 检索（FTS5 `bm25()` 列权重 text=4.0/refs=2.0/eventId=1.0） | `mcp-server/src/contextdb/sqlite/events.ts:97` | mem0 混合检索的 BM25 路 |

## 二、缺口清单

状态：`待办` / `进行中` / `已完成（证据）`。

### A. 检索与热路径

| # | 条目 | 验收标准 | 来源 | 状态 |
| --- | --- | --- | --- | --- |
| A1 | file 后端排序升级为 BM25+IDF 融合（对齐 sqlite FTS5 路径已有语义；保留精确子串加成；归一化保持分数尺度稳定；实体加成留待抽取契约产出 entities[] 后接入） | 全量 memo 测试 + turn-recall 通过；AB 评测三 arm 断言不回归；排序确定性不变 | 09-05 报告 P0-3.1；`events.ts:97` 既有先例 | **已完成（2026-09-08，`query.mjs` BM25 融合 + MATCH_SCORE_EPSILON 噪声地板；memo 110 + search 20 测试全绿，AB 评测 baseline 76.9% / explicit 100% 维持）** |
| A2 | recall 热路径有界化：现在每次全量读取事件流并 fold Dream governance（`collectEvents` + `readDreamArchivedEventIds`），无增量索引/有界缓存。**可行方案评估（2026-09-08）**：① 进程内 mtime+size 失效缓存（`events-read.mjs` 按 root/storage/space 键缓存解析结果，governance/feedback 同模式）——惠及 MCP server、harness 循环、turn-recall 等长活进程，改动小、正确性易证；② 跨进程增量索引需 `appendMemoEvent` 同锁域维护（依赖 D4），成本大，暂缓；③ BM25 的 df 扫描（tokens × docs）随 ① 的解析缓存一并摊薄 | 20/200 规模基准（复用 `2026-07-28-context-lifecycle-v1-scale.md` 的 fixture 纪律，须同 runner 同场景）下 recall 延迟有界；缓存失效有测试 | V1 终稿未完成项 #6 | **已完成（2026-09-09，方案①：`events-read.mjs` 进程内 stat 签名解析缓存，FIFO 有界 50，命中 structuredClone 防篡改；治理侧复用既有持久 archive 索引未动，feedback 经同解析缓存覆盖；200 事件同进程 cold 6.99ms → warm 均 2.86ms，`memo-events-cache` 10/10）** |
| A3 | 独立实体层：抽取契约产出 entities[]，跨记忆链接，检索时 spread-attenuated 实体加成 | 抽取契约（B1）产出 entities[] 后，recall-ab 增加实体加成 arm 且 top-1 不降 | mem0 实体层；09-05 报告 P0-3.1 | **已完成（2026-09-09，`normalizers.mjs` 读时透传 entities/confidence/evidenceRef（修collectEvents静默丢实体）+ `query.mjs` 实体层：ICU复用直接交集DIRECT 1.0 + 精确实体一跳spread×0.5封顶0.5 + `entityBoost`开关 + `recall-ab` entity-boost arm；`memo-entity` 9/9；AB四臂76.9/100/76.9/76.9零漂移）** |
| A4 | 可选本地 embedding 粗排（fastembed/all-MiniLM，数据不出机器）+ token 精排 | 开关默认关；开启后 recall-ab 增加 embedding arm；无外部 API 依赖 | Rutgers 同名项目 retrievers；09-05 报告 P0-3.5 | 待办 |

### B. 写入与验证

| # | 条目 | 验收标准 | 来源 | 状态 |
| --- | --- | --- | --- | --- |
| B1 | 五要素抽取契约收口：`claimStatus=verified` 仅在引用且仅引用一条 runtime 实测退出码=0 的证据时由协议打标；模型自声明降权为 candidate | 变更后 memo-provenance 测试覆盖"伪造 verified 声明被拒"路径 | 4a663b0a 契约文档；09-05 报告 P0-3.2 | **已完成（2026-09-09，`createMemoEvent` 忽略无可信 provenance 的调用方 claimStatus + 自动链去掉 publish-shared self-grant，模型自报一律 candidate；verified 只剩三条真路：手工本地信任、attested 发布身份、治理晋升；伪造测试进 `memo-provenance`）** |
| B2 | 抽取门槛规则：相对时间锚定为绝对日期、排除无信息条目（客套/寒暄） | 契约文档补充规则 + 测试 fixture | mem0 抽取 prompt | **已完成（2026-09-09，新 `storage/extraction.mjs` 形状校验：date 强 ISO（相对时间 reject，有码错）、confidence high\|medium、evidenceRef 标量单条、entities 去重 24 封顶；`memo add` 加四 flag 并拒相对 date；语义判断（是否客套）仍归模型，runtime 只卡客观形状；`SKILL.md` 补锚定示例 + 单证据规则 + verified 新语义；`memo-extraction` 7 用例）** |
| B3 | memo 写入 stale-write guard（line#hash 精确替换语义，防并发覆盖） | 并发写 fixture 下后写者被拒并要求 re-read | oh-my-openagent Hashline（watchlist core 参考问题） | **已完成（2026-09-09，`pinned.mjs` 整块内容 hash 守卫：`pinnedContentHash` + `expectedHash`，stale 抛 `AIOS_MEMO_PINNED_STALE` 带 fresh hash，不传 hash 保持旧行为，读写对进 memo storage 锁；行级寻址延期见 review verdict；`memo-pinned-guard` 4/4 + 邻近 storage/CLI 绿；rex memo-all-impl TDD+review 全过）** |

### C. 注入与预算

| # | 条目 | 验收标准 | 来源 | 状态 |
| --- | --- | --- | --- | --- |
| C1 | 预算降级投影 full → summary+ref → ref-only，与 packet/receipt/执行链打通（现在 projector 与执行链断开） | planned 执行真实构建 packet，超预算时降级且 must-preserve 可达性受验证 | watchlist p0；V1 硬门 #8；TencentDB InjectionMode/Loadout | 待办（随 V1 enforcement） |
| C2 | 工具日志 offload + Mermaid 任务状态图 | 设计已批（2026-05-17 spec）；落地后长任务 context 压缩率可测且 info 可 grep 回溯 | TencentDB（61% token 节省来源） | 待办 |
| C3 | pinned 区 limit 化 memory block：字符上限 + 行号化渲染 + 余量元数据 | pinned.mjs 暴露 per-block limit；超限需显式整理 | Letta blocks；09-05 报告 P0-3.3 | 待办 |
| C4 | 渐进披露读 API：search 每条 ~50-100 token 摘要 → timeline → 按需详情（context:pack 分层） | context:pack 支持层级参数；pack 大小可观测 | claude-mem 三层工作流 | 待办 |

### D. 治理与安全（Context Lifecycle V1 硬门中属 memo 的部分）

enforcement 现状为 NO-GO（S0-S2 仅 library prototype，无生产调用方）。达 GO 的属 memo 硬门：

| # | 条目 | 验收标准 | 来源 | 状态 |
| --- | --- | --- | --- | --- |
| D1 | read evidence 改为受控读取工具的实测读取（现在 readRefs 是 caller 断言） | ContextReceipt 记录受控读取工具的实际读取事件 | V1 硬门 #3；Letta memory-citations | **已完成（2026-09-09，`assembleExecutionContext` 给 receipt 加 `reads[]`（ref+sourceHash+reader+readAt），来源只能是 assembler 自己的 `readAssemblySource` 调用（入口不收 readRefs），并纳入 decisionDigest；`memo-read-receipt` 2/2；rex memo-D-read-gc 全过）** |
| D2 | authority 不可由 shell-capable agent 经 `AIOS_RUNTIME_*` 自授 | 治理权威与 env 解耦的测试 | V1 硬门 #4 | **已完成（2026-09-09，四层锁定：推导/写入/治理毒化 env 下不变 + 四权威源码文件无 `AIOS_RUNTIME` 引用断言；`memo-authority-env` 4/4；lib 层本就不读该 env，属证明性收口）** |
| D3 | path 归一化覆盖 relative/absolute/Windows/CJK/symlink/case（已知 absolute path 产生 undeclared_target 误报） | 跨平台 path fixture 全绿；Windows 为一等测试环境 | V1 硬门 #5 | **已完成（2026-09-09，声明侧同工作区归一化 + reconciliation 缺失比对 + ledger 绝对转相对；`production-correction` 6/6 + `execution-context-packet` 11/11 + s2/orchestrate/evidence-gate 19/19，Windows 大小写真实跑过）** |
| D4 | Dream GC 与 append 同锁域/CAS | 并发 append+GC fixture 不丢事件 | V1 硬门 #7 | **已完成（2026-09-09，`createGcSnapshot` 删写本就在 `withMemoStorageLock` 内（与 append 同域），加法导出作真实写路径缝；`memo-gc-lock` 并发 10 append × 持锁 GC：幸存者+新增全在、目标入 snapshot；rex memo-D-read-gc 全过）** |
| D5 | supersede 的 ACL/publish gate 补全 | 未授权 agent 不能 supersede 他人 space 的事件 | watchlist p0（supersede 后半句） | **已完成（2026-09-09，`partitionSupersedes` 写时 fail-closed：dangling 一律 `unknown_target`（原放行），跨 space `scope_or_principal_mismatch` 可见；同 space 共享协作规则不变；`memo-supersede-acl` 4/4；rex memo-D-gov 全过）** |
| D6 | 内容安全扫描接入候选晋升门（safety.mjs 存在但未接 gate） | promote 路径强制过 scan，注入样本被拒 | watchlist 反向信号（OpenClaw 免确认前提是 quarantine 兜底，我们不具备） | **已完成（2026-09-09，`decideCandidate` promote 前强制 `scanWorkspaceMemoryContent`：注入样本 DENY + `unsafe_content` + receipt 记 `safety` 结论，干净样本走原权威门且 receipt 带 clean 结论；`memo-promote-safety` 2/2；rex memo-D-gov 全过）** |

### E. 整理与卫生

| # | 条目 | 验收标准 | 来源 | 状态 |
| --- | --- | --- | --- | --- |
| E1 | Autodream Phase B：会话结束/空闲阈值自动触发 + 便宜模型路由 | 默认 opt-in；触发后产出 proposal 走既有治理 CLI | Letta sleeptime（论文：per-interaction token 成本最高降 3 倍） | 待办 |
| E2 | 卫生命令落地（2026-08-01 调查停在建议层）：`--dry-run` + 可审计 diff 的 hygiene 命令，覆盖陈旧 session / pinned 复核 / 保留策略 | 审批队列四步（survey L24-29）可走通且全程无破坏性默认 | 2026-08-01-memory-hygiene-survey.md | 待办 |
| E3 | `l2-events.jsonl` 保留策略（无界增长） | 归档/轮替机制 + 大小可观测 | hygiene survey（unbounded event history） | 待办（随 E2） |

### F. 多 agent 共享与跨客户端

| # | 条目 | 验收标准 | 来源 | 状态 |
| --- | --- | --- | --- | --- |
| F1 | 核实并补全 2026-05-10 已批设计的未落地部分：AgentView T0-T3 分级加载、HandoffPacket v2、乐观锁冲突标记 | 缺项清单化后逐项验收；sub-agent 启动不再丢父上下文 | 2026-05-10-memory-system-optimization-design.md | 待办（先核实） |
| F2 | memo 投影/注入扩到全部已注册客户端（generatedTargets 现仅 4/7；hermes/workbuddy 走降级注入） | 7 客户端 doctor 全绿 + 注入冒烟 | 09-06 审计 C4；mem0 hook 矩阵（已吸收的对照） | 待办 |
| F3 | `aios import` 迁移导入器（Claude MEMORY.md / Continue rules / .roomodes / CONVENTIONS.md → memo） | 各格式 fixture 导入为 candidate 并可审核晋升；配套落地页 | 2026-09-08 外部调研（死亡竞品用户池：Continue 34k / Roo 24k / Aider 48k） | 待办（GTM 联动） |

### G. 评测与可观测

| # | 条目 | 验收标准 | 来源 | 状态 |
| --- | --- | --- | --- | --- |
| G1 | 真实项目评测集：现 20/200 fixture 为自构，不代表真实 precision/recall | 从真实 memo 语料建集，同 runner baseline/post 纪律 | V1 终稿证据边界 + 硬门 #9 | 待办 |
| G2 | `aios memory report`：各 space 体量/命中率/失效比/候选积压/feedback 分布 | 命令输出 + --json；doctor 不重复 | TencentDB 可观测 dashboard（roadmap 对照） | 待办 |

## 三、执行顺序（当前判断）

1. **A1**（本批次）：file 后端 BM25 融合——改动面最小、sqlite 路径已有先例、有 AB 评测护栏。
2. **D3**：path 归一化 Windows 误报——主环境正确性 + V1 GO 硬门。
3. **A2**：热路径有界化——性能隐患，A1 落地后其 df 扫描一并吸收。
4. **B1+B2**：写入门槛收口——与 evidence envelope 形成独有闭环。
5. E1 / E2 / F2 / G1 随后；C1 随 V1 enforcement 大盘走。

## 四、本批次记录

- 2026-09-08：A1 完成。变更：`scripts/lib/memo/storage/query.mjs` 排序分升级（成员过滤 `eventMatchesQuery` 不动，仅排序）——`scoreEventsWithBm25`（matched set 内计算 IDF，无需全局索引）+ 保留精确子串加成 + `MATCH_SCORE_EPSILON = 0.2` 噪声地板（分数差在地板内回落到 ts 时间序）。
- **经验教训（写给后续排序改造）**：首版 BM25 曾把 AB 评测 baseline top-1 从 76.9% 打到 61.5%——长度归一化让"证据相同、仅文档长短差几个字符"的修订对翻转了 recency 平局裁决。证明：排序改造必须先跑 `recall-ab` 看分段指标，不能只看测试断言；recency 是 memo recall 的有效先验，证据噪声不得覆盖它。
- 验证：`node --test scripts/tests/memo-*.test.mjs scripts/tests/turn-recall.test.mjs`（110/110）+ `search.test.mjs` + `search-budget.test.mjs`（20/20）+ AB 评测三 arm（baseline 76.9% / temporal-explicit 100% / auto 76.9%，ranked-stale 段保持设计内失败）；全量回归套件另行运行。
- 2026-09-09：D3 完成。变更：`execution-context.mjs` 声明侧同工作区归一化（绝对 targets/patterns 不再误报）+ `context-reconciliation.mjs` 缺失比对工作区感知 + `changed-files.mjs` ledger 绝对转相对；新增 `production-correction` 回归 2 用例（绝对声明/模式、CJK、点段、reconciliation 双向等价）。
- 2026-09-09：CRLF 根治。pinned 31 文件删后检出强制 LF（`ls-files --eol` w/crlf 清零）；`aios-orchestrator-agents.test.mjs` 删 `normalizeEol` 改字节严格相等，Windows（autocrlf=true）21/21 全绿——漂移哨兵以后只认 git 配置。
- 2026-09-09：B 全量基线认证（A1+D3 脏树）。`run-test-suite.mjs regression` 1069 用例 1060 pass / 0 fail / 9 skip；`memo-ab-eval` 8/8 + 三 arm（baseline 76.9% / explicit 100% / auto 76.9%）与 A1 断言一致；mcp `typecheck` 过 + `test` 102 pass / 0 fail / 12 skip + `build` 过；`aios doctor` errors=0（10 warn 均为环境项：bootstrap 空队列、browser profile、codemap 待重建、native 组件）。
- 2026-09-09：A2 完成（方案①）。变更：`events-read.mjs` 进程内 stat 签名（size+mtimeMs+ctimeMs）解析缓存——`readJsonlEvents` 单文件单条目（tolerant 全量 + strict 首错重抛，字节等价）、`readSplitEvents` 快照比对、命中 structuredClone 防篡改、FIFO 有界 50、`memoEventsCacheStats/clearMemoEventsCache` 测试钩子；治理侧复用既有持久 archive 索引（`archive-index.mjs`）未动，feedback 经同解析缓存覆盖；`getActiveMemoStorage` 小配置读保留未缓存。
- **经验教训（写给后续缓存改造）**：缓存存后直接返回存储引用会让首读调用方篡改缓存行——存后必须返回 clone；`normalizeEventRows` 纯函数是缓存安全的前提，动它之前先确认无原地改；stat 签名省 IO 不省 BM25/排序 CPU，bench 数字只反映解析层收益。
- 验证：新 `memo-events-cache.test.mjs` 10/10（冷热一致、search 复用、append 失效、同尺寸改写失效、防篡改、space 隔离、malformed 双序、FIFO 驱逐、split 失效、200 事件 bench cold 6.99ms → warm 均 2.86ms）；memo 系 140/140 + dream/候选/校正 34/34 + AB 8/8 与三 arm 零漂移。
- 2026-09-09：B1+B2 完成。变更：新 `storage/extraction.mjs` 五要素形状校验（无语义关键词表）；`createMemoEvent` 无可信 provenance 时忽略调用方 claimStatus；`recordAutomaticMemory` 去掉 publish-shared self-grant（模型自报一律 candidate 进治理队列，附五要素）；`memo add` 加 `--entities/--date/--evidence-ref/--confidence` 并拒相对 date；`SKILL.md` 补锚定示例 + 单证据规则 + verified 新语义；用例：`memo-provenance` 加伪造降级 + 迁移兼容，新 `memo-extraction.test.mjs` 7 用例（含自动链 candidate、CLI 透传冒烟）。
- **经验教训（写给后续门槛改造）**：`assert.throws` 正则只匹配 message 不匹配 `error.code`——码断言要写 validator 回调；语义门槛（是否客套/是否有用）一旦写成词表就是反模式，runtime 只许卡客观形状（ISO 格式、枚举、标量、长度下限），判断归模型声明。
- 验证：新 extraction 7/13 与 provenance 6/13 合计 13/13；memo 系 148/148；ctx-agent-core + dream-governance + candidate-governance + AB-eval 52/52；AB 三 arm（76.9%/100%/76.9%）零漂移；全量回归套件本轮未重跑（A2 后无热路径改动，B1 改动面限写入链）。
- 2026-09-09：A3 完成。变更：`normalizers.mjs` 读时透传 entities/confidence/evidenceRef（此前 `collectEvents` 静默丢实体，recall 永不可见）；`query.mjs` 实体层：`eventMatchesQuery` 含实体 + `scoreEventsWithEntity`（query/实体均经 `tokenizeForMatch`，直接交集比 DIRECT 1.0，精确实体一跳 spread×0.5 封顶 0.5，仅零直接事件吃 spread）+ `searchMemoEvents({ entityBoost })` 开关（关即旧行为）；`recall-ab.mjs` 加 `withEntities`（chain.id 为实体）+ `entity-boost` arm。
- **经验教训（写给后续检索改造）**：写侧有字段≠读侧可见——`normalizeEventRows` 是读写鸿沟，先查透传再谈加成；实体加成零实体时必须恒零，否则 A1 式翻转重演；spread 只许精确实体等值连边，token 交集只算直接证据，不做二跳。
- 验证：新 `memo-entity.test.mjs` 9/9（归一化、零实体零分、直接、spread 衰减/封顶/仅零直接、写读透传 + entityBoost 关即旧行为、防篡改、AB top-1 不降、语料仅差 entities）；memo 系 + turn-recall + search/search-budget 156/157（1 例 Windows Temp EPERM 锁抖动，重跑 locking 10/10）；`memo-ab-eval` 四臂 baseline 76.9% / explicit 100% / auto 76.9% / entity-boost 76.9% 零漂移。
