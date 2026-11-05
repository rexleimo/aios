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

### 需求准备度（requirements readiness）

**定义**：需求阶段显式报告的 `ready|blocked` 结论，附决策依赖、正常/失败路径、可行性和已有用户对齐依据；Rex 验证结构与状态一致性，关键未决项不允许推进。

**为什么**：提问轮数、首个切片或已记录假设都不能说明整套逻辑已想清；低影响默认值与阻塞实施的关键未知必须分开，已有授权无需重复确认。

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

## 长期与重复流程

### 运行约定（operating contract）

**定义**：记录在已有需求/spec 中的目标与非目标、触发/输入、产物/验收证据、失败/停止、预算和人工决策点；`aios-harness` 是宿主编写与执行交接入口，软件 Provider 仍由 Rex 选择。

**为什么**：把 loop-me 的流程设计产物接到现有工作项，避免另建一套计划；文档约定不等于运行时已提供对应强制门。

### 流程定义与单次运行

**定义**：重复流程定义保存可复用约定及版本；每次运行分别记录所用定义版本、输入/基线、结果和证据。

**为什么**：上一轮完成不能证明下一轮完成，修改定义也不能静默改变正在执行的验收条件。

### 人工决策点与恢复检查点

**定义**：人工决策点需要用户对明确事项作判断，附证据、选项和建议；恢复检查点保存运行状态和下一步，供显式恢复时使用。

**为什么**：loop-me 的 Checkpoint 指前者，AIOS checkpoint 多指后者；保存状态不能代替获得批准。

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

## 动效契约（motion contract）

### 动效契约与视觉契约分家

**定义**：`MOTION.md` 管时间轴上的事实（时长、easing、进出场顺序、循环接缝、光标因果、`prefers-reduced-motion` 覆盖），`DESIGN.md` 只管视觉语言（配色、字体、间距、组件形态）。两者不互相顶替：`DESIGN.md` 现有 51 行标题为 "Documentation Interface Design Contract"、`Scope` 写死 `docs-site style refresh only`，它从来不是动效规范的 owner。

**为什么**：两类判据的判定方式不同——配色只需读 CSS 变量，动效必须跑起来拍帧才知道（一帧全体淡出、4px 跳变、循环接缝都只在中间帧可见）。写进同一个文件后，改纹理要动动效章节、改动效要动纹理，且文件粒度预算（400 行软上限）会把两件事挤在一起。裁决见 `docs/adr/0006-motion-contract-and-render-gate.md`。

### 渲染门（render gate）

**定义**：必须启动页面并在真实浏览器里采样才能判定的门，与只读文本/路径的 `aios standards check` 相对。当前落点是宿主侧 `scripts/` 的显式命令；`rex-harness/src/standards/check.mjs` 的 4 条规则（`directoryEntries` / `fileLines` / `duplicateLines` / `reverseDependencies`）全部是文本级，引擎内实测零渲染能力（`rg browser|playwright|screenshot|visual rex-harness/src/standards/` 零命中）。

**为什么**：`standards check` 的输入契约是 git worktree（取不到 tracked 列表就 SKIP），而渲染门需要起服务 + 浏览器，把它塞进内核会让「第三方装完 rex-harness 就能跑」这条公开面变脆。同理它暂不进 `pretest:scripts`：存量未处置就接门，等于把门静音（同 `duplicateLines` 593 个文件的处置教训）。

### 演示层与产品层（demo layer vs product layer）

**定义**：`stageshow` 这类 skill 产出的是「给别人看的仿制界面」（营销 hero、feature card、docs 插图、bento），允许用占位条代替真实文案、允许裁切出血；本仓库的真实 UI 面是 `docs-site/`（mkdocs 源，`site/` 为生成物）、`rex-harness/website/`（Astro）、`packages/debug-hub/src/ui.html`、`scripts/lib/memory/genealogy-gui/index.html`。

**为什么**：把「占位条代替文字」「窗口跑出画框」这类演示层规则搬进产品页就是灾难，反之把产品页的可访问性/真实数据规则套进演示图也做不出好东西。两层共用动效判据，但**不共用简化规则**。

### 渲染门的适用落点

**定义**：`apps/desktop/` 只有 `dist/` 与 `node_modules/`、无源码，不能作为 UI 变更落点；用户口中的「客户端」在本仓语境指**技能投影到的各 coding client**（`skill-sources/` → `.agents/skills/` → 客户端技能根），不是 Electron 壳。

**为什么**：落点搞错会让整条链（skill 投影、门禁接线、验证证据）全部指向一个改不了的地方；这一条是 `/grill` 明确纠正过的理解偏差，写下来防止下一个会话重犯。

## 感知面与生态（perceived surface / ecosystem）

### 感知面（perceived surface）

**定义**：使用者能直接看见「AIOS 为我做了什么」的那些界面——当前是 TUI、`aios hud`、`genealogy-gui`、`debug-hub`；目标是新增接入矩阵面板与桌面壳。裁决见 `docs/adr/0007-aios-perceived-surface-and-desktop-shell.md`。

**2026-11-05 修正**：这条只解释了「看得见」，没解释「动得了」，用户实测后判定控制台「意义不明」。控制台的定位改为**本机 agent 栈的管理面**（见 [[统一对象表]] 与 `docs/adr/0008-console-is-the-local-agent-stack-control-plane.md`）；感知面继续是它的属性之一，不再是第一屏的定位。0007 决策 2 被该 ADR 取代，其余决策不动。

**为什么**：它与扩展面是同一件事的两面——没有宿主，插件无处可装；没有插件，宿主没有内容；没有可见面，两者都不可感知。用户反馈「感知不到受益」与「外部开发者参与不进来」是同一个空洞。

### 能力进程与视图（capability process vs view）

**定义**：能力进程 = 持有 ContextDB / 记忆 / CLI / 文件 / 子进程的常驻进程；浏览器面板、TUI、Tauri 壳都只是它的视图，动作由它执行。

**为什么**：Web 页面无法调用底层的说法只在「页面来自外网、能力在别处」时成立；localhost 页面的能力等于服务端进程的能力（`genealogy-gui` 的 file API、`debug-hub` 的 `POST /api/logs` 是两次实证）。真正限制浏览器的是路径选择、钥匙串、常驻自启、托盘与系统通知，以及**本地端口的信任边界**。

### 插件 manifest kind（client / integration / panel）

**定义**：AIOS 的扩展契约按挂载侧分三类——`client`（把 AIOS 装进某客户端，今天在 `scripts/lib/clients/*` 里是代码）、`integration`（第三方 skill + MCP，已有 `config/integrations.json` 声明式注册表 + `aios integration` 四道门）、`panel`（给宿主加一屏，尚无实现）；共同字段 `schemaVersion`/`id`/`version`/`permissions`/`lifecycle`/`evidence`。

**为什么**：magpie 生态能长，是因为只有一个宿主、一个 ABI、一个分发通道；我们三个平面各自为政，所以问题不是「缺钩子」而是「缺共同宿主与共同契约」。

### 任务级路由 vs 请求级路由（task-level vs request-level routing）

**定义**：任务级 = 现有 `scripts/lib/tooling/model-router/routing/selection.mjs` 按 task/role 选模型、`availability.mjs` 记通道状态（`ok`/`degraded`/`down`，TTL 10min）、`protocols.mjs` 的四方言词表；请求级 = 一次 LLM HTTP 请求经本地网关时决定走哪个 provider/账号/通道，含流式与工具调用透传。两者不是同一件事，不能互相顶替。

**为什么**：二期网关的可行性依赖前者已有零件（状态机、词表、fallback 链），但“已有智能路由”不等于“已有网关”；把它们混为一谈会把请求面（HTTP 入口、流式转发）的工程量藏起来。

### 接入矩阵（adapter matrix）

**定义**：13 个客户端 × 7 个能力轴（`sessionStartInjection`/`preToolRewrite`/`controlledShellRunner`/`mcpProxy`/`compactPacket`/`advisorySkills`/`metrics`）× L0–L3 的矩阵视图，数据源固定为 `aios status --json`（`aios.status.v1`）、`config/host-capabilities.json` 与生成式记分板 `docs/reports/2026-10-19-client-capability-scorecard.md`；每格必须能展开 `reason` 原文与 `evidenceRef`。

**当前地位（2026-11-05）**：不再是控制台第一屏——ADR 0007 决策 2 被 `docs/adr/0008-console-is-the-local-agent-stack-control-plane.md` 取代，矩阵降为「客户端」这一对象的证据屏。三个地方仍引用它，改定位时不能顺手删：`lib/sections.ts` 里「设置」页的描述文字（「决定接入矩阵每一格的那份声明」）、`components/sections/overview.tsx:49` 的入口链接、以及 `config/host-capabilities.json` 这份被它消费的声明。另注：`MatrixSection` 组件在但没挂进路由，`/matrix` 现在实际是 404（路由 `if (!Page || !meta) notFound()`），说「矩阵页」时必须区分「组件存在」与「可达」。

**为什么**：它是唯一同时满足三件事的第一屏——数据现成、每格可指回文件（界面里不允许出现手写常量）、并且它本身就是插件契约的入门沙盒（写 manifest 的人看着自己的格子变绿）。

**落地时的两点修正（`apps/shell/data/matrix.mjs` 实测）**：逐轴原因字段不存在，单元格只表达「是否在配置里声明」，点击后展示行级 `limits[]` 原文 + `subagents.evidenceRef` + 证据状态，界面不得编造逐轴理由；且配置声明 13 个客户端而 `aios status` 只覆盖 10 个，未覆盖必须显示为 `not-covered` 而不是「好」。

### 统一对象表（unified object table）

**定义**：控制台一期的信息架构——一行一个可管理对象，每行固定三件事：**能不能动**（可操作 / 只读 / 未接线 / 待人工）+ **为什么**（引用原文，不许编）+ **详情**。取代今天「按数据源切页」的形状（`overview/sessions/memory/tools/settings` 各对应一个 JSON 来源）。

**为什么**：用户「完全不知道它能做什么」的根因不是界面丑，是页面按我们的数据源切、不是按他的对象切——他想知道「我能不能管这个 MCP」，页面回答的是「我这页显示哪份 JSON」。统一表还能把「管不了」从一种感觉变成一张可追的台账。

### MCP server 一等对象与账本

**定义**：把「一个 MCP server」当作有身份的对象——`server × 落点(client, scope) × 归属(aios|foreign|kept-differs) × 状态(verified|unverified|failed|pending-interactive)` 四元组的账本，由 `aios mcp list/add/remove/enable/disable/adopt/doctor` 驱动。

**现状（2026-11-05 更新，先前此处写「这层不存在」，已过期）**：这层的引擎与命令面已落地——
`scripts/lib/clients/mcp/server-writer.mjs:1`（读/写/卸，文字手术）、`ledger.mjs`（归属与指纹）、
`install-policy.mjs:189`（`uninstallServer`，写前门禁）、`cli.mjs:160`（`runMcpCommand`，动词面），
经 `scripts/lib/tooling/cli/dispatch/dispatch.mjs` 的 `FEATURE_CLI_ROUTES` 路由接入，参数层在
`scripts/lib/tooling/cli/parse-args/platform/mcp.mjs`。真机只读实测：18 个落点、82 个条目、0 错误。
**仍未完成的**是「只有一个写入者」：headroom / browser / code-review-graph / pi 四个特性还在各写自己的条目，
等 w5 收编到这条通用路径上；账本目录 `~/.aios/mcp/ledger/` 至今未在这台机器上创建过（写入面属于 w7 的逐家确认）。

**为什么**：这台机器的真实分布本来就是歪的（实测 home 侧 7 个 server × 7 个客户端：`aios-memory` 在 codex/grok/workbuddy 有而 `~/.claude.json` 无；`pencil` 在 claude/gemini/zcode 有而 codex/qoder/workbuddy 无）。没有账本时没有任何一方能回答「我装了它吗、给谁装了」，所以「MCP 管理不了」不是少一个按钮，是少一层对象。

### 落点表与落点可证性（landing table / landing-verified）

**定义**：落点表 = `CLIENT_MCP_TARGETS`（`scripts/lib/foundation/clients/selection/core/definitions.mjs:266+`，实测 10 家：codex/claude/gemini/opencode/hermes/grok/workbuddy/pi/zcode/qoder，格式 json/toml/yaml/opencode-json/gemini-json/none）。**落点可证性** = 该落点的真实 schema 路径与字段白名单经过本机实测；未证者显示 `landing-unverified` + 失败原文，禁止标绿。

**为什么**：同一个落点事实今天有三份表（`CLIENT_MCP_TARGETS`、codemap 的 `CODEMAP_MCP_TARGETS`、browser 的 `migrateOne*` 格式 writer），互相不一致：pi 在权威表里是 `format:'none', scopes:[]`，真实文件 `~/.pi/agent/mcp.json` 却是 `mcpServers.<name> = {command,args,lifecycle}` 且有三处写入者；zcode 用户级用 `transport`、项目级用 `type`+`timeoutMs`；opencode 是 `{type:'local',command[],enabled,environment}` + 需要 `experimental.mcp_timeout`；gemini 用 `timeout` 而 claude 家族用 `startupTimeoutSec`，且 gemini 严格 schema——未知字段直接让整个 `settings.json` 判废、客户端拒启。「表里有这一行」不等于「写进去客户端读得到」。pi 另有一条硬约束：条目必须与 pi 自己写入器的形状**逐字节一致**（`lifecycle:'lazy'`），否则 pi 的 doctor 用 `JSON.stringify` 精确比对会永久报 `kept-differs`。

**已作废的错误结论**：先前本节记「hermes 真实路径是 `mcp_servers.mcp.<name>`」。2026-11-05 用 YAML 解析器复测：真实结构就是 `mcp_servers.<name>`，与 codemap `mcp-targets/yaml.mjs:31-34` 写入形状一致，无漂移。错误来源是一个按空格猜缩进的自写行扫描脚本——**结构性结论要用解析器验，不要用手写缩进正则**。

### 接管（adopt）与每客户端允许集合（per-client allowlist）

**定义**：接管 = 把别人（用户手写或其它特性）写的 MCP 条目纳入 AIOS 账本的动作，需一次显式确认；此后写回仍带指纹，指纹不符拒绝。允许集合 = 每个客户端接受哪些 server，继承代码里已成立的决定——pi 拒绝 shell 与 auth（`mcp-adapter.mjs:21-22`，原话「a shell MCP tool would bypass the AIOS Pi safety gate, and auth stays niche」），browser server 仅在运行时已装时才可加（`:13-15`、`:79-81`）。

**为什么**：管理面的默认危险是把自己伪装成万能：无边界地改别人配置会抹掉用户手写的注释与字段，绕过安全门则更糟（Pi 明确认为 shell MCP 会绕过它的安全门）。允许集合必须做成拒绝 + 理由原文，而不是界面上的一个可选下拉。

### 留痕对象 vs 配置对象（record vs config object）

**定义**：配置对象 = 客户端 / MCP server / 技能 / 集成 / agent（一期只有 MCP 有真动词）；留痕对象 = 会话 / 记忆 / 用量（有归属与生命周期语义，但不是「装与卸」）。留痕对象保留现有动作：会话导出与扔回收站、记忆标有用与取代；用量只读。

**为什么**：用户骂「会话、记录乱七八糟」的实质是它们被摆在和配置对象同一层、却没有对应的动词，看起来像噪声。同时一期不能顺手再造一套会话生命周期引擎（实测 `aios session` 只有 `start/close/changed-files`），否则两条主线一起烂。注意 memo 硬删是**故意没有**的（清理归 dream/GC），要改需要另开 ADR。

### pending-interactive（待人工）作为合法终态

**定义**：自动化在结构上无法完成的动作（例如 hermes 在非 TTY 下要求 CLI 交互，`headroom-mcp/lifecycle.mjs:55-57` 返回 `pending-interactive` 并附上要人手动跑的命令；卸载路径同形 `:113-115`），在对象表里是一等状态，带出口；`kept-differs` 同理。

**为什么**：管理面最大的诚信风险是把「没做成」显示成「做完了」。这两个状态是仓库里已有的诚实形状，界面必须继承，而不是用进度条掩盖。

