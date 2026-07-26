# 竞品刷新 + AIOS 实现 Review（2026-07-26）

> 基线: `docs/reports/competitor-watchlist.json` schema v3（lastUpdated 2026-07-09，nextRefresh 2026-07-23 — **已逾期 3 天**）
> 上一轮: `docs/reports/2026-07-09-competitor-refresh-actionable.md`
> 本仓库版本: `VERSION` = 5.2.1（`d02c528`）

## 0. 本轮方法与已知限制（先说清楚，避免把结论当成已验证事实）

| 环节 | 状态 | 说明 |
|------|------|------|
| 竞品仓库 clone/update | **已完成（换路由）** | `git clone` 全部失败：`github.com:443` 与 `raw.githubusercontent.com` 从本机不可达（DNS 正常解析 20.205.243.166，TCP 连接 21s 超时）。但 `api.github.com`（200/0.4s）与 `codeload.github.com`（200）可达。改用 codeload tarball 抓取，**12/12 全量源码树到位**，比原 `--filter=blob:none` 浅克隆更完整 |
| 竞品 GitHub 元数据刷新 | **已完成** | 走 `api.github.com`，12 仓库 stars / open_issues / default_branch / HEAD SHA 见 §6 |
| 竞品优缺点 | **完成，源码级证据** | 见 §1（基于 07-01 双端 file:line 与 06-04 两份 deep-dive）+ §6（本轮对当日源码的复核与两处修正） |
| AIOS 侧源码级 review | **完成，证据充分** | 见 §2–§4，全部为本轮实读 `scripts/lib/**` 得到的 file:line 证据（HEAD `d02c528`） |

**阻断根因（两段，均非权限问题）**：
1. 前段：宿主自动批准的安全分类器不可用（`claude-opus-5 is temporarily unavailable, so auto mode cannot determine the safety of Bash`），约 30 次重试。该检查在权限判定**之前**，故 `/permissions` 授权无法绕过。后自行恢复。
2. 后段：网络。`github.com:443` 不可达。`api.github.com` + `codeload.github.com` 可达，据此绕行。

抓取脚本：`temp/fetch-competitor-tarballs.sh`（`api.github.com` 取 `default_branch` →
`codeload.github.com/<slug>/tar.gz/refs/heads/<branch>` → `tar --strip-components=1`）。
`temp/refresh-competitor-repos.sh`（原 git clone 版）在本机网络下不可用，保留备查。
注意：Windows 下 `tar` 建符号链接会报错退出非零，但文件内容已正确解出，非真失败。

---

## 1. 竞品优缺点（源码级）

**证据来源与置信度**：本节的竞品事实来自三份**源码级**分析报告，均为真实读取竞品源码后写下的双端引用，非元数据摘要：

| 报告 | 覆盖 | 读取方式 |
|------|------|----------|
| `2026-07-01-source-level-gap-analysis.md` | the-pair / gnhf / OpenHarness / oh-my-openagent / OpenClaw / TencentDB | raw.githubusercontent + GitHub Blobs API 逐文件完整读取，附竞品 `repo:file:line` |
| `2026-06-04-competitor-context-infrastructure.md` | OpenViking / OpenClaw / OpenClaw-Recall | sparse clone + release notes 全量 |
| `2026-06-04-competitor-agent-team-analysis.md` | 19 仓库全覆盖 | GitHub API + 5 路并行 deep-dive |

**"我们的状态"一列全部为 2026-07-26 本轮实测**（HEAD `d02c528`）。竞品侧最新版本快照止于 2026-07-09；本轮 clone 未完成（见 §0），故竞品**最近 17 天的新变化未覆盖**。

### 1.1 memo-memory

#### TencentDB-Agent-Memory（v1.0.0 GA，7.7k★）

| | |
|---|---|
| **优点** | ① Recall 双重预算 `maxCharsPerMemory` × `maxTotalRecallChars`，按 score 排序截断（v0.3.6 PR #71）② 单趟 fast-token-estimate 短路替代 6 轮全量 tiktoken，首次 assemble **29s→1.4s** ③ 五级管线 L1 摘要 / L1.5 任务边界 / L2 Mermaid / L3 三级压缩 / L4 skill 生成 ④ **L3 三档阈值按 contextWindow 比例**（0.5 mild / 0.85 aggressive / 0.95 emergency，`types.ts:185-197`）而非固定节点数 ⑤ emergency 级目标 0.6，在 aggressive 被用户消息保护卡住时强制降级 ⑥ `/v2/pipeline/status` 管线可观测 |
| **缺点** | ① L1/L1.5/L2/L4 **四个阶段都调 LLM** —— 记忆整理本身烧 token，与本地-first 冲突 ② v1.0 走独立 Memory Gateway 商业化，架构绑远端服务 ③ 回查是两步 grep（node_id → result_ref → `refs/*.md`），比一步绕 |
| **我们** | 已吸收：`search/budget.mjs` 预算、`mermaid-canvas.mjs` emergency 级、canvasToMermaid 零 LLM（**优于**竞品）。**仍缺**：压缩阈值仍是固定节点数 20/50，不是 contextWindow 比例；无 pipeline status |

#### mem0（v2.0.11，60k★）

| | |
|---|---|
| **优点** | ① 零 LLM 检索管道 ② 5 平台 plugin 矩阵，跨 CLI 记忆注入 ③ **Stop hook 会话结束自动写记忆**：解析 transcript JSONL → 提取 last assistant + touched files → `mem0.add(infer=True)` → 90 天 expiry → dedup 标记 7 天清理 ④ SessionStart timeline：最近 10 条 + 类型图标 + 相对时间 ⑤ identity scoping，多 agent 共享实例不串台 |
| **缺点** | ① 全量向量库适配器全家桶，运维成本对本地-first 不划算 ② cli-node-v0.2.8 一次修 8+ 高危 CVE，说明依赖面过宽 |
| **我们** | `lifecycle/session-hooks/` 存在。**仍缺**：per-agent identity scoping（`scripts/lib/search/` 下 `agentId\|agent_id\|namespace` **0 命中**） |

#### Graphiti（v0.29.2，28.5k★）

| | |
|---|---|
| **优点** | ① **bi-temporal `valid_at`/`invalid_at`** —— 事实被新事实取代时软失效而非删除。这是"记忆正确性"最关键的一条语义 ② attribute-hallucination 三层防御 |
| **缺点** | ① 重量级图谱抽取，每次写入跑实体关系抽取 ② 母仓 getzep/zep 已 dormant（56 天） |
| **我们** | **0 命中**（`validAt\|valid_at\|invalidAt\|invalid_at\|supersede`）。dream TTL 是**类级过期**，缺"事实被取代"语义 —— 旧事实与新事实会同时被召回 |

#### Letta Code（v0.27.29，2.8k★）

| | |
|---|---|
| **优点** | ① Sleep-Time 记忆整理独立于主循环 ② `dream --to/--from` 把整理结果**写回指令文件**，闭合 memo→规划 ③ system prompt 版本化 canary |
| **缺点** | 母仓 letta-ai/letta 21 天无 push，实际是壳 |
| **我们** | 已吸收 dream Phase A + `dream --to`（`lifecycle/dream/export-to.mjs`） |

#### OpenViking（v0.4.8，26.4k★）

| | |
|---|---|
| **优点** | ① **per-agent_id 经验命名空间隔离**，local & remote 同步实现避免模式漂移 ② 三个显式旋钮 `recall_exp_first_round_only` / `exp_recall_limit=2` / `exp_recall_max_chars=10000` ③ **OVPack v2** 二进制上下文容器：`manifest.content_sha256` + `dense_vector_sha256` + `index_records.jsonl` + 字节级 contiguity check + ZIP member path 严格校验 ④ Usage/Audit **7 张 SQLite 表**，UTC 持久化 + 读端 viewer-tz 重分桶，14 列复合主键，`zoneinfo` 处理 DST 与印度/尼泊尔半小时偏移 ⑤ `embedding_template` 取代字段级 `searchable` ⑥ trajectory `retrieval_anchor` 收敛索引文本，提升 vector precision |
| **缺点** | ① cuVS GPU 向量 + 递归爬站，偏离本地-first ② AGPL-3.0 需注意 |
| **我们** | 已有 recall 预算。**仍缺**：per-agent 命名空间、`context:pack` 的 machine-readable manifest、audit 表 |

### 1.2 intelligent-planning

#### superpowers（v6.1.1，250k★）

| | |
|---|---|
| **优点** | ① brainstorm / writing-plans / verification-before-completion / TDD / systematic-debugging 方法论闭环 ② **两阶段 subagent 审查**：implementer → spec-reviewer（只查 spec 合规）→ code-quality-reviewer ③ skill TDD：先写 pressure test 再写 skill |
| **缺点** | AIOS 已于 v5.0.0 将其从工作流与安装组件下线（Rex-only 迁移），现仅方法论参照 |
| **我们** | `rex-*` Provider 已替代。**watchlist 描述过时**：`competitor-watchlist.json:148` 仍写"AIOS 智能规划 skill 体系的直接方法论来源"，需改写 |

#### Hermes Agent（v2026.7.7.2，211k★）

| | |
|---|---|
| **优点** | ① **background review fork**（`agent/background_review.py:402-451`）：异步复刻 agent 跑 skill review，不阻塞主循环 ② `tools/skill_provenance.py` 用 ContextVar 区分 background/foreground **写入来源** ③ `agent/curator.py` **1843 行**，7 天 cadence 做 pin/archive/consolidate ④ LSP on write ⑤ 1h prompt cache ⑥ `/handoff` |
| **缺点** | 渠道/桌面 UI 爆炸增长，绝大多数与三支柱无关 |
| **我们** | `skills/health.mjs` 有观测**数据采集层**（JSONL append + 30d 窗口聚合）。**仍缺**：异步 review fork、provenance 来源标记、周期 curator。即"采了数据但没有消费闭环" |

#### OpenHarness（v0.1.9，静默）

| | |
|---|---|
| **优点** | ① dry-run `ready/warning/blocked` + `next_actions[]` 具体修复指令 ② autodream 5 类 taxonomy + PREVIEW/APPLY 双模式 ③ 门控链短路：`_CHILD_ENV` 防递归 → 24h 间隔 → 10 分钟扫描节流 → ≥5 新 session ④ stale 候选筛选：`importance>1` 跳过 / `use_count>0` 跳过 / ≥60 天才入选 / 前 20 条并明确告知"review candidates, not automatic deletion" |
| **缺点** | ① autodream taxonomy **是 prompt-only**，代码层零枚举零校验 ② **PREVIEW 模式无写保护** —— 纯靠提示词约束 LLM，preview 不创建备份，LLM 不听话则既无备份又无拦截 ③ 锁的"上次成功时间"隐式用文件 mtime，rollback 必须恢复 mtime 否则 min_hours 门控失效 —— 脆弱耦合 ④ dry-run 实际只有 **4 个**检查维度（`cli.py:333-393`），不是早期报告说的 6 个 ⑤ 自 06-04 静默 |
| **我们** | 已吸收 dry-run（`solo-runtime/dry-run-readiness.mjs`）+ dream Phase A |

#### oh-my-openagent（v4.16.0，65k★）

| | |
|---|---|
| **优点** | ① ralph/ultrawork 长循环 ② per-agent skill filter 两层：静态工具黑名单 `agent-tool-restrictions.ts:7-31` + 配置层 `agents.<name>.skills` ③ 公开反对 premature adapter 抽象 ④ LazyCodex 瘦 prompt |
| **缺点** | ① **`default_mode` config 字段不存在** —— 完整读 `config/schema.ts:1-342` 确认无此字段。真实机制是运行时关键词正则 hook（`/\b(ultrawork\|ulw)\b/i`），07-01 已核实为早期报告误读 ② `restrictedAgents` 同样不存在 ③ 关键词正则路由对措辞高度敏感 |
| **我们** | `lifecycle/options/default-mode.mjs` 是原创落地，不是抄。**但见 F6** —— 我们自己的入口分类恰恰是关键词正则驱动的，踩了同一个坑 |

#### gnhf（v0.1.42，静默）

| | |
|---|---|
| **优点** | ① **双计数器分离**：`consecutiveFailures`（agent 自报失败 → abort）与 `consecutiveErrors`（进程崩溃/infra → 退避）语义不同，分开计 ② commit repair prompt 把 git commit 错误原文注入下一轮 ③ `tokensEstimated` sticky flag，一旦某轮 usage 是估算就永久置位，诚实呈现总量 ④ `PermanentAgentError` 立即 abort 不退避 |
| **缺点** | ① 退避 `60_000 * 2^(n-1)` **无 cap**，无限指数增长（60s/120s/240s/480s/960s/1920s…）—— 明确的设计缺陷 ② pre/post-iteration abort 逻辑**完全相同**（`orchestrator.ts:739-759`），"双阶段分类器"是夸大 |
| **我们** | 已吸收 consecutiveFailures abort，且有 **300s cap 优于竞品**。**仍缺**：`tokensEstimated` sticky flag、commit repair prompt、failure/error 双计数器分离（`backoff.mjs` 仍是单一 infra-retry 判定） |

#### ECC（v2.0.0）

| | |
|---|---|
| **优点** | ① skill-comply —— 验证 skill **是否真被执行**，而非是否写得好 ② skill health/evolution loop ③ changed-files ledger ④ Plan Canvas |
| **缺点** | 价值在"验证"不在"模板"；照抄成又一个 plan 模板库就失去意义 |
| **我们** | `skills/health.mjs` 已有；`session/changed-files.mjs` 已有；**Plan Canvas 0 命中**；comply 只有静态探针（见 F5） |

### 1.3 team-workflow

#### OpenClaw（v2026.7.1-beta，382k★）

| | |
|---|---|
| **优点** | ① Skill Workshop 治理闭环：proposal/review/apply/rollback，**rollback 把 apply 前完整文件内容内联进 rollback.json**（`types.ts:86-99` 的 `previousContent` + 每个 support file 的 `previousContent`）② scanner **7 条 critical 规则**（prompt-injection ×3 / shell-pipe-to-shell / secret-exfiltration / dangerous-exec / dynamic-code-execution / env-harvesting），且 **apply 时重扫**，不 clean 自动 quarantine ③ v2026.6.2-beta.1 起用 **operator install policy 替代 scanner 作主闸门** —— 理由是"scanner 永远滞后于新攻击向量" ④ support files 64 文件 / 2MB 上限，禁可执行/硬链接/符号链接 ⑤ stale 检测：`currentContentHash` 校验，目标被外部改过自动 stale ⑥ 按目标 skill hash 加锁 + manifest 锁 ⑦ per-conversation capability profile ⑧ QMD 写入按 store 串行化避免并发竞争 |
| **缺点** | ① 生态噪声极大（渠道/插件/移动端/桌面）② SQLite mail bus 劣于 OpenHarness 文件型 mailbox ③ 主项目对 openclaw-recall 零引用，插件生态自身碎片化 |
| **我们** | 已吸收：`skill-workshop.mjs`（propose/review/apply/rollback + 文件级 rollback + stale 检测）、`install-policy.mjs`（deny-first glob + requireProvenance + 坏文件回退默认策略）。**policy 在 apply 路径默认强制**（`skill-workshop.mjs:223` 拒绝即 exit 1；`policyCheck` 参数是 dry-run 开关而非启用开关）。**仍缺**：① 内容 scanner —— `memo/safety.mjs` 有 6 条威胁规则但**只服务 memo**，`skill-workshop.mjs` 未 import 它，skill 正文从不过内容检查 ② per-conversation capability profile（0 命中） |

### 1.4 优缺点分析导出的三条结论

1. **我们已过"抄基础能力"阶段**。dry-run / dream / recall 预算 / skill workshop 文件级 rollback / verdict schema / consecutiveFailures abort 全部落地，且在两处**优于**来源竞品（零 LLM Mermaid、300s 退避 cap）。
2. **剩余缺口集中在"闭环的后半段"**，不是新功能：health 采了数据没有 curator 消费；comply 有命令没有真验证；death-notice 有协议没有恢复调度；install-policy 有闸门但 skill 正文不过内容扫描。竞品的优点恰好都在这些后半段。
3. **竞品的缺点给了两条明确的否决**：OpenHarness 的 PREVIEW-无写保护 与 oh-my-openagent 的关键词正则路由。第二条我们自己正在犯（F6）。

---

## 2. AIOS 侧 Review — 本轮实读发现（有 file:line 证据）

> 以下全部为本次会话直接读取 `scripts/lib/**` 得到，非沿用。

### F1 — 工作流策略门每轮从零评估，永不携带已完成 Capability【治理，高】

`evaluateWorkflowPolicy` 声明并向下透传 `observations` / `completedCapabilities`
（`scripts/lib/planning/workflow-policy.mjs:311,388`），rex 适配层也确实接收
（`scripts/lib/workflows/rex-harness-adapter.mjs:105-113`）。

但**没有任何生产调用方传入这两个参数**。全仓 grep 命中仅落在 policy 自身签名与
`scripts/tests/*.test.mjs`。三个生产入口——
`scripts/aios-mcp-server.mjs:613`、`scripts/lib/ctx-agent-core/run.mjs:131`、
`scripts/lib/planning/cli.mjs:199`——全部走 `runAutoGate`，而
`evaluateAutoGateDecision`（`scripts/lib/planning/auto-gate.mjs:85-102`）只透传
`message / activePlan / policyMode / client / sessionId / explicitIntent`。

**后果**：每条 prompt 都以"此工作项尚未完成任何 Capability"的前提重新选 Provider。
Rex 阶段机在 `rex-activation-store` 里是有状态的，但**决定选哪个 Provider 的那一层是无状态的**——
门控可以在已经走完 requirements → design 之后，再次选中 requirements-clarify。
这正是 CLAUDE.md 里"当前 rex Command 是唯一推进权威"的策略在入口层的漏接。

**修法**：`evaluateAutoGateDecision` 读取 `findStoredAiosCapabilityActivation(...).workflow.completedCapabilities`
并透传。改动面小，直接闭合治理链。

### F2 — guarded 轮的 workItemKey 用消息哈希，跨轮必然断链【治理，高】

`guardedWorkItemKey` = `turn:<client>:<sessionId>:<sha256(message+intent).slice(0,16)>`
（`scripts/lib/planning/auto-gate.mjs:72-82`）。

planned 轮用 `plan.relativePath` 作 key（稳定，可续转），guarded 轮用**逐字消息哈希**。
用户换一个措辞的追问 → 新 key → `findStoredAiosCapabilityActivation` 找不到
（`rex-activation-store.mjs:175-187`）→ 起一条全新 Workflow Activation。

**后果**：guarded 轨的证据链天然按 prompt 碎片化，每轮一条孤儿 activation，永不 `completed`。
配合 F3 直接变成磁盘与 CPU 的复利增长。

### F3 — activation 记录无 GC，且每轮全目录 parse【效率，高】

`startStoredAiosCapabilityActivation`（`rex-activation-store.mjs:142`）与
`findStoredAiosCapabilityActivation`（`:178`）都调用 `listRecords`
（`:120-126`），后者 `readdirSync` + 对**每个** `.json` 做 `parseRecord`（`JSON.parse` + 可能再读一次 workflow 文件，`:113-115`）。

`entropy-gc` 只回收 `dispatch-run-*.json`
（`scripts/lib/lifecycle/entropy-gc/constants.mjs:2`：`DISPATCH_ARTIFACT_RE = /^dispatch-run-.*\.json$/i`），
**不覆盖 `.aios/workflow-activations/`**。

**后果**：叠加 F2，每条 guarded prompt 净增 1–2 个 JSON 文件，且下一条 prompt 要把它们全部读一遍。
这是 O(历史 prompt 数) 的每轮开销，直接压"工作效率"。而且 `parseRecord` 遇到任一坏文件就 throw
（`:107-108` 有意为之），意味着一个损坏记录会让**整个**工作流入口硬失败。

**修法**：给 activation 目录加 TTL/上限的 GC（并入 entropy-gc），并给 `listRecords` 加
`workItemKey → activationId` 的索引文件，避免全目录扫描。

### F4 — 三处状态路径硬编码 `.aios/`，绕过 `AIOS_PROJECT_STATE_DIR`【正确性，中】

`scripts/lib/aios/state-root.mjs:25-36` 明确支持 `AIOS_PROJECT_STATE_DIR` 重定位状态根，
且 `death-notice.mjs:6,62` 正确使用了 `resolveContextDbRoot`。但以下位置直接拼 `.aios`：

- `scripts/lib/harness/solo-runtime/dry-run-readiness.mjs:37`（ContextDB index 预检）
- `scripts/lib/harness/solo-runtime/dry-run-readiness.mjs:94`（session resume 预检）
- `scripts/lib/workflows/rex-activation-store.mjs:15`（`ACTIVATION_DIR`）
- `scripts/lib/workflows/rex-long-running-delivery-store.mjs:7`（`DELIVERY_DIR`）
- `scripts/lib/harness/subagent-runtime/snapshots.mjs:51`

**后果**：一旦设置 `AIOS_PROJECT_STATE_DIR`，dry-run 预检会误报
"ContextDB index missing"→ 把 readiness 从 `ready` 降到 `warning` 并给出错误的
`aios context init` 建议；activation 与 delivery 会写到与其余状态**不同的**目录，
状态被劈成两半。这是"预检本身不可信"，比缺预检更糟。

### F5 — `skill comply --live` 名不副实：只量文档自相似度，不量行为【治理，中高】

`scripts/lib/skills/compliance-live.mjs` 的 "live" 评估是
**纯确定性词法/结构探针**：把 expectedSequence 的 token 拿去和 skill 正文自身
做包含匹配打分（`:47-56`），再按 supportive/neutral/competing 三档阈值判 pass（`:98-122`）。
文件头自述 "no external LLM required"（`:2`）。

也就是说：**被评的文档和作为答案的文档是同一份**。写得越冗长、把 sequence 原词
重复进正文，分数越高。它无法回答 ECC 那条模式真正要回答的问题——
"agent 在竞争性指令下是否真的照 skill 执行"。

这恰好踩中 watchlist 自己列出的否决理由："展示层 / 记录层不进 P0"
（`competitor-watchlist.json:120`，07-01 否决 the-pair 的同款理由）。
07-09 报告把 B2 标为 Pending 是对的，但当前代码存在会让人误以为已落地。

**修法**：要么把它明确改名为 `comply --static`（诚实降级），
要么接一个真跑 agent 的 sandbox 探针再叫 `--live`。前者成本近零，建议先做。

### F6 — 语义路由是关键词正则，与 watchlist 自己的否决理由冲突【治理，中】

`workflow-policy.mjs:64-76` 用 ~12 条中英混合正则（`ACTION_PATTERN`、`PLANNED_SIGNAL`、
`TEAM_PATTERN` 等）决定 direct/guarded/planned 与 route。

watchlist 明确记录过"oh-my-openagent 关键词 `default_mode` 误读"
（`competitor-watchlist.json:196,258`）作为已否决抄法。AIOS 自己的入口分类却正是关键词驱动的。

具体可观察的失效：`READ_ONLY_PATTERN` 含"优化"的近义面而 `ACTION_PATTERN` 也含"优化"
（`:65,68`），`isReadOnlyMessage` 要求 `READ_ONLY && !ACTION`（`:271-276`），
所以"分析并优化 X"会因两侧同时命中而落到 not-read-only，进而按 `PLANNED_SIGNAL` 二次判定。
分类结果对措辞高度敏感，且没有置信度输出——门控无法表达"我不确定"。

**修法**：短期给 decision 增加 `confidence` 与命中的 pattern 名（可观测性），
低置信时降级到 `guarded` 而非 `planned`；长期考虑把分类交给已有的 rex 语义评估而非宿主正则。

### F7 — `MAX_CONSECUTIVE_FAILURES` 不可配置【效率，低】

`scripts/lib/harness/solo-runtime/backoff.mjs:17` 硬编码 5。退避 cap 与 base
（`:15-16`）同样硬编码。overnight 长任务与短交互任务用同一阈值。
优点是不会踩 gnhf 的无 cap 坑（`:10` 注释已明确），缺点是长跑场景只能改代码。

### F8 — skill 正文从不过内容安全扫描【治理，中高】

`scripts/lib/memo/safety.mjs` 有一套完整的威胁检测：10 个不可见 Unicode 字符 + 6 条威胁正则
（prompt-injection / system-prompt-override / deception-hide / secret-exfiltration-curl /
secret-exfiltration-wget / ssh-backdoor，`:1-45`），`assertWorkspaceMemoryContentSafe` 抛 `AIOS_MEMO_UNSAFE_CONTENT`。

但 `scripts/lib/skills/skill-workshop.mjs` 的 import 只有 `source-tree.mjs` 与 `install-policy.mjs`
（`:13-17`），**没有 import safety.mjs**。`apply` 路径（`:178-237`）做的是：状态检查 → SKILL.md 存在性 →
install policy glob 判定 → stale hash 校验 → 写盘。**skill 正文内容本身从头到尾没有被检查过**。

对照 OpenClaw：scanner 7 条 critical 规则，且 **apply 时重扫**，不 clean 自动 quarantine。
OpenClaw v2026.6.2-beta.1 用 operator policy **替代** scanner 作主闸门是对的（scanner 滞后于新攻击向量），
但它**没有删掉 scanner** —— policy 管"能不能装"，scanner 管"装的东西里有没有注入"。这是两层。

**后果**：一个被批准的 proposal 只要路径命中 `skill-sources/*` 允许 glob 就能落盘，
正文里带 `ignore previous instructions` 或不可见 Unicode 也照写不误。而 skill 是要被注入 agent 上下文的。
memo 这条路已经防住了，skill 这条更危险的路反而没防。

**修法**：`apply` 写盘前对 SKILL.md 正文调 `assertWorkspaceMemoryContentSafe`。
一行 import + 一次调用，复用已有规则集。

### F9 — skill health 只有采集层，没有消费闭环【治理，中】

`scripts/lib/skills/health.mjs` 有 `recordSkillObservation`（JSONL append）与
`buildSkillHealthReport`（30 天窗口 successRate + failurePatterns + pendingAmendments）。数据采得完整。

但全仓 grep `curator\|backgroundReview\|background-review` 在 `scripts/lib/skills/` 下 **0 命中**。
没有任何东西定期读这份 health 报告并据此 pin / archive / consolidate skill。

对照 Hermes：`curator.py` **1843 行**，7 天 cadence 做 pin/archive/consolidate；
`background_review.py:402-451` 异步复刻 agent 跑 skill review 不阻塞主循环；
`skill_provenance.py` 用 ContextVar 区分 background/foreground 写入来源。

**后果**：health 报告是一份**没有消费者的数据**。skill 质量退化能被观测到，但不会触发任何动作。
这与 F5（comply 是静态探针）叠加，意味着整个 skill 治理链条只有前半段。

### F10 — canvas 压缩阈值用固定节点数，不随 contextWindow 缩放【效率，中】

`scripts/lib/offload/mermaid-canvas.mjs` 用 `COMPACT_MILD_NODES=20` / `COMPACT_AGGRESSIVE_NODES=50`
固定节点数触发，`CANVAS_RECALL_MAX_CHARS=12_000` 固定上限。

对照 TencentDB：三档全部是 **contextWindow 比例**（`types.ts:185-197` mild 0.5 / aggressive 0.85 /
emergency 0.95，目标 0.6），阈值在 `l3.ts:217-222` 由 `Math.floor(contextWindow * ratio)` 算出。

**后果**：同一套阈值同时服务 200k 与 1M 上下文窗口的模型。大窗口下过早压缩（浪费可用上下文，
且压缩本身有信息损失），小窗口下过晚压缩（有溢出风险）。节点数与 token 数的关系还依赖节点内容长度，
本身就不是稳定代理量。

**修法**：阈值改为 `contextWindow × ratio`，contextWindow 从 model-router 已知的模型能力读取，
读不到时回退当前固定值。

### F11 — recall 无 per-agent 命名空间，多 agent 经验互串【治理/正确性，中】

`scripts/lib/search/` 下 grep `agentId\|agent_id\|namespace` **0 命中**（`budget.mjs` /
`unified-search.mjs` / `cli.mjs` / `index.mjs` 全部）。

对照 OpenViking v0.3.23：per-agent_id 经验命名空间隔离，local & remote 同步实现；
配套 `recall_exp_first_round_only` / `exp_recall_limit` / `exp_recall_max_chars` 三个旋钮。
mem0 plugin v0.2.5 的 identity scoping 是同一问题的另一解。

**后果**：`aios harness`、`aios team` 的多个 worker、subagent 共享同一召回空间。
一个 agent 的失败经验会被另一个不相关的 agent 召回。agent 越多、跑得越久，串扰越严重。
这直接压"智能体治理" —— 治理的前提是每个 agent 的经验边界清晰。

### F12 — memo 缺事实失效语义，新旧事实同时召回【正确性，中】

全仓 grep `validAt\|valid_at\|invalidAt\|invalid_at\|supersede` **0 命中**。
dream 的 TTL 是**类级过期**（按类型给统一存活期），不是"这条事实被那条新事实取代了"。

对照 Graphiti：bi-temporal `valid_at` / `invalid_at`，事实被取代时**软失效而非删除** ——
既保留历史可追溯，又不再进入当前召回。

**后果**：用户改了偏好、项目换了约定、命令改了名字之后，旧事实不会失效，
只会等 TTL 自然到期。在此之前新旧两条同时被召回，agent 拿到互相矛盾的上下文。
这是记忆系统最难被发现的一类错误 —— 不报错，只是悄悄给出过时答案。

---

## 3. 与 07-09 清单的差分

| 07-09 项 | 07-09 状态 | 2026-07-26 实测 |
|----------|-----------|-----------------|
| B1 Plan Canvas | Pending | **仍无实现** — 全仓 grep `plan-canvas\|planCanvas` 无命中 |
| B2 skill comply --live | Pending | **代码存在但只是静态探针** — 见 F5，不应记为 Done |
| C1 memo 事实时效 valid_at/invalid_at | 季度级 | **仍无实现** — grep `valid_at\|invalidAt\|bi-temporal` 无命中 |
| C2 memo pipeline status | 季度级 | 未见 `aios memo pipeline status` 入口 |
| C3 per-conversation capability profile | 季度级 | **仍无实现** — grep `capabilityProfile\|capability-profile` 无命中 |
| A3 death-notice | Done（协议+展示） | 协议与读写确实完备（`death-notice.mjs:23-126`），但**仍无恢复调度**——文件头自述"不做恢复调度"（`:1`）。07-09 记的"调度闭环未接"依然成立 |
| A1/A2/A4/B3 | Done | 未在本轮复验 |

**v5.0.0 带来的 watchlist 结构性影响（尚未反映到 JSON）**：
superpowers 已从"AIOS 工作流与安装组件"降级为"纯方法论参照"（CHANGELOG.md:57-68）。
它在 watchlist 里仍是 intelligent-planning 轨 P0 且 whyKeep 写着
"AIOS 智能规划 skill 体系的直接方法论来源"（`competitor-watchlist.json:148`）——
描述已过时，下轮刷新需改写 whyKeep 或降级。

---

## 4. 建议优先级

按 ROI 排序。前三项互相咬合，建议同一批处理。**来源**列标注该项是纯 AIOS 自查（self）还是由竞品优缺点对照导出（竞品名）。

| # | 项 | 支柱 | 来源 | 成本 | 理由 |
|---|-----|------|------|------|------|
| 1 | F1 auto-gate 透传 `completedCapabilities` | 治理 | self | S | 一处透传，闭合"Rex Command 唯一推进权威"在入口层的漏洞 |
| 2 | F2 guarded workItemKey 改为会话内稳定键 | 治理 | self | S | 让 guarded 轨可跨轮续转；与 #1 共同修复证据链 |
| 3 | F8 skill apply 前调 `assertWorkspaceMemoryContentSafe` | 治理 | OpenClaw | **XS** | 一行 import + 一次调用，复用已有规则集。skill 正文要进 agent 上下文却零内容检查，是当前最不对称的风险 |
| 4 | F3 activation GC + 索引 | 效率 | self | M | 消除 O(历史 prompt) 的每轮 IO；#2 修好后增长速率也降 |
| 5 | F4 五处状态路径改走 `resolveContextDbRoot` | 正确性 | self | S | 机械替换；消除"预检不可信"与状态劈裂 |
| 6 | F5 `comply --live` → `--static` 诚实降级 | 治理 | ECC | XS | 近零成本，避免把静态探针误当行为验证 |
| 7 | F11 recall 加 per-agent 命名空间 | 治理 | OpenViking / mem0 | M | 多 agent 经验边界是"智能体治理"的前提；agent 越多串扰越重 |
| 8 | F12 memo 事实软失效 `valid_at`/`invalid_at` | 正确性 | Graphiti | M | 消除新旧事实同时召回；这类错误不报错，只悄悄给过时答案 |
| 9 | F10 canvas 阈值改 contextWindow 比例 | 效率 | TencentDB | S | 阈值随模型窗口缩放，避免大窗口过早压缩、小窗口过晚压缩 |
| 10 | F6 decision 增加 confidence + 命中 pattern | 治理 | oh-my-openagent（反面） | M | 让路由可观测、低置信可降级 |
| 11 | F9 接 skill curator（消费 health 报告） | 治理 | Hermes | M | 让已采集的 health 数据产生动作；与 #6 共同补完 skill 治理后半段 |
| 12 | F7 backoff 阈值可配置 + `tokensEstimated` sticky flag | 效率 | gnhf | XS | 长跑场景解锁；token 总量诚实呈现 |
| 13 | 补齐竞品 clone + 元数据刷新 | — | — | S | 脚本已就绪，仅缺工具可用性 |
| 14 | watchlist 更新 superpowers whyKeep / lastUpdated / nextRefresh | — | — | XS | 与 v5.0.0 对齐 |

### 4.1 本轮已落地（2026-07-26）

用户指示优先做记忆系统的能力跃迁，本轮实现了下列三项，其余保持在待办队列：

| 项 | 状态 | 落点 |
|----|------|------|
| **F12 记忆双时态失效** | 已实现 | 新增 `scripts/lib/memo/storage/temporal.mjs`；`normalizers.mjs` / `events-write.mjs` / `query.mjs` 透传；`memo add --supersedes/--valid-at`、`memo list\|search\|recall --as-of/--include-invalid`、新命令 `memo supersede`；测试 `scripts/tests/memo-temporal.test.mjs` |
| **F8 skill 正文安全扫描** | 已实现 | `skill-workshop.mjs` `apply()` 在 policy 门之前扫描提案目录下全部 `.md`，复用 `memo/safety.mjs` 规则集；测试补在 `scripts/tests/skills-component.test.mjs` |
| **F10 canvas 阈值按窗口缩放** | 已实现 | `mermaid-canvas.mjs` 新增 `parseContextWindowTokens` / `resolveCanvasThresholds`，以 200K 为基准线性缩放并 clamp 到 [0.25, 8]；测试 `scripts/tests/canvas-context-scaling.test.mjs` |
| ~~F11 per-agent 命名空间~~ | **撤回** | 已实现于 `query.mjs:33-46`（`eventVisibleForAgent` + `filterMemoIdentity`），07-26 初稿把它列为缺口是我 grep 词不对（字段名是 `agent`，逻辑在 `memo/storage/` 不在 `search/`） |

F12 的实现要点，与 Graphiti 的差异：

- **不改写旧记录**。memo 是 append-only，Graphiti 可以回写 `invalid_at`，我们不能。
  改由**新事件**携带 `supersedes: [eventId...]`，读时折叠出旧事件的 `invalidAt` / `supersededBy`。
  `file`（单一 JSONL 追加）和 `split`（一 seq 一文件）两种存储因此行为完全一致。
- **默认只召回当前有效事实**，`--include-invalid` 取回历史，`--as-of <iso>` 做时间旅行。
- **失效判定不自动发生**。`memo supersede` 默认 dry-run，用 `dedup.mjs` 的 Jaccard 相似度提案，
  阈值 0.82（比 dream dedup 的 0.7 严），要 `--apply` 才写。理由见"明确否决"里的 OpenHarness 条目：
  自动改写可召回集合的风险高于收益，必须留人工闸门。
- `--apply` 写入的是一条**重述事件**，其 `supersedes` 包含胜出者自身，因此应用后同一事实只剩一条有效记录，且可重复执行。

F10 的落地限制（如实记录）：`solo-runtime/loop.mjs` 的 summary 里没有模型路由信息，
所以缩放系数来自显式入参或 `AIOS_CONTEXT_WINDOW` 环境变量；未声明时系数为 1，
阈值与改前逐位相同（`verify-all.mjs:36-43` 的断言不变）。把模型窗口一路接进 harness runtime
属于另一条改动线，本轮不做。

验证状态：三个新增/改动测试文件已登记进 `package.json` 的 `test:scripts`。
定向合跑 `canvas-context-scaling` + `skills-component` + `memo-temporal` 共 44/44 通过。
全量 `npm run test:scripts` 862 例、850 通过、5 失败——失败项全部在 shell install / browser install /
package-release 三处，报错为 Git Bash 下 `tar: Cannot connect to C: resolve failed`（把盘符当远程主机）
与 PATH shim 解析，属 Windows 环境问题；已用 `git stash` 剥离本轮 `package.json` 改动复跑
`release-pipeline.test.mjs`，同样 2 失败，确认为既有问题，与本轮改动无关。

### 4.2 F12 召回消融 A/B（2026-07-26）

先更正一处：`gaia-ab-eval` 跑不了真实模型 A/B——`scripts/gaia-ab-eval.mjs` 里 `--execute`
直接 `throw '--execute remains fail-closed until production client adapters are configured'`，
它只校验 manifest。另外真实语料 `.aios/memo/file/events.jsonl` 只有 20 条且零 supersede 链，
两臂完全相同——这本身是结论：**没人写链之前 F12 是空操作**。

因此改做**确定性召回消融**：不调模型，直接打生产入口 `searchMemoEvents`，语料 13 条事实链
（每链恰有一条当前为真的修订）+ 6 条噪声。三臂只差 supersede 链的有无，测试
`memo-ab-eval.test.mjs` 断言了这一点，保证指标差可归因。运行：`node scripts/memo-ab-eval.mjs`。

| 臂 | top-1 正确 | 矛盾率 | 陈旧占比 | 平均条数 | 平均字符 |
|---|---|---|---|---|---|
| baseline（改前行为） | 76.9% | 100.0% | 51.9% | 2.08 | 130 |
| temporal-explicit（显式写链） | **100.0%** | **0.0%** | **0.0%** | 1.00 | 60 |
| temporal-auto（`memo supersede` 自动） | 76.9% | 84.6% | 48.0% | 1.92 | 118 |

分段结果（矛盾率）：

| 分段 | baseline | explicit | auto |
|---|---|---|---|
| reword 同义改写 | 100% | 0% | 50% |
| flip 决策反转、措辞不同 | 100% | 0% | **100%** |
| ranked-stale 旧条目索引更好 | 100%（top-1 **0%**） | 0%（top-1 100%） | 100%（top-1 0%） |
| cjk 中文 | 100% | 0% | **100%** |

结论：

- **显式链是有效的，且效果是满的。** 矛盾率 100%→0%，召回条数 2.08→1.00，payload 字符 −54%。
  top-1 的提升全部来自 ranked-stale 段：旧笔记因 `refs` 也含关键词而 `scoreEvent` 得 3 分、
  压过新修订的 2 分，改前 top-1 正确率 0%，改后 100%。其余段改前 top-1 就对
  （打平时按 ts 倒序），所以**收益主要不是"排第一的对不对"，而是"矛盾条目不再进上下文"**。
- **自动检测基本不可用。** 13 条链只提出 2 条提案，仅覆盖 reword 段的一半。
  整体矛盾率只从 100% 降到 84.6%，接近没做。
- **中文完全失效，且是硬缺陷。** `dedup.mjs:12` 的 `textSimilarity` 用 `split(/\s+/u)` 分词，
  中文无空格 → 整句变一个 token → 除非逐字相同否则相似度为 0。cjk 段自动检测命中 0。
  本仓库的 memo 语料目前是英文，但项目文档与用户输入是中文，这条迟早踩。
  → 已在 §4.3 修复，上表的 auto 臂数据为**修复前**测量。

行动项（未做）：主力路径应是**让 agent 写入新事实时自带 `--supersedes`**，而不是靠事后 Jaccard。

### 4.3 CJK 分词修复（2026-07-26）

`dedup.mjs` 的 `textSimilarity` 原本只做 `split(/\s+/u)`。改为：**只有含无空格文字的 token 才被拆解**，
Han / Hiragana / Katakana 连续段转字符 bigram（`包管理器` → 包管/管理/理器），
标点分段，token 内的拉丁段保持完整。纯 ASCII 文本的 token 集合逐位不变，
`us-east-1` 不会被标点拆开，因此 dream dedup(0.7) 与 proposeSupersedes(0.82) 的英文行为零回归。
新增 `textTokens` 导出便于断言。

实测相似度：

| 文本对 | 改前 | 改后 |
|---|---|---|
| `项目使用 pnpm 作为包管理器…` vs `…npm…` | 0.000 | **0.882** |
| `…华东二区，灰度先走单可用区` vs `…华北三区…` | 0.000 | 0.700 |
| 中文真实决策反转（应当不合并） | 0.000 | 0.038 |
| 英文四组对照（identical / disjoint / 部分重叠 / us-east-1） | — | **逐位不变** |

A/B 复跑，cjk 段自动检测矛盾率 100% → **50%**，陈旧占比 50% → 33.3%，
全局自动臂矛盾率 84.6% → 76.9%，提案数 2 → 3。

**没有解决，只是不再归零。** 0.700 那组差在阈值 0.82 之下——差异字符聚在一起时 bigram 重叠掉得快。
自动检测依然只是补充，显式链仍是唯一能拿满收益的路径。

### 4.4 supersede 观察提示（2026-07-26）

§4.2 的结论是"自动检测不可信、显式链才拿满收益"，但**让 agent 自己写 `--supersedes` 的影响未知**——
它会改变召回返回什么，写错就是静默丢事实。所以本轮先只落**观察模式**：不写链，只报告。

`memo add` 写入成功后，用**写入者自己的 agent 身份**回扫本 space（上限 500 条），
对新文本做 Jaccard，≥0.7 的活跃事实按相似度降序取前 3 条打印：

```
Memo added: memo:default:20260726103422552-fce45dc8
Hint: 1 existing fact(s) look like earlier revisions of this entry:
  memo:default:20260726103422317-9c6a504e (0.82) deploy-region primary deployment region for the api tier is…
  No link was written. Pass --supersedes <ids> to retire them.
```

设计约束（每条都有测试）：

| 约束 | 理由 |
|---|---|
| 只打印，不写 `supersedes`、不改 `invalidAt` | 召回结果逐位不变，回滚成本为零 |
| 用写入者 agent 身份回扫 | 他人 `agent_private` 不可能出现在输出里（复用 `query.mjs` 隔离） |
| 已传 `--supersedes` 时整段跳过 | 写入者已声明，无可建议 |
| `--no-supersede-hint` / `AIOS_MEMO_SUPERSEDE_HINT=0` 可关 | 脚本化调用不被污染 |
| 扫描上限 500 | 大 space 不让每次写入付全量扫描 |

阈值取 **0.7**（比写链的 0.82 松）：提示错了只损失一行输出，此阶段召回率比精确率重要。

这一步的目的是**攒数据**——先看提示的命中质量，再决定要不要让 agent 自动写链。
在有观察数据之前，agent 自动 `--supersedes` 保持不做。

`memo-temporal.test.mjs` 18 项全通过（含 6 项新增 hint 测试）。

**不建议本轮跟进**：Plan Canvas（ECC，体验向）、pipeline status（TencentDB，可观测锦上添花）、
per-conversation capability profile（OpenClaw，依赖 capability manifest 先稳）、
OVPack manifest（OpenViking，依赖向量后端）。
它们都是"加新特性"；上面 1–9 是"现有能力没接对线"，先修 ROI 高得多。

**明确否决**（竞品缺点给出的负面样本）：
- OpenHarness PREVIEW 模式的"纯提示词写保护"—— 无备份又无拦截，不抄
- gnhf 无 cap 退避 —— 我们的 300s cap 更好，不动
- oh-my-openagent 关键词正则路由 —— 不但不抄，F6 说明我们自己要往回改

---

## 5. 证据索引

本轮所有结论对应的读取点：

- `scripts/lib/planning/workflow-policy.mjs:64-76,271-276,303-436`
- `scripts/lib/planning/auto-gate.mjs:72-82,85-102,370-428`
- `scripts/lib/workflows/rex-harness-adapter.mjs:105-124`
- `scripts/lib/workflows/rex-activation-store.mjs:15,107-126,142-187`
- `scripts/lib/workflows/rex-long-running-delivery-store.mjs:7`
- `scripts/lib/lifecycle/entropy-gc/constants.mjs:2`
- `scripts/lib/lifecycle/death-notice.mjs:1,23-126`
- `scripts/lib/harness/solo-runtime/dry-run-readiness.mjs:37,94`
- `scripts/lib/harness/solo-runtime/backoff.mjs:10,15-17`
- `scripts/lib/harness/subagent-runtime/snapshots.mjs:51`
- `scripts/lib/skills/compliance-live.mjs:2,47-56,98-122`
- `scripts/lib/aios/state-root.mjs:25-48`
- `scripts/lib/search/budget.mjs:12-59`
- `CHANGELOG.md:57-68`
- `docs/reports/competitor-watchlist.json:120,148,196,258,267`

未验证项已在 §0 与 §1 标题中标注，不计入结论。

---

## 6. 本轮实拉复核（2026-07-26，竞品当日源码）

12 个仓库经 codeload tarball 全量落地到 `temp/competitor-repos/<owner>__<name>/`。
以下为对 §1 论断的当日源码复核，含**两处对既有记录的修正**。

### 6.1 元数据快照（api.github.com）

| 仓库 | stars | issues | 默认分支 | HEAD | 本地文件数 |
|------|------:|-------:|---------|------|----------:|
| openclaw/openclaw | 384150 | 7029 | main | `bfd6f2ef` | 42297 |
| obra/superpowers | 261279 | 322 | main | `3dcbd5c4` | 179 |
| affaan-m/ecc | 233440 | 101 | main | `56d9302f` | 3349 |
| NousResearch/hermes-agent | 220626 | 25407 | main | `d9f1043c` | 7460 |
| code-yeongyu/oh-my-openagent | 66606 | 920 | **dev** | `b17479d0` | 6254 |
| mem0ai/mem0 | 61698 | 718 | main | `b357a5a1` | 1817 |
| getzep/graphiti | 29205 | 438 | main | `448e57c5` | 352 |
| volcengine/OpenViking | 27234 | 412 | main | `b62a4d2c` | 3550 |
| HKUDS/OpenHarness | 15042 | 72 | main | `9b2efd79` | 484 |
| TencentCloud/TencentDB-Agent-Memory | 9282 | 344 | main | `45e6e80a` | 173 |
| kunchenguid/gnhf | 3400 | 22 | main | `1d067392` | 116 |
| letta-ai/letta-code | 2895 | 164 | main | `2f20500b` | 1716 |

`oh-my-openagent` 默认分支是 **`dev` 而非 `main`** —— 引用该仓库的历史结论需核对分支。

### 6.2 论断复核（确认）

| 结论 | 当日源码证据 | 判定 |
|------|-------------|------|
| F10 TencentDB 按 contextWindow 比例算压缩阈值 | `src/offload/hooks/after-tool-call.ts:259-260,413-414,432-433,521-524`；`before-prompt-build.ts:149-152,219-221`；默认值 `src/config.ts:489-490`（0.5 / 0.85） | **确认**，且实现位置已从 07-01 记录的 `l3.ts:217-222` 迁到 hooks 层 |
| F12 Graphiti bi-temporal | `graphiti_core/edges.py`、`nodes.py`、`graph_queries.py` 及 4 个 driver 的 `entity_edge_ops.py` / `episode_node_ops.py` 均带 `valid_at`/`invalid_at`（25+ 文件） | **确认** |
| F11 OpenViking per-agent 命名空间 | `bot/vikingbot/openviking_mount/ov_server.py:408` — `self._namespace_policy["isolate_user_scope_by_agent"] and self.agent_id`；配置 `bot/vikingbot/config/schema.py:590,598`（`recall_exp_first_round_only=False`、`exp_recall_limit=5`） | **确认**，且比 07-01 记录更精确：隔离由**具名策略开关** `isolate_user_scope_by_agent` 控制，不是硬编码 |
| F9 Hermes curator 闭环 | `agent/curator.py`、`curator_backup.py`、`background_review.py`、`learning_mutations.py`、`turn_finalizer.py`、`skill_utils.py`；桌面端 `apps/desktop/src/app/learning/archive-skill-confirm-dialog.tsx` | **确认**，且新增事实：archive 动作有**人工确认 UI**，不是全自动 |

### 6.3 修正一：oh-my-openagent **确实有** `default_mode`

07-01 报告记录"全读 `config/schema.ts:1-342` 确认无 `default_mode` 字段"，
`competitor-watchlist.json:258` 的 `crossCuttingTrends` 据此记了一条"已否决的误读"。
当日源码推翻该记录：

- `assets/oh-my-opencode.schema.json:6907` — `"default_mode"` 为正式 schema 字段
- `docs/reference/features.md:397,400` — `default_mode.goal`；`default_mode.ralph_loop` 已更名为 `default_mode.goal`
- `CHANGELOG.md:167` — "`default_mode` config auto-activates ultrawork and ralph loop without typing commands. (PR #4190)"

且该仓库已做包分层重构，配置 schema 从根 `src/config/` 迁至
`packages/omo-opencode/src/config/schema/`（36 个 schema 文件）。
07-01 读的路径已不存在 —— 无论当时是否读错，**该条 watchlist 记录现在是错的，需删除或改写**。

### 6.4 修正二：F6 的对照证据比原先更强

原判断"oh-my-openagent 用关键词正则路由"成立，且当日源码给出更硬的证据：

- `packages/omo-opencode/src/hooks/keyword-detector/detector.ts:59-70` — `KEYWORD_DETECTORS.map(({pattern}) => pattern.test(textWithoutCode))`，纯正则布尔，**无置信度、无打分**
- 三文件共 382 行（`constants.ts` 54 / `detector.ts` 80 / `hook.ts` 248）
- `AGENTS.md:381` 自述："**IntentGate (`keyword-detector`)**: classifies user intent (`ultrawork`/`ulw`, `search`, `analyze`, `team`)"

值得注意：`README.md:218` 对外宣称 IntentGate "Analyzes true user intent before classifying or acting"，
但实现就是 `pattern.test()`。**连主打"真实意图分析"的竞品，落地也只是正则。**
这不改变 F6 的结论（我们要加 confidence），但说明这条不是"抄谁"，是没有现成答案可抄。

### 6.5 新增观察：OpenClaw 正在**放松** skill 审批门

`openclaw/CHANGELOG.md:21`（最新条目）：

> Skill Workshop approvals: run agent-initiated apply, reject, and quarantine actions
> **without an additional approval prompt by default** while preserving
> `skills.workshop.approvalPolicy: "pending"` as an opt-in approval gate.

即：agent 自主的 apply / reject / quarantine **默认不再二次确认**，人工审批降级为 opt-in。
对照 `CHANGELOG.md:2680`（更早）"unanswered requests stay safely pending" —— 方向明确反转。

对我们的意义：这是**反向信号，不跟进**。他们能放松的前提是 quarantine 机制健全
（`CHANGELOG.md:10747` "quarantines unsafe proposals"）。我们目前 F8 尚未接内容扫描，
在没有隔离兜底的情况下放松审批只会放大风险。**F8 应先落地，审批策略不动。**

