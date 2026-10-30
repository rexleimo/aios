# CONTEXT.md — 领域词汇表

本文件记录 AIOS 的领域术语：一行定义 + 一行「为什么需要它」。
由 `/grill`（rex-requirements 写回步骤）实时 upsert；用户手写内容不重写。

---

## Token / 上下文压缩

### interception refs

**定义**：`scripts/lib/foundation/interception/runtime/core/engine.mjs:15 interceptToolResult()` 在工具结果边界把 ≥2048 字节（`scripts/lib/foundation/interception/runtime/core/types.mjs:4 minRawBytes`）的原文写入本地 `.raw` ref，上下文只保留 summary + errorLines + keyLines + ref_id + 召回命令。

**为什么**：把「完整证据留在本地、可召回」和「上下文里只放可行动信号」拆成两件事，使压缩不必以丢失可诊断性为代价。

### Pi 观察卸载（ObservationPack-lite）

**定义**：`packages/aios-pi/lib/offload.mjs:59 offloadMessages()` 在 pi 的 `context` 事件（每次 LLM 调用前）扫描**每条消息的任何文本内容项**，≥20000 字符者归档一次，上下文中替换为 handle + 2000 字符头 + 800 字符尾；取回靠 `packages/aios-pi/lib/tools.mjs:103 aios_offload_retrieve`。默认关（`packages/aios-pi/lib/offload.mjs:18-24`）。

**为什么**：pi 是全栈唯一没有拦截面的客户端，工具循环内的观察量不受任何压缩层约束。**注意：它和 interception refs 是两条独立通路**（不同文件、阈值、触发面、客户端），不共享代码路径——早先文档把两者当作"同一个自动 offload"是错的。

### 取回不对称

**定义**：AIOS 的压缩在多个通路是 **runtime 强制**的（interception refs、PostToolUse offload、Pi 观察卸载都自动挡），而取回全部是**模型自愿**的（`cli/dispatch/offload.mjs:9 runRefsCommand` 的 `refs read`、`aios_offload_retrieve`）。

**为什么**：这个不对称是 Pi 观察卸载 A/B 出现 −64% 翻转的背景。但**它本身不是根因**——refs 层同样不对称却零代价。根因在压缩产物的形状（refs 留结构化信号，Pi 只留头尾截断），见 `docs/plans/2026-10-12-token-intelligence-v3-retrieval-root-cause.md` §1.3。

### 产物形状（压缩产物的信号保留）

**定义**：一次自动压缩**留在上下文里的东西**。refs 层留 summary + errorLines + keyLines + ref_id + 召回命令（`scripts/lib/foundation/interception/runtime/packets/compact-packet.mjs:32-34`）；Pi 层留 handle + 2000 字符头 + 800 字符尾（`packages/aios-pi/lib/offload.mjs:39-42`）。

**为什么**：这是取回轮次方差的根因判据——产物保留了信号，模型就少回读；只留头尾，模型想要中段就必须回读且回读几次由模型自定。所以修法在产物侧，不在「谁决定取回」侧。推论状态为**待验证**（v3 计划段 B1 的对照实验），尚未证实。

### ledger layer

**定义**：`scripts/lib/foundation/interception/observability/metrics/ledger.mjs:11 LEDGER_LAYERS` 的四层枚举 `['refs','pi_usage','headroom','rtk_ab']`，每层在统一 JSONL 账本里独立计账。

**为什么**：让每 token 事件可归因到机制，使 A/B 结论能被拆解而非整体宣称。**写入点与枚举成员是两个概念**——枚举里有名字不等于有生产写入点（`headroom` 就是只有枚举、无写入点）。

---

## 技能系统

### 外部技能安装（`aios skill add`）

**定义**：从外部来源（本地技能目录 / GitHub 仓库 / 技能包）安装技能的新命令入口，来源含多个技能时交互式勾选。已确认的决策见 `docs/adr/0001-external-skill-install.md`。

**为什么**：`clone-website` 这类社区技能只存在于单个客户端的全局目录（如 `~/.pi/agent/skills/`），现有 canonical sync 只覆盖随 AIOS 发布的 `skill-sources/`，缺一条"收编外部技能"的通路。

### 全局技能根（global skill root）

**定义**：各客户端在用户主目录下的技能目录（`~/.pi/agent/skills/`、`~/.claude/skills/`、`~/.config/opencode/skills/` 等），对该客户端的所有项目生效；与仓库内项目级技能根（`.agents/skills/`、`.codex/skills/`）相对。

**为什么**：外部技能安装的分发目标就是所有客户端的全局技能根（用户确认），术语上必须与项目级投影区分开，避免两条同步通路混淆。

---

## 工程尺度（可量化那条）

### 预算式规则（budget rule）

**定义**：一条能用客观事实判定的工程标准，固定形状为「一个度量 + 一个预算 + 三类处置」。
度量（目录条目数 / 单文件行数 / 裸日志命中数 / 重复片度相似度）；预算（可调数值）；
处置为 `exempt`（跳过并**必须注明理由**）、`baseline`（存量冻结，只许收缩不许增长）、以及其余超标即红灯。
见 `docs/adr/0002-portable-engineering-standard-rules.md`。

**为什么**：本仓库已有的 `scripts/check-dir-budget.mjs` 跑的就是这个形状，把它升成通用模型比发明一套新词便宜；
而且“只许收缩”的 ratchet 允许存量债合法存在，避免为了进门先把仓库改一遍。
与它相对的是**语义类标准**（§1 依赖方向、§2 深层模块）：那些需要项目声明分层映射，不能套这个模型。

### 送达（delivery）与加载（load）

**定义**：送达 = 规范文本真的出现在客户端会读的位置（本机投影，不是子模块源）；
加载 = Provider 执行时读了它。两者是不同失败点：送达断了时，加载永远不会发生而且不报错。

**为什么**：2026-10-22 实测到 rex-code-review 在 5 个客户端目录都没有“第 0 步先加载标准”这一行，
而子模块源里有——失效发生在送达层，所以只修 Provider 文本不够，得把投影新鲜度当成可检测状态。

## 竞品组合

### consumed dependency

**定义**：AIOS 实际安装并计量的上游组件（Headroom / RTK / Caveman），不是竞品。按版本 pin 漂移 + 采纳率跟踪，**不占 watchlist 坑位、不设 refreshTrigger**。

**为什么**：把已集成组件当新候选评估会虚增观察面，虚增的观察面会产出虚增的缺口判断。

### uniqueReferenceQuestion

**定义**：每个 watchlist 条目的核心字段——该竞品回答的**一个**、AIOS 计划内尚未被覆盖的问题。没有这个问题的条目不能保留。

**为什么**：把「参考竞品」从「值得看的项目清单」变成「按问题索引的证据源」；这是 2026-07-28 组合收缩的依据，也是淘汰时唯一需要的判据。

### 定位口径

**定义**：AIOS 是**本地优先的 coding client 编排控制面**（`docs/reports/competitor-watchlist.json` → `coreValue.product`）。

**为什么**：它是判断一个项目是否在参照范围内的依据。2026-10-12 据它移除了 OpenClaw（`portfolio.remove.openclaw.reason`）——面向终端用户的多渠道 agent 产品在范围外。

> **口径的外延尚未裁决。** 同属范围外的 archive 条目（Hermes / OpenViking / mem0 / OpenHarness）是否一并移除，是 `docs/reports/2026-10-12-competitor-refresh.md` §6.1 的待裁决项；在 operator 拍板前，本条术语只记录**已确立**的定义与一次**已发生**的适用，不代表口径已一致适用于全部条目。

---

## 子模块与发布边界

### 落点边界

**定义**：一个变更属于 `rex-harness/` 子模块，当且仅当它属于「第三方可独立安装使用」的公开产品面（状态内核、契约、CLI、公开 schema）；不属于的留在父仓库（适配层、solo 编排、AIOS 集成如 plan 同步 / offload / continuity）。裁决与拒绝项见 `docs/architecture/adr/0001-submodule-landing-boundary.md`。

**为什么**：在父仓库侧二次实现同一条语义（例如「什么算完成」）会让一条规则有两个 owner——这正是 2026-10-14 评审认定的「决策语义外泄」缺陷；子模块是独立公开仓库（`@rexleimo/rex-harness`），语义只实现一次，下游使用者同样受益。

### 公开面（public face）

**定义**：父仓库唯一允许 import 的子模块入口是 `rex-harness/src/index.mjs`（对应 package `exports` 的 `.`）；`rex-harness/src/**` 其余内部模块禁止 deep import，`bin/` 只允许通过进程调用（`rex-harness verify` / `settle`）。

**为什么**：子模块已有向内的边界测试（`rex-harness/tests/architecture/import-boundaries.test.mjs`），但向外的检查缺失——历史上的 `scripts/lib/execution/harness/solo/turn-settlement.mjs:4` 就是一处未受约束的 deep import（该模块已于 2026-10-14 被 work-4 C 裁决删除：零生产 importer）。没有检查的边界不是边界。

### 可达性（枚举）

**定义**：一个枚举成员只有在存在**真实 call site** 时才允许留在该枚举里；没有 call site 的能力不进 public enum / CLI flag / event schema / 空 adapter。反向地，公开 wire 契约里的成员可以由**外部宿主**产出，宿主桥不得为了“用满枚举”自行映射。

**为什么**：两侧都会腐化：① 声明了不可达的能力（父 `SHOULD_RUN_ACTIONS.self_repair` 永不返回）会让契约撒谎；② 桥为了填满枚举把失败轮映射成 material outcome（`repair_required`）会静默改变结算与额度语义。裁决见 `docs/architecture/adr/0002-turn-outcome-reachability.md`。

## Solo 循环的决策契约

### 声明通道（F / S / O）

**定义**：solo 循环的一次 turn 只从三个**声明**来源取信息——**F 事实**：`solo-journal` 账本已记录的轮次与额度（work-6 的单一写者）；**S 自报**：provider 的 `selfReport{progressMade, blockedReason, summary}`（`support/turn-consequences.mjs:normalizeSelfReport`）；**O 操作者**：显式声明（resume ack / 门放行）。程序不从 summary 文本猜进展，也不从缺字段推意图。

**为什么**：迁移前这些语义由 ≥6 处手写字符串分支各自推断（`normalizers.mjs` 的三个 `infer*`、`backoff.mjs`、`cadence.mjs`、`checkpoint.mjs`、`state.mjs` 的 runStatus、`should-run.mjs`），加一个 outcome 要同时改多处且无守卫证明它们一致。声明是字段，猜测是分歧的源头。

### 材料性（material）

**定义**：一轮 turn 有资格产生**副作用**（扣额度、把节奏拉回基准、推进工作流、以成功收尾）当且仅当 `TURN_CONSEQUENCES[outcome].material === true` **且** S 通道声明 `selfReport.progressMade === true`（`support/turn-consequences.mjs:isMaterialTurn`）。裸 `outcome: 'success'` 而无声明：归类照常，副作用一律不给。

**为什么**：executor 不得自验完成声明（turn 契约 §前言），而"字符串等于成功"曾经是唯一的进展证据。实测现网 provider 根本不声明 success（`execute-turn.mjs` / `execute-turn-pi-rpc.mjs` 只发 stopped/blocked/infra-retry/human-gate），所以这条收紧不剥夺任何真实声明，只堵住"给裸字符串就能白拿额度与节奏"。safe_bypass 封印是它的第二道防线。

### 后果表（单一 owner）

**定义**：`outcome → 全部后果`（failureClass / backoffAction / checkpointStatus / runStatus / verificationResult / cadenceClass / stopByDefault / requiresOperator / countsAsNoopPoll / material）只登记在 `support/turn-consequences.mjs:TURN_CONSEQUENCES` 一处；其余模块调用 `derive*` / `turnConsequencesFor`，未登记名字直接抛错。`findTurnTableGaps()` 是这张表与 `SOLO_OUTCOMES` 的一致性检查，`scripts/tests/execution/harness/solo/harness-turn-consequences.test.mjs` T7 额外扫描运行时源码，禁止第二处 outcome 字符串比较。

**为什么**：D1 裁决保留 rex `TURN_OUTCOMES` 与 `SOLO_OUTCOMES` 两套词表（不跨表映射，直到有真实 call site——见 ADR 0002 的「可达性（枚举）」），前提是映射所有权唯一。没有这个约束，"两套词表"就会退化成"两套互相漂移的推理"。

## 仓库卫生（垃圾判定）

### 本地残留（local residue）

**定义**：被 `.gitignore` 覆盖、只存在于工作机的目录或文件——测试沙箱（`aios-<fixture>-<随机后缀>`）、`temp/` 下的日志与探针工作树、可再生缓存/构建产物。判定凭据是**客观事实**（`git check-ignore` 命中 + 名字形状 + mtime 年龄 + 无 `.env*`/无未提交 git 状态），不是「看起来没用」。

**为什么**：这一级删错了不产生仓库 diff，也不进任何文档引用（`scripts/check-doc-citations.mjs` 只解析 `path:line`，不解析目录树），所以可以自动化、可逆（`to-trash`）；把它和「已提交进 git 的文件」混成一坨处理，才是清理真正危险的地方。

### 仓库噪声（repo noise）

**定义**：已被 git 跟踪、但对未来会话没有决策价值的文件（只有自动脚手架的空 plan、跨站点字节相同的重复二进制、一次性产出物）。删除它的代价是**一次可见的 commit**，且必须先过 `check-doc-citations.mjs` 引用检查。

**为什么**：本仓库实测 `docs/plans/` 共 692 个目录条目（567 个顶层 md + 117 个 ticket/testability json）。这里的东西**不是同一种东西**：纯自动脚手架 plan（0 条勾选任务、无 Task Details、无 evidence）删了不丢决策；而 `*-decision-ticket/*.json` 里装的是真决策（objective / decision / blockingUnknowns / nonGoals），docs 里指向它们的引用只是记录。所以处置它的判据是「引用图分区 + 内容是否承载决策」，不是文件名，也不是「历史证据一律不能碰」。裁决与两次测量的出入见 `docs/adr/0003-repo-junk-cleanup-tiering.md`。

## 变更落点

### 落点三问

**定义**：动手前按顺序问三个问题，第一个命中的「是」即决定变更落在父仓库还是 `rex-harness/` 子模块——① 是否本仓库的贡献文书形状（PR/issue 模板、`AGENTS.md`、docs）；② 是否宿主「何时允许声称完成」的门禁（客户端指令注入、quality gate、verification-before-completion）；③ 是否需要被 Command 选中并返回一份 Evidence（新 Capability、新阶段、evidence schema、`skill-sources` 正文）。前两类留父仓库；第三类进子模块并走完整发布流（CHANGELOG + semver + tag + 独立指针 commit），判据本体是 ADR 0001 的「第三方可独立安装使用的公开产品面」。

**为什么**：`workflow-ownership.md:37`（软件阶段只改 rex）与 ADR 0001（公开产品面归子模块）是同一条边界的两侧，但都是陈述句、不好执行；三问把它变成动手前的可判定顺序，同时把「改子模块要走发布流」的成本前置到决策时——外部 skill（如 mattpocock/skills 的 `pr`）的每一份内容都能拆成文书、门禁、阶段三块，混成一整份塞进任一侧都会造成第二套语义。裁决见 `docs/architecture/adr/0003-external-skill-adoption-landing.md`。

## 子代理上下文新鲜度（fresh context / fork）

### fork（子代继承父对话）

**定义**：宿主自己的 subagent 工具把父会话带进子代上下文的默认行为。判定只能靠测量：父会话里埋一个 `AIOS-NONCE-<16 hex>`，问子代能否复述——复述即 `fork`，明确拿不到即 `fresh`，其余（缺失/拒绝/超时/不匹配）一律 `unknown` 且必带 reason。本仓实测：codex = `fork`（子代复述父 nonce，banner 里留有 session id 可核），pi = `not-applicable`（声明 `surface: none` + 宿主自述无该工具）。裁决见 `docs/adr/0004-subagent-context-freshness.md`，落地与偏差见 `docs/plans/2026-10-30-verified-fresh-context-v1.md`。
**为什么**：「Codex 默认 fork」一开始只是外部博客的说法，而这条说法会决定要不要做 brief 自包含。按本仓规矩未测不能当已测；更重要的是**对治不了的那一半**（宿主 fork）不能用提示词禁止——那个事件不可观测，禁止必然退化成关键词猜测，只能让 fork 无害：worker 只凭自包含 brief 开工，缺事实回 `blocked`，做完这步「宿主会不会 fork」从正确性问题降级成性能问题。

### 送达面（delivery surface）

**定义**：真正进入模型上下文的位置。本仓实测只有两处：① AIOS 生成的角色卡（`scripts/lib/foundation/agents/emitters/shared.mjs:22` 三条固定条款，实测 38/38 张卡命中）；② 每次派发注入的 `## Dispatch Brief`（`scripts/lib/execution/harness/team/subagent-runtime/context/prompts.mjs:145` 构造、`:154` 渲染）。`client-sources/native-base/shared/partials/` **不是**送达面：10 个 partial 里只有 `core/core-instructions.md` 真被 `composeNativeMarkdown()` 读进去，其余 9 个从未被任何 loader 读取。判据是行为（patch `fs.readFileSync` 记实读 + 在产物文本里查证段落标题落点），不是 grep 引用数；守护它的是 `scripts/tests/foundation/native/native-partial-delivery.test.mjs:26` 的显式 disposition 表。
**为什么**：这次踩到的具体坑是「写了文件就以为送达了」——第一版用 basename 全库 grep 数引用，得出「7 个孤儿」，真数是 9 个从未被读；文档提到一次 ≠ 投递一次。附带代价更大：把能力相关细则写进多客户端共享的 `AGENTS.md` 会泄漏给没有 subagent 工具的客户端，所以「该投递什么」和「投到哪里」必须分开决定。
