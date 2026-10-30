# ADR 0004：subagent 上下文新鲜度——**先测量、只声明、用 brief 让 fork 无害**，送达面只有一个 owner

日期：2026-10-30
状态：已确认（codex `fork` 已由 AIOS 自己的探针证实；实现落点与偏差见 `./docs/plans/2026-10-30-verified-fresh-context-v1.md`）
序号说明：本仓库存在**两套 ADR 序号**（`docs/adr/` 与 `docs/architecture/adr/`，两侧都有 0004）。本文件沿用 `grill` / `rex-requirements` 的字面约定落 `docs/adr/`，即 `0004` 这个号在两处指向两份文档——该收敛是 `./docs/adr/0003-repo-junk-cleanup-tiering.md` 已记的待决项，本 ADR 不擅自合并两套序号。

## 背景

外部（Matt Pocock 的 skills 线）把「fresh context, not a fork」当成工程理由：子 agent 若继承父对话，会继承父的**错误前提**，并且拿不到自己该看的上下文。我们仓库的实情是两个派发面待遇不同：

| 观测 | 实测值 | 判定依据 |
|---|---|---|
| AIOS 自己 spawn 的 worker | 结构性新鲜：一次性 prompt、无 `--resume` | `scripts/lib/foundation/ctx-agent-core/entry/one-shot.mjs` 各 handler + `scripts/lib/execution/harness/solo/solo-profiles.mjs:17` 的 `RESERVED_FLAGS` |
| 宿主原生 Task/Agent 工具 | **零约束**：无声明、无测量、卡片里没这句话 | `config/host-capabilities.json` 原本没有 `subagents` 块 |
| 「Codex 默认 fork」 | 此前**只是外部断言**，本仓零证据 | 探针后：`fork`（子代复述父 nonce），见 plan §6 |
| 提示词散文能不能当投递面 | **不能**：10 个 shared partial 里只有 1 个真进模型 | patch `fs.readFileSync` 记 loader 实读 + 在产物文本里查证 H2 标题落点；唯一 reader `readSharedMarkdownParts` 零调用者 |
| 角色卡合同 | 19/19 源文件带过期 Output contract，与 enforced schema 互斥 | `scripts/lib/foundation/agents/source-tree.mjs:51` 的 marker 要求标题存在，故不能整段删 |
| 宿主 headless 输出 | banner 会**回显 prompt（含 nonce）**，把真实测量判成 `answer-not-json` | codex 探针首跑误判；修复走「只认带契约字段的平衡 JSON 对象」 |

隐藏约束（差点踩的那条）：`config/standards.json:3` 的 `directoryEntries: 8`。`scripts/lib/execution/harness/team/` 已顶格，把新模块塞进去会当场 violation；已安装运行时 `~/.rexcil/aios` 与仓库代码不同步，运行时实测必须以**行为**（谁真被读）为准，不能以仓库源码为准。

## 决策

1. **未测即 `unknown`，且 `unknown` 是合法结论**。外部断言不得写成事实；能力声明只接受带 nonce 的可复跑证据。证据里必带 `evidenceRef`，这样「依据是什么」有答案而不是靠人回忆。
2. **`verdicts = fork / fresh / unknown / not-applicable`，`surface = host-tool / none` 是两个正交维度**。「上游没有该工具」与「没测」必须分开——否则一个已声明无 subagent 的客户端会永久把 `aios status` 拖在 `incomplete`，那是假红灯。行为测量 TTL 30 天，`surface: none` 的声明 TTL 180 天（版本漂移另判 `stale`）。
3. **「宿主自述没有该工具」只用来印证已有声明，不用来制造新事实**：先前声明 `surface: none` 且宿主自述无子 agent → `not-applicable`，confidence `direct`；未声明者即使自述「没派子 agent」也只是 `unknown / no-subagent-spawned`。**模型自述不得凭空造出能力缺失的事实。**
4. **诊断式复测（`--spawn`）不得被故障降级**：非零退出、provider 断连、网络错误一律保持原声明、把失败写进诊断证据，**只有 `fork`/`fresh` 正面证据才更新声明**。`--record-answer` 的 operator 回填是**重新分类已捕获的答案**，不是用散文造新结论。
5. **让 fork 无害，而不是禁止 fork**：brief 自包含（objective / owned paths / acceptance / refs），缺事实就回 `blocked`。做完这步，「宿主会不会 fork」从正确性问题降级成性能问题。禁止性散文是 NO-GO——它依赖一个我们观测不到的事件。
6. **送达面只有一个 owner，且由门守护**：worker 侧 = 生成的角色卡三条条款；派发侧 = `## Dispatch Brief`（`scripts/lib/execution/harness/team/subagent-runtime/context/prompts.mjs:145` 构造、`:154` 注入）。**`client-sources/native-base/shared/partials/` 不是投递机制**：新增/改动 partial 必须在 `scripts/tests/foundation/native/native-partial-delivery.test.mjs:26` 的 disposition 表显式表态（`composed` 或 `documentation-only` + 理由），标 `composed` 的必须被探针证明真被读到且落到产物。这条防的具体错误是「写了文件就以为送达了」。
7. **结构化宿主输出是唯一可信答案源**：宿主进入 JSON 模式时，事件流里的 `assistantText` 才是子代回答；原始流含 prompt 回显，直接判会假 `fork`。分类器只认带契约字段（`subagentSpawned`）的平衡 JSON 对象。
8. **`subagents` 是旁挂块，不是 `capabilities[]` 的一根轴**：`CAPABILITY_AXES` 是固定 token 集，加轴会改总分、逼着同批改报告，`scorecard --check` 必漂移。旁挂块零漂移。
9. **报告不默认红**：`unknown` → `not probed yet`（warn 级措辞）、`fork` → 在 `status` 里单列 `fork=1(codex)` 并附「靠 Brief + 卡片兜住」的处置。这条检查**不进** `pretest:scripts` 默认红集合。
10. **旧合同在渲染期剥离，不在源文件整段删**：`scripts/lib/foundation/agents/source-tree.mjs:51` 要求 `## Output contract` 标题存在；删标题即破既有断言。做法是源文件留一行指向 schema 的指针，渲染时剥离任何残留旧字段表，保证卡片里**恰好一份**合同。
11. **版本事实要有单一 owner**：`clientVersion` 走平台 spawn spec（Windows 下 `pi` 是 npm shim，裸 `spawnSync('pi', ...)` 取不到版本），取不到版本的声明会让版本漂移判定永久失效。
12. **未复现的失败不加重试**：`cli-usage-error-exit` 在并发下红过一次（61329ms，撞该 harness 的 60000ms per-spawn 上限），隔离与混跑均绿、全量重跑绿；没有可复现证据就不给测试加静默重试——静默重试会掩盖基础设施抖动。
13. **卡片必须把门禁实际执行的约束说出来**：只列字段名不算合同。D3 实测：同一个模型在只给 Required fields 时分别交回 `schemaVersion: "1.0"` 与 `"1.0.0"`，而 schema 要的是 `integer const 1`——空白会话里的 worker 无法从字段名推出常量。约束行现在住在单一 owner（`HANDOFF_CONTRACT_CONSTRAINTS`），内容严格来自 schema 已声明事实，并由 `handoff-contract.test.mjs` 直接读 schema 文件反校（schema 改了而卡片文字没跟着就红）。复跑：`schemaErrors 2 → 0`。推论：**模型偏离未被声明的约束，是投递方的不完整，不是模型的不听话**；补声明比加校验器或重试便宜得多。
14. **语义判定不得靠散文正则**（本轮自己踩到并删掉）：一度用 `doesNotMatch(/parent conversation/i)` 判“有没有回头索要父上下文”——模型说「未使用父上下文」会一样命中，这是本仓 AGENTS.md 禁止的关键词猜测。新鲜度只能测客观可判事实：上一会话才可能见过的 nonce 与文件名不得出现在本会话输出里。

## 后果

- **正向**：`fork` 在本仓第一次有了自己产出的证据（codex）与可核的复跑路径；`aios status` 从「一句 unknown」变成「`measured=2/10 fork=1(codex) unknown=8`」这种**带处置的**措辞；卡片合同从 19 份冲突收敛到 38/38 唯一；派发载荷里第一次出现「你不继承父对话」这条硬约束；新增两道会红的门（送达门 + banner 假阳性护栏），且都做过双向突变验证。
- **顺带挖出并修掉两个既有缺陷（与新鲜度无关，由本次排查暴露）**：① `scripts/lib/clients/native/distribution/emitters/codex-config.mjs:115` 的 `stripManagedTables` 按**文本拼写**枚举表名，认不出同一路径的两种 TOML 拼法（`"C:\\..."` vs `'C:\...'`），会把重复键写进 `~/.codex/config.toml`，实测使 `codex` 全线 exit 1（`duplicate key`）；② 同函数在遇到无管理标记的遗留 AIOS 表时进入剥离态并一路吞到 `MANAGED_END`，**人类手写的后续配置会在下次 sync 时被删掉**（数据丢失级）。两者均带回归测试。
- **本轮新行为尚未发布**：卡片约束行是用户可见的投递面变化，按 `scripts/lib/diagnostics/release-impact.mjs` 不能当 patch 发（那等于把用户可见行为写进 changelog 却不升 MINOR）；v6.16.0 tag 不追改，这堆工作进入下一个 minor（附带代价：minor 需四语发布帖）。发布决策属于人，本 ADR 只记录约束。
- **仍然存在的负向 / 未解**：
  - ~~**完成定义 D3「空窗口可用」未达成**~~ → **已达成（2026-10-30 真跑）**：三次真实空白会话——P1 只凭 brief 交出符合 `agent-handoff.schema.json` 的 handoff（它真的跑工具去数了行数），P2 缺事实时回 `blocked` 并点名缺失项、未编造答案，P3 上一会话的 nonce 不会出现在下一会话。**这一跑的本领在于拓出了静态测试永远看不见的 §9.1 缺陷**（合同没声明 const/类型/枚举）；`blank-brief-session.test.mjs` 默认 skip，只在 `AIOS_VFC1_D3_LIVE=1` 下花钱。
  - 8/10 客户端仍是 `unknown`（每个一次真实模型调用）。
  - **9 个 partial 的内容无处投递**：其中确有该下发的纪律，但唯一的共享投递面是 `AGENTS.md`，而它是多客户端同一份文件——把 subagent 细则写进去会泄漏给没有 subagent 工具的客户端。投递面设计是独立决策，本 ADR 只钉住「不得靠写文件冒充投递」。
  - 已安装运行时 `~/.rexcil/aios` 仍带 `stripManagedTables` 缺陷——实测该副本（mtime 10-27 13:01）里没有本次修复的标志（无 `decodeTomlKey` / `sameProjectTable`），`codex-config.mjs:133` 仍是旧的文本拼写比对 `tableNames.some((t) => name === t || ...)`，所以下次 native install 会重新制造 duplicate key；需一次 install/update 才对齐（用户级写操作，需授权）。
  - 门禁状态：`duplicateLines` 本轮实测 **measured=602 / blocking=602**（AGENTS.md 里记录的 2026-10-22 数字 596 已过时），本项**没有**把它接成默认红；新增的 `reverseDependencies` 实测 `measured=0 blocking=0`，与本项无关。本次新增的 4 个文件（送达门、两份文档、CONTEXT.md 追加段）在这三条规则上**均为 0 贡献**。
- **可复用为通用原则的三条**：① 语义判断（算不算 fork/done/stuck）必须是模型在结构化输出里自报的字段，代码只核对客观事实；② 担保是协议（退出码 + 证据在盘 + 预算未破），不是提示词礼貌；③ 「写了文档」与「模型读到了」是两个事实，只有后者能当投递证据。
