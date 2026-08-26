# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

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

## [Unreleased]

## [5.5.2] - 2026-08-08

- Disable Chrome launch-agent autostart

## [5.4.4] - 2026-08-06

### Fixed

- `agents smoke --live` no longer fails for clients that wrap probe replies in their JSON output contract (e.g. Codex): the probe prompt now explicitly overrides the output contract with an ACK-only marker, ACK detection tolerates JSON-wrapped replies, the post-receive compression proof is required only for outputs at or above `minRawBytes` (short outputs are inlined by design and no longer fail the smoke), and empty compression refs no longer crash evidence recording.
- Add `AIOS_AGENT_SMOKE_TIMEOUT_MS` env var and `agents smoke --timeout-ms <ms>` CLI flag to replace the hardcoded 30s live probe timeout (default raised to 60s).
- Live smoke probes now auto-retry with escalated timeouts (base, 2x, 4x) on transient slow responses before blocking an agent, so a single slow cold start or model queue delay no longer leaves agents permanently workflow-disabled; the final blocker message includes the recovery command for raising the budget.

## [Unreleased]

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
