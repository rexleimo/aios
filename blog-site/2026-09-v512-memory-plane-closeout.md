---
title: v5.12.0 记忆系统收尾——从能存到能管：卫生、报表、迁移导入、分级加载
date: 2026-09-09
description: "memo 卫生命令（只读 survey + 归档/轮替零删除）、aios memory report 一条命令看全记忆面、aios import 迁移 Claude/Continue/Roo 记忆为受治理候选、AgentView T0-T3 分级加载、Autodream 自动触发（opt-in）、本地 embedding 粗排（默认关）。真实语料基线 top-1 98%。"
---

# v5.12.0 记忆系统收尾——从能存到能管：卫生、报表、迁移导入、分级加载

> 2026-09-09 · 记忆优化 backlog 13 项全部关闭：10 项实现落地、3 项核实关闭（其中两项早已上线，只是没人回填状态）。全量回归 1106 用例 / 0 失败。

## 快速答案（30 秒版）

v5.11.0 解决了"记忆怎么写进来的门槛"，v5.12.0 解决"进来之后怎么管"：超限的 pinned 块现在会报警并给你整理入口（**只归档不删除**）；一条 `aios memory report` 看全记忆面；`aios import` 把 Claude/Continue/Roo 的旧记忆搬进来当受治理候选（给从死亡竞品迁移过来的用户用）；AgentView 四档分级加载让 sub-agent 上下文有预算可观测；Autodream 有了 opt-in 的自动触发。升级无破坏性变更，拉取即用。

```bash
aios memo hygiene          # 只读体检：sessions / pinned / 事件体量 + 整理提案
aios memory report         # 每 space 体量/失效比/候选积压/采纳率/pinned 预算
aios import --format claude --file ~/MEMORY.md --dry-run   # 旧记忆搬进来先预览
```

## 为什么发这个版本

上一版（v5.11.0）立了写入门槛：五要素抽取、verified 语义收口。但写入只是记忆系统的一半——另一半是**管理**：存了 171 条事实之后，哪个 space 在膨胀？pinned 块超没超限？候选积压了多少？召回质量有没有退化？这些问题在 v5.12 之前都答不出来，或者要手工翻文件。

更有意思的是核实环节的发现：backlog 里三项"待办"其实是误报。C2 的工具日志 offload + Mermaid 画布（`aios refs` / `aios canvas`）早在 5 月的设计批复后就上线了，只是没人回填状态——和 Context Lifecycle V1 当年被误判"已完成又撤回"是同一个病根。**这就是为什么我们坚持单一真源 backlog + 完成即回填。**

## 核心变更

### 1. memo hygiene：只读体检 + 零删除整理

`aios memo hygiene` 默认只读：列出全部 session（陈旧判定 + 状态）、每个 pinned 块的预算三元组、每份 `l2-events.jsonl` 的行数/字节/时间跨度，最后给整理提案。动手必须显式传 flag：`--archive-stale-sessions` 把陈旧历史 session **移动**进 `context-db/archive/`（目标冲突即拒，可逆）；`--rotate-events --max-events N` 对事件日志做 keep-newest 轮替，旧行进归档文件，`moved + kept == before` 零丢失，sha256 前后对账。三条硬规则：永不 delete；`workspace-memory--` 前缀的 space 级活 session 永不归档（它的 meta 可以 41 天没更新但还在服务 `pin show` 回退）；memo 存储的 `events.jsonl` 是召回主存储，不参与轮替。

真实仓库首跑就抓到：pinned 块 21,424 字符（限 5000，超限 4 倍），default 事件日志 1.4MB/2495 行。`pin status` 的 `truncated` 语义第一次跑就在真实数据上证明了自己。

### 2. aios memory report：一条命令看全记忆面

每 space 的事件数/字符量/失效比（superseded 占比）/候选数/feedback 采纳率/时间跨度，加候选四态 tally 和 pinned 预算，全部只读派生，与 doctor（管存储可用性）职责不重叠。`--json` 出机器可读版。

### 3. aios import：把旧记忆搬进治理队列

`aios import --format claude|continue|roo|conventions --file <path>` 支持 Claude `MEMORY.md`、Continue 规则、`.roomodes`、`CONVENTIONS.md` 四种来源。设计上有一条不能让的线：**导入器以无发布能力的 runtime identity 写入，写时权威判定让每条事实都落成 `candidate`**——B1 的"verified 不可伪造"不因导入而破例。幂等可重跑（已存在文本跳过），`#import-<format>` tag 永远可溯源，审核晋升走既有 `memo candidate list/inspect/promote`。落地页：`docs/import-migration.md`。

### 4. 渐进披露 + pinned 预算（C3+C4）

`memo search --level summary` 每行约 100 token（连续重复 token 先压到 2 次再卡 400 字符——退化循环文本是摘要层真正的风险，朴素前缀截挡不住），末行 `pack: N entries, M chars, level=X` 让 pack 大小可观测；full 与默认行为不变。`memo pin status` 打印 pinned 块的 `chars/limit, remaining` 三元组，超限标 `truncated`。

### 5. AgentView 四档分级加载（H1）

`buildAgentView({ tier })`：T0 = meta + 项目上下文；T1 = + 按 taskType 过滤的 skill 摘要与 continuity 指针（不读全包）；T2 = + 激活 skill 全文；T3 = + continuity 全包/lineage/knowledge。每档带 `budget.sections` 逐段字符账，成本可观测量化。生产入口 `node scripts/ctx-agent.mjs workspace-view --session <id> [--tier T1]`——pull-based 读取，不违反"不自动注入启动 prompt"的政策。默认 T3，旧调用方零破坏。

### 6. Autodream Phase B：opt-in 自动触发（E1）

`AIOS_AUTODREAM_AUTO=1` 开启后两个触发器：会话关闭钩子（包裹式，绝不阻塞 close）和空闲阈值（`AIOS_AUTODREAM_IDLE_MINUTES`，默认 30 分钟）。触发只跑 `preview`，proposal 走既有治理 apply。诚实结论：dream 引擎本身零 LLM 确定性——0 token 就是最便宜的路由，不需要再"路由"什么。

### 7. 本地 embedding 粗排（默认关）+ 真实语料基线（A4+G1）

`AIOS_MEMO_EMBEDDER=hash-lexical` 开启进程内确定性 embedder。粗排是 **union-only** 的：只向 token 匹配集加近邻候选、永不剔除，所以开启不可能丢结果——AB 第五臂 top-1 与基线零漂移（76.9% = 76.9%）实证了这一点。真实语料评测集（`real-corpus.mjs`）运行时从活语料派生查询、语料文本不入库：本仓库基线 **top-1 98% / top-5 100%**（171 事件 / 50 查询）。以后任何检索改造，改前改后各跑一次即见回归。

### 8. 核实关闭的三项（C1/C2/F2）

C1 预算降级投影核实**已落地**（full → summary+ref → ref-only 三档 + hardConstraint 必保项恒以全文纳入 + orchestrate 生产调用链，"projector 与执行链断开"的记载已过时）；C2 判定**已建成**（见上）；F2 的前提被修正——`generatedTargets` 是按客户端 `agents` 能力**推导**的而非硬编码 4 个，装机实测后差距缩水为"workbuddy 一个待证目录"。另外 F1 补上了乐观锁的真实缺口：stale 写被拒时自动留 `conflicts/{ts}.json` 审计标记。

## 升级说明

无破坏性变更，全部向后兼容（默认层级行为、full 输出、旧调用方均不变）。拉取后直接可用；`workspace-view` 与 `memo hygiene` 是新增命令，无迁移成本。门禁证据：全量回归 1106 用例 / 1100 pass / 0 fail / 6 skip（101 文件，含本批 9 个新套件），AB 五臂零漂移，workspace/handoff/ctx-agent/dream 邻近套件全绿。

## FAQ

**Q: pinned 超限了会自动清吗？**
A: 永不。hygiene 只归档/轮替，pinned 内容的删改永远是 owner 的显式动作（`memo pin set`）。这是 survey 报告审批队列的设计：机器给证据，人做决定。

**Q: `--level summary` 会丢事实吗？**
A: 摘要层是有损投影，这是它的设计目的（~100 token/行）；要完整内容用默认 full。`pack` footer 让你在两级之间做有依据的选择。

**Q: 为什么 import 不直接导入为已验证事实？**
A: 因为导入器无法出示可信溯源。协议上 verified 只有三条真路（手工本地信任、attested 发布身份、治理晋升），导入走哪条都是伪造。落成 candidate 进治理队列，审核权在你。

**Q: embedding 默认为什么是关的？**
A: hash-lexical 是词面近似，收益取决于语料；它只加候选不减结果所以不会退化，但值不值得开看你自己的数据。真模型（如本地 MiniLM）实现同一接口即可插。

## 相关链接

- 项目：`https://github.com/rexleimo/aios`（以仓库实际地址为准）
- 更新日志：`docs-site/changelog.md` / `docs-site/zh/changelog.md`
- 迁移指南：`docs/import-migration.md`
- 优化 backlog（单一真源）：`docs/plans/2026-09-08-memo-optimization-backlog.md`
