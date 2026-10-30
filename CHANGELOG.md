# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.










## [6.16.1] - 2026-10-30

- Fixed: dispatched workers no longer stop early. The brief and role card said a fact missing from the brief means `blocked`, and that
the reply must be JSON-only; with tool access and delivered context present, both instructions ended the task before investigation.
The brief now allows workspace and tool discovery within existing permissions and only then returns `blocked` with the missing item and
what was checked. `ownedPathPrefixes` is stated as the **edit** boundary it actually is (it is enforced against `filesTouched`), so
related dependency reads stay allowed.
- Fixed: review, diagnosis and verification work can complete without editing files. The runtime prompt no longer infers no-op from
"no code changes needed" and no longer forbids task-relevant checks for read-only phases; it completes the assigned objective and
acceptance checks, and returns no-op only when evidence shows the work is already satisfied.
- Fixed: the final handoff contract has one owner again. Both the subagent and GroupChat system prompts reuse the shared renderer
instead of keeping private copies, a card's legacy output section is stripped, and JSON-only is scoped to the final reply after tool use.
- Fixed (data loss path): GroupChat replaced the entire executable prompt **and** the model routing with a lossy pre-send compact
packet whenever no `executionContext` was supplied. Measured on a 4,706-character task prompt, the 1,897-character packet kept a raw
ref but dropped a concrete task condition, so a worker had to recall its own task text to learn the requirement. GroupChat now keeps
the full prompt and routing; pre-send and post-receive compression remain as redacted observation and storage.
- Docs: ADR 0004 no longer claims a self-contained brief makes a host fork harmless. It reduces dependence on the parent conversation;
it does not isolate a forked host session, and the absence of a prior nonce in output only proves absence in output.
- Also included from the same unreleased window: generated agent cards now state the constraints the gate actually enforces
(`schemaVersion` is the integer 1, the status enum, array-of-string fields, no extra fields), pinned against the schema file itself.

## [6.16.0] - 2026-10-30

- Added: **Verified Fresh Context V1** — "fresh context, not a fork" is now measured, declared, injected and test-pinned instead of
  incidental. `aios agents probe --client <id>` runs a nonce probe (the parent embeds `AIOS-NONCE-<16 hex>` and asks the child to repeat it):
  a repeated nonce is `fork`, an explicit inability is `fresh`, everything ambiguous stays `unknown` **with a reason** — `unknown` is a legal
  verdict and is never defaulted to `fresh`. Measured on real hosts: codex = `fork` (confidence indirect; the stored banner still carries session
  `01a18ae5-a4a8-7882-988d-60e1e98bdb53`), pi = `not-applicable` (declared `surface: none`, corroborated at confidence `direct`), 8 clients still
  unmeasured. `--dry-run` prints what would run without spending a model call; `--record-answer` re-classifies an already-captured answer; `--spawn`
  re-measures a declared-absent surface into `<client>.spawn.json` and only positive `fork`/`fresh` evidence may change a declaration, so a provider
  or network failure can never erase a measured conclusion.
- Added: `subagents` as a side-car block in `config/host-capabilities.json` (contextMode, `surface`, measuredAt, evidenceRef, reason) rather than a
  `capabilities[]` axis — `CAPABILITY_AXES` is a fixed token set, and a new axis would move scorecard totals and force a report rewrite. Freshness is
  TTL-based (30 days for behaviour, 180 days for a declared absent surface) plus client-version drift, and stored evidence refs are root-relative so a
  clone on another machine can still resolve them; the shipped config is now gated on that shape.
- Added: the Dispatch Brief. One pure builder and one renderer produce a self-contained brief (objective, owned paths, acceptance, refs, forbidden
  defaults) that the existing prompt assembler injects — no second assembler. This is what makes a host fork harmless rather than prohibited: a worker
  missing a fact returns `blocked` instead of leaning on inherited context.
- Changed: subagent context clauses have a single owner in `emitters/shared.mjs`, so every emitter's hand-copied Output Contract is gone and 38/38
  generated role cards carry exactly one contract plus the three clauses (no parent-conversation inheritance, work from the brief, missing fact ⇒
  `blocked`). The 19 stale field tables in role sources contradicted the enforced schema; the legacy table is stripped at render time because
  `REQUIRED_PROMPT_MARKERS` still requires the `## Output contract` heading to exist.
- Added: a delivery gate that measures instead of assuming. Instrumenting `fs.readFileSync` while running the real projection proved that of ten shared
  native partials exactly one (`core/core-instructions.md`) is ever read — `readSharedMarkdownParts` has no call sites in the repo or the installed
  runtime. `native-partial-delivery.test.mjs` now requires an explicit `composed` / `documentation-only` disposition for every partial and proves
  `composed` ones by behaviour (read *and* visible in the emitted surface) while proving `documentation-only` ones are **not** read; both directions
  were verified by lying to the gate.
- Changed: `aios status` reports the measured split (`subagent-context=incomplete measured=2/10 fork=1(codex) unknown=8`) with `fork` called out as the
  risk case instead of absorbed into a neutral "measured" count, and this stays out of `blockers` — the repo's own `duplicateLines` history shows a
  red-by-default gate without a disposition plan gets muted, not fixed.
- Fixed: `stripManagedTables` compared TOML table names by **textual spelling**, so one path written two ways (`"C:\\Users\\..."` and `'C:\Users\...'`)
  produced duplicate `[projects.*]` keys and made every codex invocation exit 1 with `duplicate key`. The same function used a single flag for "inside a
  managed block", which let an unmarked legacy AIOS table swallow human-written config until `MANAGED_END` — a latent data-loss path. Table identity is
  now a decoded key compared with `path.resolve()`, undecodable keys are preserved, and block state is split in two.
- Fixed: the probe classifier recorded a real host answer as `answer-not-json` because it sliced from the first `{` to the last `}` and the host banner's
  echoed prompt broke it; it now scans balanced JSON objects and accepts only one carrying `subagentSpawned`, with an echoed nonce explicitly **not**
  evidence of a fork. Pi's `--mode json` event stream echoes the prompt too (nonce included), so verdicts read only the parsed `assistantText`.
- Added: pi one-shot turns run `-p --no-session --mode json` with a pure parser for the JSONL event stream (model, stopReason, errorMessage, retries,
  usage, tool calls, assistant text); `output` stays text for existing callers and the structured facts ride alongside. `--no-session` is pinned at the
  handler that owns pi's argv — without it every worker call persisted a session file and left a `--continue` target behind.
- Fixed: version capture goes through the platform spawn spec; `spawnSync('pi', …)` cannot read a version through the Windows npm shim, which had been
  silently disabling version-drift detection permanently.
- Evidence: full regression 2484 tests / 2475 pass / 0 fail / 9 skipped; probe + declaration + runner suites 28/28 (a 688-line suite split into three
  single-responsibility files, all inside the 400-line budget); native family plus suite wiring 104/104; `check-syntax` 1296 files / 0 failures;
  `scorecard --check` ok across 13 clients with zero drift; `directoryEntries` blocking=0; `check-doc-citations` invalid 335 → 335 while refs 542 → 563.
- Honest gap: the plan's completion criterion D3 — a hermetic blank session handed only the brief producing a schema-valid handoff — has **not** been run;
  current tests prove structural availability only. Eight clients remain unmeasured, and nine partials carry discipline text with no delivery surface
  (writing it into the shared `AGENTS.md` would leak subagent instructions to clients that have no subagent tool).

## [6.15.1] - 2026-10-27

- Fixed: bare `aios` (no arguments) crashed with `ReferenceError: getRootHelpText is not defined` instead of printing
  the root help. The dispatch barrel lost the import when the 425-line dispatch file was split for the directory
  budget, and the only path that exercises the non-TTY interactive branch has no test, so the crash shipped in both
  the repo and the release install. The branch now pins its contract in a real-subprocess test: warn line, root help,
  exit 1, never a ReferenceError.

## [6.15.0] - 2026-10-27

- CLI unknown-option exit code contract: a misspelled or undeclared flag on `aios …` now exits non-zero instead of
  running the command anyway. The root parser (`top-level.mjs`) stopped opting into `allowUnknownOption(true)`, five
  parsers that swallowed Commander errors into a `{ mode: 'help' }` exit-0 result (`init`, `plan`, `dream`, `hud`, and
  the shared catch) now rethrow them tagged `error.usage`, and `isUsageError` matches Commander's lowercase message
  (it looked for `Unknown option`, so a rejected flag used to print a stack trace as if it were an internal fault).
- **Migration**: `aios uninstall` no longer removes anything without `--yes`; without it the command prints a preview
  (`would remove components: shell,skills`, `scope=global client=all`) and exits 0. Any script that relied on the old
  unconditional removal must add `--yes`. This closes the defect where `aios uninstall --<typo>` was rejected by the
  parser and then ran the destructive defaults anyway.
- `setup --yes/--retry/--force` and `orchestrate --force` are now declared in the parser that dispatches to handlers
  reading `options.yes` / `options.force`. Before this they existed only in the help surface, so the flag was accepted,
  dropped, and the handler silently saw `undefined`.
- 12 commands whose parsers still declare `allowUnknownOption(true)` are recorded in one place —
  `scripts/lib/tooling/cli/commander/passthrough.mjs::UNKNOWN_OPTION_STRICTNESS_DEFERRED` — and the new guard test
  fails if a name goes stale there, so the ledger can only shrink.
- New guard suite `scripts/tests/execution/aios-setup/cli-usage-error-exit.test.mjs` (9 tests, real subprocess exit
  codes, sandboxed `HOME`/`USERPROFILE`): positive control that the CLI seam is alive, a matrix over the 32
  `COMMAND_SPECS` commands, uninstall refusal before and inside, and a no-stack-leak assertion.
- `plan-single-ledger.test.mjs` N3b was tightened, not relaxed: it could only assert a weak property because the
  "unknown input degrades into a read-only view" seam was open, and this release closes it.

## [6.14.5] - 2026-10-27

- fix: memo pin status shows the real lane size and backlog, so a growing pinned lane is no longer invisible

## [6.14.4] - 2026-10-27

- fix: pinned memory serves its newest entries - a checkpoint that lands outside the served window is now reported as not served

## [6.14.3] - 2026-10-27

### Fixed

- **`harness resume --dry-run` 不再“被接受、静默失效、然后照旧调真 provider”**。发现方式不是读代码，
  而是执行上一轮刚写进 help 的那句承诺：在沙箱里跑 `aios harness resume --session X --dry-run`，
  实测 **111 秒**且 `stopRequested` 被清成 `false`。`--dry-run` 这个词的全部含义就是“不要调模型”，
  而 harness 子命令开着 `allowUnknownOption(true)` —— 一个**静默失效的成本闸门比直接报错危险得多**：
  用户以为自己站在省钱一侧，实际站在付费一侧。修两层：解析层现在**声明并映射** `--dry-run`
  （`RESUME_OPTIONS` + resume 分支 + `createDefaultHarnessResumeOptions` 默认 `false`）；
  命令层现在 resume 也读 `options.dryRun`，并与 run **共用同一个渲染器** `reportHarnessDryRun`
  （同事实两个写者会各排一遍版、各说一套话），且**只读不写**：不清 stop 标志、不动 worktree，
  报告完即返回，会话停在它本来的位置。

### Added

- **一条穿过解析层的测试**。上一轮的 dry-run 用例是直接注入 `options` 的，因此它只能证明
  “命令函数正确”，证明不了“用户实际打的这条命令正确”——而缺陷正好在被绕过的那一层。新增
  `infra/command/command-dry-run.mjs` 穿过 `parseHarnessArgs` 断言 `resume --dry-run` 能抵达命令层，
  并带一条反例（不带 `--dry-run` 时仍必须是 `false`）；该模块已登记进 `phase-structure` 的预算表
  （29 行 / 预算 40），而不是留成一个没人管长度的文件。

### Docs

- `aios harness --help` 的 `--dry-run` 作用域从 `(run)` 改为 `(run/resume)`，并在 Notes 里写明它
  两个子命令上都只读、不会改 stop 标志也不会动 worktree（新增 2 条断言钉住）。

### Internals

- RED → GREEN 全部由真实执行得到：修复前注入的绊线 `executeTurn` 被调用，断言失败
  “the word dry-run must never reach a provider”；把 HEAD 版 `commands.mjs` 换回去同样红。
  修复后 `harness-runtime` 50/50（含 2 条新 parser 用例）、`help-surface-renders` 5/5。
- 真 CLI 对比：修复前 111s 且 `stopRequested` 由 `true` 变 `false`；修复后 **0s**、输出
  `Harness Dry-Run: WARN`、`stopRequested` **保持** `true`。
- `check-syntax` 1284/0；`fileLines blocking=6`（存量未变）、`directoryEntries blocking=0`。
  沙箱残留按安全门规矩逐个显式命名删除（变量派生的递归删除会被拦，这是预期行为而不是阻碍）。

### Notes

- 本轮同时发布 v6.14.1（关闭不验证的 Activation 旁路 + B1 主张证伪）与 v6.14.2（补 stop 语义文档 +
  B3 裁定为“差距不存在”）。自查 backlog 六项至此全部处置完毕，每一项都带了当场取的回执。

## [6.14.2] - 2026-10-27

### Docs

- **`aios harness --help` 新增 Notes 段，说清一次 stop 到底何时生效**。这不是新功能，是把一个已经存在、
  但只能读代码才知道的行为写到用户能看到的地方：`harness stop` **不杀进程**，只写 `control.json` 标志；
  循环只在迭代顶部读它，所以**当前 turn 会跑完才停**，操作者可见的停止上限是 `--turn-timeout-ms`
  （默认 1800000 = 30 分钟）。`docs-site/solo-harness.md` 的 Stop 一节补同一段事实。
- **自查 backlog 收尾：板上 B3（“Stop 应当暂停整条 run，而不是取消并收尾”）经实测后差距不存在**。
  五条证据：stop 无 signal/kill 路径；`loop.mjs:143` 只在迭代顶部读标志，turn 内不检查（恰好就是对手那句
  “hold where they are”）；`resume` 早已是文档化后继动作（清标志 + 恢复保留的 worktree + 从 lastIteration 继续）；
  记录本来就分得清 `reason=control-stop-request` 与 `failureClass=stop-requested`；重复收尾不重复产记忆候选
  （`candidateId` 与落盘路径都按 sessionId 定，`atomicWriteText` 覆盖写）。这使本窗口内“被实测推翻的对手差距”
  累计两条：B1（栅栏其实已在校验层）与 B3（暂停语义其实已经成立）。

### Internals

- **裁定不加 `paused` 状态，理由写进报告而不只是提交信息**：`reconcile.mjs:23` 把 `stopped` 当终结态是**对的**
  （它判的是进程死活，不是操作者意图）；新状态要穿过 status / watchdog / CLI / hooks / 记忆闭合 五张面，
  而它想携带的信息 `reason` 字段已经携带了——同一个事实两个写者，正是 v6.14.1 里 B6 结构守卫在拦的形状。
- 唯一真实残留是**停止延迟**，已归为另一个问题（边界协作 vs 中途硬砍），需 provider 传输层配合（`rpc` 才谈得上
  中途让路，one-shot 只能等）。裁定不混入本次发布，也不隐式开成工作项，只在报告与 help 里标清。
- 带日期的报告继续只用追加：看板补记 2.5 节里 B3 那一格从“仍未裁定”改为带证据的裁定，**原 2026-10-26 的 B3 卡片
  逐字节校验保持不动**，本次 diff 的删除行只落在当天自己新增的那一节。help 文本新增 4 条停止语义断言
  （`help-surface-renders`）。
- 验证证据：`help-surface-renders` 5/5；`npm run test:affected` 因动态 import 自动升级为全量 248/248 文件、
  tests=2407 pass=2398 fail=0 skipped=9；`node scripts/check-syntax.mjs` checked=1283 failures=0；看板 HTML 标签平衡。

## [6.14.1] - 2026-10-27

### Fixed

- **适配层不再存在“不验证也能把证据写进 Activation”的入口**。`advanceAiosCapabilityActivation`
  直接把证据交给内核的 `advanceActivation`，而栅栏（receipt 存在性、回执命令与声明场景命令
  逐字段相等、按 kind 强制退出码极性）只实施在 `validateCommandEvidence` 里。实测全仓
  **零调用方、零文档引用、零测试引用**，所以保留它没有兼容代价，只会多出一个比合规写者更弱的
  第二写者。现在它抛错并说明该走哪条路径（仅删名字会让可能的动态引用静默失效，报错路碑不会）。

### Added

- **一条拦“下次又长出绕过入口”的结构守卫**（`rex-import-boundaries.test.mjs` B6）：host 生产文件
  不得直接调 `advanceActivation`；同时**落盘且推进**的文件必须同文件调用 `validateCommandEvidence`。
  规则对准落盘边界而不是转发层：适配器的 `advanceAiosSoftwareWorkflow` 只是一层薄转发（验证在它的
  调用方做），第一版把“同文件必须验证”强加到转发层上会误报——这个形状错误是被自己的守卫纠出来的。
  守卫自带正向控制（必须真的存在一个“既落盘又同文件验证”的写者），所以空集合不算干净。

### Docs

- **自查 backlog 最后一项 B1 被证伪，而错在报告不在代码**。板上写的是 P0「文档已承诺，代码未实现：
  证据记录只有 `{kind, refs}`」——该结论来自只读 `rex-harness/src/domain/evidence.mjs` 一个文件。
  三层查证后的事实：栅栏在**校验层**（`validate-command-evidence.mjs` 拒绝未知 receipt、id 不一致、
  命令不匹配、退出码极性不符）、在**写入口顺序**（`rex-activation-store.mjs` 先验证再推进再落盘，
  并钉住 Provider 命令必须匹配存储的 activation 命令）、在**测试担保**（两个子模块测试直接断言这些
  拒绝，连 `stdoutSha256` 必须是 64 位十六进制都钉了）。哈希封套也真实存在于
  `training-certification.mjs`，带篡改检测。即栅栏是**校验期实施**而非记录期盖章。
- 带日期的报告不回写历史：竞争窗口板只在 B1 卡片里加一节明确标注的「裁定（2026-10-27 补）」，
  详情放在页尾新增 section；该文件的 `git diff` 是 **34 insertions / 0 deletions**。

### Internals

- 两条“守卫是不是装饰”的变异实验：删掉 store 里的验证器 → B6 红；把 `advanceActivation(` 接回适配器
  → B6 红。两次实验后文件均恢复到预期状态（store 与 HEAD 无差异）。
- 验证证据：`rex/runtime` 套件 50/50；`npm run test:affected` 120/248 文件、tests=1334、pass=1331、
  fail=0；`node scripts/check-syntax.mjs` checked=1283 failures=0；看板 HTML 标签平衡。

## [6.14.0] - 2026-10-27

### Added

- **生命周期钩子现在有预算上限**。此前 `invokeLifecycleHook` 是无界 `await`：一个永不 resolve 的订阅者就能把整条 run 挂住，而日记里只多出一条 `started` 事件——既不失败、也不成功，只是不再出现。“任务是不是卡住了”于是完全依赖人盯。现在钩子等待受 `AbortController` 约束，超预算即取消并记为 `timed-out`。预算按 phase 声明（turn-start / before-continuity-commit / iteration-start 60s，turn-complete 120s，session-end 300s，default 120s），用 `AIOS_SOLO_HOOK_TIMEOUT_MS=<ms>` 覆盖，`off` 退回旧的无界等待。
  - 默认值故意给到典型耗时的 1–2 个数量级：这是**首次引入**的闸门，漏报比误杀便宜——把一个慢但正常的 run 因预算过紧而中止，等于新造了一个故障。

### Changed

- **等待结论从两个词变成四个**：旧的 `ok | error` 现在分为 `ok | cancelled | timed-out | failed`。这三个语义在旧记录里是同一个字：钩子返回错误（真失败）、操作者取消（不是失败）、等到了预算（停滞）。只有 `failed` 计入运行失败，只有 `timed-out` 计入停滞，`cancelled` 两者都不计。因此一个慢订阅者不会再像旧实现那样把一条正常 run 推进退避。
- **中止记录不再替被调用方编造原因**。旧写法是 `consecutiveInfraFailures > 0 ? 'runtime-error' : 'no-progress'`，那是拿计数器反推语义：一条反复 `tool-error` / `safety-gate` 失败的 run 会被贴上“无进展”的标签，而那一行恰好是恢复判断要读的内容。现在一律沿用本轮真上报的 `failureClass`，自报缺席就写 `none`，不替它补一个猜的原因。停滞中止走独立阈值（`AIOS_SOLO_STALL_ABORT_AFTER`，默认 3）并单独措辞，因为它的重试不会让卡死的订阅者变好。

### Fixed

- **归因现在能落盘**。`solo-journal` 的事件白名单不含 `component / verdict / budgetMs / elapsedMs`，于是“是哪个钩子、多大预算、实际等了多久”只在内存里成立，写进日记就被静默丢弃。补上后由真实写入器测试钉住，防止未来再退回去。
- **迟到的 resolve 不再改写已经记下的结论**。钩子被取消后若自己跑完了，旧写法会把结果漏回 loop（看起来像一次真成功）。现在结论一经记入即为终态。

### Internals

- `loop.mjs` 保持在 596 行的 fileLines 基线内：新逻辑拆成 `solo-runtime/support/stall.mjs`（纯策略）、`loop/hook-waits.mjs`（停滞记账）、`loop/abort-records.mjs`（两种放弃各自的措辞与证据），而不是抬高一个 shrink-only 的棘轮。破门的正确反应是拆责任，不是改预算。
- 新增测试已登记进 `scripts/test-suites.json`（该清单是显式文件列表，不是 glob 发现）：`hook-stall-guard`（含策略、真写入器、预算覆盖）与 `hook-stall-loop`（整条 run 后果）。后者带一条反例守卫：把 HEAD 版本的 `loop.mjs` 换回去，两条均失败（turns=5而非停滞闸介入、类别被洗成 runtime-error），证明断言不是空转。
- 验证证据：`npm run test:regression` files=248, tests=2407, pass=2398, fail=0, skipped=9；`node scripts/check-syntax.mjs` checked=1283 failures=0；`directoryEntries blocking=0`，`fileLines blocking=6`（存量，无新增）。

## [6.13.0] - 2026-10-27

### Added

- **refs 回收第一次有了自动调用方**（B5）。`pruneInterceptionRefs` 自诞生起只有一个入口：人敲 `aios refs prune`。九周里没人敲过——本仓存储实测积压 **49,209 个文件 / 161.7MB，其中 30,861 条超过 30 天**，与 2026-09-09 那次审计记录的数字**逐位相同**，这就是"没有调用方"的物证。现在它挂在 `session close` 钩子上，与 `runAutodreamPhaseB` 同一个约定：包在 try/catch 里，**绝不让 close 失败**。
- 新增配置面（全部向后兼容，默认不删数据）：`AIOS_REFS_SWEEP` = `off` | 默认 `dry-run` | `enforce`；`AIOS_REFS_SWEEP_KEEP_DAYS`（默认 30）；`AIOS_REFS_SWEEP_BUDGET_MS`（默认 1500）；`AIOS_REFS_SWEEP_COOLDOWN_HOURS`（默认 6）。`aios refs prune --dry-run` 新增同名开关。
- **默认只报告，不删除**——与仓内既有先例同形：`AIOS_AUTODREAM_AUTO` 默认关、dream 只出 preview、governed apply 才是人工动作。新增的自动变异不能默认动数据；真删需要显式 `enforce`，或人敲 `prune`（那是明确意图，固定 enforce）。

### Changed

- **保留期的事实来源从"文件 mtime"改为"每条 ref 自己申报的 `created_at` + `ttl_days`"**。旧实现两条都不读：`ttl_days` 写进 meta 却没有任何代码消费它，等于声明了一个从未生效的契约；而 mtime 会被复制/同步/迁移重置，一次复制就能让一条证据永远年轻、再也清不掉。现在 meta 优先，缺 `ttl_days` 才退回全局默认，缺 `created_at` 才退回 mtime，并且回执里**如实标注用了哪个较弱的钟**（`clockBasis`）。真实存储实测：18,525 对里 `meta.created_at/meta.ttl_days` 命中 18,524、`fs.mtime/default.keepDays` 命中 1——兜底分支在生产数据上被真走过，不只是测试里。
- **当前会话整体保护**。旧 prune 会连活动会话的 ref 一起删；AIOS 的长任务是可恢复的，30 天前的 ref 可能正是本次要引用的证据，删掉等于在会话中途斩断召回链。真实 dry-run 回执：`sessionsProtected: 1`。
- `.raw` 与 `.meta.json` 改为**成对处置**，不再逐文件独立判定——否则会留下"列表里有 ref 却没有原文"的孤儿 meta，或"grep 命中却无法解释来源"的孤儿 raw。

### Fixed

- **回收器差点成为一个静默的 no-op**：`decideRefRetention` 调 `refAgeMs` 时漏传 `nowMs`，于是 `ageMs = NaN`、`NaN > keepMs` 永远为 false、**什么都不删**，而回执里的 `clock` 字段照样显示"读到了 created_at"，表面完全正常。这条由新写的测试自己抓出来（RED 阶段 4 条 I/O 测试连带 3 条策略测试同时红），补了一条回归守卫：漏传 `nowMs` 必须退化到真实时间，而不是退化到"干净"。
- 帮助文案里写反引号把 template literal 提前关掉，模块当场 `SyntaxError`（`Unexpected identifier 'created_at'`）。我当时只对**新建文件**跑了 `node --check`，没覆盖"只改了文案的文件"——于是要等某个恰好 spawn CLI 的测试才炸。**改文案等于改代码**：新增 `scripts/check-syntax.mjs`（并发 8，本仓 `scripts/` 实测 1278 文件 / 16.9s；串行 72.7s 太贵故不进回归）并接进 `pretest:scripts`，同时新增 `help-surface-renders` 套件把每个帮助主题真渲染一遍（覆盖"能解析 / 分支命中 / 产出确实是 help"三类缺陷）。探针目录验证它能抓到同一处反引号断串并 exit 1。

### Verified

- `refs-sweep` 15/15（策略 + 真 I/O 夹具 + 冷却/截断语义 + close 钩子调用方）；`help-surface-renders` 4/4；套件登记守卫 W1–W6 10/10（两个新文件都已登记，regression 244 → **246**）。
- 成本画像实测：冷却命中 **1ms**、`AIOS_REFS_SWEEP=off` **0ms**、真有积压时 ≤ **1501ms**（预算上界，截断不计完成、下一轮继续清）。
- 相邻套件 47/47；`npm run test:regression` files=**246**, tests 2390 / pass 2381 / **fail 0** / skipped 9（506.1s；较上轮 +56s 属已知 484s 枢纽文件 `aios-harness.test.mjs` 抖动——我新增的两个套件单独实测总耗时 **147ms**）。
- CLI 真实贯通：`aios refs prune --dry-run` → `Would prune 5658 refs, freed 39523.6KB (scanned 6700, 1501ms, basis: meta.created_at/meta.ttl_days=6700, truncated by budget)`。
- `directoryEntries` blocking=0；`fileLines` 6 条 FAIL 全部落在我未触碰的文件上（`git status` 可证），属存量且 CI 未接该规则。


## [6.12.1] - 2026-10-27

### Fixed

- **租约不再把"PID 被人复用"读成"会话还活着"**（B2）。`reconcile` 原先用 `isProcessAlive(owner.pid)` 判活，而 `kill(pid,0)` 只能证明"这个号当前有人用"，证明不了"还是当初那个进程"。崩溃对账因此可以无限期把一个已被回收的 pid 当成活owner，再也不会为那个会话写中断记录，恢复被永久挡住。现在判定分成四种事实：`self/ours`（尊重租约）、`recycled`（PID 已复用 → 继续对账，原因 `lease-owner-pid-recycled`）、`unprovable`（探不到启动时间 → 尊重租约并在 skipped 里写明原因）、`dead`。关键设计：不追求精确身份匹配——进程必然早于它写下认领时刻启动，于是"**内核启动时间 > 认领时刻 + 容差**"就等价于复用，一次有界比较即可。Linux 走 `/proc/<pid>/stat` 第 22 字段（从**最后一个** `)` 之后切分，因为 comm 可以带空格与括号），macOS 走 `ps -o lstart=`，Windows 走 `Get-Process StartTime`；未知平台与探测失败一律 `unprovable`，**不把"证明不了"洗成"已证明死亡"**，与 `check-release-submodule` 的失败关闭同一形。
- **`EPERM` 不再被判成进程已死**（同一条判断曾有 4 个 owner 且语义互相矛盾）。`solo-journal/content/owner.mjs` 在 `process.kill` 抛任何错误时都返回 false，而 `spawn.mjs` 与 `watchdog/signals.mjs` 把 EPERM 当活——EPERM 的含义是"进程存在，只是无权发信号"。旧语义会给一个**活着的**会话写出假崩溃记录。现在判活逻辑单一 owner 落在 `foundation/platform/process/identity.mjs`，`signals.mjs` 改为复用（导出面不变），未知错误码保守按活处理：看门狗宁可不回收也不误杀工人。`spawn.mjs` 那份私有实现保留，因为它是**轮询热路径**（每 `TREE_POLL_INTERVAL_MS` 一次），而 `identity.mjs` 为了走统一的命令解析已经从 `spawn.mjs` 引入 `getCommandSpawnSpec`：反向再引一次就是同目录循环依赖。——**这里刻意不引入跨模块耦合，也不为消灭一份重复而把 PowerShell 探测拖进轮询**。
- **`parseInt` 截断 pid 被堵住**：原 `normalizePid` 把 `1.5` 解析成 `1`，于是一个小数就能拿真实进程 1 去探测并被判"活着"。现在数字入参必须是整数，字符串入参必须匹配 `^[1-9]\d*$`，非法值不发信号。这条是**新测试自己抓出来的**，不是评审看出来的。
- **`scripts/release-version.sh` 不再把新条目插错位置**。它对"最新在上"的本仓 CHANGELOG 系统性错位：只认 `## [Unreleased]`，而该锚点要么不存在（走 END 分支把新条目**追加到文件最底部**）、要么残留在中段（插到 5.x 附近）。两种形态今天各咬过一次——第二次就是本次 6.12.1 生成时，条目落到了第 1829 行。现在以"第一个 `## [` 标题"为锚：有 Unreleased 插在其下，没有则插在当前最新条目之上；END 分支只留给尚无任何条目的空文件。

### Added

- `verifyOwnerLease`（`solo-journal/content/owner.mjs`）：把租约身份判定做成可注入的显式结论，`reconcile` 的中断记录新增 `ownerIdentity{verdict,pid,detail}` 字段——恢复证据必须能让人复核"凭什么说这不是原进程"，而不必重跑一次相同探测。

## [6.12.0] - 2026-10-26

### Added

- **`rex-debug` 把调试断言变成可核对的证据**（`rex-harness/skill-sources/rex-debug/SKILL.md`）：阶段 1 要求先建立能跑的反馈回路再谈假设——10 种构造手段按速度排序、四条回路判据（red-capable / deterministic / fast / agent-runnable）、每条回路断言附执行回执；非确定性问题必须先给复现率契约并把复现率提上去，回路建不出来即 `blocked`。阶段 2 要求先写 3-5 个按可能性排序、可证伪的假设（各自说明"观察到什么就排除它"），每个探针必须写明它区分哪些假设，性能问题先记录基线测量。阶段 3 把"不存在正确的测试接缝"当作一条发现退回阶段 2，而不是硬挤一个能变红的测试；假红必须与 pristine 基线 diff 后才可判定。阶段 4 统一 `[DEBUG-xxxx]` 标记、抓取前脱敏、清理写进变更摘要。阶段 5 确认的假设随修复一起进 commit/PR，供下一位读者证伪。交付状态词表不变（新判据是自报证据字段，不是新状态）。

### Changed

- `rex-harness` 子模块升级到 **v0.13.0**（`rex-debug` 的反馈回路/假设排序/执行回执契约，与 `skill-sources/**` 整树 LF 钉；已发布产物 `rex-harness-0.13.0.tar.gz`）。宿主 gitlink 指向该 tag 剥皮后的 release 提交 `59d1e70`，符合“宿主 release 不得骑在未打 tag 的内核提交上”。

### Fixed

- **`typesafe-ai` 投影漂移不再伪装成所有权问题**：真因是一个**未被 `.gitattributes` 钉住的 `LICENSE`**——blob 是 1068B/LF，而 `core.autocrlf=true` 的 Windows 检出把它刷成 1089B/CRLF（21 行 × 1 字节 = 21B 差额精确吻合，去 `\r` 后逐字节相同）；`SKILL.md` 从未漂移。收养分支要求"忽略 meta 后快照全等"，21 字节就让 `.agents/skills/typesafe-ai`（被 `.claude`/`.grok`/`.hermes` 以符号链接复用）永远拿不到 `.aios-skill-sync.json`，而检查器的期望快照含 meta 文件，于是恒判 `[drift]`。本轮走既有声明通道收下它：`config/skills-sync-manifest.json` 增 `legacyReplaceable=.agents/skills/typesafe-ai`，sync 两次收敛（替换物理目录 → 三个别名 surface 迁移），9 个 surface 全部带标记，`check-skills-sync.mjs` exit 0。同批隔离 8 个 `*aios-crlf-bak*` 孤儿备份（逐个证明去 CR 后与现役内容同哈希）。
  > 更正：本条目初稿把因归给"2026-09-18 行尾事故漏改的文件"，该归因已被实测推翻——`git checkout-index` 在本机对 `LICENSE` 直接产出 1089B/CRLF，对已钉 `eol=lf` 的 `SKILL.md` 产出纯 LF；那批 `.bak` 是另一次人工归一化的残留，只处了 `SKILL.md`。
- **从源头消除这一类漂移：`skill-sources/**` 整树钉 LF**（父仓 + rex-harness 两份 `.gitattributes`，`text=auto eol=lf` 保留 git 二进制自检）。原规则只钉了 `skill-sources/**/SKILL.md`，所以**任何非 md 资产一检出就是 CRLF**：实测两仓 128 个资产中 68 个磁盘为 CRLF（含训练用的 16 个 `evals.json`），而两仓 blob **全为纯 LF**（0/87、0/41）。刷新工作树后 CRLF 计数归 0 且 `git status -- skill-sources` 为空——即**未改动一个字节提交内容**，只纠正本地检出。
- **投影相等判定不再被行尾卡住，也不再只报路径**：`hashFileBuffer` 在**摘要输入层**归一 CRLF→LF（latin1 字节保真，因此二进制除 CRLF 序列外仍逐项可区分；调用方六处守卫均只做相等比较、不反解摘要）；新增 `describeSnapshotDiff` 让门禁说出到底是哪个文件——`[drift] <path> (missing: .aios-skill-sync.json; content: LICENSE)`、`skip unmanaged blocker: <path> (extra in target: …)`。本轮定位那 21 字节做了 5 次探针，因为旧日志只给一个目录路径。
  > 与既有决策的边界：`.gitattributes` 里已有一条相反取向——"钉 LF 而不是在测试里归一化换行，因为归一化会把'内容真变了'和'只是被检出转了行尾'合并掉"。那条适用于**已提交文档与重渲染产物**的对比（基线即字节约定）；此处对比的是**生成面 vs canonical 物料**，契约是内容而非行尾，所以两层一起动：属性钉住才是两类信号不合并的前提，摘要归一只作为存量安装的兼容垫（不强行重写已有字节）。
- **行尾兼容不再只靠约定，有三例反例守卫**（`scripts/tests/foundation/skills/install/snapshot-line-endings.test.mjs`）：CRLF-only 副本被**收养而非阻塞**（标记写入、skipped=0）；真内容差仍**拒绝收养**且 blocker 行点名 `content: LICENSE` / `extra in target: EXTRA.md`；drift 行必须同时说出缺失的标记文件与被改的资产。归一化不会放过真漂移。
- **`rex-debug` 认证基线重跑**：子模块提交 `5f87da7` 后，旧认证的 base 落后于当前 git 基线，`verify-training` 按设计报 `baseline-differs-from-git-base`/`certification-base-mismatch`（没有伪装成内容陈旧）；`skill certify` 重跑后 `verified/accepted`（证据 `…T21-36-40-932Z`，旧证据作为历史保留）。

### Documentation

- 竞品窗口看板 `docs/reports/2026-10-26-competitor-window-board.html`：覆盖 10-12→10-26 两个快照的增量（左栏可借鉴项带来源/成本/优先级，右栏我们自身的缺口含实测数字），并纠正了一条误判——AIOS 已有 `learning/judgment/` 的 JEV 决策门，因此该案例的价值是"决策问题写得更具体"，不是"是否引入判断解释变量"。
- `rex-debug` 训练认证证据入库：`docs/evidence/skill-training/rex-debug-certification-2026-10-26T15-13-59-230Z/`（10 任务 × 3 轮，42 份输出，`accepted`，由本地确定性 `compliance-live.mjs` 执行，零模型调用）。

## [6.11.0] - 2026-10-23

### Fixed

- **被拦不再终结整轮对话**：Pi 安全门拦截 bash/powershell 后不再设置 terminate（此前 99 次拦截直接结束了整轮，agent 得等人重问）。现在只报告原因和可行做法，agent 自行恢复继续干活。
- **起始钩子 8 秒熔断**：`runAios` 的 execFile 超时从 120s 压到 8s（正常 digest 约 0.57s），`before_agent_start` 不再被 wedge 住的子进程拖住每轮开头；超时以显式 `AiosCliError` 失败并保留证据形状。

### Added

- **启动时兼容自愈（需显式同意）**：`aios doctor` 上报缺 `compat.supportsDeveloperRole` 声明的 reasoning relay 模型（此前因此报 400 硬停整轮）；`aios init --pi-compat-self-heal` 经用户同意后只增补声明，不改手写值、不建文件。默认不加 flag 时只读提示修复命令，一个字节不写。
- **删除门改按目标判定**：42,282 条历史调用实测，旧词形规则 114 次拦截中 112 次误伤（沙箱清理、构建目录等）；新门走命令位置判定（引号/heredoc/重定向/注释/同行变量/`find`/`xargs`/解释器内联脚本），残留 4 条逐条确认为真阳性，37 条对抗性危险形状照样全拦。

## [6.10.1] - 2026-10-22

> **本号段重新发布（2026-10-22）**：标题保持严格形状，因为 `release-preflight.sh:77` 用
> `^## \[<ver>\] - YYYY-MM-DD$` 全行匹配（带任何后缀就 `changelog missing matching release heading`，
> CI 实测撞过一次）。本号包含两次内容：原 6.10.1（只含发布查询配额修复）与中间版本 6.9.0 / 6.10.0
> 的 GitHub Release 已下架，`v6.10.1` tag 移到含本页全部修复的提交上重发。已知代价：**已经装上原 6.10.1 的机器
> 拿不到本次修复**——`compareVersionStrings` 把同版本判为 `equal` → `not-newer-than-installed` 直接 skip，
> 那些机器需手动重跑安装器（`scripts/aios-install.ps1 -StopHolders`）才能跟上。6.8.0 / 6.9.0 / 6.10.0
> 的机器不受影响，它们看到的是“更新”，能直接升。保留历史号段（6.9.0 / 6.10.0）的 changelog 条目不改写；
> 其中的错误因果由下面“更正 6.9.0 的因果陈述”一条指回。

### Fixed

- **发布查询不再被匿名配额打回降级路径**：GitHub 的匿名 API 配额（60/h）按出口 IP 计，共用出口时会被别人烧光——本机实测 `api.github.com` 对公开仓库返回 HTTP 403 且 `x-ratelimit-remaining: 0`。旧行为是打一行 warn 然后退回 `releases/latest` 指针，而该指针按创建时间排序，补发旧版本会抢占它，正是当初写 `release-lookup` 要防的降级缺陷。现在：有 token 就带（`AIOS_RELEASE_TOKEN` > `GITHUB_TOKEN` > `GH_TOKEN`，再试 `gh auth token`）；403/429 且配额头明确为 0 才判 `release-lookup-rate-limited`（缺头仍是 `release-lookup-http`，因为处置动作不同）；第二事实源是不吃 API 配额的 `releases.atom`，公告页分不清 draft/prerelease，所以返回一律标 `exact:false` 且按 tag 形状排除预发布；三个来源全失败抛 `release-source-unreachable` 并带上两次尝试，`aios update` 在此**停止**而不是装一个没验过版本的包。
- 本机限流状态下的真实解析结果：`{"tag":"v6.10.0","source":"feed","exact":false}`。
- **`aios update` 在安装树被自己锁死：长驻子进程的 CWD 不再钉在安装根**。Windows 换入靠把旧安装目录改名让位（`Directory::Move`），而目录改名**只被一种持有者拦住：某个进程的 CWD 落在该目录子树内**。实测（在真安装树内新建子目录做可逆 rename 探针）：16 个 Chrome 进程持树内 profile、`fs.watch` 目录通知句柄、SQLite 打开文件句柄——三种同时在场仍 `MOVE-OK`；加一个 CWD 在树内的进程立刻 `EPERM`，杀掉它又回 `MOVE-OK`。旧写法在两处把 CWD 焊进树里：`scripts/run-local-browser-mcp.mjs` 的 `cwd: rootDir` 与 `mcp-server/scripts/with-project-node.mjs` 的 `cwd: PROJECT_ROOT`，另加注册面 `mcp-server-builders.mjs` 的 `cwd: rootDir` 与 codex emitter 的 `cwd = <安装根>`。本机实测残留 9 个树内 CWD 进程，父链是别的会话的 browser MCP——**每一次用过浏览器工具都在给下一次升级上锁，且随会话重启自动复现**。现在判定收到单一 owner `resolveCwdOutsideRootDir`（`scripts/lib/foundation/platform/aios-runtime-root.mjs`）：继承调用方（客户端）的 CWD，仅当它本身在树内才退回用户主目录；启动器还先把自己择出去（它是 `spawnSync` 阻塞式长驻进程，只挪子进程等于自己继续锁着）。`with-project-node` 的默认**保持** `PROJECT_ROOT`，因为 mcp-server 的 npm 脚本靠它解相对 glob 与 `src/index.ts`——改成无条件继承实测把 `contextdb-lazy-load` 整组跑真 CLI 的套件跑红；长驻链由上游入口用 `AIOS_MCP_CHILD_CWD` 显式声明，npm 用法零变化。
- **安装器预检改测真实 CWD，不再拿命令行字符串猜**。旧启发式在本机一次列出 39 个 PID（Chrome、别的会话的 bridge、连安装器自己的 shell 都在里面），噪音盖掉了真正挡路的 3 个；它连“没有持有者”和“测不到”都分不开。现在读 PEB 取真实 CWD，报 `PID/名称/cwd`，探针不可用（非 x64、Add-Type 失败、安装目录不存在）时**明说测不准**并退回旧启发式，绝不把空结果当干净。失败文案也从“被某个运行中的进程占用”改成指名那一类持有者。
- **更正 6.9.0 的因果陈述**（不撤回它做对的事）：CHANGELOG 6.9.0 与 AGENTS.md「Browser MCP Selection」、博客 `2026-10-v690-browser-profile-root-leaves-the-install-tree.md` 都写着“树内 profile 的活 Chrome 持有目录，导致 `Directory::Move` 被拒”。上面的探针否证了这个因果：Chrome 在场时改名照样成功。profile 根搬家仍然正确（安装产物里不该住用户态数据），但它**不是** `aios update` 失败的原因；拿它当原因，才是这次“修了还是报错”的直接成因。6.9.0 现场那一次真正的 blocker 是被 `cwd: rootDir` 钉住的 `run-local-browser-mcp.mjs` 自己。

Evidence: `node --test scripts/tests/foundation/platform/cwd-outside-install-tree.test.mjs` → 5/5（树外继承 / 四种树内写法一律改选到树外 / Windows 大小写不敏感且 `aios-other` 不误伤 / POSIX 同判定 / 缺参不炸）；`scripts/tests/foundation/native/codex-config.test.mjs` → 8/8（新增：四个 AIOS 服务表一律不钉 `cwd`，且 `aios-memory` 的工作区语义仍由 `AIOS_WORKSPACE_ROOT` 显式承载——去掉冗余 `cwd` 是零语义变化）；`browser-local-mcp` + `profile-root` + `mcp-path-repair` + `aios-components` → 70/70（`'cwd' in entry === false` 取代旧 `entry.cwd === rootDir` 契约）；`contextdb-lazy-load` 6/6（这条是先红后修的：无条件继承 cwd 会把 npm 驱动的相对解析打碎）；`npm run test:affected` → tests=2316 pass=2307 fail=0 skipped=9；`npm --prefix mcp-server run typecheck` → 0 错，`npm --prefix mcp-server test` → tests=117 pass=105 fail=0，`npm --prefix mcp-server run build` → OK（npm 用法未受影响）；`Parser::ParseFile` 对 `aios-install.ps1` 0 语法错，且 BOM + CRLF 保持（`irm | iex` 远程加载依赖它）；**真机端到端**：从安装树内部起真启动器，`A 正例`（自造的树内 CWD 进程）探针读出 `insideTree=1`，证明探针不是恒 null；`B` 链上 4 个进程（启动器 + with-project-node + tsx + server）`insideTree=0`，全部落在 `C:\Users\Administrator`；从树外起时同一链 4 个进程全部原样继承项目根 `D:\Temp\fakeproj`（没有多改一刀）；安装器函数在真机上对现存旧 6.8.0 残留报 `ok=true holders=6`，与独立交叉核对同一批 PID。

## [6.10.0] - 2026-10-22

### Added

- **可移植工程标准（`aios standards check`）**：目录项数、单文件行数、重复行、依赖方向四条量化规则，任何 git 仓库都能跑，不再只是 AIOS 自己的私有门。项目侧只有一份 `config/standards.json`：`budgets`（可按整条规则或按实体覆盖）、`exemptions`（必须写理由）、`baselines`（存量，只许收缩）、`layers`（分层声明）。默认预算的唯一 owner 在 `rex-harness` 规则清单里，宿主不再各存一份数字。
- **首次运行只报告，不拦你**：仓库没有 `config/standards.json` 时输出 `STOCK` 前缀、每规则最多 20 行、全量走 `--json`、退出码 0。`aios standards check --freeze` 把当前存量冻结成 `baselines` 并报告数量，从此这条门对该仓库生效——新增越界立刻红灯（实测 `kind=growth`），冻结是处置不是赦免。`--strict` 保留"未配置也拦"的旧行为。
- **分层与依赖方向**：`layers.order`（外层→内层）+ `layers.prefixes`（路径前缀→层名）由项目自己声明；引擎只把**内层指向外层**的边判红，未声明分层或缺模块图一律 SKIP 并说明缺什么，不产出猜测式违规。模块图由 `standards check --write-edges` 从本仓库 tracked 源码自给生成（正则近似，非 AST）。
- **重复行度量（近似等级）**：连续 6 行归一化文本相同的窗口，预算 0。局限写在规则清单与 `rex-engineering-standards` 技能里：改名就看不见、窗口以下的相似不算、单文件自重复不算。
- `rex-harness` 子模块升级到 **v0.12.0**（引擎、命令、`--freeze/--strict/--write-edges`、分层声明、证据引用完整性修复都在这里）。

### Fixed

- 依赖方向门的输入检查把"输入齐备"误当成"本构建供不了这个输入"，导致这条规则此前在任何项目上都静默 SKIP。
- `runStandards` 缺省读器时静默量到 0 个实体并报 `status=ok / exit 0`（假通过）；现在量不到任何实体是结构化 `measure-error` 且退出码 1。
- `git:` 证据引用要求 7-40 位小写十六进制，`receipt:` 引用在所有 evidence 种类上都必须能在 receipt 存储里解析（此前审查阶段的伪造引用可以通过）。

## [6.9.0] - 2026-10-22

### Added

- feat(browser): 浏览器 profile 根搬到安装树外，默认 `~/.rexcil/browser-profiles`（与安装根 `~/.rexcil/aios` 同卷，所以迁移就是一次 rename）。新增单一契约变量 `AIOS_BROWSER_PROFILE_ROOT`（只接受绝对路径）：AIOS 侧在 `mcp-server-builders.mjs` 里把它算好注进浏览器 MCP 子进程，TS 侧只读这个值，读不到就退回 `REXCIL_HOME`/`~/.rexcil` 推导——两侧同一语义，不留第二份安装布局知识。位置定义集中在 `scripts/lib/tooling/components/browser/profile-root.mjs`（根解析、旧串映射、锁判定、迁移四件事）。`config/browser-profiles.json` **不改一个字段**：里面的 `.browser-profiles/<name>` 是 profile 的名字不是位置，resolver 把旧串直接折到新根（Windows 手写的反斜杠同形同样折）。CDP 服务布局（`cdp-service.mjs` 的 `userDataDir`）一并改到新根，否则 Mac 上同一个争用面原地保留。

### Fixed

- fix(browser): `aios update` 不再被一个活着的浏览器会话顶死。旧位置把 profile 放在安装根里面，而换入靠 `[System.IO.Directory]::Move` 给安装目录改名让位——Chrome 用 `--user-data-dir=<安装树内路径>` 持有目录句柄时，Windows 直接拒这个改名。本机实测两次：一次孤儿 browser MCP + 9 个 Chrome（自己退出后升级才成功），一次活会话正在写 `grill`/`headless-check`（19 个 Chrome，当场拦住 v6.8.0 本机升级）。对照事实把阻塞源说得很清楚：十几个只持有安装树内**脚本文件**的 bridge 并不挡改名，挡的是**目录名占用**——所以这不是"进程太多"，是位置放错了。
- fix(browser): 迁移只在客观安全时动文件系统，拒绝就是拒绝，不是降级。判据是客观占用：Chrome 自己写的锁标记（POSIX `SingletonLock`、Windows 实测为 `Lockfile`），加上进程探针（任何浏览器进程的 `--user-data-dir` 落在树里即视为占用，孤儿 renderer 也算）；探针不可用时按 fail-closed 处理，不确定就不搬，新根已存在时**绝不合并**，软链接旧根不搬，`rename` 失败（如 EXDEV）时旧数据原地完好并带原因上报。状态一律打出来（`migrated`/`no-legacy`/`target-exists`/`locked`/`error`），不静默。
- fix(browser): 卸除两处会把旧位置“焊回来”的字面量——`launcher.ts` 的兜底 `'.browser-profiles/local'` 改成走 `getProfileDir('local')`；`cdp-service.mjs` 的 `path.join(rootDir, '.browser-profiles', …)` 改用 profile 根。安装器的 `preservePaths` **不改**：过渡期仍需要它兜住尚未迁移的安装。

### Notes

- 新增 `aios internal browser doctor` 一行现状：根已在安装树外（OK）/ 旧根存在且仍被占用（WARN，说明占用理由，并告知它会挡住下一次升级）/ 旧根没人用（WARN，告知迁移命令）。warn 不改 doctor 结论（只有 err 会），所以不会把现有用户变成红。
- 浏览器 MCP 子进程如果跑的是旧 `mcp-server/dist`（发布归档不打包 dist，但用户自己 `npm run build` 过就会优先用 dist），需重新构建才拿到新逻辑；升级本身会整树改名重建，所以升级后的安装天然走 tsx+src。

Evidence: `node --test scripts/tests/clients/browser-core/profile-root.test.mjs` → tests=12 pass=12 fail=0（覆盖：根不在安装树内、契约变量优先且只认绝对值、旧串与反斜杠写法映射到同一目标、两种锁标记、`live-process` 计数与两种命令行写法、探针不可用 fail-closed、五种迁移状态 + 失败时旧树完好 + 幂等、软链接拒搬、dry-run 不碰盘、CDP 布局落在外部、builder 注入绝对契约值）；`npm --prefix mcp-server run typecheck` → 0 错，`npm --prefix mcp-server test` → tests=117 pass=105 fail=0（新增 3 条 TS 侧同名契约全部 pass）；`node --test scripts/tests/clients/browser-core/*.test.mjs` → tests=61 pass=61 fail=0；消费方套件（browser-local-mcp / aios-components / aios-doctor / aios-lifecycle-plan / platform-smoke）→ tests=102 pass=102 fail=0，新增 env key 没破任何配置快照断言；test-suite-wiring 6/6（新测试已登记进 regression 清单）；dir-budget 767 dirs 0 blocking；真机进程验证：起一个真 headless Chrome 指向沙箱 profile，有 `Lockfile` 时读作 busy/lockfile，删掉标记后默认探针仍命中 10 条真实命令行，杀掉进程后读作 free；`git grep "'\.browser-profiles'"` 复核：除安装器 preservePaths 与配置里的 profile 名外无硬编码残留。

### Known limits

- 本版本只改新安装与已接线消费者的行为。现场旧安装里的 `.browser-profiles` 要等到浏览器会话结束（占用消失）才能搬走；那期间 `aios update` 仍会被同一个目录句柄拒绝——现在会告诉你原因和处置命令，不再只留一句错误。
- 已有安装如果自己 `npm run mcp-server` 构建过，旧 dist 仍含旧逻辑；重新构建或升级（整树重建）即恢复。

## [6.8.0] - 2026-10-21

### Added

- feat(testing): 测试运行的临时根改由 runner 拥有。`run-test-suite.mjs` 与 `run-affected-tests.mjs` 现在每轮开一个隔离目录（同时重写 `TMPDIR`/`TEMP`/`TMP` 三个键：POSIX 读 `TMPDIR`，Windows 读 `TEMP`/`TMP`，`os.tmpdir()` 两边取的不一样，漏一个就有测试继续往真 `%TEMP%` 里写），跑完直接删整根。起因是现场清理时量化了堆积：本机 `D:\\Temp` 共 68,052 条目，其中 **62,773 个**匹配自家测试沙箱形状（374 个 fixture 前缀族，最老 2026-10-13），占条目数 92%；靠 ~100 个测试文件各自自觉回收是挡不住的，所以把回收放到拥有运行生命周期的那一层。新建测试仍可用 `t.after`（`release-download` / `self-update-lifecycle` 已在 6.7.3 改成那样），但不再是个正确性前提。
  - 逃生门：`AIOS_TEST_TEMP_SANDBOX_DISABLE=1` 退回真实临时目录（调试、或要复现一个固定路径时），套件尾行会打 `temp_sandbox=disabled`。
  - 删不掉时不静默：子进程留了句柄在沙箱里（Windows 上常见，就是本版本上面那条 `aios update` 被拒的同一族问题）时，尾行打 `temp_sandbox=KEPT@<路径> (<错误码>) -> npm run tmp:gc`，把处置路径交给用户。
  - 自我愈合：建沙箱前先把**自己命名家族**（`aios-test-run-` + 6 位随机后缀）超过 24h 的陈旧沙箱扫掉，只碰这一族、只碰够旧的。

- feat(cli): `scripts/aios-tmp-gc.mjs --temp`（C 项兜底）。作用是把根换成 `os.tmpdir()`、隐式放行易失根（否则刚报的发现又被下一道守卫剔掉）、并把名字谓词从通用 `isSandboxName` 换成严格的 `isAiosFixtureName`（`^aios-<fixture>-<6 位随机>`）。窄化是必须的：系统临时目录里住着别的 app 的随机名目录（`.tmpHau8Eb`、GUID.tmp）和碰巧带 4-6 位后缀的真实工程名，通用形状判定在那儿太宽。新增 `npm run tmp:gc`（默认 dry-run，`--older-than 1440`）和 `npm run tmp:gc:trash`（移到废纸篓暂存，可逆）；`--mode purge` 仍需 `--yes` 才真删。

### Fixed

- fix(windows): 两个 CLI 在 Windows 上**静默空转**。`import.meta.url === \`file://${process.argv[1]}\`` 这种入口判定只在 POSIX 成立——Windows 那边是 `file:///C:/…`（三斜杠 + 盘符），把 `argv[1]` 的反斜杠换成正斜杠也补不上那个前导斜杠。后果不是报错，是根本不执行 `main()` 并且以 0 退出：`aios-tmp-gc --mode purge --yes` 看起来成功、实际一个目录没删（实测三轮 `--help` 全部空输出 exit 0：相对路径、Windows 绝对路径、正斜杠绝对路径）。`scripts/aios-tmp-gc.mjs` 与 `scripts/client-capability-scorecard.mjs` 改用已有的 realpath 版 `isDirectModuleInvocation`。现存带 `|| argv[1].endsWith('<本文件名>')` 兜底的入口（`aios-mcp-proxy` / `aios-mcp-server` / `shell-mcp-server`）本来就是靠这个兜底在 Windows 上活着的，不改；新增 `cli-entry-guard.test.mjs` 把「裸 `file://` 模板相等」这一形状钉住，并额外用子进程实测三种 argv 形态都能真的跑进 `main()`。

- fix(release): `release-stable.sh` 不再吞掉 preflight 的输出。旧写法 `bash release-preflight.sh ... >/dev/null`：本机一次 v6.8.0 发布就卡在这里，只留下一句 `root release test suite failed: npm run test:scripts`，重跑又全绿——既定不了位，也判断不出是不是偶发。一个发布门把它拦住的原因自己吃掉，比不过门更糟（调用方只能反复重试）。现在完整输出先写 `.aios/artifacts/release-preflight-<tag>-<stamp>.log`（`AIOS_RELEASE_PREFLIGHT_LOG_DIR` 可改，目录不可用时退回系统临时目录），失败时把末 40 行直接喷到 stderr 并给出日志路径；成功时也多打一行日志位置。`set -euo pipefail` 下用 `if !` 包住，不会提前退出也不吃掉退出码。

Evidence: 全量 `npm run test:regression`（228 files，elapsed 438,894ms）**退出码 0、tests=2241 pass=2232 fail=0 skipped=9**，尾行 `temp_sandbox=removed`，同一轮 `%TEMP%` 里 fixture 家族计数 **1081 → 1081 不变**、`aios-test-run-*` 残留 0（修前同一轮会新增上千个：本机 24h 内实测堆到 5,857 个）；重点套件 `tests=42 pass=42 fail=0`（含 `--temp` 在假临时目录里的端到端：`collect=3 keep=3`，`.tmpHau8Eb` / `someproject-rex-work` / `node-compile-cache` 原地不动，`--mode purge` 缺 `--yes` 返回 1，补 `--yes` 后只删自家三族）；`node scripts/aios-tmp-gc.mjs --help` 现在输出 usage，`client-capability-scorecard.mjs --check` 不再空转，实在报 `ok: ... matches config (13 clients)`；dir-budget `0 blocking`。feature release 按仓库自己的发布契约必须带发布帖（`llms-txt.test.mjs` 用一条失败把这件事抦了出来）：新增 `blog-site/2026-10-v680-test-runner-owns-the-temp-directory.md` 并重生成 `docs-site/llms.txt`（76 → 77 篇，Blog 索引首位 v6.8.0）。 发布门可见性实测：同树两次实测——物化后 `npm run test:scripts` 与 `bash scripts/release-preflight.sh --tag v6.8.0` 都是 EXIT=0（tests=2242 pass=2233 fail=0），即第一次拦住的是瞬态失败；`bash -n scripts/release-stable.sh` 语法通过；新路径实测产出 `.aios/artifacts/release-preflight-v6.8.0-*.log`。

### Known limits

- 隔离只覆盖走 runner 的两个入口。直接 `node --test scripts/tests/<x>.test.mjs` 单文件调试仍写真实临时目录（这是刻意的：调试时要看得见的产物），由 `npm run tmp:gc` 兜底。
- `--temp` 只认 `aios-*` 家族；别的客户端或更早版本留下的随机名沙箱仍在“不可判定”里，不会被动。
- 本版本不回收安装目录内的 `.browser-profiles`（它是本轮 `aios update` 被拒的真原因）；那是 profile 根位置的决策，单独立项。

## [6.7.3] - 2026-10-21

### Fixed

- fix(windows): `aios update` 的 Node 暂存回退路径不再漏留暂存目录，测试沙箱一律自行回收。现场：清理本机 `%TEMP%` 时扫出 **856 个**匹配项（共 21 MB），绝大多数是测试沙箱与回退路径留下的 `aios-dl-*` / `aios-selfupdate-*` 目录，少量是本会话的探针文件。两个原因：（1）`self-update.mjs` 的 win32 分支在资源下载失败时把 `stageDir` 变量置空后直接回退，但目录已经被 `mkdtemp` 建出来了——于是每次回退都在易失目录里留一个空目录（变量置空不等于删除，外层 `finally` 也被跳过）；现在回退前先 `rm(stageDir, {recursive:true, force:true})` 再置空。（2）`release-download.test.mjs` 与 `self-update-lifecycle.test.mjs` 的沙箱从不回收（后者 14 处 `mkdtemp` 裸用）；现在统一到 `tempRoot(prefix, t)`，由 `t.after` 删除，跟 `mcp-path-repair.test.mjs` 里已有的 `t.after` 约定保持一致。另注意一个平台差异：Windows 上 `t.after` 里用 `fs.rmSync` 会抛（该文件 `fs` 是 `node:fs/promises`），回收统一走异步 `rm`。

Evidence: `self-update-lifecycle` + `release-download` 18/18（含新断言：暂存失败回退后 `tempDirBase`  readdir 为空，把这个泄露钉住）、`node --test` 跑完 `%TEMP%` 残留计数 **0**（修前同一次跑留下 1–2 个）、`npm run test:affected` → `tests=648, pass=647, fail=0, skipped=1`。

### Known limits

- 泄露只影响易失目录里的空子目录（不顶磁盘也不影响正确性）；不打算为此加一个 GC 钩子——目录预算/临时回收已有现成工具。

## [6.7.2] - 2026-10-21

### Fixed

- fix(windows): 路径卫生与既存红不再依赖 POSIX 形状，Windows 上 `scripts/release-preflight.sh` 可正常本地发版。三条既存失败其实是两类平台假设：
  1. `scripts/lib/foundation/platform/aios-runtime-root.mjs` 的 `findVolatileAiosPaths` 从配置**文本**里抠绝对路径 token，而 Windows 条目在 JSON 里是转义形态（`"D:\\aios\\scripts\\x.py"`）。抠到的 token 以多余反斜杠开头，既匹配不上 `trustedRoots` 也匹配不上易失前缀，最后被「带 aios 字样且不存在」的兜底分支抓住 —— 于是**已经修好的稳定根条目被永久误报 stale**（修复器年年重修同一条目、`doctor` 说脏话）。修法是客观解码而不是放宽断言：新增并导出 `decodeConfigPathToken`，把成对反斜杠折回真实路径（POSIX 与 `D:/` 形态原样保留，顺带剥尾部标点）；抓取模式同时接受 `D:\` 与 `D:/`；比较键 `comparisonKey` 统一折叠分隔符，并在 win32 额外折叠大小写（Windows 路径大小写不敏感），UNC/POSIX 语义不变。
  2. `mcp-path-repair.test.mjs` 与 `interception-cli.test.mjs` 用 `item.startsWith('/')` 挑「绝对路径参数」，把 POSIX 形状写进了断言：Windows 上修复器明明已经把条目重指到稳定根（`D:\Temp\…\stable-aios\…`），过滤器却整批丢掉，断言只拿到空数组并报「应已重新 materialize / 应离开失效目录」—— 红的是测试自己的平台假设。口径收到生产模块自己手里：`aios-runtime-root.mjs` 新增并导出 `isAbsolutePathLike` / `absolutePathItems`（认 POSIX 根、盘符、UNC 三种形状），两处断言改用它。理由是这个判断本来就是平台路径形状的事实判定，放在测试侧会再长出一份平行实现；先试过单独开 `scripts/tests/fixtures/absolute-path-items.mjs`，但那把 `scripts/tests/fixtures` 顶到 9 项、踩穿目录预算门，而预算门给出的结论正是“该归位而不是该豁免”。
  3. `client-capability-scorecard.test.mjs` 的「已提交报告与重新渲染逐字节相同」在 Windows 必红：`core.autocrlf=true` 的检出把 LF 报告刷成 90 个 CRLF，而生成器只写 LF。按仓库既有同类约定（`agent-sources/**`、`scripts/lib/tooling/specs/*.json`、`docs/evidence/skill-training/**` 都钉 `text eol=lf`）给 `docs/reports/*client-capability-scorecard.md` 补同一属性并重新检出为 LF。**没有在测试里归一化换行**：归一化会把「内容真的变了」和「只是被检出转了行尾」两类信号合并掉，前者该响、后者不该响。

Evidence: `mcp-path-repair` 11/11（含 2 条新回归：`decodeConfigPathToken` 在任意主机上验证转义形态解码与标点剥离；JSON 化的配置里受信稳定根零命中、易失条目恰好命中 1 条且交回的是解码后的真实路径）、`interception-cli` 通过、`client-capability-scorecard` 5/5 且工作树 CRLF 计数为 0（blob 本来就是 LF）、`npm run test:affected` → `tests=764, pass=762, fail=0, skipped=2`：改动前那 3 个既存 Windows 失败全部消失且零新增失败。

### Known limits

- 路径 token 仍靠正则扫描配置文本（不是先解析 JSON 再遍历字段），所以依赖「解码后形状与 `path.resolve` 一致」；文件名本身含反斜杠这类罕见转义仍可能漏判。
- win32 的大小写折叠只作用于比较键；交回调用方与写盘的路径保持原样大小写。
- 只改 Windows 侧判定，POSIX 行为未变（`comparisonKey` 在非 win32 不折叠大小写）。

## [6.7.1] - 2026-10-21

### Fixed

- fix(windows): `aios update` 在 Windows 上因 GitHub CDN 中途重置 TLS 连接而报错，现在能自愈。现场事实（同一台 Windows 机、同一 URL、不同 TLS 栈）：PowerShell `Invoke-WebRequest` 抛 `System.IO.IOException`「从传输流中收到意外的 EOF 或 0 个字节」，git-bash `curl`（schannel）抛 `curl: (56) schannel: server closed abruptly (missing close_notify)` 并留下 9,646 字节残 zip，而 Node 自带 TLS 栈与 `C:\Windows\System32\curl.exe` 同 URL 稳定拿到 7,094,308 字节完整资产——即资产与网络都好，坏的是 Schannel 通道的不稳定性叠加“单发下载 + 不校验 + 不清残文件”。三处修：（1）新增 `scripts/lib/execution/lifecycle/release/release-download.mjs`，`downloadReleaseAsset` 带退避重试、`content-length` 比对、按客观字节判定完整性（zip 查 end-of-central-directory 记录、gzip 查魔数），任何失败当场删残文件，4xx「资产不存在」标为不可重试直接中断；（2）`self-update.mjs` 的 win32 分支改为先用 Node 把 `aios.zip`（以及缺失时的 `aios-install.ps1`）暂存到临时目录再做替换，安装器只读本地文件，Node 暂存失败才退回安装器下载并记录原因，`platform`/`downloadImpl`/`tempDirBase` 作为测试接缝使 win32 形状可在任意主机断言；（3）`aios-install.ps1::Download-File` 重写为下载器优先级 Node → `curl.exe` → `Invoke-WebRequest`、4 次退避重试（`AIOS_DOWNLOAD_RETRIES` 可调）、解压前用 `ZipFile::OpenRead` 证明 zip 完整、本地副本校验失败只删副本不动原件。Linux/macOS 分支未动（OpenSSL 通道无此问题，`aios-install.sh` 原本就带 `--retry 3`）。
- 失败语义澄清：旧版把截断包一路带到 `Expand-Archive` 才以「找不到中央目录结尾记录」暴死，且残文件留在临时目录；现在下载阶段即拒绝并清理，报错保留真实原因（`download failed permanently: <url> :: HTTP 404 (not retryable)` / `download failed after 4 attempt(s): ...`）。`release-lookup` 本就走 Node fetch，Windows 侧只剩 `CRYPT_E_REVOCATION_OFFLINE` 影响手工 `curl` 探针，代码路径无需改动。

- fix(ci): 负 chromium 的 CI 作业不再跑在浮动 `ubuntu-latest` 上。v6.7.1 首发的真实死因不是网络抖动：`ERROR: Playwright does not support chromium on ubuntu26.04-x64` —— GitHub 把 `ubuntu-latest` 抬到了 26.04，而 Playwright 1.58.2 的 chromium 支持表（`mcp-server/node_modules/playwright-core/lib/server/registry/index.js` 的 `ubuntu…-x64` 键）只到 `ubuntu24.04-x64`，于是 `Verify local browser MCP install path` 这一步无论重试多少次都不会绿。修：`release.yml` 的 build、`ci-main.yml` 里 `mcp-server-quality` 的 matrix.os、`contextdb-quality.yml` 的 quality 三个作业钉到 `ubuntu-24.04`；不装 chromium 的 `scripts-tests`/`performance-smoke`/`gitleaks` 保留 `ubuntu-latest`（不受该表约束，也无谓锁旧）。
Evidence: `scripts/tests/foundation/release/release-download.test.mjs` 7/7（一次成功、重置后第 2 次成功且残文件被清、content-length 不符拒绝且不落盘、503 重试、404 不重试且只发 1 次、无 EOCD 的 zip 被拒、gzip 魔数正反例）+ `self-update-lifecycle.test.mjs` 11/11（win32 注入 platform：Node 暂存→本地安装器→`AIOS_ASSET_URL` 指向暂存文件→暂存目录用完即清；暂存失败→回退远端 URL 并告警；bash 形状回归；防降级守卫不受影响）+ `release-pipeline.test.mjs` 42/42（安装器断言改为守护重试循环与 zip 完整性校验）；真机 Windows 验证：把旧的 9,646 字节残 zip 喂给新 `Download-File` → `downloaded zip is truncated or unreadable` 且无残文件；真下载 `v6.7.0/aios.zip` → 第 1、2 次被重置、`[ok] download succeeded on attempt 3/4`、7,094,308 字节；`https://.../nope.zip` → 单次 404 即 `download failed permanently`；`npm run test:affected` → `tests=648, pass=647, fail=0, skipped=1`；`powershell Parser::ParseFile` 对 `aios-install.ps1` 零语法错误；`workflow-runner-support` 6/6（三个真实 workflow 全绿、浮动 tag 被标、matrix 展开被标、pin 到 26.04 被标、不碰 chromium 的作业放行）、`test-suite-wiring` 6/6、三个 workflow YAML 仍可被 `yaml` 解析。升级链已验半程：本机运行时用已修的 `aios-install.ps1` + `curl --retry` 预下载并校验过的 7,094,308 字节 v6.7.0 资产经 `-AssetUrl` 本地路径从 6.3.0 升到 **6.7.0** —— 日志显示 13 个进程引用安装目录时改名让位仍成功、跳卷回退生效、`npm install` 175 包无长路径故障、`.browser-profiles`(1.1G) 与 `.aios` 完整保留、无 `.retired-*` 残留，`aios --version` = `AIOS 6.7.0`，回滚点 `~/.rexcil/aios-backups/20261021-163441`。

### Known limits

- Windows 通道的重置是网络中间盒行为，重试把“必然失败”变成“大概率成功”，不是 100% 保证：4 次全失败时仍会报错，但此时报错是干净的（不半截替换、不残文件、旧安装完好）。
- `AIOS_DOWNLOAD_RETRIES` 之外没有独立的退避时长旋钮；上限 8 秒。
- 6.7.0 → 6.7.1 这一跳仍会执行 6.7.0 树里的旧 `self-update.mjs` 与旧 `aios-install.ps1`（本修复只存在于 6.7.1 载荷里），仍可能被 CDN 重置打中；已验证的临时做法是 `curl --retry` 预下载 + `-AssetUrl 本地zip`。
- 本机运行时已在 6.7.0；6.7.1 资产仍需一次绿的 CI（tag 已推但尚无 GitHub Release）。

## [6.7.0] - 2026-10-18

### Added

- feat(skills): 新增 `aios skill add <source>` —— 把**外部技能**（canonical `skill-sources/` 之外的社区技能）装进 AIOS 的分发体系。动机是一次真实使用缺口：`clone-website` 技能很好用，但它只装在 pi 客户端的全局技能目录（`~/.pi/agent/skills/`），其他 9 个客户端都没有；而现有 canonical sync（`scripts/lib/tooling/skills/install/sync.mjs` + `skill-sources/`）只负责随 AIOS 发布的技能，没有「收编外部技能」的入口。管线三段：来源解析（本地目录根带 `SKILL.md` = 单技能；子目录各带 = 多技能；`https://` URL / `*.git` / `owner/repo` 简写 = git 浅克隆进一次性临时目录）→ canonical 外部注册处 `~/.aios/skills/external/<name>/`（`client=registry / scope=external` 归属元数据，与仓库内 `skill-sources/` 并行不干扰）→ 分发到各客户端用户级技能根 `homes[client]/skills`（复用 catalog 全局 scope 的同一落点约定与 `.aios-skill-install.json` 元数据格式）。幂等靠归属元数据 + `snapshotDirectory` 内容比较：managed 且内容相同 → reuse，不同 → 刷新；同名字技能换来源重装会刷新注册处（比较时忽略 `catalogSource`）。选择语义：多技能来源在 TTY 上交互勾选（`a`=全选 / 编号 / 名字）；非交互环境 fail-closed 拒绝猜测，要求 `--skill <names>` 或 `--yes`（全选）；`--client` 接受逗号列表（默认 `all`）。安全语义：`--force` 只强制接管 unmanaged 目标目录——managed 且内容相同的副本仍然 reuse（force 不是无脑覆盖）；目标目录就是来源目录本身时**防自毁跳过**（`copyDirRecursive` 会先 `rmSync` 目标，首次收编时目标常等于原始来源，pi 实测命中此守卫）；frontmatter 技能名做单段名校验（拒绝 `../` 遍历与路径分隔符）；预检错误全部走 refusal 约定（单行可操作结论，不刷堆栈）。Evidence: `scripts/tests/foundation/skills/core/skills-external-install.test.mjs` 7/7（单技能全端安装+幂等、多技能选择/非TTY拒绝、unmanaged 跳过与 force 接管、内容更新联动刷新、json 输出、来源分类、遍历名拒绝）+ `skills-component.test.mjs` 新增 parseSkillArgs 2 例（add 旗标解析 / client 默认 all + 缺 source 校验）共 35 个；真机端到端 `node scripts/aios.mjs skill add ~/.pi/agent/skills/clone-website` → 10 客户端 `[copy] skill installed (global)`，复跑 → `installed=0 reused=10`（pi 命中防自毁守卫保留原目录），`~/.codex/skills/clone-website/` 等实文件与 `.aios-skill-install.json` 归属链核验；定向回归 skills 全目录 129/129、CLI+wiring 96/96、setup components 40/40；全量 `npm run test:regression` → `files=224, tests=2212, pass=2200, fail=0, skipped=12`。

### Known limits

- 交互勾选的 TTY 提示路径只有逻辑覆盖（编号/名字解析与取消语义），没有真 TTY 会话级实测——agent 与 CI 走的都是 `--skill`/`--yes` 非交互路径。
- `--mode link` 未实现：传了会得到 actionable 报错（copy-only slice）；注册处→客户端的 symlink 分发属后续独立决策。
- 卸载命令未做（本批非目标）：外部技能目前只能手动删副本；注册处元数据已为未来的 `skill remove` 备好归属链。
- GitHub 来源按 `git clone --depth 1` 实现，未做 tarball/registry 协议；`owner/repo` 简写固定指向 github.com。
- 开发过程中测试曾因默认 `client: 'all'` 把 mock 未覆盖的客户端写进真实家目录（21 个目录），已按 `catalogSource` 含 `/aios-home/skills/external/` 精确清理并复核；测试现在全部限定到 mock 过的 homeMap。

## [6.6.0] - 2026-10-17

### Added

- feat(tooling): 新增 `scripts/aios-tmp-gc.mjs` —— 回收散落在**工程父目录**里的 `mktemp` 沙箱残留，每个判定都是客观事实，读不出来一律保留。背景是一次真实事故：`~/codes`（仓库的父目录）里长出 41 个无人命名的目录（`abhome-1zbU` / `ci-repro-home-R2MG` / `asset-check-EYJZ` / `v650-patch-check-38213` / `rex0111-qLxI`），合计 4.06 GB 沙箱 + 5.8 GB 过期发布包 = 9.9 GB，全部躺在真实项目旁边。根因是一个被省略的参数：`mktemp -d <前缀>-XXXXXX` 不带 `-p` 时落在 shell 的 cwd，而那些 shell 当时正站在仓库父目录；它们不在任何仓库里，所以全世界的 `.gitignore` 都挡不住。判定阶梯（第一个不通过即短路）：名字形状 `-[A-Za-z0-9]{4,6}$` **且**后缀含大写或数字 → 年龄（`--older-than`，默认 60 分钟）→ git 状态（`dirty`/`unpushed`/`stashed`/**`unknown`** 全部保留）→ 根层凭据（`.env` / `.env.*.local` 保留，需 `--allow-secrets`）→ 易失根（系统 `TMPDIR` 整根默认剔除，需 `--allow-volatile-root`）→ 不可逆（`--mode purge` 必须再带 `--yes`，否则 exit 1；默认 `dry-run`，`to-trash` 只是 `mv` 到带日期的暂存目录）。Evidence: `scripts/tests/tooling/tools/aios-tmp-gc.test.mjs` 12/12（含 23 个**真实工程名**防误删回归：`rex-work`/`hermes-setup`/`wordpress-shens`/`rex-videos`/`rex-ppt-codex`/`aios-pro`/`inkloom.im` 必须全部判 false——原本只有一条形状正则时 `rex-work` 当场被判定可回收，是这条断言拦下的）；`node --test scripts/tests/tooling/tools/*.test.mjs` 62/62 无回归；`node scripts/check-dir-budget.mjs` → `0 blocking`；真实首跑 `node scripts/aios-tmp-gc.mjs --root ~/codes --older-than 30` → `collect=0 keep=34`（清理后对 34 个存活项目零误报）；清理前指向暂存目录时认出 44 项中的 37 项，把名字不规则的 7 项留给人。删除前另做内容核：`inkloom-release-pack` 的 4 个 `.env*` 与在用项目副本逐字节哈希一致、无独有顶层文件，三个 git 树 0 dirty / 0 stash，故无凭据与独有文件被销毁。
- docs(agents): `AGENTS.md` 新增 `## Temp Sandbox Hygiene`，把规则写成约束而非偏好——沙箱必须 `mktemp -d -p "${TMPDIR:-/tmp}" <前缀>-XXXXXX`（`-p` 不可省略），禁止在工程父目录创建任何目录，并给出 `aios-tmp-gc` 的预览/可逆暂存/真删三档用法。这类问题的形状决定了 Definition of Done 抓不到：验证本身是通过的（假 HOME 确实证明了 `aios init` 写对了文件），损害纯粹是位置性的，只在文件管理器里看得见。

### Known limits

- 门禁未接：pre-tool gate 可以在源头拒绍「`mktemp -d` 的目标父目录是工程根」，但那要改安全门禁本身（blast radius 更大），本批未做，已记录为独立决策。
- 制造者仍在运行：诊断过程中 21:21 / 21:29 又冒出新探针（来自并行的发布验证会话）。规则在被门禁强制执行之前只是建议。
- 本次清理的 9.9 GB 是**暂存不是释放**（全部 `mv` 入 `~/.Trash/aios-sandbox-cleanup-2026-10-17`，一次 `rm` 未用）；macOS TCC 禁止枚举 `~/.Trash`，无法确认里面还有什么，清空废纸篓保留为人工动作。
- 仓内其他会话/脚本是否还有「不带 `-p` 的 `mktemp`」未普查（本仓库 222 个测试文件已确认全部走 `os.tmpdir()`）。

## [6.5.1] - 2026-10-17

### Fixed

- fix(interception): `config/host-capabilities.json` 之前按**调用方 rootDir（= 用户工作区）**拼路径，于是 `aios interception doctor` 只在「当前目录恰好是 AIOS 根」时能跑：在仓库外执行时读 `<cwd>/config/host-capabilities.json` 直接 ENOENT 崩栈（经 `doctor → proof → turn-gateway → buildCapabilityMatrix(rootDir)` 传入的 rootDir 默认是 `process.cwd()`）。开发机与 CI 都看不出来，因为两者的工作区就是仓库根。这份能力矩阵是随运行时分发的**静态内容**，不是用户工程产物，因此改为模块锚定：工作区里有就用工作区的（保留可覆盖性），没有就回落到本模块所在的安装根。写入目标仍以 rootDir 为准，只有内容根源改成模块锚定。Evidence: 同一个外部 cwd（`/tmp/foreign-cwd-doctor-*`）A/B——发布版 6.5.0 安装副本 `ENOENT ... /private/tmp/.../config/host-capabilities.json`，修复后 `ok: true`、`existing 16/16, direct_browser 15, missing_required_browser 0`、`hygiene.stale_count: 0`、`crg-plugin.ts verdict ok`、`rtk.ts` 仍按非自有只报不改；`interception-capabilities.test.mjs` 8/8（新增 3 例：工作区优先、缺失回落运行时根、无 rootDir 也可解析）。
- 同形状问题只查了 interception 链路（`doctor.mjs` / `proof.mjs` / `tail.mjs` 都以 `process.cwd()` 为 rootDir 默认值）；仓内其他「按 rootDir 读静态内容」的位置未普查。
- fix(rex-pr): 技能的入口探针把「PATH 里没有 `rex-harness`」误当「未安装」。AIOS 宿主形态下 `rex-harness` **有意不装全局 PATH**（命令规格原文："Run bundled rex-harness without a global PATH installation"），宿主用 `aios rex <cmd>` 直接跑内置副本；裸命令返回 `command not found` 只说明入口名不对，不能据此判定运行时不存在。旧写法在宿主形态下必然得出假阴性，把「环境缺入口」误报成「无 rex 运行时 / 工作项未收口」。现在技能同时声明两种被支持形态，要求先换入口重试、再用 `doctor` 判存在性，并把停机原因分成三类（入口名错 / 运行时不存在 / Evidence 未收口）。同时修正 `--root` 语义：状态命令传工程根（`.rex-harness/` 所在），`doctor` 传 rex 包根——把工程根喂给 `doctor` 会刷出一堆 `missing Provider instructions` + `status: invalid`，那是参数用错，不是安装坏了。Evidence: 同一环境三种探针真实输出——`rex-harness status …` → `command not found`；`aios rex status --work-item does-not-exist --root .` → `{"kind":"rex.cli-error.v1","error":"rex standalone workflow not found"}`（入口对了，只是工单不存在）；`aios rex doctor --root rex-harness` → `"status": "ready"` vs `--root .` → `"status": "invalid"`。技能变更后重跑投影与认证：`projection-history` 的 rex-pr 追加到 3 条 digest；`skill certify --skill rex-pr --base HEAD` → `accepted`，baseline/candidate 均 `trainHard=1, validationHard=1, overallHard=1`、`nonRegression: true`；`skill verify-training --skill rex-pr` → `verified, score 1`；11 份副本（源 + 10 客户端）哈希一致 `e8762228c301`；`skill-sources 8/8`、`client-install + proportional-gates 33/33`、`training-certification + rex-client-projection 10/10`。同类缺陷未普查：`rex-workflow` 等其余 rex-* 技能仍只写裸 `rex-harness <cmd>`，在宿主形态下有同一假阴性风险。

## [6.5.0] - 2026-10-17

- feat(clients/opencode): AIOS 生成的 OpenCode 插件改为 **1.x / 2.x 双导出**，并对已存在的旧插件文件安装期自愈。OpenCode 2.x 加载器只读 `default` 导出且要求 `{ id, effect | setup }`，1.x 只遍历具名导出——两者互不兼容，现场是 `~/.config/opencode/plugins/crg-plugin.ts` 报 `PluginModule.LoadError: SchemaError(Expected object at ["default"])`、`rtk.ts` 报 `Missing key at ["default"]`，失败只降级成 WARN，插件（CRG 图更新、RTK 命令重写）**静默停摆**。模板尾部改为 `export default { id: 'code-review-graph', setup: CodeReviewGraphPlugin }` 并保留 1.x 具名导出（`setup` 是 2.x 内部的旧形状适配入口），一份文件两边可加载；`ensureOpencodePlugin` 写盘前先用 `classifyOpenCodePluginSource` 判定旧文件形状，不合格则留 `.bak-*` 后重写并 `[warn]/[hint]` 说出口。新增 `scripts/lib/clients/opencode/plugin-contract.mjs` 作为「插件模块契约」单一事实来源（分类 verdict：`ok / missing-default / default-not-object / default-missing-id / default-missing-handler`，与 2.x 四种失败一一对应），版本探测失败返回 `null` 并保守产出双导出。v2 原生 `effect` API（Effect runtime + capability ctx）**不在本批范围**，属独立迁移决策。Evidence: `plugin-contract.test.mjs` 12/12（含分类器对现场三种真实失败形状、自愈+备份、非 AIOS 文件逐字节不变）；真机 v2.0.32 `opencode run` 日志中 `crg-plugin.ts` 不再有 `failed to load plugin`，`mcp connected` 五服务齐（`code-review-graph` tools=30、`mcp-browser-use` tools=12、`aios-shell`/`aios-auth-tools`/pencil）；`rtk.ts` 经 `auditOpenCodePlugins` 判为 `missing-default / owned=false`，按「不改别人插件」只报告。
- feat(interception): 新增 `aios interception mcp-repair [--client <name>] [--fix] [--json]` —— 把漂到**已回收临时目录**的 AIOS 托管 MCP 条目重指到稳定运行时根。默认预览，`--fix` 才写盘，写盘前逐文件留 `.bak-*`，只碰检出 stale 的文件（不动 `mcp-migrate` 那种全量 16 个配置的 blast radius），用户自有条目原样保留，`plugin[]` 里指向不存在文件的条目只报不建（不替用户造文件）。稳定根解析优先级：非易失的调用方 `rootDir` → `AIOS_ROOT_DIR/AIOS_ROOT/ROOTPATH/AIOS_INSTALL_DIR` → `null` 时 **fail-closed 拒修**（绝不猜 cwd，否则等于把配置写进新的坑）。同一文件有两条写路径（`[mcp_servers.*]` 归迁移器、codex 托管块归 emitter），只走一条会漏修，故两条都跑。Evidence: `mcp-path-repair.test.mjs` 9/9（含 dry-run 不写盘、修复后指向稳定根、`user-owned` deepEqual 原值、备份等于修复前原文、二次运行 `stale=0/changed=0/字节不变`、无稳定根时拒修）+ `interception-cli.test.mjs` 新增 CLI 级断言（预览不留备份、`--fix` 才写）；真机 `~/.aios/bin/aios interception mcp-migrate` 后 9 个客户端配置 `stale=0`，仅剩托管块外用户自加的 `[projects."/var/folders/…"]` 信任条目（属用户数据，只报不删）。
- fix(browser/mcp): **易失根守卫**堵住长期配置污染。`migrateBrowserMcpConfig` 在 `clientHomes` 缺省时回退真实家目录，而写进配置的绝对路径取自调用方 `rootDir` —— 任何以 `mkdtemp` 物化目录发起的迁移都会把临时路径写进真实 home 配置，系统回收后客户端 MCP 永久失联；**跑测试套件即中招**（CI、任何开发者、macOS `/var/folders/…` 与 Linux `/tmp/…` 故障形状相同）。现在源根位于易失目录之下时，持久落点一律拒绝并返回结构化 `skipped:[{reason:'volatile-root'}]`，沙箱→沙箱照旧放行（否则测试无法自测自己的落点）。第二道同结构守卫挂在 `syncCodexHomeConfig`（写 `~/.codex/config.toml` 托管段：trust 表 + `aios-memory`），只守迁移器会漏修 codex 的 5 条 stale 路径。`switchBrowserMcpMode` 新增 `clientHomes` 沙箱接缝，泄漏源头测试 `bsk-writer.test.mjs` 改为显式传沙箱。Evidence: 真机对照——打补丁前 `node --test scripts/tests/clients/browser-core/bsk-writer.test.mjs` 会污染 `~/.config/opencode/opencode.json`，打补丁后该文件 sha256 逐字节不变（`GUARD OK`）、`~/.codex/config.toml` 在跑 `token-discipline.test.mjs` 后同样不变；`mcp-path-repair.test.mjs` B7 断言 + `codex-config.test.mjs` 两条新守卫（持久目标 0 字节写入 / 沙箱互写放行）。
- feat(doctor): 配置卫生诊断落地到两个 doctor。`aios internal codemap doctor` 新增 `checkDoctorOpencodePlugin`：逐个判定 home 内插件是否满足 2.x 契约、并报告 `plugin[]` 里指向不存在文件的条目；`aios interception doctor` 新增 `collectPathHygiene`（stale MCP 路径 + opencode 主版本 + 插件 verdict 与处置建议）。两者**只读**——诊断不改写任何插件文件，AIOS 自有项指向可自愈动作（重跑 `aios init` / `codemap install`），第三方项给上游修法或建议钉 1.x。Evidence: 真机 `aios internal codemap doctor` → `OK opencode plugin contract ok: crg-plugin.ts` / `WARN opencode plugin not loadable by 2.x (missing-default): ~/.config/opencode/plugins/rtk.ts - third-party, AIOS will not rewrite it`；`collectPathHygiene` 真机输出 `stale_count=0, opencode_major=2, opencode_plugins_broken=1`；doctor 断言锁死「只诊断不改写」（第三方文件字节不变）。
- chore(repo): 仓库根 `opencode.json` 不再入库（`git rm --cached` + `.gitignore`）。它是按机器生成的投影产物（`clients/native/distribution/emitters/opencode.mjs` 在 `aios init` 时写），入库等于把一台机器的绝对路径分发给所有人——本批修的正是这类形状。形状断言不受影响（`buildOpenCodeConfig` 在临时 rootDir 上完成）。
- fix(test): `interception doctor and mcp migration make browser MCP direct` 此前只在「机器上已有残留配置」时成立，干净检出必败（CI 两处同时红）。它把前提写在 `workspaceRoot/.mcp.json`，而迁移目标是以**安装根**与 client home 为键的，workspace 那条种子根本不进目标集；能过的原因是先前某次运行在 `<repo>/.mcp.json` 里留下了 browser 条目，`targetsHaveExistingBrowser` 因此成立、mode 保成 playwright。干净树里没有任何 browser 条目 → mode 解为 none → 不写 browser → `missing_required_browser=2` → doctor 退 1。现在测试把前提**声在地供给自己的沙箱**：向会被扫描的 client-home 目标（`$AIOS_HOME/clients/opencode/opencode.json`）写一条代理形态 browser 条目，不再依赖机器状态。Evidence: 同一干净克隆 + 全新 HOME 的 A/B——control（未打补丁）`pass 13 / fail 1`，patched `tests 14 / pass 14 / fail 0`；本地真实机器上 `interception-cli.test.mjs` 14/14，`mcp-path-repair + plugin-contract + codex-config` 30/30。同形状缺陷（测试依赖环境残留而非自宣前提）未在全仓普查，仅本例被 CI 拓出。
- test(ci): 两份新测试文件接入 `scripts/test-suites.json` 的 `regression` 清单。未接线的测试文件会被 `test-suite-wiring.test.mjs` 的 W2/W3/W5 判「静默不可达」——第一次全量回归确实因此红了三条，接线后转绿。Evidence: `npm run test:regression` → `files=222, tests=2185, pass=2173, fail=0, skipped=12`（elapsed 248s），新断言合计 24 个（plugin-contract 12 / mcp-path-repair 9 / codex 守卫 2 / mcp-repair CLI 1）。

- **未闭环（诚实标注）**：插件 hook 在 2.x 会话中是否真被触发**未验证**——三次 `opencode run` 全在模型侧失败（`Invalid rexai-openai/openai-responses stream event`、`OpenAI Chat stream ended without finish_reason`、`service_unavailable`），未产生任何 tool 调用；项目级双导出探针已被 v2.0.32 无 WARN 加载，因此本批只能声称**加载兼容**，不能声称行为兼容。冷启动竞态（`Location plugins did not finish activating`）与 `opencode.db` 膨胀属 opencode 侧/本机运维，未改。

## [6.4.1] - 2026-10-16

- fix(update): `aios update` 的安装器资产 URL 在「release 查询成功」的正常路径下被拼成双 `/download/` 段 —— `scripts/lib/execution/lifecycle/setup/self-update.mjs` 把 `releaseSegment` 定为 `releases/download/<tag>`，而两个平台分支的模板仍在其后追加 `/download/aios-install.{sh,ps1}`（模板是为 `releases/latest` 回退分支写的），生成 `releases/download/vX.Y.Z/download/aios-install.sh` → HTTP 404。只有 release 查询失败退回 `releases/latest` 时 URL 才是对的：升级恰恰在最该工作的时候失效。实测（本机 6.1.0 → 6.4.0）：`update` 打印 `curl: (56) The requested URL returned error: 404` 后继续报 `runtime files replaced`、以 `--skip-self-update` 重执行、最后 `Done.` 退出 0，而 `VERSION` 仍是 6.1.0 —— 整场升级是静默 no-op，这也是 6.4.0 发布后本机无法升级的直接原因。第二半缺陷在被吞掉：`curl -fsSL <404> | bash` 无 `pipefail`，管道退出码取末命令（bash 读空 stdin 退 0），拉取失败被当成替换成功。修复：安装器基址单点拼接（tag 分支 `releases/download/<tag>`、回退分支 `releases/latest/download`），两分支只追加文件名；bash 分支加 `set -o pipefail`，PowerShell 分支加 `$ErrorActionPreference = "Stop"`，404 现在响亮失败。守卫测试此前把畸形 URL 钉成预期（`self-update-lifecycle.test.mjs` 断言 `releases/download/v5.17.0/download/aios-install.sh`），已改为钉正确形状并拒绝 `/download/download/`；win32 分支补钉 `$ErrorActionPreference` 与 `.ps1` 资产 URL。Evidence: lifecycle-ops 六文件逐个 `node --test` 75/75 通过（self-update-lifecycle 8/8）；`bash -lc 'set -o pipefail; curl -fsSL <畸形URL> | bash'` 退出 56（修复前该管道退 0）；正确 URL `releases/download/v6.4.0/aios-install.sh` 与 `releases/latest/download/aios-install.sh` 实测均 HTTP 200，排除发布侧原因。

## [6.4.0] - 2026-10-15

- fix(ci): the directory-budget rule AGENTS.md declares (max 8 entries per directory) now runs where it claims. The check itself worked (`node scripts/check-dir-budget.mjs` exits 1 on a blocking violation), but it had zero execution surfaces — not in `package.json`, not in any workflow, no pre-commit — and the repo had drifted to 2 blocking violations while every suite stayed green, because the only related test unit-tests the script's helpers and never evaluates the live tree. The check now runs as the second step of `pretest:scripts`, so CI's `npm run test:scripts` (and release) fails on a new over-budget directory. The two drifted dirs (`scripts/tests/execution/harness` 9, `scripts/tests/execution/planning` 11→12) were first frozen in the script's ratchet baseline rather than split in this change, because splitting moves test paths and `scripts/test-suites.json` then carried an in-flight change from concurrent work — doing both at once would cross-commit the two. The split landed once that change committed: harness → `solo/` + `team/` mirroring `lib/execution/harness`, planning → `cli/` + `flow/` + `contract/`, with 23 path updates in `scripts/test-suites.json` and the stale pointers in `package.json`, `CONTEXT.md` and `docs/reference/outstanding-work.md` following along; the baseline is empty again (`harness` 5, `planning` 3 entries). Evidence: before `exit 1` with `FAIL scripts/tests/execution/harness: 9 > budget 8` and `FAIL scripts/tests/execution/planning: 11 > budget 8`; after the split `[dir-budget] 741 dirs, 23 over budget 8: 0 blocking, 0 recovered`, exit 0; the 18 moved files 143/143, `npm run test:workflow-policy` 63/63, suite wiring + affected-test guards 16/16.
- fix(docs): `AGENTS.md` carried two `## MCP Tools: code-review-graph` sections whose mandates contradicted each other — an externally injected legacy block ("ALWAYS use the code-review-graph MCP tools BEFORE using Grep/Glob/Read") and the AIOS-managed CODEMAP block ("only when structural relationships materially affect the current decision", budget of three graph calls per work item). Every agent read both. The legacy block is deleted, so the bounded AIOS block is the single owner, and `codemap.test.mjs` now pins exactly one CRG section per tracked instruction file (`AGENTS.md` / `CLAUDE.md` / `GEMINI.md`) and refuses the legacy `<!-- code-review-graph MCP tools -->` marker — a re-injection fails loudly instead of quietly reintroducing the conflict. Evidence: `codemap.test.mjs` 15/15.
- fix(tooling): affected-test selection no longer silently runs 0 tests for skill-registry changes. `skill-sources/` files are read by the skill guard suite via directory traversal, never via import, so the static impact graph has no edge for them — measured this session: an 8-file change including `skill-sources/retro/SKILL.md` printed `选中 0/219 … 改动未关联到任何 regression 测试`, while `test-suites.json` lists 13 guard tests (`skills-frontmatter`, `skills-source-tree`, `skills-sync`, `skill-index`, `install-policy`, training gates, …) that would catch a broken SKILL.md. `selectAffectedTests` now attributes any `skill-sources/` change to the `scripts/tests/foundation/skills/` guard prefix (still subject to the 60% full-suite bail). Pinned by `test-impact.test.mjs` I10 (fixture: the skill change selects exactly the guards; real repo: the regression manifest must actually contain ≥5 guards). Evidence: `node scripts/run-affected-tests.mjs --changed skill-sources/retro/SKILL.md --list` now lists the 13 guards instead of nothing.
- docs(plans): fix a rotted pointer in `docs/plans/2026-07-31-workflow-iteration-v1.md` — it said the mattpocock/skills reference clone lives at `agent-sources/skills/`, but that copy is gone (`agent-sources/` now holds `manifest.json` + `roles/`); the sentence now records it as removed and points at the watchlist entry that tracks the repo.
- feat(skills): 新增 `retro` 目录 skill——复盘一次会话，只找「该改环境而不是改代码」的候选：导航指针、确定性检查、编码标准（机械违规→确定性检查、判断项→标准文本）、AGENTS.md 增删、工具经济性、无效指令、信息可达性，按严重度列表交用户挑选。采纳自 mattpocock/skills 的 `retro`（engineering 桶，v1.3.1 毕业），按 ADR 0003 落点三问的第①问落主仓库（AIOS 目录 skill，非 rex Provider）。机制全部复用既有受控闭环：落地走 `skill-workshop` 的 propose→review→apply→rollback，改 skill 文本额外过 training gate；本 skill **不写任何文件**，不新开第二条写入路径；编码标准文本 owner 仍是 `rex-engineering-standards`，retro 只提案不新增规则。两条上游硬判据保留：仓库无 pre-commit 也无 CI 跑检查 = 本身是一条 finding；「已有但没接线或悄悄坏掉的检查」算发现而非重新发明。取证纪律本地化：候选必须带源引用（文件:行 / 事件 id / 轮次），给不出引用的不列，七类逐类交代"未见"。Evidence: `skills-frontmatter`/`skills-source-tree`/`skills-sync`/`skill-index` 29/29；`node scripts/sync-skills.mjs` 九个 surface 各 installed=1（grok 无 repo 目标），`retro` 已出现在客户端 skill 列表。
- feat(skills): 新增 `implement-spec` 目录 skill——交付链的执行入口：输入一份已带验收标准与工作项的 spec，把它整份实现到底（任务图取前沿 → `aios work` 并发派发须人工批准 → 集成分支收口 → `/review` 审查收尾 → worktree 清理）。采纳自 mattpocock/skills 的 `implement-spec`（engineering 桶，v1.3.0 毕业），它是 v1.3.0 三个新指令中本仓此前唯一没有任何入口的（`retro` 已落、`pr` 只落文书形状）。落点判定：它是 **AIOS 宿主编排面**（executionHost 选择 + `aios work` 批准制派发 + `.aios/` 状态），不是新软件阶段/`capabilityId`。「rex 控制面不得拥有 Team/进程编排」禁止的是子模块实现调度机器，不禁止用户显式触发的编排指引 skill（rex-workflow 即先例）——第一版判定以该边界为由把 implement-spec 排除出子模块是推理漏洞，已在 ADR 0003 修正。**双面模式在案**（grill ↔ rex-requirements 先例）：本 skill 服务 AIOS 用户；只装 rex-harness 的独立用户拿不到 framework-free 版，该缺口走子模块发布流补齐。上游语义本地化：任务图/前沿推进、上下文指针通讯（不复制指针可取的信息）、缺前置就停（缺验收标准先 `/grill`/`/spec`，缺工作项先 `/tickets`/`/plan`，所有权重叠不硬派）、只由用户显式触发、完成判据要求每条验收标准带真实执行证据。与既有入口的边界照旧：单工作项 `/implement`、一次性并发 `/team`、长可续目标 `/harness`。Evidence: `skills-frontmatter`/`skills-source-tree`/`skills-sync`/`skill-index`/`install-policy` 55/55；`node scripts/sync-skills.mjs` 八个 surface 各 installed=1（grok 无 repo 目标），`implement-spec` 已出现在客户端 skill 列表。
- chore(cleanup): 删除 `src/core/index.mjs`（A16 关闭，operator 授权二选一后按删除处置）——自封「核心基础设施 barrel」但全仓零 importer（scripts/ src/ packages/ mcp-server/src/ 均无引用，`esm-reexport-binding.test.mjs` 只在注释里提到它的误报史，不 import 它）。接为统一入口需要全仓改 import 路径却无功能收益；`src/core/` 目录（仅此一文件）随之移除，ESM 守卫测试通过。登记见 `docs/reference/outstanding-work.md` A16。
- feat(plan): `plan auto-gate` accepts the declared work-item identity and binds its Capability Command through it (work-14, register A23). A22 gave `plan start` an id but the gate that writes ledgers for a planned turn still passed none, so a gate-created ledger carried `workItemId: ''` while its rex activation was keyed by `plan.relativePath` or, when no plan object reached `startCapability`, by a `turn:<client>:<session>:<sha256>` per-turn hash — the ledger answered to an id and the Command that admits completion answered to something else, and `syncEvidenceToMatchingPlan` compared evidence keys against the path only. Activation keys are now an ordered preference: declared id, then ledger path, then turn hash, with an id-then-path read-through so pre-A23 path-keyed activations stay reachable. Two precedence rules came out of measurement rather than design: (1) A21's "reuse the active ledger" was swallowing an explicitly *different* declared id, so a declared id whose canonical form differs from the active plan's id now creates its own ledger (equality of canonical ids only — never text similarity); (2) `--work-item X --new-work-item` is refused with exit 1 instead of being resolved by precedence, because the combination writes a second ledger whose activation key collides with the first. `canonicalizeWorkItemId('')` must return `''`: the shared `slugify` helper falls back to the literal `'plan'` for empty input, and that made every undeclared turn look like a *different* work item, silently switching A21's reuse off (five tests failed before the cause was found). Blank and unsafe ids are refused before anything is written, matching A22. Evidence: `scripts/tests/execution/planning/flow/plan-auto-gate-identity.test.mjs` P1-P8 wired into `regression`; planning + suite wiring 89/89, workflow + rex runtime/harness + ctx-agent-core 129/129, full regression 2156 tests / 2147 pass / 0 fail / 9 skipped; mutations flip 1 / 6 / 2 / 1 assertions (drop the id precedence, restore the `'plan'` fallback, drop the id from the gate ledger, accept the contradictory pair). A fifth mutation (removing the reuse branch's id read-through) flipped nothing because `startCapability` re-derives the same keys and is idempotent on an existing activation — recorded as a deliberate second belt, not as a guarded branch.

- test(ci): the five `shell: pwsh` workflow steps are now inside the shell-syntax guard (register A15). `windows-shell-smoke.yml` had been excluded by design — the guard's header literally said non-bash steps were out of scope, which is how the A6 class (a here-document whose terminator survives YAML block-indent stripping indented, so the shell never closes it and the step dies before running anything) stayed reachable in PowerShell for six weeks. S3 now checks, on every platform and with no interpreter required, that every `@'`/`@"` here-string in a PowerShell `run:` block is closed; S4 parses each block with the real PowerShell AST parser (`Parser::ParseFile`, `pwsh` then `powershell.exe`, nothing is ever executed); S5 makes the coverage non-vacuous — the selector must find exactly the number of PowerShell steps the raw YAML declares, and a synthetic unterminated here-string plus unbalanced parentheses must both be reported while a valid script must not be. Deliberate asymmetry recorded rather than hidden: an indented terminator is legal in PowerShell 6+ but not in the 5.1 proxy available here, so S3 does not enforce column 0 and the header says a 5.1 indentation complaint is a portability warning. The guard was validated against the real file by injecting an unbalanced `@(` (S4 failed as designed) and restoring it byte-identical to HEAD.

- feat(plan): `plan start --work-item <id>` gives a work item a canonical identity so registering it twice cannot fork its ledger (work-13, register A22). Repeating an unkeyed `plan start` reserved `<slug>-2.md` and made the new document active, and because task/evidence writes only reach the *active* plan, the first ledger had no CLI path back — the same ledger-integrity class as A19/A21. Identity is **declared**, never inferred: `canonicalWorkItemId` normalises case/spacing/punctuation and refuses `..`, path separators, `:` and control characters, so `--work-item ../../elsewhere` cannot write a ledger outside the workspace and an unsafe id writes nothing at all. `openWorkItemPlan` is get-or-create: an existing id store re-activates that ledger, a lost store with a surviving document re-adopts the document (`recovered: true`) rather than reserving `-2`, and only a genuinely new id creates one. Structured state now survives switching away and back via `.aios/planning/plans/<id>.json`, and `> work-item: <id>` is recorded in the durable markdown header rather than only in gitignored state. One hole was found by the guard rather than by review: a declared-but-blank `--work-item ""` collapsed into "flag absent" and fell through to the unkeyed path, minting exactly the sibling this exists to prevent — identity is now keyed on presence (`typeof === 'string'`) and a blank declaration is refused. The unkeyed default is untouched and pinned (W4), so `plan start` does not silently change meaning. Evidence: `plan-work-item-identity.test.mjs` W1-W8 wired into `regression`; planning 75/75, wiring+workflow+ctx-agent-core 77/77, context/native/skills/dream/product-L3 35/35; five mutations each flip an assertion (blank-fallback, no id mirror, no re-adoption, no unsafe-id guard, document name ignores identity). Residual registered rather than guessed: `plan auto-gate` does not yet accept `--work-item`, so capability bindings still key on the plan path.
- fix(plan): a planned turn reuses the active ledger instead of minting a second one (work-12, register A21). `workflow-policy.mjs` hardcoded `persistence: planned ? 'create' : 'none'`, so every planned turn wrote a new `docs/plans/<slug>.md`; registering an item twice (the reproducible shape was `plan start` followed by `plan auto-gate --explicit-intent plan`) left two documents whose names differed only by a `-2` suffix, and only the newer one carried the capability activation — so `plan task --target` and `plan add-evidence`, which act on the *active* plan, silently orphaned the first ledger. The same class of stale/misleading ledger is what steered every 「继续」 resume for three weeks before A19. Reuse is now keyed on a state fact (an active, non-terminal plan exists) and never on objective-text similarity; `decision.plan` carries the reused plan to the adapter. Switching reuse on alone would have made things worse, because the reuse branch only *looked up* a stored activation and thus returned `capabilityCommand: null` for a never-bound ledger — reuse was useless, which is exactly why `create` felt necessary; it now starts a capability bound to the reused plan. `plan auto-gate --new-work-item` is the declared escape hatch, and `strict` mode reuses too (strict means "always work from a ledger", not "mint one per turn"). Boundary: repeated `plan start` still mints `-2` because that command carries no work-item identity — measured in an isolated `--workspace`, registered as A22 rather than absorbed here. Evidence: `plan-single-ledger.test.mjs` N1-N6 wired into `regression`; five mutations flip 5/7/3/1/3 assertions; planning+workflow 138/138, rex runtime+harness+team 127/127, full regression 2140 tests / 2131 pass / 0 fail / 9 skipped; A19's fail-closed pins still green.
- fix(skills): the release training gate stopped reporting nine different failures as one sentence, and now says which base it validated against (work-11, register A20). `verify-training` collapsed every rejection into `accepted training evidence is stale, incomplete, or missing the hash of the current Skill content`, so a cert recorded at the **wrong base** looked identical to stale content — and the remedy differs: re-certify at the base the gate uses, not at `HEAD`. Each blocked entry now carries `code` + `reasonKind` + `remedy` (`node scripts/aios.mjs skill certify --skill <id> --base <base>`), the `remedy` is withheld for `unreadable-input` because `certify` reads that same file, and `release-preflight.sh`/`.ps1` print the base they validated with plus that command. Three defects surfaced only once the reasons became specific: a **tampered baseline artifact** and a **cert recorded at another base** shared one branch (now `baseline-artifact-tampered` vs `baseline-differs-from-git-base`, split on whether the artifact still matches the hash its own state records); an evidence state with a **malformed/absent** `acceptedSkillHash` (V1 legacy) was reported as "different content" (now `accepted-hash-malformed` → `incomplete-evidence`); and `Invoke-NodeCheck` in `release-preflight.ps1` captured child stdout/stderr into temp files and **deleted them on failure**, so all eleven PowerShell-side checks failed with only a one-line message — it now re-flows the captured output. Five existing assertions pinned the umbrella *prose* (`/stale|incomplete|hash|evidence/i`); they pin `code`/`reasonKind` instead, because pinning sentences is what let a diagnostic gap survive inside a gate whose job is diagnosis. Evidence: `scripts/tests/foundation/skills/training/training-gate-reasons.test.mjs` R1-R6 (base-mismatch / stale-content / missing-evidence / no-remedy-when-unreadable / code-table totality / text renderer), wired into `regression`; focused run 61/61 across training + rex evidence + ecc-uplift + release-pipeline + wiring guards; five mutations (drop the `.sh` base echo, drop the `.ps1` reflow, stop emitting `remedy`, blank the code table, re-merge the tamper branch) each flip at least one assertion.
- feat(harness): give the solo loop one owner for turn consequences, and make material progress a declaration instead of a string match (work-7, interaction contract · parent-side scope). `outcome → consequence` was hand-copied across six-plus sites — `support/normalizers.mjs` (its own `inferFailureClass` / `inferBackoffAction` / `inferCheckpointStatus`), `loop/backoff.mjs` (which also carried a second private copy of the retryable failure-class set), `loop/cadence.mjs`, `gate/checkpoint.mjs`, `support/state.mjs` (eight string branches for the run-summary status), `gate/should-run.mjs` — and nothing proved they agreed: adding an outcome meant editing every one of them, and raw outcome literals spanned 19 files. They now read one frozen table, `support/turn-consequences.mjs:TURN_CONSEQUENCES`, whose lookups **throw** on an unregistered name instead of guessing. The three declaration channels are explicit: F fact (the work-6 single-writer ledger), S self-report (`selfReport{progressMade, blockedReason, summary}`), O operator (resume ack / gate release). Per the signed D3 default, **material** side effects (quota spend, cadence promotion to `active_work`, backoff-counter reset, success termination) now require the S channel to declare `progressMade`; a bare `outcome: 'success'` is still classified exactly as before but earns nothing. This removes no live capability: measured on this host, no production provider ever emitted `success` (`execute-turn.mjs` / `execute-turn-pi-rpc.mjs` emit only stopped/blocked/infra-retry/human-gate), so the tightened rule blocks only an undeclared claim. Behaviour is otherwise preserved to the branch, including `infra-retry`'s precedence over the failure-class gate in the run-status projection. Per D1 the rex `TURN_OUTCOMES` and `SOLO_OUTCOMES` vocabularies stay separate with **no** cross-vocabulary mapping — that would be dead code until a call site exists (ADR 0002 reachability), and it is deferred with the submodule wiring to D2's separate item. Cadence/backoff/run-status/checkpoint vocabularies moved into `support/constants.mjs`, and the never-imported `CADENCE_CLASSES` export was retired rather than duplicated. Evidence: `harness-turn-consequences.test.mjs` T1-T7 7/7 — T2 drives the coverage guard with a synthetic outcome to prove it is not vacuous, T7 scans the runtime source for a second owner (reintroducing one string comparison fails only T7), T4 pins the D3 rule (disabling the S gate fails only T4); `harness-runtime` + `core` 57/57; the safe-bypass seal test still discriminates (disabling the seal fails it, so updating its fixture to declare `progressMade` kept its power rather than masking it); wiring guards W1/W2/W3/W5/W6 6/6 with no snapshot drift.
- fix(cli): `aios plan` no longer answers a write request with a read-only view. Two silent substitutions made the plan ledger unwritable through what looked like the obvious command: the argv parser rewrote **any** unrecognized subcommand to `status` (so `plan list`, or a mistyped `plan setstatus`, printed the active plan and exited 0), and the `status` branch ignored `--status/--note/--force` (so `plan status --status done` exited 0 having changed nothing). This is how a plan finished on 2026-09-21 stayed `executing` in `.aios/planning/active.json` for three weeks — and a stale `executing` plan is exactly what a 「继续」 resume trusts, so the ledger was actively misleading the next session. The parser now passes the declared subcommand name through verbatim and the ops layer (which owns the branch set, and therefore the vocabulary) refuses names it does not implement, listing the valid ones; `status` refuses write flags and points at `plan set-status`; help advertises `aios plan set-status …`, which it never did — the missing line is why the trap was survivable. Pinned by `scripts/tests/execution/planning/cli/plan-cli-status-readonly.test.mjs` (C1-C5), wired into `regression`; both mutations are caught independently — reintroducing the parser fallback fails C2, deleting the `status` guard fails C3, and C4 proves the refusals are not over-wide (unforced `done` is still blocked by the done gate, `--force` still lands, `note` still persists). Also corrected the wiring guard's own stale refresh path (`scripts/tests/test-suite-wiring.test.mjs` → `scripts/tests/tooling/suites/test-suite-wiring.test.mjs`), which the test-tree move left in both the header instruction and the generated snapshot note.
- fix(tests): the `--project-root` guard-refusal pin spawned the CLI from the wrong directory. `scripts/tests/clients/client-platform/cli-project-root.test.mjs` computed `repoRoot = resolve(SCRIPT_ROOT, '..', '..', '..')`, but `SCRIPT_ROOT` is already `scripts/`, so three levels up lands one directory *above* the repository — the child ran outside the runtime root, exited 0 with a normal doctor report, and the assertion that pins "the guard refuses" could never hold. The product behaviour was always correct (`node scripts/aios.mjs internal skills doctor --client codex --scope project` from the repo root exits 1 with the actionable `--project-root <path>` line); this was a stale up-count left by the test-tree move. Fixed to one level and the file is 9/9.
- fix(skills): make Skill training evidence independent of how it is checked out. The certification validator hashes the stored `baseline-skill.md` against the Git baseline, but `core.autocrlf` materializes working trees with CRLF — so a freshly accepted certification would have been rejected by its own gate after a clean Windows checkout (proved by flipping the artifact and watching `verify-training` go `blocked`, the same platform-dependency class as the `llms.txt` fix above). The validator now normalizes line endings on both sides of the baseline comparison (reusing the skills layer's existing `normalizeEolText`, and `generate-llms-txt.mjs` drops its private copy for the same helper), and `.gitattributes` pins `docs/evidence/skill-training/** text eol=lf` alongside the other byte-compared drift artifacts. Strictness is unchanged: the new test asserts the CRLF artifact verifies *and* that a tampered baseline of any line ending is still `blocked`.
- chore(skills): re-issued V2 training certification for `rex-implement` and `rex-code-review` (`docs/evidence/skill-training/*-certification-2026-10-14T16-33-57-282Z`). The freshness gate resolves a nested-repo Skill's baseline as `git show <submodule gitlink revision at base>:skill-sources/<id>/SKILL.md`, so every `rex-harness` pointer move re-draws the baseline under the previously recorded evidence and the gate correctly reports `blocked` — the 2026-09-28 evidence died when the submodule advanced with the 0.9.x/0.10.0 Skill changes. Remedy is the sanctioned one (`aios skill certify --skill …`), and it recomputed real deterministic compliance scores for baseline and candidate (3 tasks, trainHard/validationHard/overallHard = 1) rather than copying the old state; `rex-debug` and `rex-wayfinder` still verify against their 2026-09-21 evidence because their content and baseline did not move.
- fix(site): make the `llms.txt` drift guard satisfiable on a Windows checkout. `scripts/generate-llms-txt.mjs` compares the committed artifact byte-for-byte while `core.autocrlf` materializes the working tree with CRLF, so on this machine the guard reported `docs-site/llms.txt` as permanently stale (the two recorded `llms-txt.test.mjs` failures) even though the committed blob matches the generator exactly (0 CRLF in the blob). The earlier "generated output was not refreshed since 2026-10-02" classification was wrong — nothing was stale. Fixed at one boundary: every generator read normalizes CRLF → LF (the artifact is always LF and the comparison always uses the same shape), `.gitattributes` pins `docs-site/llms.txt text eol=lf` like the other drift-guarded paths, and the guard test's own reader normalizes before splitting sections. Both directions verified on this CRLF worktree: the guard passes with 149 CRLF lines on disk, and an injected content drift still exits 1 — the guarantee kept its teeth, only the platform dependency left.
- fix(platform): cap the Windows `taskkill` wait in the kill-escalation path (work-9, A18). Some host sessions degrade the `taskkill.exe` RPC until its own ~60 s internal timeout, and the timed-out-spawn cleanup inherited that unbounded wait (measured `timeout settled after 62189ms`). `terminateChildTree` now passes `timeout: TASKKILL_TIMEOUT_MS` (1500 ms) plus `killSignal: 'SIGKILL'` and still falls back to `child.kill()`; the settle-budget assertions derive from the cap (`SETTLE_BUDGET_MS`) instead of a hard-coded 3000 ms, so a 60 s-class regression is still caught. Pinned by the win32 test that injects a fake slow killer (it wants 10 s, obeys the 300 ms cap, fallback still reaps the tree). Residual is environment-only: on a host without a working `taskkill` there is no tree-kill primitive, so the shell-shim grandchild survives and that assertion deliberately stays strict. Record: `docs/reference/outstanding-work.md` A18.
- chore(harness): bump the `rex-harness` submodule pointer to **0.10.0**, which adds recovery-backup pruning (work-8): a successful projection install (no conflict/error) prunes `.rex-projection-recovery/<root>/` to the newest 2 `.rex-backup-*` per skill and reports `prunedRecoveryBackups`; entries that cannot be attributed to a known skillId are never touched, and conflicted/failed runs prune nothing. This closes the root cause behind the 93 accumulated backups (~1.16 MB) found in work-5 — deleting that pre-existing debris stays an owner action (`docs/reference/outstanding-work.md` C5).
- fix(harness): correct the v5.13/v5.14 turn-settlement claim — the typed `rex.turn-result.v1` bridge was defined and test-covered but never wired into the live solo loop (zero production importers; settlement was reachable only through the manual `aios rex settle` pass-through). Record: `docs/reference/outstanding-work.md` A17.
- remove(harness): delete the unreachable bridge `scripts/lib/execution/harness/solo/turn-settlement.mjs` and its sub-suite per operator decision (work-4 option C, `docs/plans/2026-10-14-submodule-boundary-and-loop-closure.md`). The submodule standalone CLI surface (`settle`/`verify`/`start`) is unchanged — it has a confirmed human consumer path.
- feat(video): new standalone Remotion sub-app at `video/` producing the 45s / 1080x1920 / 30fps (1355-frame) vertical
  AIOS short for 抖音 / 小红书 / 视频号 — 8 story beats (`hook crash resume route work team proof cta`)
  drawn entirely with React + SVG (no external assets, offline-reproducible) following one real task
  (`/implement 重构浏览器层，测试全绿`) instead of a feature list. Hard subtitles carry the narration
  because the platforms autoplay muted: cues live only in `video/src/timeline.json`, are injected by
  `PromoVideo.tsx` through the single `SceneProps` contract, and `video/tests/timeline.test.mjs` rejects
  any scene that inlines its own cues. The same file is the timeline source for `timeline.ts` and
  `scripts/render.mjs`, which prints visible render progress in three channels (TTY bar, non-TTY
  percentage lines every 2.5% for agent capture, throttled `out/render-progress.json`). On-screen
  `file:line` pills were dropped as review artifacts; the claim-to-citation table moved to
  `video/README.md`. Render artifacts stay gitignored.
- feat(skills): `promo-video-pipeline` dispatches the storyboard as independent per-scene work items
  (main thread freezes `src/components/**`, `theme.ts`, `PromoVideo.tsx`, `timeline.json` and the
  `SceneProps` contract; each subagent owns exactly one `src/scenes/<id>.tsx`), keeps the
  `aios work --dry-run` preview separate from live approval, and gates completion on real render evidence
  (mp4 exists, progress json `phase=done`, `renderedFrames == totalFrames == 1355`, typecheck and test exit
  0, plus a vertical still-frame pass since layout defects only surface in rendered frames). Certified with
  `nonRegression: true` at `docs/evidence/skill-training/promo-video-pipeline-certification-*/state.json`.
- feat(video): the hard subtitles are now also the voiceover script, so 剪映 can narrate the film without a
  second source of truth. `video/scripts/narration.mjs` estimates Mandarin speech at 4.5 syllables/second plus
  0.12s of breath per cue, `npm run srt` exports frame-accurate `video/out/aios-promo.srt` (18 cues, read-aloud
  42.60s against a 45.17s film), and `video/tests/timeline.test.mjs` asserts every beat's window fits its own
  narration — that assertion, not a taste-based "quick cut" bound, is what sets the film's length. Rendering
  stays audio-free and offline-reproducible; the audio track is produced locally in 剪映 from the exported cues.
- fix(video): three beats shipped a blank screen because acceptance stills only sampled each beat's *settled*
  state. `team` fan-out cards faded in at local frame 30, so the film's middle held an empty block for a full
  second while every still frame looked clean; `resume`'s right column and `cta`'s layered chips arrived late
  the same way. Entrance timings moved forward (`team` gate 66→54, `resume` cards 30→14, `cta` clients 34→18)
  and the verification frame list now includes `beat start + 14` for every beat, re-checked by extracting frames
  from the encoded mp4 rather than from source.
- feat(video): `video/scripts/jianying_draft.py` turns the same `timeline.json` cue table into a 剪映 draft — the
  rendered mp4 on the video track plus one `VoiceOver` segment per caption — so narration no longer depends on a
  human importing an SRT by hand. It deliberately creates no subtitle track (the captions are already burned into
  the frame, a second set would double up), bypasses the third-party skill's `add_media_safe()` because its
  normalizer hardcodes `scale/pad=1920:1080` and would letterbox a 9:16 film, and puts the repository-bundled
  `ffprobe` on PATH since there is no system ffmpeg here. Verified structurally (draft `version 360000` matching
  what 剪映 11.6 writes for its own drafts, 1 video + 1 audio + 0 text tracks, 18 segments at 0.0000s offset from
  the timeline, every measured clip inside its own caption window, all audio staged inside the draft dir); opening
  the draft and exporting stay human actions because 11.6 has no working auto-export. The skill itself stays a
  user-scope install outside this repo, addressed through `JY_SKILL_ROOT`.

## [6.3.0] - 2026-10-01

- feat(pi): the Pi MCP bridge now picks its carrier from the installed pi version instead of always
  installing `pi-mcp-adapter`. pi 0.99.0 (2026-09-29) shipped a built-in `mcp` extension that reads the
  same `~/.pi/agent/mcp.json`; with the adapter also installed, pi loaded the adapter and skipped the
  built-in one, printing an `[Extension issues]` warning on every startup. `resolvePiMcpMode()` in
  `scripts/lib/components/pi/mcp-adapter.mjs` now returns `builtin` for pi >= 0.99.0 and `adapter`
  otherwise — version-detection failure stays on `adapter`, the legacy always-safe path, so old pi and
  offline/CI installs keep working unchanged. `ensurePiMcpAdapter` still merges the AIOS-managed servers
  into `mcp.json` in both modes (the file is carrier-independent), but builtin mode never installs the
  adapter: an already-installed one is only reported as `installed-conflicts` with an opt-in
  `pi remove npm:pi-mcp-adapter` hint, never removed automatically (removal flips session behavior).
  `doctorPiBridge` (`scripts/lib/components/pi/doctor.mjs`) mirrors the split: an adapter shadowing
  built-in MCP is an `[info]` note (new `notes`/`mode` result fields) instead of silence-plus-warning,
  and a *missing* adapter on pi >= 0.99.0 is `[ok]` instead of the false "Pi cannot load MCP servers"
  warning. `aios init` logs the chosen mode and `scripts/lib/integrations/clients.mjs` drops the stale
  "Pi core has no MCP surface" comment. The default carrier on pi >= 0.99.0 remains the adapter for
  existing installs; flipping init's default to builtin awaits the tool-name sweep (0.99.2 normalizes
  `-` to `_` in `mcp__` namespaces; every AIOS server name contains a hyphen).
  Guarded by new cases in `scripts/tests/pi-mcp-adapter.test.mjs` (gate table, both modes, fallback,
  explicit-version override) and `scripts/tests/pi-doctor.test.mjs` (conflict-as-info, missing-adapter-ok
  on builtin, capture-failure fallback).

- feat(skills): `/grill` becomes a registered, client-visible skill and `rex-requirements` gains a
  doc write-back step — the two halves the aihero `/grill-with-docs` pattern has that our grilling
  discipline lacked. The new thin skill `skill-sources/grill/SKILL.md` declares
  `explicit-intent: grill`, executes the rex-requirements flow, and performs its write-back rules;
  it is materialized to every repo surface by `scripts/sync-skills.mjs` (`.codex/.claude/.agents/…`)
  and installed to the seven client homes its `clients` frontmatter promises, so `/grill` finally
  shows up in slash autocomplete (previously the whole `/plan`-family existed only as text parsed by
  the Claude Code hook and workflow-policy — nothing was registered, so no client suggested it).
  `rex-harness/skill-sources/rex-requirements/SKILL.md` adds step 4 「写回仓库文档」: domain terms
  confirmed during grilling are upserted into the repo-root `CONTEXT.md` glossary in real time
  (one-line definition + why, user-authored content never rewritten); decisions that survive the
  clarification budget or get an explicit user call become `docs/adr/NNNN-<slug>.md` lightweight
  ADRs (context/decision/consequences, monotonically numbered). The boundary against
  `assumptions-recorded` is written into the rule: assumptions are unverified and never become ADRs;
  adjudicated decisions do. Old step 4 (first verifiable slice) renumbers to 5. Cross-session memory
  stays on the ContextDB lane — repo docs are the push-in-your-face complement, not a replacement.

## [6.2.1] - 2026-09-28

- fix(site): the docs and blog sites render a footer again, restoring the only non-`nofollow`
  outbound link path to `rexai.top`. `docs-site/overrides/main.html` had `{% block footer %}{% endblock %}`,
  which emptied Material's footer on every page and therefore made `extra.footer_links` (added in
  `4326b084`, holding the rexai.top / os.rexai.top / tool.rexai.top entries) dead configuration — the
  built pages contained zero footer links, and nothing failed. Found by measuring the live site: the
  `rexai-footer-links` marker appeared 0 times on `/`, `/changelog/`, and `/zh/`. The footer block now
  includes `partials/copyright.html` again, `docs-site/assets/redesign/footer.css` styles it with the
  existing `--rex-*` tokens (imported from the shared `custom.css`, so both builds pick it up), and
  `mkdocs.blog.yml` gains the matching `footer_links` so `cli.rexai.top/blog` — the property that ranks
  for version queries — also links the content hub.
  `scripts/tests/site-footer-links.test.mjs` guards the footer block, both configs, and the stylesheet
  so an emptied block fails instead of silently dropping the links.

- docs(readme): the repository README is now a funnel to the two sites instead of a dead end at the
   page bottom. `rexai.top` previously appeared only at line 79 and line 161-166, so a visitor arriving
   from GitHub search, Explore, or a trending list never saw the content hub above the fold. Added a
   `RexAI` badge to the badge row and a content-hub entry to the first link row in both `README.md` and
   `README-zh.md`, plus a "Where to go next" / 「下一步去哪儿」 section placed directly after the
   30-second install — the highest-intent moment in the document — routing to the docs site, the
   per-version blog, and the Chinese long-form hub. Both READMEs are bundled into the release archive
   by `scripts/package-release.sh`, so this ships with the next release.
 - docs(readme): the site links now carry brand anchor text instead of bare domains, and badge `alt`
   text now names the domain it points to. Measured against the rendered page: GitHub marks every
   outbound README link `rel="nofollow"`, so a README link transfers no PageRank, and a badge is an
   image link whose anchor text is the `alt` attribute (`alt="Docs"` threw that text away). What the
   README can still do is put the brand and the domain in the indexed text of a page that ranks, so the
   mapping "this repository = cli.rexai.top + rexai.top" is stated in prose ("Official properties of
   this project" / 「本项目的官方站点」) and repeated in branded anchors.
   `scripts/tests/readme-funnel.test.mjs` guards the placement, the `alt`-carries-domain rule, and the
   brand anchors so the funnel cannot silently rot back into page-footer links.

- fix(tests): test temp directories no longer land in the repository root. `fs.mkdtemp(prefix)` with a single
  argument treats the prefix as a path **relative to cwd**, so every `browser-mode` / `bsk-writer` run
  grew fixture directories in the working tree, and a `git add -A` committed 18 of them into
  `f0bb56c2` — the commit the v6.2.0 tag points at. Both files now create temp dirs under
  `os.tmpdir()` and remove them in a file-level `after` hook (cleanup runs even when an assertion
  fails), the tracked junk is removed, and `.gitignore` adds a root-anchored `/aios-*/` guard.
  Shipped v6.2.0 artifacts were never affected: `scripts/package-release.sh` packs an explicit
  allowlist, so stray root directories cannot enter the tarball or zip.

## [6.2.0] - 2026-09-28

- feat(skills): `rex-engineering-standards` joins the bundled Rex projection as a shared
  reference skill (projected via the new `sharedReferenceSkillIds` list in
  `rex-harness/src/clients/install.mjs`; no fake capability binding — it stays a
  prerequisite standard, not a Command-selectable Provider). The code-producing
  Providers (`rex-implement` / `rex-design` / `rex-code-review` /
  `rex-refactor-hardening`) now load it before executing, AGENTS.md documents the
  prerequisite as workflow-policy rule 6, and the standard gains a file-granularity
  baseline (one responsibility per file, ~400-line soft budget, kebab-case naming,
  no semantically empty splits) plus a matching Definition of Done row. Covered by
  `rex-harness/tests/contract/client-install.test.mjs`,
  `rex-harness/tests/skills/skill-sources.test.mjs` (including a trigger-chain guard
  that fails the build if a code-producing Provider stops naming the standard), and
  `scripts/tests/rex-client-projection.test.mjs` (whose hardcoded projected-skill
  count now derives from the source tree).
- chore(deps): `rex-harness` submodule bumped to 0.8.0, which ships the trigger chain
  above and adds `scripts/refresh-projection-history.mjs` so a skill edit cannot ship
  without its canonical projection digest.
- feat(release): the host release now refuses to ship an unpublished kernel — `scripts/check-release-submodule.mjs` (backed by `scripts/lib/release-submodule-gate.mjs`) proves the recorded `rex-harness` gitlink is pointed at by a tag on the submodule remote, and `release-preflight.sh` / `.ps1` fail closed when it is untagged or unprovable. This closes a defect that had already shipped: the published v6.1.0 archive bundled rex-harness 0.7.0, a version with no tag and no release artifact on the submodule remote, so its changelog claim resolved to nothing and standalone rex-harness consumers received no such release. Covered by `scripts/tests/release-submodule-gate.test.mjs` (8 cases: annotated vs peeled tag refs, non-tag refs rejected, missing input fails closed, `--tags-file` path used by PowerShell) and wired into the regression suite.

## [6.1.0] - 2026-09-23

- feat(browser): MCP default-off with mode selection (none|playwright|bsk, default none); install-time prompt + switch command + BSK connect baseline; 4-language release blog

## [6.0.13] - 2026-09-22

- fix(integrations): ZCode's HTTP key name is read out of ZCode's own runtime instead of being guessed — `zcode` moves from `manual` to the verified `config` plane and writes `{"type":"http","url":...}` into `~/.zcode/cli/config.json` / `<repo>/.zcode/config.json` under `mcp.servers` (closes A14). ZCode's CLI bundle validates every `mcp.servers` entry with a strict discriminated union on `type` (`stdio`/`http`/`sse`): `http` and `sse` require `url`, `stdio` requires `command`, and an unknown field gets that one server dropped with a `config_mcp_server_invalid` warning. AIOS records that schema as the entry's evidence, and no client falls back to `manual-step-required` any more.
- fix(mcp): the ZCode strict-schema allowlist had been reverse-engineered from the `stdio` branch only, so it dropped `url` (plus `protocolVersion`/`oauth`) — an AIOS-managed HTTP server would have lost its required field and been discarded by ZCode. The allowlist is now the schema's full field set, with a test that fails if `url` is ever dropped again.

## [6.0.1] - 2026-09-21

- refactor(quality): the engineering-standards skill moves to where its consumers live — `aios-engineering-standards` is now `rex-engineering-standards`, shipped inside the `rex-harness` submodule (release 0.7.0) alongside `rex-implement` / `rex-refactor-hardening` / `rex-code-review` / `rex-design`. The dependency direction is now correct: the capability chain's shared quality baseline belongs to the capability chain, and standalone rex-harness consumers (npm `@rexleimo/rex-harness`) no longer miss it. The router and `pre-edit-safety-gate` reference the new name; content and Definition of Done are unchanged. Digest registered in `src/clients/projection-history.json`; host catalog back to 27 skills, rex projection now 14.

## [6.0.0] - 2026-09-21

- feat(quality): engineering standards become a first-class framework citizen — the new `aios-engineering-standards` skill encodes the classic software-engineering baseline as the Definition of Done for all code-producing work: Clean Architecture dependency rule and boundary discipline (high cohesion, low coupling, minimal interface), Ousterhout deep modules (small interface, deep implementation; strategic over tactical programming), Clean Code naming/function/error-handling rules, DRY and orthogonality, a test-coverage bar, a toolchain bar for new projects (lint + pre-commit hooks + CI + structured logging), and ADD documentation for consequential changes. `aios-workflow-router` now loads the standard before `rex-implement` / `rex-refactor-hardening` / `rex-code-review` / `rex-design`, and `pre-edit-safety-gate` checks the chosen change shape against it — the quality baseline rides the existing evidence-driven capability chain instead of running beside it.
- docs(site): new public Engineering Standards page (en/zh/ja/ko) with the four-stage engineering capability model, the reference reading list (Clean Code, Refactoring 2, The Pragmatic Programmer 2, GoF Design Patterns, Clean Architecture, DDIA, A Philosophy of Software Design, The Mythical Man-Month, Making Things Happen) with core values, free legitimate resources, and a book-principle → AIOS-mechanism mapping; release blog post in en/zh/ja/ko.

## [6.0.12] - 2026-09-22

- fix(audit): A8-class re-export defect, unresolvable test entries, and invisible unit suite (A11-A13)

## [6.0.11] - 2026-09-22

- fix(ci): release-health-watch heredoc terminator (A6), plus a workflow shell-syntax guard

## [6.0.10] - 2026-09-22

- fix(cli): per-command flags are discoverable from help (A10)

## [6.0.9] - 2026-09-22

- test(guard): W5 CI-execution guard closes A5; W4 rejected on measurement

## [6.0.8] - 2026-09-22

- test(rl): wire the test:rl-* suites into CI; repair their stale paths and CLI assertions

## [6.0.7] - 2026-09-22

- fix(rl-orchestrator): undefined normalizeText reference in shipped evidence path (A8)

## [6.0.6] - 2026-09-22

- fix(integrations): WorkBuddy MCP registration is verified; correct the C1/C3 premises (C2, C4 closed)

## [6.0.5] - 2026-09-21

- fix(tests): newly wired regression tests are hermetic on a clean checkout; repairs the CI outage that blocked v6.0.2-v6.0.4

## [6.0.4] - 2026-09-21

- fix(tests): POSIX-hermetic automem-loop and team-pi-worker; repair v6.0.2/v6.0.3 CI failure

## [6.0.3] - 2026-09-21

- fix(mcp): planning evidence accepts deliveryTicket alias; B1 closed

## [6.0.2] - 2026-09-21

- First tagged release of the 6.x line: this tag also carries v6.0.0 (engineering standards as a framework citizen) and v6.0.1 (the baseline moves into the rex-harness submodule) — their sections above ship as part of this release.
- fix(tests): repair stale static-analysis pins and the Windows regex over-match; remove the retired `.pi/skills` projection residue — platform-smoke's TLS assertion anchored on the first literal `aios-install.ps1`, which now legitimately names the preferred local installer path (the real contract: the Tls12 line is the first statement of the generated PowerShell script, so it holds for both installer paths); its tsx-dispatch pin still read `dispatch.mjs` after TUI startup moved to `dispatch/helpers.mjs` in the documented 425-line split. Removing the retired `.pi/skills` junction residue then exposed a masked second failure in `pi-shipped-content-hygiene`: `REPO_RELATIVE_INVOCATION` matched `scripts\` inside the absolute Windows install-root path the same test demands five lines later (a Windows-only self-contradiction) — the third alternative is now token-anchored, the two exact-shape alternatives unchanged. Both files green; full regression 115 files / 1310 pass / 0 fail.
- fix(tests): adjudicate and repair the remaining unwired families — all five were stale tests, never implementation defects. `automem-loop` expected `verified` where the automatic loop deliberately lands shared-scope entries as `candidate` (bare runtime identity is indistinguishable from a forged one; the declaration still records `turn.verified`). `death-notice` assumed the notices path concatenates onto the raw workspace root instead of deriving from the context-db root. `interception-mcp-stdio` was left inconsistent by its own 3b689cc4 update — the protocol payload passes through unchanged by design and the compact packet rides in `_meta.aios`, so the file had been red since 2026-06-11 without being a redaction regression. `hook-user-prompt` expected `direct`/`planned` where the north-star principle (never guess read-only from free text; the hook has no explicit-intent channel) yields `guarded`. `ecc-agent-workflow` expected a compatibility-tier reason no client can produce any more (`deprecated: true` was retired with the opencode deprecation). `doctor-bootstrap-task` likewise pinned pre-split reason codes. All seven families green.
- test(scope): wire the repaired families into the `regression` suite — 9 files (the 7 above plus `interception-mcp-proxy`) now run on every regression; the unwired baseline shrinks 82 → 73, exactly the wired count, enforced by the W3 wiring guard. Full regression: 124 files / 1396 pass / 0 fail.
- fix(release): `check-site-sync` no longer demands a four-language release blog post for maintenance (patch) releases. Repo history is the evidence: v5.17.0–v5.17.4 shipped changelog-only with no posts at all, while feature releases (v5.16/5.18/5.19.x/5.20/6.0.x) carried them. Minor/major releases still require the post; unknown version shapes default to requiring it.
- chore(skills): re-certification evidence for the three skills touched by the 6.0.1 rename (`aios-workflow-router`, `pre-edit-safety-gate`, `rex-engineering-standards`).
- fix(clients): Qoder now resolves its **edition home** — `resolveQoderHome()` in `scripts/lib/platform/paths.mjs` picks `~/.qoder-cn` on a CN install (matched by product-written markers, `QODER_HOME` still wins) instead of hardcoding `~/.qoder`, so user-scope skills and `settings.json` land in a directory the shipped runtime actually scans. Distribution command names resolve as candidates (`commandAliases` finally has consumers): capability detection, Windows spawn classification, and command→client reverse lookup all accept `qoder` / `qodercli` / `qodercn` / `qoder-cn` / `qoderclicn`.
- perf(tests): add `npm run test:affected`, mapping the working-tree diff through the import/spawn graph (`scripts/lib/test-impact.mjs`) and running only the related regression test files, with a printed fallback to full regression whenever impact cannot be proven. The design came from measurement: `--test-concurrency` 4→8 changed nothing (476s vs 461/483s), and per-file timing puts `scripts/tests/aios-orchestrator.test.mjs` alone at 484s of a 774s serial sum — the lever is fewer files, not more threads. `AGENTS.md` now tiers verification (affected → regression → `test:scripts`), and `workspace.test.mjs` awaits its `assert.rejects` so parallel runs stop reporting false failures.

## [5.20.0] - 2026-09-19

- feat(clients): first-class Qoder support — `qoder` joins the registry as the tenth client (skills projection into `.qoder/skills`, all 27 catalog skills whitelisted for qoder install/mirror, MCP migration into `settings.json` `mcpServers` user + `.qoder/settings.json` project scopes, verified `qoder mcp add --scope user|local|project` CLI registration, AGENTS.md native projection, `aios init --agent qoder`, shell-bridge + doctor + codemap wiring, team/harness spawn via headless `-p --yolo`). Model routing is `own` (account-bound `/model`, no verified headless `--model` yet). Docs-site and blog updated in en/zh/ja/ko.

## [5.19.2] - 2026-09-18

- fix Windows artifact names: a promotion whose candidate id contains a colon was written as an NTFS alternate data stream, so it was lost silently

## [5.19.1] - 2026-09-18

- fix(cli): declare the workflow disposition with --explicit-intent; test: gate test-file wiring integrity

## [5.19.0] - 2026-09-18

- feat(judgment): expose the opt-in gate as the aios_judge MCP tool and a rex stage gate

## [5.18.0] - 2026-09-18

- feat: opt-in System One judgment gate (aios judgment) with fail-closed enablement; fix Gemini strict-schema MCP config that broke startup; fix CRLF frontmatter leak into client skill trees; honest vendor client coverage; docs and blog in four locales

## [5.17.5] - 2026-09-18

- fix(skills): `isSourceRepoProjectRoot` now recognizes an AIOS source checkout by its own
  markers (`package.json` name `aios-scripts` plus `scripts/sync-skills.mjs`) instead of only
  matching when the runtime root and the project root are the same directory. Doctor runs that
  use the installed runtime inside this repo no longer print one
  `[warn] ... project install overrides global install` per skill per client (197 such lines on
  the dev repo), which drowned the findings that actually need attention. Covered by
  `scripts/tests/skills-resolution.test.mjs`.
- fix(workflow-surface): a recognized legacy Superpowers projection whose target no longer
  exists is reported as inert instead of an unresolvable conflict, and
  `--adopt-legacy-superpowers` now unlinks it without requiring the deleted source root. Such
  links previously could not be cleaned through any sanctioned path (adoption demanded the
  source directory), so `aios doctor` kept reporting `legacy workflow projection retained`
  forever (47 links on the dev machine). Links with an unrecognized shape still fail closed as
  conflicts. Covered by `scripts/tests/rex-workflow-surface-reconciliation.test.mjs`.
- fix(workflow-surface): fail closed when a skill home exists but is not a directory. Windows
  reports `ENOENT` where POSIX reports `ENOTDIR`, so a misconfigured `AGENTS_HOME` file let
  reconciliation converge and retire the legacy source root; it now returns `inspection-failed`
  and touches nothing.
- feat(scripts): `scripts/prune-legacy-skill-copies.mjs` exposes the metadata-gated legacy skill
  copy removers that were previously importable but not runnable (`--dry-run` by default,
  `--apply` to delete, then re-run `aios setup --components skills --client all`). Directories
  without AIOS install metadata (user-owned skills) are never removed. Covered by
  `scripts/tests/legacy-skill-prune-cli.test.mjs`.
- feat(cli): `--project-root <path>` declares which project a command operates on, and
  `AIOS_PROJECT_ROOT` is now actually read (it was only ever exported to the TUI child, so any
  wrapper or CI that set it was ignored). Resolution is `flag > env > cwd`: an explicit flag that
  is not a directory fails closed, a stale env value falls back to cwd instead of breaking the
  command, and skills doctor echoes `Project root: ...` so the target is never implicit. Before
  this, `scripts/aios.mjs` used `process.cwd()` as the single source, which made `--scope project`
  unreachable for anyone whose cwd is the runtime root. Covered by
  `scripts/tests/cli-project-root.test.mjs`.
- fix(skills): the project-scope refusal now names its own cause and its own way out: "project
  scope resolved to the AIOS runtime root (...); run from your project directory or pass
  --project-root <path>" when cwd sits on the runtime root, and "... is an AIOS source checkout;
  its skills are owned by sync-skills" when the target really is an AIOS checkout. The first case
  previously read like a permission problem and had no sanctioned escape. Guard refusals print one
  actionable line instead of a stack trace.
- perf(tests): `regression.concurrency` goes from 1 to 4, so a full `npm run test:regression` stops
  serializing 105 files behind one another (fresh checkout: 631s -> ~90s; this dev checkout: 631s ->
  ~448s, because one file still runs its own slow cases back-to-back). Measured across six
  full-suite samples with 0 failures (three in a fresh worktree, three in the dev checkout), c=8 gave
  no further gain. Isolation was audited before
  raising it: no test binds a port, none writes the real `$HOME`, every `git` write happens inside an
  `mkdtemp` fixture, and each fixed temp path literal belongs to a single file -- and
  `node --test` parallelizes whole files, so there is no cross-file collision to guard. The remaining
  dev-box cost is written up, with an A/B that localizes it to local state rather than to committed
  code, in `docs/plans/2026-09-18-regression-throughput-parallel-evidence.md`.

## [5.17.4] - 2026-09-18

- fix(release): `scripts/release-stable.sh` / `.ps1` now create an **annotated** tag
  (`git tag -a vY.Z.W -m "AIOS vY.Z.W"`) instead of a lightweight tag, matching what
  `release-preflight` requires (the tag object itself must carry the release note).
  Until now the documented release shortcut could not satisfy its own preflight, so
  the tag had to be created by hand. Asserted by
  `scripts/tests/release-pipeline.test.mjs` (dry-run output now pins the `-a` form).

## [5.17.3] - 2026-09-18

- fix PowerShell 5.1 GBK decode breaking non-ASCII .ps1 (UTF-8 BOM + guard test)
- fix(shell): `aios doctor` now flags a native shim whose baked runtime root no longer resolves (`native shim baked root is stale ...; re-run shell setup to refresh it`) instead of reporting `[ok] native shim installed`, so a shim left pointing at a deleted test temp root becomes visible and repairable. Covered by `scripts/tests/aios-components.test.mjs`; TDD receipts in `docs/plans/2026-09-18-shell-shim-baked-root-guard-*.md`.

## [5.17.1] - 2026-09-18

- fix(update): never downgrade through GitHub `releases/latest`. The `latest` pointer is ordered by release creation time, not semver, so the late-published v5.16.2 hotfix displaced v5.17.0 and `aios update` would have pulled the lower version. Update checks now list stable releases and pick the highest semver (`scripts/lib/lifecycle/release-lookup.mjs`); release-installer self-update resolves the exact newest tag, skips (instead of downgrading) when the installed VERSION is not older, and pins the download via `AIOS_RELEASE_TAG`/`AIOS_ASSET_URL`; both installers now prefer an exact-tag asset URL over the `latest` pointer (`scripts/aios-install.sh`, `scripts/aios-install.ps1`). Covered by `scripts/tests/release-lookup.test.mjs` and extended `self-update-lifecycle`/`release-pipeline` regression tests.

## [5.17.0] - 2026-09-18

- feat(model-router): client model-routing contract (`relay` vs `own` + protocol gating) so a routed model is always launchable by the worker client; explicit `-m`/`AIOS_MODEL_*` moves the client, automatic routing moves the model
- feat(model-router): channel availability state machine (ok/degraded/down with TTL + cooldown) learned from real dispatch outcomes, readable via `model-router availability` and applied when `AIOS_MODEL_AVAILABILITY=1`
- fix(ctx-agent-core): classify relay channel evidence (`model_not_found`, `no available channel`, truncated gateway responses) as `channel-unavailable` instead of generic `tool`, so agent-side mistakes no longer cool a model down
- feat(specs): model registry schemaVersion 2 — 25 models, `protocolPaths`, per-model protocols, relay-curated primaries (planning→glm-5.2, browser-automation→gpt-6-astra, research→gemini-3.8-flash, review/security→claude-opus-5)
- fix(opencode): raise the AIOS strict agent step ceiling from a hard 24 to a generous default (500) with a real escape hatch. `agent.steps` is a hard tool-step cap: at the limit OpenCode disables tools and the model can only write a partial status report, so multi-milestone plans could never finish in one session (each prompt bought only 24 steps). `AIOS_OPENCODE_MAX_STEPS` now resolves the value (positive integer, or `0|off|none|unlimited` to omit the cap); the key is still always written because `opencode.json` is deep-merged and an omitted key would leave a stale `steps: 24` behind. The strict OpenCode agent no longer tells the model to split objectives into batches and hand work to a "next session"; it now finishes until acceptance criteria are met or a real blocker is recorded (`scripts/lib/opencode/config.mjs`, `scripts/lib/opencode/strict-primary-agent.mjs`, covered by `scripts/tests/ecc-uplift.test.mjs`).
- fix(opencode): keep the 19 projected Rex role cards out of the OpenCode agent switcher. The agents emitter now writes `hidden: true` into `.opencode/agents/*.md`; verified against opencode 1.18.27 that the TUI agent cycle only includes `mode !== "subagent" && hidden !== true`, while `task` dispatch only filters `mode !== "primary"` and does not exclude hidden — so the role cards stay dispatchable by the orchestrator and by `task`, but no longer clutter the picker. `aios-build` remains the visible primary/default; `build`/`plan` are untouched. Covered by `scripts/tests/aios-components.test.mjs`.
- feat(cli): `--provider` and codemap `--client` help now derives from the client capability registry instead of hardcoded lists
- docs(model-router): document the routing contract, protocol→endpoint map and channel availability (en/zh); routing tables regenerated from the registry
- feat(pi): pi promoted to team provider (spawn-verified); fix(pi): aios_memory execFile namespace crash; fix(native): Windows JSON path bake

## [5.16.1] - 2026-09-16

### Fixed

- Runtime self-update from a git clone now syncs the required `rex-harness` submodule worktree after `git pull --ff-only`. Previously the pull advanced the recorded gitlink while the submodule files stayed on the old kernel, pairing new scripts with a stale rex-harness (`ensureRexHarness` only initializes when files are missing; stale-but-present content was never refreshed). `updateHarnessRuntime` additionally accepts an injected command runner for testability, and `scripts/tests/self-update-lifecycle.test.mjs` — previously registered in no suite, so its macOS `/var → /private/var` temp-path sensitivity went unnoticed — is now part of the regression roster with green-path, dirty-skip, and installer-path coverage (`scripts/lib/lifecycle/self-update.mjs`).

### Added

- Release preflight submodule gate (sh and PowerShell): the run fails when the rex-harness checkout does not match the recorded gitlink (`+`/`U` status) or when the submodule HEAD is not reachable on its remote. Release assets bundle the submodule worktree as plain files, so an unsynced or unpushed pointer would silently ship an outdated planning kernel (`scripts/release-preflight.sh`, `scripts/release-preflight.ps1`).
- rex-harness version identity caught up: the kernel is tagged `v0.6.0` at the commit recorded by this release (package.json said 0.6.0 while the last tag was v0.4.3, leaving doctor's reported version unable to distinguish shipped code).

No breaking changes.

## [5.16.0] - 2026-09-16

### Added

- ZCode agents plugin: rex role cards (`agent-sources/roles/*.md`) now install as executable ZCode subagents. ZCode has no project-scope subagent definitions, so AIOS materializes them as a local inline plugin (`~/.aios/zcode-plugin`, `.zcode-plugin/plugin.json` + `agents/*.md`) and registers it through the user-level `plugins.dirs` config — the same plugin-agents channel the official document-skills plugin uses. `aios init --agent zcode` installs/refreshes the plugin idempotently (dry-run plans without writing), and a `doctor:zcode-agents` gate (standard/strict profiles) reports manifest validity, agent drift against the AIOS install's agent-sources, and registration state (`scripts/lib/components/zcode/agents-plugin.mjs`, `scripts/lib/components/zcode/doctor.mjs`, covered by `scripts/tests/zcode-agents-plugin.test.mjs`).
- ZCode (Z.AI desktop coding app) is now a first-class AIOS client: registry definition (skills/native/team/harness, `zcode-cli` runtime id, AGENTS.md instruction file, `--mode yolo` unattended args, empty model flag — zcode 0.16.5 has no headless `--model`), `aios init --agent zcode` detection, project skills on the shared `.agents/skills` root (ZCode natively scans it after `.zcode/skills`; global scope installs to `~/.zcode/skills`), native AGENTS.md co-writing, codemap instruction mapping, interception matrix entry (L2, mcpProxy only — turn compression and hook injection stay unverified), ctx-agent one-shot/interactive wiring (`--mode yolo -p <prompt>`), team routing (spawn-based, drives the bundled CLI headlessly like the other providers), and shell-bridge management-command blocklist. No `agents` capability in the project-projection sense: ZCode has no project-scope subagent-definition surface (its native extensibility is `.zcode/workflows/*.workflow.js`, a different artifact type) — rex agents reach ZCode through the inline agents plugin above. Harness/team dispatch resolves the bundled CLI through the PATH (`zcode` native shim + a launcher for the app-bundle `zcode.cjs`) (`scripts/lib/clients/core/definitions.mjs`, covered by `scripts/tests/client-registry.test.mjs`, `scripts/tests/zcode-mcp-nested-migration.test.mjs`).
- ZCode MCP config migration: the JSON migrator now supports dot-path server namespaces (`mcp.servers`) and a `zcode-json` format that normalizes the three AIOS-managed servers to ZCode's strict server schema — `startupTimeoutSec` (seconds) is translated to `timeoutMs` (milliseconds) and unknown fields are dropped, because ZCode silently discards servers carrying unknown keys; user-owned servers pass through untouched. Targets: home `~/.zcode/cli/config.json` and project `.zcode/config.json` (`scripts/lib/components/browser/mcp-zcode.mjs`, covered by `scripts/tests/zcode-mcp-nested-migration.test.mjs`); the MCP proxy inspector resolves dot-path namespaces the same way (`scripts/lib/interception/mcp/proxy-inspector.mjs`).
- Pi MCP bridge gains a third AIOS-managed server: `aios-bridge` (the stdio AIOS MCP server) joins `code-review-graph` and `aios-memory` in the Pi-global `mcp.json`, so Pi agents can call the plan toolset (`aios_plan_start/task/status/gate/auto_gate`), `aios_capability_evidence`, `aios_context_pack`, and friends — the `aios_plan_auto_gate` declaration channel documented in AGENTS.md is now real on Pi. All three servers stay cwd-less and follow the Pi session cwd (`scripts/lib/components/pi/mcp-adapter.mjs`, covered by `scripts/tests/pi-mcp-adapter.test.mjs`).
- memo: `aios memo checkpoint "<text>"` CLI subcommand pins a `[checkpoint]` milestone entry to workspace memory through the same locked append path as the `memory_checkpoint` MCP tool (`scripts/lib/memo/cli/commands/checkpoint.mjs`, covered by `scripts/tests/memo-checkpoint.test.mjs`).
- Pi extension v0.2.0: new `aios_memory_checkpoint` tool — the `aios_memory_checkpoint` reference in the injected session policy now resolves to a real tool instead of only the MCP surface (`packages/aios-pi`, covered by `scripts/tests/pi-extension.test.mjs`).
- harness: `--transport rpc` for `aios harness run|resume --provider pi` drives Pi as a long-lived managed RPC session (`pi --mode rpc --no-session`) instead of one-shot spawns; every turn gets a fresh `new_session` so context semantics match one-shot, and any transport failure discards the session and rebuilds on the next turn. Turn prompts, compression packets, and the JSON iteration contract are shared with the one-shot executor (`scripts/lib/lifecycle/harness/execute-turn-pi-rpc.mjs`, covered by `scripts/tests/pi-rpc-execute-turn.test.mjs`).
- doctor: new `doctor:pi-bridge` gate (standard/strict profiles) reports the AIOS-managed servers inside the Pi-global `mcp.json` and the pinned MCP-client adapter; skips cleanly when Pi is not installed. Repair hints use the global `aios` CLI only (`scripts/lib/components/pi/doctor.mjs`, covered by `scripts/tests/pi-doctor.test.mjs`).
- `aios init --agent pi` now advises when the project has no `.mcp.json`: the Pi-global file carries only the cwd-less AIOS servers (code-review-graph, aios-memory, aios-bridge); shell/browser/auth servers reach Pi through a project-level `.mcp.json` that the pi-mcp-adapter reads directly.
- shipped-content hygiene gate for the Pi surface: prompts, tool descriptors, MCP server definitions, doctor output, init advisories, and memo skill projections are asserted free of repo-relative invocations (`node scripts/…`), and the extension root resolution is verified customer-style (env-provided install root + arbitrary cwd) (`scripts/tests/pi-shipped-content-hygiene.test.mjs`).

### Changed

- Pi project skills move to the shared Agent Skills root: Pi natively scans both `.agents/skills` and `.pi/skills`, so an AIOS copy in each made Pi report the skill as already loaded and skip the shared-path duplicate. `pi.projectSkillRoot` is now `.agents/skills` (registry, skills/native sync manifests, native emitter, Pi AGENTS.md guidance, and the bundled rex-harness projection map all follow); the retired `.pi/skills` projection is gone from the repo, and the skills doctor warns about leftover AIOS-managed `.pi/skills` installs with a paired `removeLegacyPiSkillRootInstalls` cleanup that never touches user-owned skills (`scripts/lib/components/skills/doctor.mjs`, covered by `scripts/tests/skills-resolution.test.mjs`). Global scope is unchanged (`~/.pi/agent/skills` stays per-client; the shared global root is not an AIOS install target).
- memo skill (source + all client projections) documents the new `aios memo checkpoint` capability alongside pin/useful.
- `aios-mcp-server.mjs` header comment now reflects its real 12-tool surface (it outgrew the original Hermes-only 5-tool bridge when the plan toolset landed).

No breaking changes.

## [5.15.0] - 2026-09-14

### Added

- Pi extension read-only `aios_codemap_search` tool (reuses `search --source code`), carried to users automatically by install/update.
- Pi MCP bridge: `aios init --agent pi` now installs the pinned MCP-client adapter extension and seeds AIOS-managed servers (code-review-graph first, plus session-following aios-memory) into the Pi-global `mcp.json`, so Pi gains MCP capability on install. Merge never clobbers user-edited servers (kept + reported), and network failures degrade to warnings so offline machines keep the extension + project `.mcp.json` path (`scripts/lib/components/pi/mcp-adapter.mjs`, covered by `scripts/tests/pi-mcp-adapter.test.mjs`).
- Skills doctor: `removeLegacySharedRootInstalls` cleanup paired with the legacy shared-root warning — removes only AIOS-managed copies (`managedBy=aios` metadata), never user-owned skills, with `dryRun` preview (covered by `scripts/tests/skills-resolution.test.mjs`).

No breaking changes.

## [5.14.0] - 2026-09-13

First tagged release since v5.11.0: it ships the v5.12.0 memory-plane work (section below), the Pi client, the LoopX control-plane adoption, and a process-lifecycle hardening pass that removes the last known long-task stall/orphan classes.

### Added

- Pi coding agent as a first-class AIOS client (`pi` / `pi-coding-agent`, skills + native + harness; no `team`/`agents` — no sub-agents upstream): registry, `PI_CODING_AGENT_DIR` home, L2 host capabilities, native emitter + instruction layer, all 25 skills projected (`skills pi -> installed=25`), ctx-agent one-shot/interactive, harness one-shot strategy, shell-bridge support.
- Pi modeled MCP-less (`format: none`, empty scopes): migration/proxy/codemap collectors skip Pi instead of pretending an MCP surface exists.
- `aios-pi-extension` (`packages/aios-pi`): 4 model-callable tools (memory recall/write/feedback, skill search), `tool_call` safety gate, `before_agent_start` policy injection, `/aios-root` + `/aios-policy` commands; `aios init --agent pi` registers it into Pi settings.
- Pi `--mode rpc` JSONL driver (`scripts/lib/pi/rpc-client.mjs`): correlated commands, settle detection, fail-closed permission dialogs. See: [Pi client blog post](/blog/2026-09-pi-client-aios/).
- harness: turn settlement gate (LoopX Phase 1) — typed `rex.turn-result.v1` envelope, `effectRef` idempotency (execution token + payload sha256), CAS write-back with expected-status precondition, append-only settlement journal, token rotation on seal; independent `rex-harness verify` validator process (an executor cannot self-verify) gates every settle from the harness bridge.
- harness: should-run pacing gate (LoopX Phase 2) — pure decision module (`run|wait|ask|self_repair|quiet`), cadence ladder (180 s base, ×1.5 to a 30 min cap, material progress resets to base), and a 24 h duty-ratio compute quota where only material turns charge; decisions and balances are projected into the run summary and `aios harness status`.
- harness: unattended tier (LoopX Phase 3, explicit opt-in via `--unattended`; attended behavior unchanged) — one bounded read-only safe-bypass turn on operator gates with code-level sealing of material claims, unchanged-poll quiet shutdown (default 3 consecutive noops), and re-entry only through explicit `resume`.
- harness: host probes + dream planning contract (LoopX Phase 4) — codex-cli/pi probe registry wired into dry-run readiness (fail-closed `host-unsupported`); `DREAM_PLANNING_CONTRACT` (five permission seals) embedded into dream proposals, governance receipts, and write-time validation.
- harness: read-only dashboard (LoopX Phase 5) — `aios harness dashboard` renders a static HTML projection with no service process and no state writes.
- harness: `--turn-timeout-ms` per-turn provider timeout (default 30 min, bounds 1 s – 6 h) so legitimate long verification turns can be granted more time explicitly.
- skills: new `portrait-916` skill source; `rexai-image-generation` gains a zero-install stdlib-only Python executor with hard deadlines, live poll progress, and bounded retries (no silent hangs) plus refreshed macOS script.

### Changed

- process lifecycle: staged process-tree termination — POSIX children are spawned detached (process-group leaders) and timeout/abort performs SIGTERM group → 3 s grace → SIGKILL group → liveness verify, reporting `treeAlive`/`killEscalated`/`childPid`; shared by harness turns and subagent client spawns.
- harness: SIGINT/SIGTERM now abort the active turn tree (Ctrl-C cannot leave a detached provider running) and then run the normal stop path.
- harness: timed-out trees that survive SIGKILL fail closed (`blocked`, stop) instead of starting the next iteration; only fully cleaned trees keep the `infra-retry` + backoff path.
- aios-shell MCP: timeouts/cancellations run the same staged tree cleanup and force-settle even when `close` never fires because a grandchild still holds the pipe.
- dream: public surface of `dream/index.mjs` re-exports the full governance API again (the governance batch had narrowed it to `DREAM_PLANNING_CONTRACT` only).

### Fixed

- harness: provider turn timeout no longer orphans a still-running provider tree (regression pinned by a POSIX grandchild test); long verification turns can no longer leave claude/opencode/etc. writing into the same workspace as the next iteration.
- aios-shell: `aios_shell` calls can no longer hang past their timeout when the command leaves background grandchildren (the OpenCode "git diff spins forever" class); background grandchildren are killed with the tree.
- skills: `portrait-916` frontmatter description quoted for strict YAML parsers.

## [5.12.0] - 2026-09-09

### Added

- memo: pinned block budget (`C3`) — `renderPinnedBlock` in `scripts/lib/memo/storage/pinned.mjs` renders line-numbered rows with `chars`/`maxChars`/`remaining`/`truncated` metadata (limits clamped to [512, 20000], default 5000, shared with the CLI env override); new `aios memo pin status` prints the usage triple.
- memo: progressive-disclosure search (`C4`) — `aios memo search --level summary|full`; summary rows keep ~100 tokens each (degenerate token runs collapse to two repeats before the 400-char cap) and every search ends with an observable `pack: N entries, M chars, level=X` footer; default `full` output is unchanged.
- memo: hygiene command (`E2`+`E3`) — `aios memo hygiene` surveys sessions, pinned budgets, and per-session `l2-events.jsonl` sizes with explicit proposals (read-only by default); `--archive-stale-sessions` moves stale historical sessions into `context-db/archive/` (conflict-safe, reversible) and `--rotate-events --max-events N` rotates keep-newest with moved+kept accounting and sha256 before/after. Nothing ever deletes; space-level `workspace-memory--*` sessions are never archived; `memo storage events.jsonl` (the recall primary store) is out of rotation scope.
- memo: memory-plane report (`G2`) — `aios memory report` / `aios memo report [--json]`: per-space volume, invalidation ratio, candidate backlog (pending/promoted/rejected/expired), feedback impressions/useful/adoption, and pinned budget in one read-only pass.
- memo: migration importers (`F3`) — `aios import --format claude|continue|roo|conventions --file <path> [--dry-run] [--json]` turns Claude `MEMORY.md`, Continue rules, `.roomodes`, and `CONVENTIONS.md` into governed memo candidates (importer runs as a no-publish runtime identity so every fact lands `candidate`, tagged `#import-<format>`, idempotent on re-run). Landing page: `docs/import-migration.md`.
- memo: optional local embedding coarse rank (`A4`) — `AIOS_MEMO_EMBEDDER=hash-lexical` enables a deterministic in-process embedder; the coarse stage is union-only (it can widen the candidate pool, never shrink the token-matched set) so enabling it cannot lose results; recall-ab gains a fifth `embedding` arm with zero top-1 drift vs baseline. The embedder interface accepts any local model implementation.
- memo: real-corpus eval harness (`G1`) — `scripts/lib/memo/eval/real-corpus.mjs` derives deterministic queries from the live corpus at runtime (no memo text is copied into the repo). Live baseline on this checkout: top-1 98% / top-5 100% (171 events, 50 queries); run it before/after any retrieval change.
- contextdb: tiered AgentView (`H1`) — `buildAgentView(workspaceRoot, sessionId, taskType, { tier })` implements the 2026-05-10 design tiers T0 (meta + project context), T1 (+filtered skill summaries and a continuity pointer), T2 (+the active skill's full text), T3 (+full continuity packet, lineage, knowledge snapshot); every view carries a per-section char budget. New pull-based CLI: `node scripts/ctx-agent.mjs workspace-view --session <id> [--task-type <type>] [--tier T0-T3] [--json]`. Default tier stays T3 for legacy callers.
- memo: Autodream Phase B (`E1`) — `AIOS_AUTODREAM_AUTO=1` (default off) enables automatic triggers: session close and an idle threshold (`AIOS_AUTODREAM_IDLE_MINUTES`, default 30). Triggers run dream `preview` only; proposals flow through the existing governed apply. The dream engine is deterministic and zero-LLM, which is the cheapest possible consolidation route.
- contextdb: optimistic-lock conflict markers (`F1`) — a rejected stale `writeWorkspaceMeta` now auto-writes an auditable `conflicts/{timestamp}.json` marker (expected/actual version plus requested updates) before throwing `OptimisticLockError`.

### Changed

- verification: backlog items closed by verification — `C1` budget-degradation projection confirmed landed (full → summary+ref → ref-only, hard-constraint items preserved at full fidelity with observable budget overflow, production caller in orchestrate); `C2` tool-log offload + Mermaid canvas confirmed already shipped (`aios refs`, `aios canvas`); `F2` premise corrected — `generatedTargets` is derived from client `agents` capability, and on-box contract checks show gemini has no agent-definition consumer and hermes consumes Claude/Codex layouts via `import-agent`, so the 4/7 gap reduces to one pending workbuddy definition-directory check.
- tests: nine new suites added to the regression manifest (`test-suites.json`, 92 → 101 files); full regression now 1106 tests / 1100 pass / 0 fail / 6 skipped.

### Fixed

- tests: Windows-only cleanup flake — workspace test temp dirs now remove with `force` + retries after the conflict-marker change left files behind (ENOTEMPTY).

## [5.11.0] - 2026-09-06

### Added

- skills: memo extraction contract (`skill-sources/memo/SKILL.md`) — persistable entries carry five declared elements (`fact`, `entities[]`, absolute ISO `date`, `evidence_ref`, `confidence`), plus exclusion rules (no greetings/half-baked/un evidenced claims) and precise-replacement editing discipline via `--supersedes`.
- skills: verification verdict judge loop (`skill-sources/verification-loop/SKILL.md`) — `VALIDATION` now carries `score`/`complete`/`missing[]` feeding the next round, a declared retry budget (default 3, exhaust = stop and hand off), and a structured self-requery template for parse failures.
- skills: harness progress self-report (`skill-sources/aios-long-running-harness/SKILL.md`) — every Execute/Verify round declares `progress_made` + `blocked_reason`; three consecutive no-progress rounds force Recover-with-changed-hypothesis or escalation, and `planning_interval` (default 5) re-emits the frontier as a checkpointed replan.
- skills: ContextDB compression tiers (`skill-sources/contextdb-autopilot/SKILL.md`) — `FULL`/`PARTIAL`/`SUMMARY`/`EXCLUDED` per event range declared by the model, newest 2 rounds never below `PARTIAL`, summaries stay agent-visible with evidence refs, and every compression writes an auditable event.
- skills: weak-model pinning + budget declaration (`skill-sources/model-router/SKILL.md`) — bypass chores (summaries, titles, memory extraction, routine docs/reviews) pinned to cheap models with downgrade-only fallback; every dispatch declares `budget`/`quota_scope`/`downgrade|fail-fast`.
- skills: dispatch node recipe headers (`skill-sources/aios-work-dispatch/SKILL.md`) — each parallel work item declares `tools` whitelist, `model` + `task-type`, `max_turns`, `budget`, `output_schema`, `retry`, and `subflow`; downstream triggers on schema-validated artifacts, never prose handoffs.
- rex-harness: planning progress ledger (`skill-sources/rex-planning/SKILL.md`) — per-round `{is_complete, in_progress[], facts[], assignment}` with empty-facts honesty rule, plus partial-results-with-resume-handle on over-limit/failing nodes and no-overlap/no-invented-deps discipline for `parallelGroups`.

### Changed

- docs: release mirrors updated (`docs/zh-CN/CHANGELOG.md`, `docs-site/changelog.md` + `docs-site/zh/changelog.md`) and release blog posted (`blog-site/2026-09-v511-prompt-contracts.md` + zh/ja/ko editions).
- repo: `rex-harness` pointer advanced to `1401a72` (planning ledger + `projection-history.json` LF pin so future digest appends never rewrite the whole file).

### Notes

- Prompt-only release: no runtime behavior changes, no breaking changes; all suites green with no code modifications.
- Refresh local projections after pulling (`aios setup`/`aios update` re-runs the rex client projection installer for `rex-planning`).

## [5.10.0] - 2026-09-06

### Added

- ci: gitleaks secret-scan job on ci-main, and `npm audit --omit=dev --audit-level=critical` gates for root and mcp-server runtime dependencies (current baseline: 0 critical).
- docs: prompt authoring norms (`docs/prompt-authoring-norms.md`, mirrored as `rex-harness/skill-sources/PROMPT-AUTHORING.md`, summarized in AGENTS.md) — contract-first skills, model self-reporting for semantic judgments (ReAct-style), hard gates as verification protocols; keyword/regex intent guessing is banned in prompts and helper scripts.
- release: `scripts/release-preflight.sh` now refuses to pass while `docs/evidence/skill-training/` has uncommitted changes (v5.9.0 white-run guard: evidence must live in the tagged commit) and prints the exact annotated-tag command.

### Changed

- ci: every GitHub Action is pinned to a full commit SHA (checkout, setup-node, upload-artifact, cache restore/save, pages suite, github-script, CodeQL); the release workflow runs the changed-Skill training evidence gate before the full test matrix (fail fast); `windows-shell-smoke` installs with `npm ci` for reproducible runs.
- docs: AGENTS.md now leads with the AIOS orchestration control plane identity (browser MCP marked as a legacy component, not the project's center); mkdocs site descriptions (en/zh/ja/ko) drop the stale "Graph Engine" narrative; README quick-tour unified on the installed `aios` CLI.
- gitignore: `docs/evidence/skill-training` certification output (the 7 canonical filenames per run) is whitelisted for plain `git add` — no more `git add -f`; `pptx-ai-coding-share/node_modules/` and `.cache/` are ignored; the stale root `opencode.json` ignore rule is removed (the file is a tested native-sync projection and stays tracked).

### Fixed

- Windows regression suite is fully green: the orchestrator agent export and codemap instruction drift guards compare line-ending-normalized content, and `.gitattributes` pins `agent-sources/**`, `scripts/lib/specs/*.json`, and the root instruction files to LF. The two chronic Windows-only failures were checkout CRLF artifacts, not drift, and running the tests no longer dirties `scripts/lib/specs/orchestrator-agents.json`.
- repo: 351 vendored `pptx-ai-coding-share/node_modules` files and 110 tracked `.cache/` mkdocs font files removed from git (regenerable, now ignored); four stray root debug logs deleted.

## [5.9.0] - 2026-09-02

### Added

- feat(memory): prompt-driven memory activation across clients — `aios session start` now registers a ContextDB session (idempotent, `--session-id/--agent/--client`), new `aios-memory` MCP server (`memory_recall` / `memory_write` / `memory_checkpoint`) for hook-less clients, Memory Trigger Contract projected into AGENTS.md / CLAUDE.md / GEMINI.md. Local-only surfaces (machine-specific paths, gitignored): project `.mcp.json` + `.gemini/settings.json` entries, `~/.workbuddy/mcp.json`, `.opencode/plugins/aios-memory.ts`.
- feat(codex): installer-managed home config — `aios` native sync now writes `~/.codex/config.toml` with a managed region carrying `[projects]` `trust_level = "trusted"` (fixes the recurring codex startup hook-trust prompt) and all five AIOS MCP servers (codex previously registered none). Idempotent, preserves user content, strips legacy unmarked AIOS tables.

### Changed

- gemini is no longer marked deprecated in the client registry: the vendor stopped iterating Gemini CLI, but AIOS keeps full per-client support (MCP memory, instruction projection, skill sync) per the all-client promise.

### Fixed

- fix(memory): review findings — memory MCP server handles messages concurrently (aligned with shell-mcp-server, slow recall no longer blocks ping/initialize), OpenCode plugin recall stash bounded (32-entry LRU), `parseSessionArgs` flag mapping and `runSessionStartTimeline` JSON contract now covered by tests. Note: `aios session start --json` output shape changed from a bare array to `{ registration, lines }`.

## [5.8.2] - 2026-08-29

### Fixed

- **计划任务状态回写不再越级（Harness/CTX/Rex 控制面）**：`syncPlanWithIterationOutcome` 过去在每轮同步时用 `findWritableTask()` 重新挑任务，而不是绑定 provider 明确返回的任务 ID；只要外层 `solo-runtime/loop.mjs` 与内部 `subagent/phase finalize` 两条路径对同一个成功 turn 各触发一次同步，第二次就会把**尚未执行的下一个 pending 任务**直接标成 `done`。现在：
  - 完成状态只认显式 ID——新增 `taskId` 入参，并接受 outcome 里的 `outcome.taskId`（`normalizeSoloIterationOutcome` 已保留该字段），`loop.mjs` 在 turn 开始拿到 `markPlanTaskInProgress()` 返回的任务 ID 后原样回传；
  - 没有显式 taskId 时**只落证据、不标 done**，绝不猜一个待办任务去完成；
  - 写 `done` 前做证据校验：outcome 必须带 evidence/keyChanges/summary，且任务声明的 `targets` 必须在 `git diff --name-only` 里有实际改动，否则保持 open 并打印原因；
  - hard fail 分支同理，只标显式任务或当前 `in_progress` 任务为 `blocked`；
  - `attachPlanVerificationEvidence` 质量门通过时只结算当前 `in_progress` 任务，不再 fallback 到 pending。
  - **进一步收敛（回归修复）**：`syncPlanWithIterationOutcome` 内部**不再调用 `markPlanTaskInProgress`**。`subagent-runtime/phase-plan-sync.mjs` 以无 `taskId` 的 `success` outcome 调用 sync 时，旧实现仍会把下一个 pending 任务强制置为 `in_progress`——虽不标 `done`，但错误推进了计划状态（越级的 in_progress 形态）。现在 sync 只记录证据 + 处理显式 `taskId`，`in_progress` 状态完全由 harness loop 持有；死代码 `hasCommitEvidence` 一并移除，`hasTargetFileChanges` 修正绝对/相对路径匹配。

### Added

- **WorkBuddy 作为受支持的 AIOS agent**：新增 `workbuddy` 客户端注册，native 同步可为其生成项目级 AIOS 工作流指令与 skills 目录。
  - 客户端定义：`projectSkillRoot=.workbuddy/skills`、`nativeMetadataRoot=.workbuddy`、指令文件 `AGENTS.md`、runtime id `workbuddy-agent`；MCP 落点 `~/.workbuddy/mcp.json`（`mcpServers`），home 目录支持 `WORKBUDDY_HOME` 覆盖；
  - **可作为 solo-harness provider 被驱动**：WorkBuddy 应用内自带 CLI
    `/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy`（别名 `cbc`，
    v2.115.0），支持 `-p/--print` 非交互、`--output-format json`、`--model`、`--worktree`、`--acp`
    与 `-y/--dangerously-skip-permissions`。据此把 `commandName` 定为 `codebuddy`
    （此前误填 `workbuddy`——真实二进制不叫这个名字，会让 shim 与 readiness 检查整条链断掉），
    并登记 `modelArgFlag=--model`、`unattendedArgs=['--dangerously-skip-permissions']`，
    在 `ctx-agent-core` 的 one-shot / interactive 注册表补上 `workbuddy-agent` handler。
    实测 `codebuddy -p "<prompt>" --dangerously-skip-permissions` → exitCode 0 / stdout `OK`；
    `aios harness run --provider workbuddy --dry-run` → `Provider CLI (workbuddy): found on PATH`。
    该二进制默认**不在 PATH**，需自行加入：
    `export PATH="/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin:$PATH"`
  - 能力声明 `skills` + `native` + `harness`；不声明 `team`/`agents`：该 CLI 的
    subagent/groupchat 路由尚未验证，不做承诺；
  - 新增 emitter `scripts/lib/native/emitters/workbuddy.mjs`，并把 AGENTS.md 共写方收敛为单一常量 `AGENTS_MD_COWRITERS`（codex → opencode → grok → hermes → workbuddy），同批次只由优先级最高的客户端写入，杜绝互相覆盖；
  - `detectHookClient` 支持 `WORKBUDDY_HOME`；codemap 的 AGENTS.md 目标客户端加入 workbuddy。
  - **MCP 全链路接入**：注册 `~/.workbuddy/mcp.json` 后，遍历 registry 的写入面自动覆盖——browser / shell / auth MCP 迁移与代理注入（走 `collectClientMcpTargets`）、interception proxy 巡检；codemap（CRG）走的是硬编码目标表 `CODEMAP_MCP_TARGETS`，已单独补入 workbuddy 条目，`internal codemap install --client workbuddy` 实测可规划注入 `/Users/rex/.workbuddy/mcp.json`。
  - interception 能力矩阵同步：`CLIENT_ORDER` 与 `config/host-capabilities.json` 均加入 workbuddy（L2：`mcpProxy` + `compactPacket`，限制为无 CLI、无 shell 拦截）。两处必须一起改，否则 `capability_matrix`（只取 `CLIENT_ORDER`）与 `turn_compression_matrix`（`CLIENT_ORDER ∪ ALL_CLIENTS`）长度不一致。
  - **skills 全量覆盖**：`skill-sources/*/SKILL.md` 的 frontmatter `clients` / `repoTargets` 与 `config/skills-sync-manifest.json` 的 `generatedRoots` 是三处独立白名单，漏掉任何一处 skills 都装不上（表现是 `no catalog skills matched` / `No generated target root configured for surface`）。三处均已加入 workbuddy，`sync-skills.mjs` 实测 `workbuddy -> installed=24`。
  - `.gitignore` 增加 `.workbuddy/skills/`（与其它客户端的 skill 投影一致，属可再生产物）。

## [5.8.1] - 2026-08-26

### Fixed

- **aios-shell MCP 卡死/空转**：客户端（opencode/codex）在执行 `aios_shell` 长命令期间完全无响应，需要 Esc 中断再发"继续"才恢复。根因是 MCP server 与 stdio proxy 主循环**串行处理** JSON-RPC——一条长命令阻塞全部后续请求（包括 Esc 触发的 `notifications/cancelled`），客户端取消不了命令也收不到任何响应。现在：
  - `shell-mcp-server.mjs` 主循环并发处理：长命令执行期间 ping / cancelled / 其它请求仍即时响应；
  - `stdio-proxy.mjs` 主循环并发转发（代理层同样不再被上游长命令阻塞）；
  - 支持 `notifications/cancelled`：客户端中断时按 requestId 立即终止命令，不再等到超时；
  - Windows 下用 `taskkill /T /F` 杀整个进程树，避免 cmd.exe 退出但 node/npm/git 子进程残留；
  - stdin 关闭时清理所有在途命令，杜绝孤儿进程。
- **保留 aios-shell 代理链路与观测数据面**：aios-shell 仍经 `aios-mcp-proxy.mjs` 提供 `_meta.aios` 观测元数据与本地 ref 存储（RTK/Caveman 为客户端侧唯一输出压缩，不与之冲突），修复只落在并发处理与取消转发，不改变配置生成。`SHELL_TOOL.description` 已移除过时的 "compression via AIOS MCP proxy" 承诺（代理不压缩工具输出，原样转发）。
- **MCP server 启动超时兜底**：Codex `config.toml` 生成的 browser/auth/shell server 段均带 `startup_timeout_sec`（60/30/30）；OpenCode 全局 `opencode.json` 迁移时若缺失则注入 `experimental.mcp_timeout: 90000`，作为并发修复之外的防御性兜底，避免 MCP server 启动挂起时客户端无限等待。
- **rex-harness 需求澄清触发改为 LLM 语义判断（去掉正则）**：旧实现用正则从请求措辞推断"需求模糊"（`MISSING_REQUIREMENTS_PATTERN` / `VAGUE_BEHAVIOR_PATTERN` / `VAGUE_GOAL_PATTERN`），只能命中显式措辞，语义层模糊（点名具体功能但缺验收标准/范围/成功标准）永远不触发。现在：
  - `derive-facts.mjs` 删除全部模糊正则与 `hasMissingRequirementsSignal()`，不再生产 `ACCEPTANCE_CRITERIA_MISSING`；
  - `requirementsCapability.activate()` 仅由 `grill`/`spec` explicit intent 或领域词汇歧义 observation 触发——模糊与否由 LLM 语义判断并归类为 intent；
  - `rex-requirements` SKILL.md 重写为**执行期内嵌问询**：grill 是制作过程中遇到决策点才停下来问的交互（一次一题、带假设、3 轮收敛），不是流水线开头的前置审问会；description 双触发（LLM 自助判断模糊信号 / rex-harness 激活）；
  - 阶段边界插入天然支持：`advanceSoftwareWorkflow` 在每个 Capability 完成后重新选择，delivery 中途遇到决策点可在下个阶段边界插入 requirements 澄清，澄清完成后继续原 Capability。

### Changed

- `serializeTomlServer`（`scripts/lib/components/browser/mcp-toml.mjs`）支持 `startup_timeout_sec` 字段；`buildAiosMcpProxyServer` / `buildAiosShellMcpServer` 支持透传 `startupTimeoutSec`。
- `rex-code-review` skill 新增**场景化子代理验收模式（Acceptance）**：验收子代理无上下文污染、独立执行正常/边界/异常场景矩阵并回收证据；`references/acceptance-scenario-matrix.md` 提供场景矩阵与 prompt 模板。

## [5.8.0] - 2026-08-22

### Added

- Self-evolution pipeline under `scripts/lib/lifecycle/evolution/`: structured verdict contracts (`verdict.mjs`), promotion state machine with audit trail and rollback (`promotion.mjs`), deterministic acceptance evaluator (`evaluator.mjs`), and an integration bridge to existing memo-candidate and dream governance (`integration.mjs`).
- Explicit evolution triggers (`evolution/trigger.mjs`) with manual / threshold / schedule modes, configurable `minCandidates` (default 5) and `cooldownHours` (default 24), plus workspace lock to prevent concurrent runs.
- Evolution status reporter (`evolution/status.mjs`) that explains why consolidation has not fired (pending candidate count, last run, next eligible time).
- AIOS version compatibility and update notice (`lifecycle/update-notice.mjs`): six states (`up_to_date`, `update_available`, `update_allowed`, `update_blocked`, `update_incompatible`, `update_check_failed`), semver-aware policy (patch/minor/major), channel gating (stable/beta/dev), deduplicated notifications with security-update override, and graceful degradation when the update check fails.
- Deterministic evolution test fixtures (`scripts/tests/fixtures/evolution/`): failing trajectory, replay/holdout tasks, malicious content sample, conflicting and superseding memories, stale baseHash, and trusted-core mutation scenarios.
- Release regression coverage for the full lifecycle: session finalize/recovery → candidate → trigger → verdict → promotion → canary → rollback, plus version-notice behavior.

### Changed

- Session finalizer (`lifecycle/session-hooks/finalize.mjs`) now runs on every session exit path (normal completion, abort, timeout, exception) via `onSessionEnd` hook and the interactive exit guard, generating reviewable memory candidates automatically. Previously `autoMemoSessionClose()` was only reachable through the manual `aios session close` CLI.
- Verdict hashes are computed over decision-relevant fields only (excluding timestamps), so identical evaluations produce identical hashes and acceptance decisions are reproducible.
- `aios update --check [--json]` is now wired to the version notice service and performs a network-bounded, check-only release lookup without installing components.
- Solo sessions now persist an owner PID/heartbeat and per-iteration `started`/`completed` markers. Graceful SIGINT/SIGTERM requests are checkpointed, while startup reconciliation distinguishes live owners, crashed iterations, and stale sessions before generating interruption candidates.

### Fixed

- `aios memo` / `dream` auto-trigger chain was broken: session end only performed a save guard and never called `autoMemoSessionClose()`, so no candidates were generated and consolidation never fired. The chain is now closed: session end → candidate → threshold check → dream → proposal → gated promotion.
- `createPromotion` now accepts `previousStableVersion` so rollback can restore the prior stable version.

## [5.7.0] - 2026-08-15

### Added

- Planned and resume turns collect budgeted ContextDB hits plus a real CCRG `graph.db` query (`ccrg: queried|unavailable|skipped`).
- Codex and Grok `UserPromptSubmit` hooks: native sources, `--client` on `aios plan hook-user-prompt`, and managed outputs `.codex/hooks.json` / `.grok/hooks/aios-workflow.json`.
- Parallel `aios work` items get isolated rex ledgers and fail closed when `ownedPathPrefixes` are missing or rex bind fails.

### Changed

- AIOS capability state write-through to `.rex-harness/` so standalone rex-harness can run without `.aios/workflow-activations`. Old activation files are not migrated.
- Resume/recall phrases live in one table shared by workflow policy and ContextDB intent.
- `rex-harness` standalone store can find/persist workflows and restart a completed or blocked work item.

### Fixed

- `startStored` reuses an already-active work-item workflow instead of overwriting the index.
- `XAI_API_KEY` no longer identifies the hook client as Grok.
- Team and harness routes do not put `## AIOS RECALL` into `--objective`.
- Rex isolation only fail-closes work-item jobs that already have owned path prefixes and a real `rootDir`; generic orchestrate dispatch keeps launching.

## [5.6.1] - 2026-08-12

### Added

- `aios work` now decomposes concurrent work items from the active structured plan: eligible plan tasks become work items with dependencies, owned paths (`targets` + `allowedWrites`), and acceptance criteria preserved. Semicolon-separated `--context` remains the fallback, so no-plan invocations are unchanged.
- Added stable `aios rex ...` forwarding to the bundled Rex Harness executable, without requiring global `PATH` installation or mutation.

### Fixed

- Post-dispatch report recomputed work items without the active-plan task source, so the report's top-level `workItems` could disagree with the executed dispatch plan; the report now preserves the plan-driven decomposition.

### Changed

- New canonical `aios-work-dispatch` skill teaches agents when to enter `aios work` parallel dispatch (planned disposition, at least two independent work items, disjoint file ownership, no strict ordering), how to express decomposition (structured plan tasks first, `;`-separated context fallback), and the preview/approval boundary. `aios-workflow-router` now routes parallel-capable planned work to the dispatch skill.

## [5.6.0] - 2026-08-11

- feat: aios work concurrent multi-agent dispatch entry

## [5.5.3] - 2026-08-10

### Fixed

- Stabilize AIOS-managed OpenCode launches by defaulting to `--pure`, while preserving an explicit `AIOS_OPENCODE_ENABLE_EXTERNAL_PLUGINS=1` opt-out. This bypasses external-plugin dependency waits and incompatible global plugins without disabling built-in plugins or MCP servers.
- Bound OpenCode work with a 24-step agent budget, a 90-second MCP timeout, a default shell timeout, deduplicated external Skill discovery, and workflow guidance that prevents recursive code-review-graph suggestion loops.
- Replace the obsolete OpenCode CRG `app.on` integration with current hooks, debounce and time-limit graph refreshes, and automatically close idle or orphaned browser profiles to prevent long-lived Chrome process trees.

## [5.5.1] - 2026-08-08

### Fixed

- Agent lifecycle promotion now follows verified managed smoke, provenance, and bidirectional metrics evidence instead of a hardcoded six-agent allowlist. All canonical Agent roles can be promoted without weakening fail-closed evidence validation.
- `agents smoke` now covers all 19 canonical roles by default, including documentation, React, refactor, and TypeScript specialists.
- AIOS status now reports workflow blockers as unmet agent or quality gates instead of incorrectly attributing every blocked recipe to missing Agent smoke evidence.
- macOS `/var` and `/private/var` path aliases are canonicalized in the client projection contract test.

### Verification

- 19/19 managed Agent live smoke probes pass with Codex, including smoke, provenance, and pre/post metrics evidence.
- Rex workflow policy: 74/74; Rex integration: 52/52; full root test suite: 1033 tests, 1023 passed, 10 skipped, 0 failed.

## [5.5.0] - 2026-08-08

### Added

- **需求对齐（Ask-First）**：工作流现在会主动识别模糊请求（如"优化一下前端页面"、"Improve the landing page."），在规划前自动进入需求澄清（rex-requirements / Grilling 模式），与用户对齐可观察行为后再开发，交付用户想要的东西而不是"完成一个任务"。
- **思考优先级链**：`rex-requirements` 与 build agent 增加"查 → 推 → 猜 → 问"行为准则——先从环境查证、再从上下文推断、必要时采用标注假设的默认值，**提问是最后手段**；提问必须携带理解 + 选项 + 默认值（Ask-with-hypothesis），用户不回答时自动采用默认继续，永不卡住。
- **澄清预算与假设收敛（防死循环）**：requirements 澄清契约新增 `anyOf` 收敛组（`acceptance-criteria-recorded` 或 `assumptions-recorded` 二选一），澄清会话有明确时间盒出口；累计 3 轮未收敛时把未决项记录为假设清单（`assumptions-recorded`）随交付物一起交付，用户验收时可见。未决项不阻塞，杜绝"无限询问、永不执行"。
- 类型化 `requirements-decision` 工件（`requirements-decision-recorded` 证据）加入澄清证据契约，确认一次后同需求不再重复触发澄清。

### Changed

- `derive-facts` 结构性推导：泛化优化目标 + 无验收描述 + 无特指功能实体 → 自动产生 `acceptance-criteria-missing`，不再依赖用户措辞中出现"需求不清/验收标准"等关键词；排除完成时态与名词化陈述（如"优化方案提交了"）的误报。
- `rex-requirements` 证据契约：验收标准/非目标可与假设记录二选一收敛；`validate-command-evidence`、`capability-pack`、`software-workflow-runtime` 契约校验支持 `anyOf` 收敛组。
- 前端 UI 专项：界面/风格方向不清晰时先给出 1-2 个方向（风格/布局/交互）让用户选择确认，确认后才实现。

### Fixed

- 修复 `rex-harness` 子模块与主仓库 gitlink 漂移导致的主仓库 workflow 测试失败（`assertSoftwareWorkflowCommandContract` 导出缺失）。
- `commandContract` 校验不再把 `anyOf` 收敛组误判为非法 expectedEvidence。

## [5.5.2] - 2026-08-08

- Disable Chrome launch-agent autostart

## [5.4.4] - 2026-08-06

### Fixed

- `agents smoke --live` no longer fails for clients that wrap probe replies in their JSON output contract (e.g. Codex): the probe prompt now explicitly overrides the output contract with an ACK-only marker, ACK detection tolerates JSON-wrapped replies, the post-receive compression proof is required only for outputs at or above `minRawBytes` (short outputs are inlined by design and no longer fail the smoke), and empty compression refs no longer crash evidence recording.
- Add `AIOS_AGENT_SMOKE_TIMEOUT_MS` env var and `agents smoke --timeout-ms <ms>` CLI flag to replace the hardcoded 30s live probe timeout (default raised to 60s).
- Live smoke probes now auto-retry with escalated timeouts (base, 2x, 4x) on transient slow responses before blocking an agent, so a single slow cold start or model queue delay no longer leaves agents permanently workflow-disabled; the final blocker message includes the recovery command for raising the budget.

## [5.4.3] - 2026-08-06

### Added

- Add CRG (code-review-graph) decision checkpoints to the workflow layer: `aios-workflow-router` and `rex-workflow` now call `get_minimal_context` before acting, `get_impact_radius` + `query_graph(tests_for)` before editing, `semantic_search_nodes`/`query_graph` before searching code, and `detect_changes` after each stage; when CRG is unavailable the flow degrades to `rg` + file reads without blocking.
- Add `aios init` `--yes` / `--retry` / `--force` options with a new `install-state` module that tracks component installation state for idempotent setup/update runs.

### Changed

- Rename the solo harness journal directory from `solo-harness` to `worker-journal` (session artifacts now live under `artifacts/worker-journal/`); legacy `solo-harness` directories are migrated automatically on first read, and solo worktree temp prefixes follow the new name.

## [5.4.2] - 2026-08-05

### Fixed

- Remove the retired `ai-browser-book` and `AIOS_BROWSER_USE_REPO` runtime dependency from browser MCP selection, installation, migration, and lifecycle recovery.
- Make the repository-local Node/Playwright MCP (`scripts/run-local-browser-mcp.mjs`) the only browser MCP entrypoint, with complete-dist validation and source/tsx fallback.
- Make browser installation install local MCP dependencies, Playwright Chromium, build the MCP server, migrate client configuration, and expose `browser_health` for runtime readiness checks.
- Add cross-platform browser MCP regression coverage, Hermes migration coverage, and a GitHub release workflow check for the local browser installation path.

## [5.4.1] - 2026-08-02

### Fixed

- `aios update` runtime self-update is now safe on Windows release installs. Previously, running update from inside the install tree left the process cwd in the directory that the installer needs to delete; Windows cannot delete a cwd-held directory, so the remove step failed silently and the new version ended up nested at `<install>/aios/`, breaking the post-update re-exec with `MODULE_NOT_FOUND`. The updater now moves the working directory outside the install tree before running the installer, the installer verifies the old directory was actually removed (failing loudly instead of nesting), and the re-exec checks its entry point and emits a clear remediation message.
- The updater now prefers the local `scripts/aios-install.ps1` for release-installer updates instead of always fetching it remotely, so defensive installer fixes take effect immediately.
- Remove the leftover untracked `agent-sources/skills/` directory (gitlink removed in an earlier commit) that broke the token-discipline sync test.

## [5.4.0] - 2026-08-01

### Added

- Rex activation store now writes through a write-ahead transaction (`.aios/workflow-activations/transactions/`): Workflow and Activation projection writes are atomic, an incomplete transaction rolls forward automatically on restart, and reads validate consistency between the two, failing closed on divergence.
- Add Wayfinder Artifact schema validation (`rex-harness` `src/domain/wayfinder-artifact.mjs`): Navigation Map, Decision Graph, Decision Ticket, and Next Slice structure validation; a partial artifact cannot claim a Decision Ticket or Next Slice.
- Add Planning Artifact schema validation (`src/domain/planning-artifact.mjs`): Frontier ready/blocked mutual exclusion, Parallel Group cross-group uniqueness, Convergence Gate, and Runtime Artifact Contract validation.
- Add `normalizeEvidenceRefs()`: every Artifact evidence ref must carry a protocol prefix and reject TODO/TBD/placeholder values, covering all Wayfinder, Planning, and Requirements artifacts.
- Add `wayfinderArtifact` / `planningArtifact` tool parameters to the AIOS MCP server, supporting typed artifact submission for the Wayfinding and Planning capabilities.
- Complete the S1-S5 Skill source and eval batches in `rex-harness`; all 13 canonical Skills pass an independent SkillOpt gate, and current digests are appended to `projection-history.json`.

### Fixed

- Client projection now re-validates the backup marker digest against managed history before restoring an interrupted backup, preventing a forged junction from being promoted to a live Skill directory (`interrupted-backup-untrusted`).
- The same Command token can no longer be advanced twice concurrently; a store file lock makes concurrent writers receive `AIOS_REX_STORE_BUSY`.
- Plan evidence mirroring (`syncEvidenceToMatchingPlan`) no longer throws on failure; it returns `planEvidence.status = 'failed'` instead, keeping already-committed Rex state visible to the caller.
- The AIOS adapter no longer forwards a `provider` field for a blocked workflow decision, preventing hosts from misusing a blocked provider binding.

### Changed

- `rex-harness` version bumps `0.4.3` -> `0.5.0` (includes all Added/Fixed changes above).
- `recoverInterruptedArtifacts` signature changes from `(targetRoot, skillId)` to `(targetRoot, plan)`, letting callers pass digest history without the function re-reading the history file.

## [5.3.0] - 2026-07-30

### Added

- Add `aios_plan_task` MCP context proposals that derive target, caller, callee, import, and test candidates from the workspace codemap without mutating the active plan.
- Add explicit `aios plan task <id> --confirm-context-candidates` human confirmation before selected inferred context can be delivered to orchestration.
- Prefer pending tasks with persisted execution context during default orchestration, return confirmation as structured argv instead of shell text, and make candidate confirmation recoverable after interruption.

### Breaking

- **BREAKING:** Structured plans are written as schema v3 on the next explicit plan write; older runtimes cannot read upgraded plan state.
- **BREAKING:** Context Lifecycle V1 session close writes a candidate sidecar instead of publishing a shared memo automatically.
- **BREAKING:** Dream governance mutations (approve, reject, archive, restore, and GC) return DENY audit receipts until a trusted broker/concurrency authority is available; dream apply remains proposal-only.

### Changed

- Plan and execution-context paths must resolve inside the workspace; external absolute paths are blocked as invalid_plan_path.

### Migration

- Review and promote desired session-close memories with memo candidate promote instead of relying on automatic shared-memo publication.
- Treat dream proposals as review artifacts; do not rely on dream apply or GC to delete canonical memo events.
- Back up plan state before downgrading AIOS, or keep a v3-capable runtime available to read an upgraded plan.
- Move plan and context source files under the selected workspace before orchestrating them.

## [5.2.1] - 2026-07-23

- train pre-edit safety gate decision guidance

## [5.2.0] - 2026-07-23

### Fixed

- Keep shared workflow guidance client-neutral across Codex, Claude, Gemini, OpenCode, Hermes, and Grok while loading detailed context only when the active task requires it.
- Harden Rex workflow completion, dependency, projection, evidence, and release-readiness handling so client overlays do not alter the shared execution policy.
- Add auditable local workflow-guidance diagnostics and tighten release verification for multi-client runtime changes.

## [5.1.0] - 2026-07-22

### Changed

- Route new browser-use MCP configurations directly to the upstream launcher so multimodal tool results are delivered without the deprecated interception proxy rewriting the protocol payload.
- Report browser content delivery separately from retained shell interception in `interception doctor` output.

### Fixed

- Preserve MCP `tools/call` text, image, audio, resource, and unknown content blocks exactly as returned by the upstream server while attaching AIOS observations only under `_meta.aios`.
- Keep binary payloads out of AIOS observation metadata and raw references by recording safe content descriptors instead.
- Harden Windows release packaging and tests around native file URLs, executable resolution, temporary client homes, PowerShell archive arguments, generated release contents, and unusable WSL Bash placeholders.

## [5.0.4] - 2026-07-22

- make debug-hub release-safe

## [5.0.3] - 2026-07-21

### Fixed

- fix(update): after a successful runtime self-update, re-exec component update in a fresh process so ESM cannot keep a pre-update native compose plan
- fix(native): skip missing shared partials (e.g. retired `superpowers.md`) instead of crashing with ENOENT during mid-update native sync

## [5.0.2] - 2026-07-21

### Fixed

- fix(release): make release CI match ci-main harness deps (ripgrep, unzip, provider CLI shims)
- fix(quality-gate): fail closed when `rg` is unavailable instead of reporting zero log hits
- fix(tests): isolate harness dry-run readiness from host provider installs; extract release zip with unzip on Linux

## [5.0.1] - 2026-07-20

- fix(release): make interception CI fixture self-contained

## [5.0.0] - 2026-07-20

### Changed

- Rex-only workflow migration: `rex-harness` is now the default software-engineering control plane for new AIOS installations and managed client projections. Superpowers is retired as an AIOS workflow and installation component.
- Keep the former public Superpowers documentation route as a Rex migration guide instead of an active workflow catalog.
- Make changed Skill certification reproducible: release evidence is checked into `docs/evidence/skill-training/` and the release gate reruns the deterministic probe instead of trusting a hand-written status or hash.

### Migration

- A normal `aios update`, `aios init`, or `aios setup` reconciles Rex projections but preserves a historical Superpowers projection without AIOS ownership proof and reports it as a conflict.
- Use `--adopt-legacy-superpowers` explicitly, preferably after `--dry-run`, to adopt and remove only recognized AIOS legacy links for Codex, Claude, Gemini, OpenCode, Hermes, Grok, and shared `.agents` projections.

## [4.2.2] - 2026-07-17

### Added

- Add auditable SkillOpt evidence for `rex-tdd` with a no-Skill control, isolated baseline and candidate rollouts, independent exact-quote scoring, 10 training tasks, and 5 validation tasks.
- Include the `rex-tdd` evidence contract in the default AIOS rex integration test command.
- Accept the `rex-tdd` v7 candidate against a newly isolated orthogonal holdout, including a frozen-observation package that preserves selected commands and observable execution evidence.

### Fixed

- Keep baseline TDD inside the user-confirmed Test Scope Contract, require reproducible command/output evidence, and prevent self-upgrading to strict TDD without a risk-backed rex Command.
- Keep historic v6 evidence assertions independent from later v7 state and artifacts, so the full training timeline remains verifiable after acceptance.

## [4.2.1] - 2026-07-17

### Added

- Add auditable two-step SkillOpt evidence for `rex-workflow` with isolated raw outputs, independent per-assertion scoring, 10 training tasks, and 5 validation tasks.
- Add rex standalone failure, multilingual routing, host-promotion, and nested Skill training-gate scenarios.

### Fixed

- Discover tracked and untracked Skills under `rex-harness/skill-sources/**` in the AIOS training gate, and reject missing or stale accepted-content hashes.
- Classify read-only and mixed mutation requests by actionable clauses, including shorthand and coordinated negated-action lists, so negation order cannot create or erase a rex Capability.
- Fail closed when a compact rex response claims `completed` while retaining a Command or missing Evidence.

## [4.2.0] - 2026-07-17

### Added

- Add Hermes and Grok Build rex Skill projections with an AIOS registry-parity contract.
- Add the `rex-workflow` native client Skill so standalone coding agents can drive the rex evidence loop through Shell without an AIOS host.
- Add a compact CLI Command protocol with explicit `--full` diagnostics while preserving the complete rex JS API for host integrations.

### Changed

- Make standalone rex clients load only the current Provider instructions and keep complete Activation history under `.rex-harness/`.
- Package the risk-backed specialist Reviewer Catalog as an on-demand `rex-workflow` reference installed with native client projections.
- Keep AIOS on the direct rex JS API boundary; it does not parse CLI output or register a rex MCP server.

### Removed

- Remove the rex core MCP server, MCP CLI command, SDK dependency, tool exports, and packaged MCP sources.

## [4.1.0] - 2026-07-16

### Added

- Add `rex-harness` as a standalone software-engineering control plane with its own adaptive workflow runtime, CLI, MCP server, local state, command-token rotation, and typed Evidence Journal.
- Add bundled rex-native Providers for requirements, design, planning, test design, baseline and strict TDD, debugging, minimal construction, implementation, review, and wayfinding, plus a risk-backed Reviewer Catalog.
- Add a test-scope contract that must align targets, non-goals, acceptance mapping, and test seams before baseline or strict TDD can start.
- Add conflict-safe rex Skill projection for Codex, Claude, Gemini, and OpenCode.

### Changed

- Make AIOS consume the rex-owned workflow runtime through an adapter instead of independently reselecting or reordering software-engineering stages.
- Default AIOS execution to rex-native Providers; Matt, Superpowers, Ponytail, and ECC replace only the current Provider when explicit compatibility mode is enabled.
- Separate semantic Provider selection from the `single | team | harness` execution host so runtime promotion never replaces the current rex Command.
- Derive `Fast | Balanced | Deep` from completed Activations as post-run analytics instead of classifying requests by prompt wording or length.
- Prevent `implementation-ready` observations from bypassing the Test Scope Contract or scheduling a duplicate implementation after TDD GREEN.

## [4.0.3] - 2026-07-15

- Install repository client skills into supported global client homes during `aios init` and native sync.
- Add Hermes to 24 canonical client-skill projections, including the correct public path for the system `skill-creator` skill.
- Create and migrate client home MCP configurations, including comment-preserving Hermes `config.yaml` support.
- Verify changed client skills with accepted SkillOpt evidence and recognize namespaced system skills in the training gate.

## [4.0.2] - 2026-07-14

- Fix Codex MCP nested env configuration migration

## [4.0.1] - 2026-07-14

- docs: expand public content and SEO/GEO coverage

## [4.0.0] - 2026-07-14

- adopt adaptive workflow policy routing

## [3.6.0] - 2026-07-10

### Added - Headroom token intelligence workflow

- `aios init` now detects and installs the tested Headroom CLI range (`headroom-ai[all]>=0.31.0,<0.32.0`) alongside RTK and Caveman. Installation requires Python 3.10+ and uses `uv tool` or `pipx`, never a silent system-Python install.
- `--yes-headroom-mcp` is a separate unattended-consent flag for new user-scope Headroom MCP registrations; `--yes-compression-tools` remains the package-install consent.
- Gemini CLI, Hermes Agent, and Grok Build can register the official `headroom mcp serve` through their native MCP commands. Hermes remains `pending-interactive` without a real TTY.
- AIOS keeps a registration ownership ledger at `~/.aios/integrations/headroom-mcp.json` and verifies the post-registration fingerprint.

### Safety and compatibility

- Existing external or conflicting `headroom` MCP entries are reported without being overwritten; removals also require an ownership match.
- MCP-only compression is explicitly on demand (`headroom_compress`, `headroom_retrieve`, `headroom_stats`). It is not advertised as transparent current-request input compression.
- The workflow documents separate roles for RTK, Caveman, ContextDB, Headroom, and a Ponytail-inspired smallest-correct-change gate. It does not claim to install or emulate the Ponytail plugin.

### Documentation

- Added the public Token Intelligence and Compression guide and the English/Chinese v3.6.0 Headroom + Ponytail blog post.

## [3.5.0] - 2026-07-09

### Added — Intelligent planning product v2

- **Always-on planning** across clients: plan contract (`docs/plans` + `.aios/planning/active.json`), skill projection, Claude `UserPromptSubmit` hook, ctx-agent prompt gate, MCP `aios_plan_*`.
- **Planning quality schema v2**: route-aware task seeds, progress/next-task inject, `plan task` / `add-evidence` / `gate`, evidence-gated `done`.
- **L3 runtime loop**: solo harness + team phase-job writeback; quality-gate attaches plan evidence.
- **Human review**: `aios plan show` text board + `.aios/planning/review.html`.
- **Skill comply --live**: deterministic local compliance probe with health observations.
- **Dream → plan**: durable memo lines sync into active plan tasks (`dream --to` / apply).
- **Superpowers install/update**: safe git pull, minimum v6.1.0 doctor, planning projection gate.
- Competitor watchlist pruned to memo / planning / team pillars; acceptance reports under `docs/reports/2026-07-09-*`.

### Commands

- `aios plan start|status|show|task|add-evidence|gate|auto-gate|repair-skills|doctor`
- `aios skill comply <path> --live`
- `aios dream --to pin|agents|both`
- `aios internal superpowers update|doctor`

## [3.4.0] - 2026-07-09

### Added — Grok Build first-class AIOS client

- Register **Grok Build** (`grok` CLI, runtime id `grok-build`) as a first-class AIOS client with skills, agents, superpowers, native, team, and harness capabilities.
- Native surfaces: `.grok/skills`, `.grok/agents`, shared `AGENTS.md` projection, MCP targets at `~/.grok/config.toml` and project `.grok/config.toml` (TOML `mcp_servers`, Codex-compatible shape).
- Runtime wiring: `ctx-agent` interactive/one-shot, harness/team provider `grok`, shell-bridge wrap, codemap MCP inject, init detection, route commands.
- Unattended headless args: `--always-approve` with one-shot `grok -p ...`.
- Docs/changelog/blog: official site client lists + multi-language blog post.

## [3.3.4] - 2026-07-07

- improve responsive site reflow and subagent cleanup reliability

## [3.3.3] - 2026-07-06

- refresh home redesign and dynamic blog

## [3.3.2] - 2026-07-02

### Fixed
- Fix Caveman Windows installation by running the PowerShell installer from a downloaded temp file instead of piping into `iex`.
- Detect current Caveman install targets across Claude plugins, Opencode skills, and shared repo skill directories.
- Keep `aios init --dry-run` read-only for compression tools and use the current RTK Opencode init flag.
- Resolve Hermes home paths during skills doctor checks.

## [3.3.1] - 2026-07-02

### Fixed
- Route `hermes-agent` interactive startup to the Hermes CLI instead of falling through to OpenCode.

## [3.3.0] - 2026-07-02

### Changed — AIOS 原生拦截运行时废弃，改用社区工具 RTK + Caveman

- **deprecated**: `scripts/aios-mcp-proxy.mjs`、`scripts/aios-intercept.mjs`、`config/aios-interception.json` 标记为 deprecated，保留代码但不再积极维护
- **删除禁令**: AGENTS.md / CLAUDE.md / GEMINI.md 中的 "Do not install RTK, Caveman" 禁令全部移除
- **删除 Turn Compression Enforcement**: `bidirectional-turn-compression`、`pre_send/post_receive`、`uncontrolled_host_output` 等强制策略全部删除
- **隐私修正**: RTK/Caveman 均为本地运行（RTK 是 Rust 二进制，Caveman 是 prompt skill），不经过外部服务

### Added — 全自动安装 RTK + Caveman

- **feat(init): 新增 `scripts/lib/aios-init/compression-tools.mjs`** — 全自动安装社区 token 压缩工具
  - RTK (github.com/rtk-ai/rtk): Rust CLI 代理，压缩命令输出 60-90%
  - Caveman (github.com/JuliusBrussee/caveman): Claude Code skill，压缩输出 token ~75%
  - 安装流程：检测 → 用户确认 → 下载安装 → 验证 → PATH 配置 → `rtk init -g` 客户端初始化
  - 平台支持：macOS (brew)、Linux/WSL (install.sh)、Windows (PowerShell zip 下载 + 自动 PATH 配置)
  - `--yes-compression-tools` 跳过确认提示（CI/无人值守场景）
- **feat(cli): `aios init` 新增 `--yes-compression-tools` 参数** — 从 parse-args 到 dispatch 全链路支持
- **docs: 重写 aios-interception-runtime skill** — 从原生拦截运行时文档改为 RTK + Caveman 安装配置指南
  - 同步到 5 个客户端目录（.claude / .codex / .gemini / .opencode / .crush）
  - 同步 client-sources partials（core-instructions / browser-mcp / token-discipline）

### 修改文件清单

| 文件 | 变更 |
|------|------|
| AGENTS.md, CLAUDE.md, GEMINI.md | 禁令→中立表述，删除 Turn Compression 段，隐私 opt-in |
| client-sources/ partials (3) | 同步拦截运行时废弃 + RTK/Caveman 引用 |
| client-sources/ crush, opencode, hermes | Turn Compression → 社区工具引用 |
| scripts/aios-mcp-proxy.mjs, aios-intercept.mjs | 顶部 @deprecated JSDoc |
| config/aios-interception.json | _deprecated 字段 |
| scripts/lib/aios-init/compression-tools.mjs | 新文件：全自动安装逻辑 |
| scripts/aios-init.mjs | 集成 ensureCompressionTools |
| scripts/lib/cli/parse-args/init.mjs | --yes-compression-tools 选项 |
| scripts/lib/cli/dispatch.mjs | 传递 yesCompressionTools |
| scripts/lib/cli/help/commands/basic.mjs | help 文本更新 |
| skill-sources/aios-interception-runtime/ | SKILL.md + runtime-contract.md 全部重写 |

## [3.2.0] - 2026-07-01

### Added
- feat(harness): add consecutiveFailures abort after 5 consecutive failures to prevent infinite retry loops
- feat(offload): add emergency compaction tier (100+ nodes) to Mermaid canvas for overflow protection
- feat(harness): add dry-run readiness preflight check (ContextDB, Git, Provider, Session) before harness start
- feat(runtime): add directive injection from .aios/config.json default_mode into harness iteration prompts
- feat(memo): add auto-dream manual CLI (scripts/lib/memo/autodream.mjs) with --preview and --apply modes
- feat(skills): add skill workshop stale detection and file-level rollback snapshot

## [3.1.0] - 2026-06-30

- feat: Hermes Agent as first-class AIOS client with MCP bridge + multilingual docs

### Added
- feat(clients): register Hermes Agent (Nous Research) as 7th first-class AIOS client with skills, native, harness, and superpowers capabilities
- feat(mcp): add `scripts/aios-mcp-server.mjs` — MCP bridge server exposing 5 AIOS tools (aios_context_pack, aios_doctor_suite, aios_intercept_compress, aios_skill_validate, aios_skill_install) for Hermes sessions
- feat(native): add Hermes native emitter (AGENTS.md output) and MCP target (JSON stdio, .mcp.json + config.yaml scopes)
- docs: add Hermes Agent + AIOS blog post and changelog coverage in English, Chinese, Japanese, and Korean

## [3.0.0] - 2026-06-15

### Added
- Make markdown agent role cards canonical across exported agent surfaces.
- Add agent governance rollout documentation for workflow routing, smoke validation, and skill training gates.
- Add website and blog guidance for the agent governance rollout.

### Fixed
- Preserve original subagent prompt semantics when turn compression offloads large prompt refs.
- Deep-merge OpenCode AIOS command/config buckets during native sync so user-defined commands are retained.
- Reject unsafe session and skill identifiers before writing runtime paths or health reports.

## [2.0.2] - 2026-06-15

### Fixed
- Validate skill health observation statuses at write time so producer typos fail fast instead of being persisted as failures.
- Honor `--help`, `-h`, and `help` before positional validation for `aios skill` and `aios session` subcommands.

### Changed
- Remove tracked `.crush.json` and `crush.json` from the repository; local Crush config copies are now ignored by git.

### Docs
- Add v2.0.2 release notes to docs and blog sources and rebuild the generated website output.

## [2.0.1] - 2026-06-13

- fix browser MCP legacy alias migration

## [2.0.0] - 2026-06-12

- remove automatic ContextDB prompt injection and startup-mode inject

## [1.53.0] - 2026-06-12

- enforce AIOS primary agent for OpenCode

## [1.52.1] - 2026-06-11

- fix MCP proxy wire compatibility for strict clients

## [1.52.0] - 2026-06-11

### Added
- feat(shell): add `aios_shell` MCP tool (`scripts/shell-mcp-server.mjs`) with output compression via MCP proxy for deterministic shell interception across all clients
- feat(shell): register `aios-shell` alias in all 9 client configs via `doctor --fix` (`.mcp.json`, `.codex/config.toml`, `.gemini/settings.json`, `opencode.json`, `crush.json`, etc.)
- feat(shim): add self-healing to native shims — probe common AIOS install paths, fail-open by exec-ing real client binary when bridge is unreachable
- feat(shell): add host permission review guard for sensitive commands (`git push`, `npm publish`) in command rewrite

### Changed
- feat(strict): enhance native strict mode to verify real downstream client exists behind managed shim
- feat(rewrite): block dangerous shell constructs in command rewrite (`\n`, `\r`, single `&`)
- feat(hook): Claude PreToolUse hook no longer forces auto-allow; uses envelope-based command wrapping
- chore(deps): upgrade `proxy-inspector.mjs` to check managed MCP aliases (`mcp-browser-use`, `aios-shell`)

### Fixed
- fix(shim): prevent stale temp-directory fallback (`/var/folders/...`) in native shims when `AIOS_ROOT_DIR` is unset

## [1.51.0] - 2026-06-10

- feat(clients): add crush smoke verification and harden pending-smoke gating

## [1.50.3] - 2026-06-09

- refactor(skills): merge skills-catalog.json into skills-sync-manifest.json as single data source for skill discovery and sync
- fix(release): include .crush/skills and .crush/agents in release package

## [1.50.2] - 2026-06-09

- feat(skills): add pre-edit-safety-gate skill with CRG-backed edit safety enforcement, routing, and native AGENTS.md injection for all 7 client surfaces

## [1.50.1] - 2026-06-05

- enforce all-client AIOS turn compression compliance
- add `bidirectional-turn-compression` proof matrix covering `pre_send` and `post_receive` for every client/host
- mark uncontrolled direct host output as `policy-violation`/`non_compliant` instead of reporting fake savings
- train `aios-interception-runtime` with SkillOpt-Lite and publish the training artifact under `.skillopt/aios-interception-runtime-2026-06-05`

## [1.50.0] - 2026-06-04

- add v1.50.0 docs, blog tutorial, and site resources for unified AIOS search
- document all-client native search guidance inheritance across Codex, Claude, Gemini, Antigravity, OpenCode, and Crush
- publish usage guidance for memo visibility filters, source filters, and release verification

## [1.42.0] - 2026-06-04

- add unified AIOS project search

## [1.41.0] - 2026-06-04

- add multi-client capability gates and memo scope guidance

## [1.40.0] - 2026-05-31

### Added

- feat(clients): add Antigravity CLI support (replaces deprecated Gemini CLI)
- feat(clients): add Crush (charmbracelet) client support with `--yolo` unattended mode
- feat(clients): add team/model-router/harness instruction partials for opencode
- feat(clients): add opencode team capability support
- feat(opencode): add agent management and agent emitter for opencode
- feat(clients): expand superpowers capability to all 6 clients (codex, claude, gemini, antigravity, opencode, crush)
- feat(clients): expand skills/native/harness capabilities to all 6 clients

### Fixed

- fix(clients): add modelArgFlag for crush (`--model`)
- fix(clients): add crush to team capability
- fix(clients): add opencode to superpowers capability order
- fix(skills): remove XHS-only skills, expand core AIOS skills to all 6 clients
- fix(gemini): revert skill format from toml-command to markdown-directory
- fix(tests): repair codemap dedup assertion and release-pipeline missing crush agent emitter

### Changed

- refactor: complete AIOS adaptation layer phases 5-10
- chore: move experiments/ to .aios/experiments/ and gitignore

## [1.30.9] - 2026-05-28

- fix(windows): preserve AIOS PowerShell wrapper arguments

## [1.30.8] - 2026-05-28

- fix(windows): preserve AIOS PowerShell wrapper arguments

## [1.30.7] - 2026-05-28

- fix(codex): emit TOML agent roles and validate skill frontmatter

## [1.30.6] - 2026-05-28

- fix(tui): refresh installed skills state after setup/update/uninstall actions so picker reflects current disk state
- fix(skills): quote YAML frontmatter description fields containing Chinese punctuation to prevent parser errors

## [1.30.5] - 2026-05-27

- fix(superpowers): filter superpowers skills by catalog clients

## [1.30.4] - 2026-05-27

- fix(skills): consolidate compression skills, add skill-opt-lite, fix catalog duplicates

## [1.30.3] - 2026-05-26

- fix(team): auto-create plan artifact and set default ownedPathPrefixes to unblock team live preflight

## [1.30.2] - 2026-05-26

- fix(harness): make gate prompts recoverable

## [1.30.1] - 2026-05-25

- fix(mcp): handle Windows shell fallback and JSON-RPC notifications

## [1.30.0] - 2026-05-24

- refactor(aios): split large runtime modules, enforce generated/cache ignore rules, and preserve multi-client Windows command handling
- refactor(dispatch): improve CLI exit-code reset and route refs/canvas output through injected streams
- ci: install root script dependencies for release and performance smoke workflows

## [1.20.11] - 2026-05-23

- fix(windows): launch OpenCode native npm wrappers directly instead of via cmd.exe shell fallback

## [1.20.10] - 2026-05-23

- fix(install): avoid treating successful native stderr as fatal during PowerShell one-liner installs

## [1.20.9] - 2026-05-23

- fix(install): normalize Windows PowerShell shell-wrapper flags during release installs
- fix(install): normalize Windows privacy-guard wrapper flags during release installs
- test(install): add local Windows installer smoke coverage for the release PowerShell installer

## [1.20.8] - 2026-05-23

- fix(install): force TLS 1.2 for Windows release installer downloads and self-update bootstrap
- fix(install): fail fast when Windows installer dependency setup commands exit non-zero
- fix(tui): start the Ink TUI through the local tsx runtime and report non-interactive terminal limitations clearly

## [1.20.6] - 2026-05-22

- fix(memo): handle -h/--help gracefully in runMemo as fallback for Windows Commander edge cases
- fix(cli): relax node version check to >=24 (was strict ==24), improve nvm hints in all entry wrappers
- fix(ci): add root npm install to windows-shell-smoke workflow

## [1.20.5] - 2026-05-22

- feat(platform): add Windows MCP launcher (run-browser-use-mcp.ps1), cross-platform browser executable paths
- feat(platform): add resolveVenvPythonPath, resolveShellCommand, resolvePythonCommand helpers for cross-platform parity
- feat(platform): add Brave/Arc/Canary/Flatpak browser candidate paths across macOS/Windows/Linux
- fix(platform): replace hardcoded python3 with uv run + platform-aware resolution in aios-cred.mjs
- fix(platform): add HOME/USERPROFILE fallback in browser.mjs and self-update.mjs
- fix(platform): add uname guard for macOS Keychain security CLI in run-browser-use-mcp.sh
- fix(platform): use resolveVenvPythonPath in doctorBrowserMcp, resolveLauncherScript for platform-aware script paths
- test(platform): add platform-smoke.test.mjs (22 assertions covering MCP config, launchers, browser paths, py/uv)
- docs: add platform audit report (docs/plans/2026-05-22-platform-audit.md)

## [1.20.4] - 2026-05-22

- fix(install): fix Join-Path 3-arg syntax for PowerShell 5.1 compatibility in aios.ps1

## [1.20.3] - 2026-05-22

- fix(install): handle archives with or without aios/ prefix (Windows + bash)
- fix(codemap): repair multi-client CRG install loop

## [1.20.2] - 2026-05-21

- fix(codemap): fix claude code MCP config path and codex createIfMissing logic

## [1.20.1] - 2026-05-21

- feat(codemap): integrate code-review-graph as first-class AIOS component with docs, blog, and i18n support

## [1.19.0] - 2026-05-19

- feat: add aios version and runtime update

## [1.18.7] - 2026-05-19

- docs: update repository URL to aios

## [1.18.6] - 2026-05-19

- fix: rename release archives to aios

## [1.18.5] - 2026-05-19

- docs: rename product brand to AIOS

## [1.18.4] - 2026-05-19

- ci: relax ContextDB benchmark gate for Node 24

## [1.18.3] - 2026-05-19

- fix: align mcp-server Node runtime pin

## [1.18.2] - 2026-05-19

- fix: run GitHub workflows on Node 24

## [1.18.1] - 2026-05-19

- fix: align Node 24 install guidance for node:sqlite

## [1.18.0] - 2026-05-17

- feat(offload): add canvas backfill and Claude hook

## [1.17.1] - 2026-05-17

- fix: pin AIOS root for shell and Stop hooks

## [1.17.0] - 2026-05-16

- feat(memo): add git-friendly storage backends

## [1.16.0] - 2026-05-16

- feat(contextdb): move runtime state into .aios
- fix(contextdb): keep workspace metadata and handoff compatibility under .aios runtime roots

## [1.15.1] - 2026-05-15

- fix: restore aios init release entrypoint

## [1.15.0] - 2026-05-14

- feat(contextdb): add project-local memo genealogy GUI
- feat(contextdb): add relationship-first GUI layout, bilingual labels, and tips glossary
- fix(contextdb): restore wheel and button zoom interactions in the memo GUI

## [1.14.1] - 2026-05-14

- fix model-router client launch flags

## [1.14.0] - 2026-05-14

- add ContextDB memory genealogy TUI

## [1.13.1] - 2026-05-13

- fix shell wrapper claude print prompt routing

## [1.13.0] - 2026-05-13

- feat(native): add route shortcuts

## [1.12.4] - 2026-05-13

- fix(shell): preserve PowerShell TTY for wrapped CLIs

## [1.12.3] - 2026-05-12

- docs: add token compression wireframe and X draft

## [1.12.2] - 2026-05-12

- docs: add token compression website and blog coverage

## [1.12.1] - 2026-05-12

- fix(installer): run first setup for release installs

## [1.12.0] - 2026-05-11

- feat(harness): persist stage checkpoint evidence

## [1.11.2] - 2026-05-11

- fix: run Codex subagents unattended

## [1.11.1] - 2026-05-11

- fix browser MCP installer path portability

## [1.11.0] - 2026-05-09

- feat(debug-hub): add instrumentation tracking and automatic cleanup (v0.3.0)
  - New MCP tools: `debug_hub.instrument`, `debug_hub.list_instruments`, `debug_hub.cleanup_instruments`
  - Marker convention `DH:<sessionId>` for zero-dependency debug log injection and cleanup
  - Dual-mode cleanup: explicit (instrument records) and discovery (workspace grep fallback)
  - Dry-run support for safe cleanup preview
- feat(debug-hub): add debug-hub skill replacing upstream debug skill
- feat(debug-hub): add cross-model debug instrumentation protocol via workspace memory

## [1.10.0] - 2026-05-09

- feat(debug-hub): add agent debugging sessions and trace materialization
- fix(debug-hub): debounce trace materialization, harden path safety, add input validation, and improve search correctness

## [1.9.0] - 2026-05-08

- Enable model-router per-phase team dispatch

## [1.8.1] - 2026-05-08

- fix localized docs links and site validation

- feat(perception): add content outcome recording, insight generation, and perception summary for agent learning loop
- feat(debug-hub): add MCP-native debug log service with Node.js/Browser/Go SDKs, embedded Web UI, and file-based storage

## [1.8.0] - 2026-05-08

- feat(model-router): add intelligent model dispatch for multi-model Agent Teams
  - Model capability registry (`memory/specs/model-registry.json`) with 8 models and structured strengths/costs/CLI protocols
  - Task-type to model routing: code-review→Opus, implementation→DeepSeek, research→Gemini, browser→GPT-5.5, and more
  - Three CLI protocol adapters: claude (--model), codex (-m), gemini (-m)
  - Cost-ascending fallback chains for all task types
  - Agent-callable `model-router` skill for self-service routing
  - `model-router list|route|stats` CLI commands
  - Orchestrator agent cards with `preferredModel` field (env var → preferredModel → model fallback)
  - `AIOS_MODEL_{ROLE}` environment variable overrides
  - Perception integration: model dispatch events recorded to ContextDB for historical success-rate learning
  - Injected into AIOS Task Router guide for automatic agent awareness
- feat: add self-trigger harness routing for wrapped agents

## [1.7.1] - 2026-04-26

- docs(blog): add solo harness release post
- docs(memo): clarify existing persona and user profile memory

## [1.7.0] - 2026-04-26

- feat(harness): add solo overnight harness and official docs

## [1.6.3] - 2026-04-25

- docs(site): sync visual onboarding across locales

## [1.6.2] - 2026-04-25

- docs(site): add visual onboarding for Chinese docs

## [1.6.1] - 2026-04-25

- fix(release): restore GitHub release pipeline and simplify Chinese onboarding docs

## [1.6.0] - 2026-04-25

- feat(aios): consolidate merged feature work
- feat(competitors): add watchlist roadmap and updater script
- feat(team): add watchdog recovery command and status integration
- feat(contextdb): add search explanations and hygiene dry-run tools
- fix(contextdb): ignore stale generated ContextDB CLI during context packet refresh

## [1.5.0] - 2026-04-25

- feat(orchestrate): add plan ownership preflight gates

## [1.4.0] - 2026-04-25

- feat(contextdb): add compact continuity summaries

## [1.3.1] - 2026-04-24

- fix(release): bootstrap direct installer dependencies

## [1.3.0] - 2026-04-24

- feat(harness): surface dispatch insights in team HUD

## [1.2.0] - 2026-04-24

- feat: add Privacy Shield for wrapped coding agent sessions

## [1.1.1] - 2026-04-23

- fix routed team/subagent startup in external workspaces

## [1.1.0] - 2026-04-02

- feat(tui): switch to React Ink + Ink UI component architecture for TUI installer
- feat(tui-ink): add MemoryRouter-based screen navigation (MainScreen, SetupScreen, UpdateScreen, UninstallScreen, DoctorScreen, SkillPickerScreen, ConfirmScreen)
- feat(tui-ink): add useSetupOptions hook for shared options state
- feat(tui-ink): add custom ScrollableSelect component for skill-picker scrolling window
- feat(tui-ink): add Header, Footer, Checkbox components
- refactor(tui): remove old string-rendering TUI implementation
- fix(tui-ink): add React imports and fix tsx execution
- docs: add Ink TUI refactoring design and implementation plan

## [1.0.0] - 2026-03-17

- feat(skills): adopt canonical skill source tree and standardize on node 22

- feat(aios): wire orchestrator agents into lifecycle components
- feat(orchestrate): derive blueprint phases from orchestrator-blueprints spec
- feat(harness): implement `subagent-runtime` live execution via CLI subagents (`AIOS_SUBAGENT_CLIENT=codex-cli|claude-code|gemini-cli`)
- feat(harness): prefer codex-cli v0.114+ structured exec outputs (`--output-schema`, `--output-last-message`, stdin) for stable JSON handoffs (falls back for older versions)
- feat(skills): add scope-aware catalog-driven installation flow for `global` and `project`
- feat(skills): expose project-oriented skills in both scope pickers without default selection
- feat(skills): include `skill-constraints`, `aios-project-system`, `aios-long-running-harness`, and `contextdb-autopilot` in the default core set
- feat(tui): show skill descriptions, group skills into `Core` / `Optional`, and show only installed skills during uninstall
- fix(skills): warn when project installs override global installs during doctor checks
- fix(learn-eval): route ContextDB quality failures to a concrete gate target
- fix(ctx-agent): fail-open when context:pack fails (set CTXDB_PACK_STRICT=1 to make it fatal)
- fix(ctx-agent): honor cmd-backed CLI wrappers by using shell-aware spawn specs (prevents Windows wrapper regressions)
- fix(contextdb): tolerate legacy context records (missing text/refs/actions) in context packs
- test(contextdb): add ContextDB quality gate to prevent context:pack regressions
- docs: document orchestrate live execution + subagent runtime env controls
- docs(blog): add a release note post for subagent runtime
- docs(blog): add a release note post for scope-aware skills install UX

## [0.17.0] - 2026-03-17

- feat(tui): add uninstall picker scrolling, bottom-anchored bulk actions, and installed markers in setup/update pickers
- fix(tui): keep uninstall picker cursor selection aligned with the rendered grouped order
- docs: update README and docs-site onboarding copy for the improved skills picker UX
- docs(blog): extend the skills install experience post with the latest TUI uninstall and installed-marker improvements

## [0.16.0] - 2026-03-10

- feat(aios): add orchestrator agent catalog and generators

## [0.15.0] - 2026-03-10

- feat(aios): gate live orchestrate execution behind AIOS_EXECUTE_LIVE

## [0.14.0] - 2026-03-10

- feat(aios): add subagent runtime stub adapter

## [0.13.0] - 2026-03-10

- feat(aios): externalize runtime manifest spec

## [0.12.0] - 2026-03-10

- feat(aios): add runtime adapter boundary

## [0.11.0] - 2026-03-10

- feat(aios): expand local orchestrate preflight coverage

## [0.10.4] - 2026-03-08

- fix wrapper fallback for non-git workspaces and sync docs

## [0.10.3] - 2026-03-08

- fix(windows): support cmd-backed cli launch

## [0.10.2] - 2026-03-08

- fix(windows): route contextdb npm calls through node cli

## [0.10.1] - 2026-03-08

- fix(windows): resolve npm cli launch in node lifecycle

## [0.10.0] - 2026-03-08

- feat(onboarding): consolidate lifecycle flow into node

## [0.9.0] - 2026-03-07

- feat: add hybrid browser snapshot and visible-first launch defaults

## [0.8.1] - 2026-03-05

- docs: add contextdb Node ABI mismatch troubleshooting

## [0.8.0] - 2026-03-05

- add strict privacy guard with ollama-backed redaction

## [0.7.0] - 2026-03-05

- feat: add browser challenge detection and handoff signals

## [0.6.2] - 2026-03-04

- fix: auto-create .contextdb-enable for opt-in wrapper mode

## [0.6.1] - 2026-03-04

- fix(windows): harden browser doctor and clarify Node 20+ prerequisites

## [0.6.0] - 2026-03-04

- feat: add cross-CLI doctor + security scan skill pack

## [0.5.3] - 2026-03-04

- docs(site): wire docs/blog nav both ways and simplify blog home footer sections

## [0.5.2] - 2026-03-03

- docs(site): move rexai links to global footer navigation

## [0.5.1] - 2026-03-03

- docs: align superpowers workflow route and add RexAI friend links

## [0.5.0] - 2026-03-03

- feat(contextdb): add SQLite sidecar index (`memory/context-db/index/context.db`) with `index:rebuild`
- feat(contextdb): switch `search`/`timeline`/`event:get` to SQLite-backed retrieval with rebuild fallback
- feat(contextdb): add optional semantic rerank path (`--semantic`, `CONTEXTDB_SEMANTIC=1`)
- refactor(scripts): unify `ctx-agent.sh` and `ctx-agent.mjs` through `ctx-agent-core.mjs`

## [0.4.3] - 2026-03-03

- docs: improve functional page SEO/GEO with AI-search answers and changelog nav

## [0.4.2] - 2026-03-03

- docs: merge windows guide into quick start with os tabs

## [0.4.1] - 2026-03-03

- docs: add dedicated windows guide pages and quick-start cross-links

## [0.4.0] - 2026-03-03

- feat: add Windows PowerShell support for browser/contextdb setup

## [0.3.1] - 2026-03-03

- chore: bump version after browser mcp onboarding rollout

## [0.3.0] - 2026-03-03

- feat: add one-command browser mcp install/doctor and default cdp fallback

## [0.2.0] - 2026-03-03

- feat: add semver governance and versioning-by-impact skill

## [0.1.0] - 2026-03-03

- Initialize project versioning (`VERSION`, `CHANGELOG.md`) and release tooling baseline.

## [3.3.5] - 2026-07-07

- improve blog responsive layouts and navbar dropdown behavior

## [3.5.0] - 2026-07-09

- feat: intelligent planning product v2 (always-on, schema, runtime writeback, show, live comply)
