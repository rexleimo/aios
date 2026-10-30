# Verified Fresh Context V1（VFC-1）· 测量—声明—注入—简报—钉住

日期：2026-10-30 · Capability：`software.design.architecture` → `software.implement.bounded` · Stage：design → implement → verify
Provider：`rex-design` / `rex-implement` · 决策记录见 `./docs/adr/0004-subagent-context-freshness.md`
来源：本文件是会话内 HTML 草稿（`temp/`，被 `/.gitignore:20` 覆盖，非仓库产物）的正式迁档，并**按实现结果修订**——草稿里被实测推翻的部分在本文件里以「草稿 vs 实际」标注，不做粉饰。

## 0. 一句话

把「不依赖父对话」变成被测量、被声明、被注入、被测试钉住的任务合同。宿主自己的 subagent 工具可能继承父对话，自包含 brief 能降低依赖，不能提供上下文隔离或保证消除旧前提。运行时能力修正见 `./docs/plans/2026-10-30-vfc-runtime-capability.md`：允许查授权来源后再 blocked，任务输入不被有损摘要替换。

## 1. 用户目标

1. **前提必须是自己测出来的**：「Codex 默认 fork」原本只是外部博客断言。本项要求 AIOS 产出可复跑的证据，未测一律 `unknown`。
2. **两个派发面差别对待**：AIOS 自己 spawn 的 worker 是结构性新鲜（保持不动）；宿主原生 Task/Agent 工具在控制面之外，需要先测量再声明。
3. **约束写进 AIOS 生成的产物**（角色卡、派发载荷），而不是写进散文提示词——散文面到不到模型，本项实测过，见 §7。
4. **降低父对话依赖**：worker 凭 brief、已投递任务上下文、上游 handoff 与授权工具查证后开工；必需事实仍不可得才回 `blocked`，不索要父对话 transcript。
5. **不制造假绿灯**：`unknown` 不默认红、不填默认值，报告面必须把 `fork` 与 `measured` 分开显示。

## 2. 明确非目标（草稿里的三条 NO-GO 全部保留）

- **不**做运行时「检测并阻断宿主 fork」：该事件不可观测，实现必然退化成关键词猜测。
- **不**把 `contextMode` 做成评分 axis，也不给 `unknown` 填默认值 `fresh`。`CAPABILITY_AXES` 是固定 token 集，加一轴会改总分并逼着同批改报告（旁挂块零漂移）。
- **不**新开 memory backend、不新开第二个 prompt 组装器、不承诺「完全控制宿主 subagent」这一 L3 能力。
- **不**改 `config/standards.json` 的目录预算来给新模块让路（顶格时先拆目录，见 §5 W3）。

## 3. 现状锁定（复用点，全部实测）

| 能力 | 单一 owner | 证据 |
|---|---|---|
| AIOS 起的 worker 必然新鲜 | `scripts/lib/foundation/ctx-agent-core/entry/one-shot.mjs` | 各 handler 只传一次性 prompt；pi 分支 `scripts/lib/foundation/ctx-agent-core/entry/one-shot.mjs:102` 显式带 `--no-session` |
| 保留 flag 被封锁 | `scripts/lib/execution/harness/solo/solo-profiles.mjs:17` | `RESERVED_FLAGS`，命中即拒（`:53` 处执行判定） |
| 唯一 `--resume` 是人工显式续跑 | `scripts/lib/execution/lifecycle/run/work/options.mjs:17` | `resumeSessionId` 来自入参，非模型自决 |
| 上下文靠指针不靠历史 | `scripts/lib/execution/harness/team/subagent-runtime/context/prompts.mjs` | ref/hash 措辞 + `:145` 起注入 brief |
| 跨 job 记忆是磁盘事实 | `scripts/lib/foundation/agents/emitters/shared.mjs` | 卡片只带合同，不带会话 |
| 证据信封已存在 | `scripts/lib/foundation/agents/smoke.mjs` | `.aios/agents/smoke/<id>.json` + provenance |
| 声明漂移已有门 | `scripts/client-capability-scorecard.mjs` | `--check` 比对报告与 config（本轮实测 ok，13 clients） |

## 4. 缺口清单

草稿的三个缺口 + 实现中新暴露的两个。

| # | 缺口 | 文件级证据 | 状态 |
|---|---|---|---|
| G1 | 宿主侧派发纪律里没有任何一条管上下文继承 | `client-sources/native-base/shared/partials/clients/agent-routing.md` | 已补文字，**但见 §7：该 partial 不投递** |
| G2 | 生成的角色卡里没有 fresh/brief 合同，且多个 emitter 手抄同一份 Output Contract | `scripts/lib/foundation/agents/emitters/shared.mjs:22` `:28` `:35` | 已修，单一 owner |
| G3 | 19 张角色卡源文件各带一份**过期**输出合同（`agentId/blockers/evidenceRefs`），与 enforced schema 互斥 | `scripts/lib/foundation/agents/source-tree.mjs:51` | 已修（渲染期剥离 + 源文件留指针） |
| G4 | 探针分类器会被宿主 banner 骗（真实测量被记成 `answer-not-json`） | `scripts/lib/foundation/clients/reporting/capability-report/subagent-context.mjs:68` `:112` | 已修 + 反向护栏测试 |
| G5 | 能力声明的 `subagents` 块缺 `surface` 维度 → 「上游没有该工具」与「没测」混成同一个 `unknown` | `scripts/lib/foundation/clients/reporting/capability-report/subagent-context.mjs:18` | 已修（`not-applicable` + `surface`） |

## 5. 四个切片 · 实际落地

顺序 W1 → W2 → W3 → W4，每片可独立验收与回滚。

### W1 · 测量与声明（草稿 0.5 人日）

- 接口：`buildSubagentContextProbe` / `classifyProbeAnswer` / `readSubagentContextDeclaration` / `writeSubagentContextEvidence`（均在 `scripts/lib/foundation/clients/reporting/capability-report/subagent-context.mjs`）。
- 判定：子代能复述父会话里的 `AIOS-NONCE-<16 hex>` → `fork`；明确表示拿不到 → `fresh`；缺失/拒绝/超时/不匹配 → `unknown` **且必带 reason**。
- 证据：`.aios/agents/subagent-context/<client>.json`，kind `aios.subagent-context-probe.v1`，含 nonce hash、answer hash、client 版本、exit code、宿主结构化事实摘要。answer 落盘有上限 `scripts/lib/foundation/clients/reporting/capability-report/subagent-context.mjs:28`（`ANSWER_STORE_LIMIT = 4000`）——实测一次 codex 原始 stdout 2406 字符、pi JSON 流 208782 字符，不设上限会把证据文件灌成日志。
- CLI：`aios agents probe --client <id> [--json] [--dry-run] [--nonce] [--record-answer <path|text>] [--spawn]`，入口 `scripts/lib/execution/lifecycle/fleet/agents.mjs:87`。
- **草稿 vs 实际（新增两条）**：
  1. `--spawn`：对已声明 `surface: none` 的客户端做诊断式复测，证据写 `<client>.spawn.json`，**只有 `fork`/`fresh` 正面证据才更新声明**——否则一次模型/网络故障会把已有结论抹成 `unknown`。
  2. 宿主 JSON 事件流成为可信答案源：`scripts/lib/clients/pi/json-stream.mjs:55` 解析 `--mode json`，`assistantText` 才是答案。事件流会**回显 prompt（nonce 就在里面）**，拿原始流判定会把 `fresh` 误判成 `fork`。

### W2 · 注入点单一 owner（草稿 0.5 人日）

- `scripts/lib/foundation/agents/emitters/shared.mjs:22` 三条固定条款 + `:28` 渲染器 + `:35` `stripOutputContractSection`。
- **草稿说「删掉 19 份过期段」，实际不能整段删**：`scripts/lib/foundation/agents/source-tree.mjs:51` 的 `REQUIRED_PROMPT_MARKERS` 要求 `## Output contract` 标题存在。做法改为：源文件里把过期字段表换成一行指向 schema 的指针，渲染期剥离任何残留旧表 → 卡片里**恰好一份**合同。
- 实测到盘：`.codex/agents` + `.claude/agents` 共 **38/38** 张卡命中三条条款、合同唯一、无 legacy 字段泄漏。

### W3 · Dispatch Brief v1（草稿 1.5 人日）

- 纯函数 + 唯一渲染器：`scripts/lib/foundation/agents/brief/index.mjs:46`（`buildDispatchBrief`）、`:76`（`validateDispatchBrief`）、`:16`（`DISPATCH_BRIEF_FORBIDDEN_DEFAULTS`）；`scripts/lib/foundation/agents/brief/render.mjs:15`（`## Dispatch Brief`）。
- schema：`scripts/lib/tooling/specs/registry/dispatch-brief.schema.v1.json`。
- 接线：`scripts/lib/execution/harness/team/subagent-runtime/context/prompts.mjs:145` 构造、`:154` 渲染注入；**没有新增第二个 prompt 组装器**。
- 目录预算：`config/standards.json:3` 的 `directoryEntries: 8`。`scripts/lib/execution/harness/team/` 已顶格，因此 brief 落 `foundation/agents/brief/`；`foundation/agents/` 加完 `brief/` 后正好 8，**再塞必须先拆目录**。

### W4 · 钉住，不开默认红（草稿 0.5 人日）

- `aios status` 的 `subagent-context` 行把 `fork` 单列：`scripts/lib/execution/lifecycle/fleet/status.mjs:54` 产出 `forkClientIds`，`:162` 渲染。当前实测输出：

  ```
  subagent-context=incomplete measured=2/10 fork=1(codex) unknown=8
  ```

- **不进** `pretest:scripts` 默认红集合。本仓 `duplicateLines` 的教训（见 `./docs/adr/0003-repo-junk-cleanup-tiering.md`）：没有处置计划的默认红门最后只会被静音。
- **草稿的致命错误**：草稿假设「往 partial 加纪律 = 下发给客户端」。§7 的实测把它推翻了；因此 W4 的钉住改为「卡片 + Brief 两个 live 面」+ 一道**送达门**。

## 6. 测量结果（截至本档）

| client | verdict | confidence | 依据 |
|---|---|---|---|
| **codex** | **fork** | indirect | 真跑 `--spawn` 前的 headless 探针；子代复述父 nonce。banner 里留有 `session id 01a18ae5-a4a8-7882-988d-60e1e98bdb53`、`model gpt-5.6-terra` 可核 |
| **pi** | not-applicable | direct | `surface: none`（上游无 subagent 工具）+ 宿主自述搜过网关 `agent`/`spawn` 零命中；clientVersion 1.4.0 |
| 其余 8 个 | unknown | indirect | 未测。`unknown` 是合法结论，不是失败 |

派生结论：**「宿主会不会 fork」已有本仓复述父 nonce 的正面观测**。自包含 brief 是重要的任务输入合同，但不能据此宣称隔离或 fork 无害；模型没有输出旧 nonce 也不能证明它看不到旧上下文。

## 7. 交付面事实（本轮最重要的更正）

行为级实测（patch `fs.readFileSync` 记 loader 真读了谁 → 真跑 `composeNativeMarkdown` 全客户端 + `syncCanonicalAgents` → 用每个 partial 的 H2 标题在产物文本里查证落点）：

| partial | 是否进入模型可见面 |
|---|---|
| `core/core-instructions.md` | ✅ 10/10 客户端 |
| 其余 9 个（`clients/agent-routing.md`、`clients/browser-mcp.md`、`clients/client-capabilities.md`、`clients/team-provider.md`、`core/contextdb.md`、`core/codemap.md`、`core/harness.md`、`ops/model-router.md`、`ops/token-discipline.md`） | ❌ 从未被读 |

`readSharedMarkdownParts`（`scripts/lib/clients/native/distribution/emitters/shared.mjs:105`）**零调用者**；仓库代码与已安装运行时 `~/.rexcil/aios` 结论一致（`ALWAYS_LOADED_PARTIALS` 同样只有一项）。

真正送达模型的只有两处：① 角色卡三条条款（38/38 命中）；② 每次派发的 `## Dispatch Brief`。

> 度量教训：先用「basename 全库 grep」数出「7 个孤儿」是**错的**——它把 docs/blog 的提及算成引用，真数是 9。文档提到一次 ≠ 投递一次。

送达门：`scripts/tests/foundation/native/native-partial-delivery.test.mjs:26` 起维护显式 `PARTIAL_DISPOSITIONS`（`composed` 或 `documentation-only: <理由>`），并双向校验：标 `composed` 必须真被读到且落到产物；标 `documentation-only` **不得**被读到（投递面变了而没人改声明就红）。门已双向突变验证（谎称 composed → 红；谎称 documentation-only → 红；恢复 → 3/3 绿）。

## 8. 验证证据（真实命令输出，非勾选框）

| 命令 | 结果 |
|---|---|
| `node scripts/run-affected-tests.mjs --concurrency 2` | 2480 tests / 2471 pass / **0 fail** / 9 skipped（mode=full，254/254） |
| `node --test scripts/tests/foundation/subagent-context/*.test.mjs` | 47 tests / 44 pass / **0 fail** / 3 skipped（probe 13 + declaration 9 + runner 10 + dispatch-brief 8 + handoff-contract 4 + blank-brief-session 3）。注：**不要用目录形式**——`node --test <dir>` 在本机 Node 24.16 对任何目录都是 `MODULE_NOT_FOUND`（已对照 `scripts/tests/foundation/native/` 证实），本仓套件是靠文件列表跑的 |
| `node --test scripts/tests/foundation/subagent-context/handoff-contract.test.mjs` | 4/4：字段清单 == `schema.required`，每条约束行都能回指 schema 声明的 const/enum/type/additionalProperties |
| `AIOS_VFC1_D3_LIVE=1 node --test .../blank-brief-session.test.mjs` | **3/3**（P1 14.9s / P2 17.4s / P3 15.3s，均为真实 `pi -p --no-session --mode json` 调用）；不带该变量时 `3 skip`，CI 不会意外花配额 |
| D3 修正前后（同一脚本、同一模型） | `schemaErrors 2 → 0`：前两次交回 `schemaVersion: "1.0"` / `"1.0.0"`，补上约束行后两次都是整数 `1`；其余行为不变（P1 completed / P2 blocked）。证据：`.aios/artifacts/d3-blank-brief-2026-10-30T06-36-28-732Z.json` 与 `...T06-39-25-483Z.json`（含 prompt/answer SHA256、model、usage、工具调用数）|
| `node --test scripts/tests/foundation/native/native-partial-delivery.test.mjs` | 3/3（+ 突变两轮均红） |
| `node --test scripts/tests/foundation/native/codex-config.test.mjs` | 11/11 |
| `node --test scripts/tests/execution/team/agents-sync.test.mjs` | 13/13 |
| `node scripts/check-syntax.mjs` | 1296 files / 0 failures |
| `node scripts/client-capability-scorecard.mjs --check` | ok（13 clients 无漂移） |
| `node scripts/aios.mjs standards --root . --rule directoryEntries` | blocking=0 |
| `node scripts/check-doc-citations.mjs` | 新增 21 条引用**全部有效**；全仓 invalid 335 → 335（不增），refs 542 → 563 |
| `node scripts/aios.mjs standards --root . --rule duplicateLines` | 本轮 4 个新文件贡献 0；全仓实测 measured=602 blocking=602（存量，未接默认红） |
| `node scripts/aios.mjs standards --root . --rule duplicateLines`（D3 本轮逐文件） | `emitters/shared.mjs: 17`、`blank-brief-session.test.mjs: 12`、`handoff-contract.test.mjs: 0`。shared.mjs 那 17 行**不是本轮引入的**：自己的 6 行窗口扇扫定位到 partner 为 `scripts/lib/execution/harness/team/orchestrator-agents.mjs`，命中窗口起于 80/81 行——即 `normalizeTools` + `escapeYamlString` 这两段早已存在的 helper（80–92），本轮 diff 只动了 `renderHandoffContract` 与新常量。blank-brief 的 12 行用自己的扇扫**无法归因到任何 tracked partner（测量脚本在 `temp/` 下，不受版本控制，而这条规则只枚举 `git ls-files`）→ 按该规则自己声明的 limits 归入待处置，将来走 `exempt` + 理由，不拿它冒充干净 |
| `node scripts/aios.mjs standards --root . --rule fileLines` | `measured=1462 overBudget=78 baseline=71 blocking=7`（本轮新增文件 86/169/131 行，均未超）——7 个 blocker 全部是存量，本轮未碰（已逐个比对 staged 清单） |
| `node scripts/aios.mjs standards --root . --rule directoryEntries` | `blocking=0`；`scripts/tests/foundation/subagent-context/` 现在 6 项（预算 8） |
| `node scripts/aios.mjs standards --root . --rule reverseDependencies` | measured=0 blocking=0 |
| `node scripts/aios.mjs status` | `subagent-context=incomplete measured=2/10 fork=1(codex) unknown=8` |
| `codex mcp list` | 修复 `~/.codex/config.toml` 前 exit 1（`duplicate key`），后 exit 0 |

一次未复现的失败：`scripts/tests/execution/aios-cli/cli-usage-error-exit.test.mjs` 在并发 2 全量里红过一次（61329ms，该 harness 的 per-spawn 上限是 60000ms），隔离 18–24s 两次绿、并发 3 混跑绿、再跑全量绿。**未复现不加重试**——同 `duplicateLines` 纪律。

## 9. 完成定义（四条硬证据 + 达成状态）

| # | 条件 | 状态 |
|---|---|---|
| D1 | 证据可复跑：`<client>.json` 含 nonce hash / answer hash / client 版本 / measuredAt | ✅ codex、pi 两份在盘 |
| D2 | 注入只此一处：每张卡片含三条条款、只含一份 Output Contract | ✅ 38/38 实测 |
| D3 | **空窗口可用**：hermetic 空白会话只凭 brief 交出符合 schema 的 handoff | ✅ **已真跑达成**（2026-10-30，三次真实调用，`AIOS_VFC1_D3_LIVE=1` 下 3/3）：P1 只凭 brief 读完工作区文件交出合规 handoff（status=completed，`schemaVersion` 整数 1）；P2 缺事实时**真的去搜了工作区**、按合同回 `blocked` 并点名缺失项，未编造；P3 上一会话才可能见过的 nonce 不会出现在下一会话。**这一跑拓出一个真缺陷：见 §9.1** |
| D4 | 门全绿：guidance 断言 + scorecard + standards 无漂移 | ✅（并新增送达门） |

D3 已不再是缺口。但它跑出了一个只有真跑才能看见的缺陷，值得单独记：

### 9.1 D3 拓出的缺陷：合同没声明门禁实际执行的约束

| 阶段 | 事实 |
|---|---|
| 第一次跑（合同只列字段名） | 两次都交出 **`schemaVersion: "1.0"` / `"1.0.0"`**，而 `agent-handoff.schema.json` 要的是 `integer const 1` → `schemaErrors=2` |
| 根因 | `renderHandoffContract` 只印 Required fields + schema 路径，**没印类型/常量/枚举**。空白会话里的 worker 无法从字段名推出 `1` 而不是 `"1.0"`，只能猜 |
| 修法 | 单一 owner `emitters/shared.mjs` 新增 `HANDOFF_CONTRACT_CONSTRAINTS`，内容严格来自 schema 已声明的事实，并由 `handoff-contract.test.mjs` **直接读 schema 文件反校**（schema 改了而卡片文字没跟着改就红） |
| 复跑 | 同一个脚本、同一个模型：**`schemaErrors=2 → 0`**，`schemaVersion` 两次都是整数 `1`；其余行为不变（P1 completed / P2 blocked） |

所以这不是「模型不听话」，是我们的投递面把可判定信息弄丢了。**静态测试永远拓不出这一类缺陷**：它只在真实空白会话里暴露——这正是 D3 存在的理由。

附带一个方法纠正：P3 最初我用 `doesNotMatch(/parent conversation/i)` 去判“有没有回头索要父上下文”，这是被本仓 AGENTS.md 明确禁止的**散文关键词猜语义**（模型说“没有使用父上下文”也会命中）。已删掉，换成只判客观事实：上一会话的 nonce 与文件名不得出现在本会话输出里。

证据耐久性提醒：`.aios/artifacts/` 是 gitignore 的，上面那两份原始 JSON 只对当时本机可验。**可重复的持久路径是已提交的 `AIOS_VFC1_D3_LIVE=1 node --test …/blank-brief-session.test.mjs`**（它自己重建临时工作区、自己跑真实会话），不是那两份 JSON。

## 10. 风险与回滚

| 风险 | 触发信号 | 处置 |
|---|---|---|
| headless 起不了 subagent | `unknown` + `host-invocation-failed` / `host-model-error` | 已设计 operator 回填（`--record-answer`）；`unknown` 合法不阻塞 |
| 宿主版本改变默认行为 | `measuredAt` 过期 → `stale` | 复跑探针，不改代码。行为测量 TTL 30 天，`not-applicable` 声明 180 天 |
| 卡片合同改动破坏快照断言 | `agents-sync` 红 | 改断言而非保留互相冲突的两份合同 |
| banner 噪声骗过判定 | 假 `fork` / 假 `answer-not-json` | 只认带契约字段的平衡 JSON 对象；测试钉住「回显 nonce 不算 fork」 |
| Windows shim 取不到版本 → 版本漂移判定永久失效 | 证据里 `clientVersion: null` | 版本探测走平台 spawn spec（单一 owner），不再裸 `spawnSync` |
| 目录预算顶格 | `standards` violation | 先拆目录，不改预算 |

回滚：W1–W4 均为增量文件 + 旁挂声明块；删除 `subagent-context.mjs` / `brief/` / 两处测试并还原 `host-capabilities.json` 的 `subagents` 键即可，`scorecard --check` 会当场抓出残留漂移。

## 11. 本次变更触碰的运行时状态（需授权项，均已备份）

| 位置 | 动作 | 备份 |
|---|---|---|
| `~/.codex/config.toml` | 删除重复表头 3 行（同一 TOML 键的两种拼写），修 codex 全局不可用 | `config.toml.bak-20261030-dupkey` |
| `~/.pi/agent/settings.json` + `models.json` | `defaultProvider` 由死端点 magpie（本地 127.0.0.1 端口 3425 无监听）切到 `bailian/qwen3.8-flash` | `*.bak-20261030-before-bailian` |

两者都在家目录、非仓库产物；代码侧缺陷（`stripManagedTables` 按文本拼写枚举、遗留表吞掉后续人类配置）已由 `scripts/lib/clients/native/distribution/emitters/codex-config.mjs:115` 的修复覆盖。**已安装副本实测仍是旧代码**：`~/.rexcil/aios/.../codex-config.mjs`（mtime 10-27 13:01）里无 `decodeTomlKey` / `sameProjectTable` 标志，其 `:133` 仍是 `tableNames.some((t) => name === t || ...)` 的拼写比对，需走 update/install 才生效。

## 12. 剩余工作项

1. ~~**D3 空窗口验证**~~ **已完成**：`scripts/tests/foundation/subagent-context/blank-brief-session.test.mjs`（P1/P2/P3，默认 skip，`AIOS_VFC1_D3_LIVE=1` 才跑）+ `handoff-contract.test.mjs`（卡片约束 ↔ schema 文件）。过程中拓出并修好了 §9.1 那个合同缺约束的缺陷。
1b. **新行为尚未发布**：本轮改动（卡片现在声明类型/枚举/const）是用户可见的投递面行为，按 `versioning-by-impact` 不能当 patch 发；它进入下一个 minor（需四语发布帖），v6.16.0 tag 不追改。
2. **其余 8 个客户端探针**：每个一次真实模型调用。
3. **修复送达**：9 个 `documentation-only` partial 里若有该投递的内容，必须先定投递面（AGENTS.md 是多客户端共享文件，能力相关细则写进去会泄漏给无 subagent 工具的客户端）。
4. **ADR 序号收敛**：`docs/adr/`（本篇 0004）与 `docs/architecture/adr/`（已有 0004）并存同号不同文，`./docs/adr/0003-repo-junk-cleanup-tiering.md` 已记为该问题待决。
5. **已安装运行时代码对齐**：`~/.rexcil/aios` 仍带 `stripManagedTables` 缺陷（实测旧拼写比对在该副本的 codex-config.mjs 第 133 行），下次 native install 会重新制造 duplicate key。

已登记领域术语（非待办）：`fork（子代继承父对话）` 与 `送达面（delivery surface）` 已写入 `CONTEXT.md` 的「子代理上下文新鲜度」段，每条带实测值与裁决指向。

## 13. 发布记录（v6.16.0）与两条度量教训

已发布：`v6.16.0`（annotated tag 指向发布提交），CHANGELOG + 四语发布博文（en/zh/ja/ko）+ 再生成的 `docs-site/llms.txt`。`release-stable.sh --dry-run` 打印的三条命令已逐条执行，`git ls-remote` 确认远端 tag 存在。

发布门拓到两个只有 `npm run test:scripts` 才能发现的问题（`run-affected-tests` 两个都没拦住）：

| 发现 | 真实原因 | 处置 |
|---|---|---|
| `directoryEntries` 变 blocking=1 | `scripts/tests/foundation/native` 因我新增的 3 个测试到 11 条。**这条规则只枚举已跟踪路径**：我在它们还是 untracked 时跑了三次 `--rule directoryEntries` 读到 blocking=0，那三次测量全是盲的 | 4 个 VFC-1 套件归入 `scripts/tests/foundation/subagent-context/`（4 条），`foundation` 回到 10 个子项、blocking=0 |
| `rex-agent-provider.test.mjs` 断言失败 | 它钉的是卡片手写的那句 `Return one JSON handoff object only`，而 W2 把它换成了生成式合同——**断言在保护已被移走的 prose** | 改成钉实际投递形状：`required-handoff: {"schemaVersion":1,…}` 存在、卡片指向生成段、旧 `Required fields:` 表不再出现、提示词里 `## Output contract` **恰好一份** |
| 韩文博文带一个 U+30FB 日文中点 | `site-text-integrity.test.mjs` 把跨语种文字当污染拦住（这条门替我发现了自己写错语言的风险） | 换逗号；7/7 绿 |

教训（入库而非口头）：
1. **门禁的作测量围不等于仓库的工作集**——对「目录条目预算」这类规则，未跟踪文件在测量中不可见，所以“新文件不超预算”这个结论必须**先提交再测**。
2. **`npm run test:affected` / `test:regression` 不是发布门**。AGENTS.md 已经写了 tier 3 是 CI 跑的那条，本轮的实际代价（一个已推送的 commit 带红）就是没按字面执行的代价。已推的四个 commit 在 CI 上是红的；`033a3d6a` 修好了，分支当前绿。
3. 发布前证据：`bash scripts/release-stable.sh --dry-run` 全链**通过**（退出 0，并打印出 tag 命令），`release-preflight.sh --tag v6.16.0` 日志 3697 行留在 `.aios/artifacts/`：累加日志内全部汇总块 = **3027 tests / 3006 pass / 0 fail / 21 skipped**，`not ok` 行数 0、`✖` 行数 0；其中 regression 层 `files=257, concurrency=4, elapsed_ms=476438`（此前单独跑的全量是 2484 tests / 2475 pass / 0 fail / 9 skipped，数字不同因为累加范围不同——引用时得说清是哪一层）。另：`check-site-sync` 输出与 6.15.1 基线逐字相同（24 条存量翻译缺失，两边都是 exit 1），即本次发布**没新增一条门错误**；`generate-llms-txt.mjs --check` ok；`check-doc-citations` 全仓 invalid 保持 335。
