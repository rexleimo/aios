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
| A4 | 可选本地 embedding 粗排（fastembed/all-MiniLM，数据不出机器）+ token 精排 | 开关默认关；开启后 recall-ab 增加 embedding arm；无外部 API 依赖 | Rutgers 同名项目 retrievers；09-05 报告 P0-3.5 | **已完成（2026-09-09，新 `storage/embedding.mjs`：`createHashLexicalEmbedder`（确定性 hashed token 投影，进程内零依赖零外呼）+ `resolveEmbedderFromEnv`（`AIOS_MEMO_EMBEDDER` 默认关，未知值报错）+ 可注入接口（name + async embedText → L2 归一化向量，真模型即插）；`searchMemoEvents({ embedder })` 粗排为 **union-only** 预筛：只向 token 匹配集**加**近邻候选、永不剔除，精排仍归 BM25/exact；recall-ab 增 `embedding` 臂（plain 语料 + embedder）四→五臂，top-1 与 baseline 76.9% 零漂移且 stale 占比下降；CLI 经 env 透传；`memo-embedding` 5/5。真模型接入留作后续：装 `@xenova/transformers` 后实现同一接口即可）** |

### B. 写入与验证

| # | 条目 | 验收标准 | 来源 | 状态 |
| --- | --- | --- | --- | --- |
| B1 | 五要素抽取契约收口：`claimStatus=verified` 仅在引用且仅引用一条 runtime 实测退出码=0 的证据时由协议打标；模型自声明降权为 candidate | 变更后 memo-provenance 测试覆盖"伪造 verified 声明被拒"路径 | 4a663b0a 契约文档；09-05 报告 P0-3.2 | **已完成（2026-09-09，`createMemoEvent` 忽略无可信 provenance 的调用方 claimStatus + 自动链去掉 publish-shared self-grant，模型自报一律 candidate；verified 只剩三条真路：手工本地信任、attested 发布身份、治理晋升；伪造测试进 `memo-provenance`）** |
| B2 | 抽取门槛规则：相对时间锚定为绝对日期、排除无信息条目（客套/寒暄） | 契约文档补充规则 + 测试 fixture | mem0 抽取 prompt | **已完成（2026-09-09，新 `storage/extraction.mjs` 形状校验：date 强 ISO（相对时间 reject，有码错）、confidence high\|medium、evidenceRef 标量单条、entities 去重 24 封顶；`memo add` 加四 flag 并拒相对 date；语义判断（是否客套）仍归模型，runtime 只卡客观形状；`SKILL.md` 补锚定示例 + 单证据规则 + verified 新语义；`memo-extraction` 7 用例）** |
| B3 | memo 写入 stale-write guard（line#hash 精确替换语义，防并发覆盖） | 并发写 fixture 下后写者被拒并要求 re-read | oh-my-openagent Hashline（watchlist core 参考问题） | **已完成（2026-09-09，`pinned.mjs` 整块内容 hash 守卫：`pinnedContentHash` + `expectedHash`，stale 抛 `AIOS_MEMO_PINNED_STALE` 带 fresh hash，不传 hash 保持旧行为，读写对进 memo storage 锁；行级寻址延期见 review verdict；`memo-pinned-guard` 4/4 + 邻近 storage/CLI 绿；rex memo-all-impl TDD+review 全过）** |

### C. 注入与预算

| # | 条目 | 验收标准 | 来源 | 状态 |
| --- | --- | --- | --- | --- |
| C1 | 预算降级投影 full → summary+ref → ref-only，与 packet/receipt/执行链打通（现在 projector 与执行链断开） | planned 执行真实构建 packet，超预算时降级且 must-preserve 可达性受验证 | watchlist p0；V1 硬门 #8；TencentDB InjectionMode/Loadout | **已完成（2026-09-09 核实 + 收口：三档降级 `full → summary+ref → ref-only` 已在 `execution-context.mjs` 投影逻辑落地（representation 三态 + ref-only `[reference only]` 渲染）；must-preserve = `hardConstraint` 项恒以 full 表示纳入并记 `hard_constraint_preserved` + `budgetOverflow` 可观测，可达性受验证；生产执行链 `lifecycle/orchestrate.mjs` → `context-lifecycle.mjs:143` 真实调用 `assembleExecutionContext`（"断开"记录已过时）；packet/read-receipt/untrusted 三套 14/14 绿。剩余仅为 V1 enforcement 大盘对全部 planned 路径的推广接线，归 D 篇 NO-GO→GO 进程，不再单列 memo 缺口）** |
| C2 | 工具日志 offload + Mermaid 任务状态图 | 设计已批（2026-05-17 spec）；落地后长任务 context 压缩率可测且 info 可 grep 回溯 | TencentDB（61% token 节省来源） | **已完成（2026-09-09 核实判定已建成，勿重复立项：`aios refs list/grep/read/prune`——offload 工具日志可 grep 回溯 + 保留策略；`aios canvas show/path/backfill`——Mermaid 任务状态图（mmd/json）+ 事件回填；写入缝在 `lifecycle/harness/execute-turn.mjs`/`prompt.mjs`。即 2026-05-17 spec 的两个交付物均已上线，backlog 未记录完成状态所致误判）** |
| C3 | pinned 区 limit 化 memory block：字符上限 + 行号化渲染 + 余量元数据 | pinned.mjs 暴露 per-block limit；超限需显式整理 | Letta blocks；09-05 报告 P0-3.3 | **已完成（2026-09-09，`pinned.mjs` 导出 `renderPinnedBlock`（行号化 lines + chars/limit/remaining/truncated，超限裁整行截断）+ `[512,20000]` clamp（`PINNED_DEFAULT_MAX_CHARS=5000` 与 CLI env 同窗，常量住 `storage/constants.mjs` 单源）；CLI 新增 `memo pin status` 打印三元组；`memo-pinned-render` 5/5 含 CLI 冒烟；真实语料首跑即报警：本项目 pinned 存量 21424 字符（超限 4 倍，投影写入不经 CLI 容量门），`truncated` 语义按设计工作，整理待 E2** |
| C4 | 渐进披露读 API：search 每条 ~50-100 token 摘要 → timeline → 按需详情（context:pack 分层） | context:pack 支持层级参数；pack 大小可观测 | claude-mem 三层工作流 | **已完成（2026-09-09，timeline/detail 层按计划复用既有 `memo list`/full 行；`memo search --level summary|full`：summary 行经 `summarizeMemoText`（连续重复 token 压到 2 次 + 400 字符封顶 + `…` 标记，防退化循环文本买回预算）≈100 token，full 与默认层级行为不变；末行 pack footer `pack: N entries, M chars, level=X` 可观测；真实语料冒烟 2 entries/593 chars/level=summary；`memo-search-level` 3/3）** |

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
| E1 | Autodream Phase B：会话结束/空闲阈值自动触发 + 便宜模型路由 | 默认 opt-in；触发后产出 proposal 走既有治理 CLI | Letta sleeptime（论文：per-interaction token 成本最高降 3 倍） | **已完成（2026-09-09，新 `lib/memo/autodream-auto.mjs`：`AIOS_AUTODREAM_AUTO=1` 默认关 + 双触发器——`session-close` 钩子（`runSessionClose` 内 try 包裹，绝不阻塞关闭）与空闲阈值（`AIOS_AUTODREAM_IDLE_MINUTES` 默认 30，读最新 memo 事件年龄）；触发只跑 `runDream mode=preview`，proposal 走既有治理 apply（人工审批），永不自动 apply；**便宜路由的诚实结论**：dream 引擎本身零 LLM 确定性，0 token 即最便宜路由，未来若接模型化整理必须经 model-router task-type 并仍在同一 opt-in 门后；`memo-autodream-auto` 4/4）** |
| E2 | 卫生命令落地（2026-08-01 调查停在建议层）：`--dry-run` + 可审计 diff 的 hygiene 命令，覆盖陈旧 session / pinned 复核 / 保留策略 | 审批队列四步（survey L24-29）可走通且全程无破坏性默认 | 2026-08-01-memory-hygiene-survey.md | **已完成（2026-09-09，`memo hygiene`：默认只读 survey（sessions 分类 + pinned 复核复用 C3 renderPinnedBlock + l2 体量可观测 + proposals）；`--archive-stale-sessions` 移动陈旧历史 session 入 `context-db/archive/`（目标冲突抛 `AIOS_MEMO_HYGIENE_CONFLICT`），`--rotate-events --max-events N` keep-newest 轮替；只 archive/rotate 永不 delete，apply 仅显式 flag 触发；安全规则：`workspace-memory--` 前缀 space 级活 session 永不归档（default meta 41 天旧但活着，legacy pinned 回退依赖它），meta 不可读记 unknown 永不归档；`memo-hygiene` 4/4；真实仓库 survey 冒烟 18 session 分类正确 + pinned 21424/5000 报警 + l2 2495 行/1.4MB 可观测）** |
| E3 | `l2-events.jsonl` 保留策略（无界增长） | 归档/轮替机制 + 大小可观测 | hygiene survey（unbounded event history） | **已完成（2026-09-09，随 E2 落地：`rotateSessionEvents` keep-newest 轮替，旧行追加进同目录 `l2-events.archive-<ts>.jsonl`，moved+kept==before 零丢失 + sha256 前后对账；survey 的 eventsRetention 段逐文件 bytes/lines/oldest/newest 可观测；不触碰 memo storage `events.jsonl`（recall 主存储，轮替会隐藏 active 事实）；真实存量 default l2 2495 行/1.4MB 待 owner 批准轮替）** |

### F. 多 agent 共享与跨客户端

| # | 条目 | 验收标准 | 来源 | 状态 |
| --- | --- | --- | --- | --- |
| F1 | 核实并补全 2026-05-10 已批设计的未落地部分：AgentView T0-T3 分级加载、HandoffPacket v2、乐观锁冲突标记 | 缺项清单化后逐项验收；sub-agent 启动不再丢父上下文 | 2026-05-10-memory-system-optimization-design.md | **已完成（2026-09-09 核实+补全。① HandoffPacket v2：**已落地**（`contextdb/handoff.mjs` 全字段 + v3 lineage + 生产写入/读取），仅命名偏差 handoff.json vs 设计 continuity.json，可不做；② sub-agent 父上下文：**经替代机制已满足**（harness `subagent-runtime/prompts.mjs` 注入上游 handoff/contextSummary），启动自动注入被 `aios-long-running-harness/SKILL.md` 政策性禁止（防 prompt replay），属有意决策；③ 乐观锁冲突标记：**已补全**——`writeWorkspaceMeta` 拒绝 stale 写时自动写 `conflicts/{ts}.json`（此前原语零调用方），`workspace.test` 11 用例含新增自动标记断言；④ **AgentView T0-T3 分级：确认为真实缺口**，`buildAgentView` 一次性全量加载且零生产调用方，分级加载器+生产接线立为新条目 H1）** |
| F2 | memo 投影/注入扩到全部已注册客户端（generatedTargets 现仅 4/7；hermes/workbuddy 走降级注入） | 7 客户端 doctor 全绿 + 注入冒烟 | 09-06 审计 C4；mem0 hook 矩阵（已吸收的对照） | **核实完成（2026-09-09，修正审计的前提误判）：`generatedTargets` 并非硬编码 4，而是 `resolveClientAgentTargets('all')` 按 `agents` 能力**推导**（`source-tree.mjs:50`），manifest 校验强等该推导值；4/7 是能力边界的设计结果——workbuddy 定义明载 agents "unverified"、gemini 上游停更注记在案、hermes 无已验证消费契约；发射器（emitters/）是**每客户端原生格式**，补 3 客户端需先验证各自 agent 卡消费方式，凭空投影违反"client overlays 只描述已验证能力"规则。真实待办 = 对 gemini/hermes/workbuddy 逐一验证 agent 定义消费契约后加 emitter（见 H2）；README"承诺落差"归增长面处理 |
| F3 | `aios import` 迁移导入器（Claude MEMORY.md / Continue rules / .roomodes / CONVENTIONS.md → memo） | 各格式 fixture 导入为 candidate 并可审核晋升；配套落地页 | 2026-09-08 外部调研（死亡竞品用户池：Continue 34k / Roo 24k / Aider 48k） | **已完成（2026-09-09，新 `lib/memo/import-external.mjs` + `import-cli.mjs`，顶层 `aios import --format claude\|continue\|roo\|conventions --file <path> [--dry-run] [--json]`；markdown bullet/有序行拆分 + .roomodes JSON 模式解析；导入器以无发布能力的 runtime identity 写入 → 权威判定恒 candidate（B1 语义不可绕过），带 `#import-<format>` 溯源 tag，幂等（已存在文本跳过）；审核晋升走既有 `memo candidate list/inspect/promote`；落地页 `docs/import-migration.md`；`memo-import` 5/5）** |

### G. 评测与可观测

| # | 条目 | 验收标准 | 来源 | 状态 |
| --- | --- | --- | --- | --- |
| G1 | 真实项目评测集：现 20/200 fixture 为自构，不代表真实 precision/recall | 从真实 memo 语料建集，同 runner baseline/post 纪律 | V1 终稿证据边界 + 硬门 #9 | **已完成（2026-09-09，新 `eval/real-corpus.mjs`：`measureRealCorpus` 运行时从活跃语料派生查询（每条 active 事实取文档频率最低的 3 个 token 作查询，superseded 排除，确定性），同 runner 直接度量真实仓库；**不落语料文本进仓库**（.aios 不入库，只记度量数）；基线（2026-09-09，171 events/50 queries）：**top-1 98% / top-5 100% / avgReturned 1.42**，两次运行 deepEqual 确定性锁定；`memo-real-corpus` 2/2。后续检索改造纪律：改前跑此基线、改后对比，数字漂移即回归）** |
| G2 | `aios memory report`：各 space 体量/命中率/失效比/候选积压/feedback 分布 | 命令输出 + --json；doctor 不重复 | TencentDB 可观测 dashboard（roadmap 对照） | **已完成（2026-09-09，新 `lib/memo/report.mjs`：`buildMemoryReport` 单次派生全量视图——per-space events/chars/superseded 失效比/候选数/feedback impressions-useful-adoption/时间跨度 + 候选四态 tally（pending/promoted/rejected/expired + backlog）+ pinned 预算（复用 C3 渲染）；`memo report [--json]` + 顶层 `aios memory report [--json]` 双入口；与 doctor 职责不重叠（doctor 管存储可用性）；真实冒烟 171 events/2 空间/pinned 超限即见；`memo-report` 2/2）** |

### H. 核实中新发现的真实缺口（2026-09-09 立项）

| # | 条目 | 验收标准 | 来源 | 状态 |
| --- | --- | --- | --- | --- |
| H1 | AgentView T0-T3 分级加载器 + 生产接线：`buildAgentView` 现一次性全量加载（meta + projectContext + 全量 skill 索引 + 遍历 session 找 handoff）且零生产调用方；`activeTasks` 硬编码 `[]` | T0=meta+context / T1=按 taskType 过滤摘要 / T2=激活 skill 全文 / T3=按需 knowledge/history；ctx-agent-core 启动路径按 tier 参数化调用；token 预算逐档可观测 | 2026-05-10 设计 §2（F1 核实残留项） | **已完成（2026-09-09，`buildAgentView({ tier })` 四档：T0 meta+context、T1 +过滤摘要与 continuity 指针（不读全包）、T2 +激活 skill 全文、T3 +continuity 全包/lineage/knowledge；默认 T3 旧调用方零破坏；每档带 `budget.sections` 逐段字符账（单调可证）；生产接线 `node scripts/ctx-agent.mjs workspace-view --session <id> [--task-type] [--tier] [--json]`（pull-based 读，遵守"不自动注入启动 prompt"政策）；`agent-view-tiers` 6/6 + workspace/handoff 回归 26/26）** |
| H2 | gemini/hermes/workbuddy agent 定义消费契约验证 + emitter：三客户端均无已验证的 agent 卡消费方式（workbuddy 定义明载 unverified） | 每客户端一份实测消费证据（CLI 读什么目录/什么格式）后按原生格式加 emitter，`agents` 能力与 `agentTargetRoot` 才随之扩展 | F2 核实残留项（09-06 审计 C4 的真实工作量） | **核实完成（2026-09-09 实测三客户端均在装机，直接探查 CLI）：**① gemini：`--help` 零 agent 概念命中，无 agent 卡消费面——其 agent 需求由 instructions（GEMINI.md）+ skills 承接，两者 skills 能力本就 7/7 投影，**无需 emitter**；② hermes：自带 `import-agent {claude-code,codex}`（映射 instructions/权限/MCP/skills/memory），**消费的是 Claude/codex 目录而非自设 agent 卡**，同样无需 emitter；③ workbuddy：subagent **运行时**已验证（`--subagent-permission-mode`、`agents view`、`--agent`），但 agent **定义目录**在 `~/.codebuddy`/`~/.workbuddy` 探查未命中，最后一步需跑一次真实 `codebuddy` 会话验证其读取路径——消耗该客户端模型配额，属 owner 操作。结论：`generatedTargets` 4/7 的差距经实测缩水为"仅 workbuddy 一个待证目录"；README 口径可如实改为"agents 投影覆盖 4 客户端 + 1 待验证" |

## 三、执行顺序（当前判断）

1. ~~A1~~ ~~D3~~ ~~A2~~ ~~B1+B2~~ ~~C3+C4~~ ~~E2+E3~~ ~~G2~~ ~~G1~~ ~~A4~~ ~~F1~~ ~~F3~~ ~~H1~~ ~~E1~~ ~~H2（核实）~~：已全部完成（见各状态）。
2. **代码侧待办清零**。仅剩两项 owner 侧动作：① pinned 块 21,424/5000 整理（需 owner 定内容，`memo pin set`）；② workbuddy agent 定义目录实测（需消耗该客户端模型配额跑一次真实会话，H2 表内已给证据边界）；另 C1 残余随 V1 enforcement 大盘（非 memo 缺口）。
3. 若未来新增工作，先跑 G1 真实语料基线（top-1 98%）再动检索。

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
- 2026-09-09：C3+C4 完成（rex memo-C-read，RED 先行：两个测试文件先落地本批实现）。变更：`storage/constants.mjs` 新增 pinned `[512,20000,5000]` 三常量（CLI env 同窗单源）；`storage/pinned.mjs` 导出 `clampPinnedMaxChars` + `renderPinnedBlock`（纯函数：行号化、超限裁整行、truncated/remaining 元数据）；`cli/commands/pin.mjs` 新增 `pin status` 三元组输出（与 show 同源的 storage→legacy 回退读）；`cli/flags.mjs` 共享解析器显式声明 `--level`（此前 allowUnknownOption 静默吞掉）；`cli/commands/events.mjs` search 归一化 level（非法值 usageError，默认 full 不变）+ 末行 pack footer；`cli/rendering.mjs` 新增 `summarizeMemoText`（连续重复 token 压到 2 次 → 400 字符封顶 → `…`）+ `renderMemoRow({ level })`；help/SKILL.md（.agents/.codex/.claude 三根同步）。
- **经验教训（写给后续投影/分层改造）**：① RED 测试的 no-leak 断言（摘要不得含 6 连重复 token）否掉了朴素 400 字符前缀截断——摘要层的真实风险是模型输出的退化循环文本，必须先压重复 run 再卡字符预算；② RED 契约从 `pinned.mjs` 导入常量，实现时把常量放 `constants.mjs` 忘了再导出，模块加载期才炸——再导出补齐；③ `chars` 计落盘字节（normalize 含尾随 `\n`），测试期望 12 实为 13；④ **真实语料首跑发现：本项目 pinned 存量 21424 字符（限 5000）**——容量门只在 CLI 层（`assertMaxChars`），投影/内部写入路径直写 storage 不设防，`pin status` 的 truncated 语义按设计暴露了它；存量整理归 E2，写入侧设防是 C1 预算投影的前置观察。
- 验证：新 `memo-pinned-render` 5/5（含 pin status CLI 冒烟）+ `memo-search-level` 3/3；邻近 pinned-guard/cli-integration/help/docs 合计 38/38；memo 全系 + turn-recall 162/162；search/search-budget 20/20；`memo-ab-eval` 8/8（排序未动，零漂移按断言锁定）；真实语料冒烟 summary footer（2 entries/593 chars/level=summary）+ pin status（4701/5000 remaining 299 truncated）。
- 2026-09-09：E2+E3 完成（memo-e-hygiene）。变更：新 `lib/memo/hygiene.mjs`（`surveyWorkspaceMemoryHygiene` 只读四段报告 + `archiveStaleSessions` 移动归档 + `rotateSessionEvents` keep-newest 轮替 + `renderHygieneReport`）；新 `cli/commands/hygiene.mjs`（手写 flag 解析，默认只读，apply 仅显式 flag）+ `run.mjs` dispatch（hygiene 无 action 词，secondary 并回 rest）；help/SKILL×3。审批队列四步对齐 survey L24-29：①survey 列陈旧 session ②pinned 复核（复用 C3）③proposals 给出整理命令 ④owner 显式批准后 apply（archive 移动 + rotate 对账，永不 delete）。
- **经验教训（写给后续卫生/治理改造）**：① **meta.updatedAt 不是活性信号**——default space session 41 天没更新但仍是活基础设施（legacy pinned 回退 + mirror 依赖），`workspace-memory--` 前缀必须整体豁免过期判定，否则第一条 hygiene 规则就会拆掉活会话；② 不可分类（meta 缺失/坏 JSON）只能列出不能归档，fail-safe 优先于清理率；③ E3 轮替对象只限 session 级 `l2-events.jsonl`——memo storage 的 `events.jsonl` 是 recall 主存储，superseded 事实也要留在审计链里，轮替它会静默改变 recall 语义；④ run.mjs 的 `[primary, secondary, ...rest]` 解构会吃掉无 action 词命令的首个 flag（hygiene 全 flag 命令），dispatch 时要把 secondary 并回 rest；⑤ l2 append 与 rotate 不同锁域，apply 应在 agent 空闲期运行（help 已注明）。
- 验证：新 `memo-hygiene` 4/4（survey 只读零突变+确定性、前缀豁免+unknown 不可归档、archive 幂等+冲突拒绝、rotate moved+kept==before+sha256 对账+幂等、CLI 四态：默认只读/--json/--archive/--rotate+usage 拒绝）；memo 全系 + turn-recall 166/166；真实仓库只读 survey 冒烟：18 sessions 分类正确（default 标 space-level 不判过期）、pinned 21424/5000 报警、default l2 2495 行/1.4MB（2026-05-22→09-08）可观测，proposals 输出 pinned tidy + rotate 两条；apply 未对真实工作区执行（审批队列一至三步属 owner）。
- 2026-09-09（第二批，收尾批）：G2/G1/A4/F1/F3 完成 + C1/C2/F2 核实判定 + E2 存量执行。变更：G2 新 `lib/memo/report.mjs` + `memo report` + 顶层 `aios memory report`（parse-args/dispatch/runtime 三处接线，`memory`/`import` 入 WORKSPACE_SCOPED_COMMANDS）；G1 新 `eval/real-corpus.mjs`（运行时派生，语料文本不入库）；A4 新 `storage/embedding.mjs` + `searchMemoEvents` union-only 粗排 + AB 第五臂 `embedding` + CLI env 透传；F1 `writeWorkspaceMeta` 锁冲突自动写冲突标记 + F1 清单（HandoffPacket v2 已落地 / sub-agent 上下文替代机制已满足 / AgentView 分级确缺→H1）；F3 新 `import-external.mjs` + `import-cli.mjs` + 顶层 `aios import` + 落地页 `docs/import-migration.md`；C1 核实（三档降级 + hardConstraint must-preserve + orchestrate 生产调用均已落地，"断开"记载过时）；C2 判定已建成（refs + canvas 即 2026-05-17 spec 交付物）；F2 核实（generatedTargets 为能力推导非硬编码，4/7 是证据支撑的能力边界→H2）。另执行 owner 已批的 `memo hygiene --rotate-events`：default l2 1996 行入档/保留 500 行/零丢失/sha256 对账。
- **经验教训（写给后续 backlog 维护与核实类任务）**：① 本 backlog 曾因"完成状态分散"而误判 Context Lifecycle V1 完成并撤回（见文件头）——本批 C2 再次证明同一病根：spec 已上线但没人回填状态，"待办"实际是"已建成"；维护规则的正确用法是核实类工作也要当场回填；② F2 的教训反向同样成立：审计说"只差把三个客户端加进 generatedTargets"，实际那是能力推导的设计结果——核实要先读懂机制再下"缺口"结论，否则会把设计当 bug、把边界当遗漏；③ 导入器最初落成 verified：`appendMemoEvent` 无 claimStatus 时 authority 默认手工本地信任 verified，这对工具型写入方是错的——任何非人工写入方必须携带无发布能力的 runtimeIdentity 让权威判定落 candidate，否则 B1 被默认值绕过；④ 幂等导入靠"已存在文本跳过"，注意 normalize 前后空白的归一化口径要与写入侧一致；⑤ 顶层新命令记得三处：parse-args 分支、dispatch 块、WORKSPACE_SCOPED_COMMANDS（漏第三处会静默解析到 AIOS 根目录而不是工作区）；⑥ root.mjs 帮助文本是模板字符串，行内不能再用反引号。
- 验证：新增套件 `memo-report` 2/2 + `memo-real-corpus` 2/2 + `memo-embedding` 5/5 + `memo-import` 5/5；`workspace`/`workspace-integration`/`handoff` 20/20（F1 冲突标记）；`execution-context-packet`+`untrusted`+`memo-read-receipt` 14/14（C1 核实）；`memo-ab-eval` 8/8 五臂（embedding 臂 top-1 76.9% 与 baseline 零漂移，stale 占比 0.519→0.412）；G1 真实基线 top-1 98%/top-5 100%（171 events/50 queries）；全量 `run-test-suite.mjs regression` 结果见下一条记录。
- 收尾批回归：`node scripts/run-test-suite.mjs regression`（92 files）1070 用例 1064 pass / 0 fail / 6 skip（10 分钟）；memo+workspace+handoff 系 200/200。
- 2026-09-09（第三批，H1+E1+H2 收尾）：H1 完成。变更：`contextdb/workspace.mjs` `buildAgentView` 四档参数化（T0/T1/T2/T3，默认 T3 保旧行为）+ `budget.sections` 逐段字符账 + continuity 指针化（T1 不再付全包成本）；`ctx-agent-core/workspace-commands.mjs` 新 `handleWorkspaceViewCommand` + `renderAgentView`；`run.mjs` 加 `workspace-view` 分支（pull-based，遵守不自动注入政策）。E1 完成。变更：新 `lib/memo/autodream-auto.mjs`（opt-in 门 + session-close/idle 双触发 + 只跑 preview）；`lifecycle/session-hooks/close.mjs` 挂钩（try 包裹不阻塞 close，json 输出附 `autodream` 字段）。H2 核实完成：三客户端实测（gemini 无 agent 概念、hermes import-agent 消费 Claude/codex 布局、workbuddy 运行时已证定义目录待一次真实会话验证）——4/7 差距缩水为"仅 workbuddy 一个待证目录"。
- **经验教训（写给后续"环境受限"判断）**：① 宣称"客户端未装/环境受限"之前先 `command -v` 实测——本机 `~/.aios/bin` 下七个客户端 shim 全在，一次臆断差点把 H2 变成永久搁置；② "某能力不存在"要用目标 CLI 的 `--help`/子命令实测，不能拿上游印象代替（gemini 零命中 vs hermes import-agent vs workbuddy subagent flags，三个客户端三种答案）；③ 涉及消耗外部账号配额（跑 LLM 会话）的验证步骤属于 owner 成本，如实标边界并给可执行命令，不要替 owner 花钱。
- 验证：`agent-view-tiers` 6/6 + `memo-autodream-auto` 4/4；受影响套件 ctx-agent-core/dream×3/contextdb×3 100/100；workspace/handoff 26/26；最终态全量回归结果见下条。
- 回归注记：F1 的冲突标记让 workspace.test 旧 stale-write 用例也会产生 conflicts 目录，其裸 `rm` 在 Windows 偶发 ENOTEMPTY（最终回归抓到 1 例）——已统一改为 `rm(..., { force: true, maxRetries: 5, retryDelay: 100 })`，三连跑 12/12 稳定；最终态全量回归随后重跑确认。
- 收尾批回归（终态）：本批 9 个新测试套件已入 `scripts/test-suites.json` regression 清单（92→101 files）；`node scripts/run-test-suite.mjs regression` **1106 用例 1100 pass / 0 fail / 6 skip**（含 Windows rm 竞态修复后三连跑验证）。
