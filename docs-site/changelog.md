---
title: Changelog
description: Release history, upgrade notes, and links to detailed docs updates.
---

# Changelog

Use this page to track what changed in `AIOS` and jump to release-related docs.

## v5.6.0 (2026-08-11) — `aios work`: Parallel Multi-Agent Dispatch in One Command

### What changed

- New `aios work` command: one entry for planned, concurrent multi-agent dispatch — planner, implementer, reviewer, and security-reviewer jobs run with bounded parallelism (default concurrency 3) and a merge gate, live by default.
- `--dry-run` previews the DAG and work items without spawning clients; `--serial` forces concurrency 1 for coupled work; `--client` / `--concurrency` tune the subagent runtime; `--session` / `--resume --retry-blocked` reuse prior dispatch state.
- Reuses the existing orchestration engine and safety gates (preflight readiness, capability guard, owned-path file policy, merge gate); per-phase model routing stays enabled by default.

### Upgrade notes

- Update with `aios update`. No config migration needed; `aios team` and `aios orchestrate` are unchanged.

## v5.4.4 (2026-08-06) — Reliable Agent Smoke: Output-Contract Clients and Escalating Probe Timeouts

### What changed

- `agents smoke --live` no longer fails for clients (e.g. Codex) that wrap replies in their JSON output contract. The probe prompt now explicitly overrides the contract with an ACK-only marker, ACK detection tolerates JSON-wrapped replies, the post-receive compression proof applies only to outputs at or above `minRawBytes` (short outputs are inlined by design), and empty compression refs no longer crash evidence recording.
- The hardcoded 30s live probe timeout is replaced by `AIOS_AGENT_SMOKE_TIMEOUT_MS` and `agents smoke --timeout-ms <ms>` (default raised to 60s).
- Probes now auto-retry with escalated timeouts (60s → 120s → 240s) on transient slow responses before blocking an agent — one slow client cold start or model queue delay no longer leaves agents permanently workflow-disabled. The final blocker message includes the recovery command.

### Upgrade notes

- Existing installs can update with `aios update`. If your environment previously hit "command 无效 / workflow 卡死" (agents blocked by live smoke evidence drift), re-run `aios agents smoke --live --client <name> --timeout-ms <ms>` to regenerate v2 evidence — no data migration needed.

## v5.4.3 (2026-08-06) — CRG Decision Checkpoints and Worker Journal Rename

### What changed

- The workflow layer now uses CRG (code-review-graph) decision checkpoints: `aios-workflow-router` and `rex-workflow` call `get_minimal_context` before acting, `get_impact_radius` + `query_graph(tests_for)` before editing, `semantic_search_nodes`/`query_graph` before searching code, and `detect_changes` after each stage. When CRG is unavailable the flow degrades to `rg` + file reads and never blocks.
- `aios init` gains `--yes` / `--retry` / `--force` options backed by a new `install-state` module, making setup/update runs idempotent (resume from not-yet-installed components, or force a clean reinstall).
- The solo harness journal directory is renamed from `solo-harness` to `worker-journal`; session artifacts now live under `artifacts/worker-journal/`. Legacy `solo-harness` directories are migrated automatically on first read, and solo worktree temp prefixes follow the new name.
- Client prompt surfaces (AGENTS.md / CLAUDE.md / GEMINI.md) are updated with the CRG workflow section.

### Upgrade notes

- Existing installs can update with `aios update`. Legacy `solo-harness` session directories are migrated automatically — no manual action needed.

## v5.4.2 (2026-08-05) — Local Browser MCP as the Single Browser Entrypoint

### What changed

- The retired `ai-browser-book` / `AIOS_BROWSER_USE_REPO` runtime dependency is removed from browser MCP selection, installation, migration, and lifecycle recovery.
- The repository-local Node/Playwright MCP (`scripts/run-local-browser-mcp.mjs`) is now the only browser MCP entrypoint, with complete-dist validation and source/tsx fallback.
- Browser installation now installs local MCP dependencies, Playwright Chromium, builds the MCP server, migrates client configuration, and exposes `browser_health` for runtime readiness checks.
- Cross-platform browser MCP regression coverage, Hermes migration coverage, and a GitHub release workflow check for the local browser installation path are added.

## v5.4.1 (2026-08-02) — Safe Runtime Self-Update on Windows

### What changed

- `aios update` self-update is now safe on Windows release installs. Running update from inside the install tree previously left the process working directory in the directory the installer must delete; Windows cannot delete a cwd-held directory, so removal failed silently and the new version was nested at `<install>/aios/`, breaking the follow-up update with `MODULE_NOT_FOUND`.
- The updater now moves its working directory outside the install tree before running the release installer, the installer verifies the old directory was actually removed (failing loudly instead of continuing into a nested install), and the post-update re-exec checks its entry point and prints a clear remediation message when the replace went wrong.
- The updater prefers the local `scripts/aios-install.ps1` for release-installer updates, so defensive installer fixes take effect immediately instead of waiting for a remote fetch.
- Removed the leftover untracked `agent-sources/skills/` directory (gitlink removed earlier) that broke the token-discipline sync test.

### Upgrade notes

- Existing installs can update with `aios update` once this release is installed; the fix itself is in the release assets.

## v5.4.0 (2026-08-01) — Workflow Iteration v2.1: Activation Safety and Typed Evidence Contracts

### What changed

- The Rex activation store now writes through a write-ahead transaction (`.aios/workflow-activations/transactions/`): Workflow and Activation projection writes are atomic, restart rolls forward any incomplete transaction automatically, and reads validate consistency between the two, failing closed on divergence (`stale-activation-projection`).
- Add a store file lock that serializes Command token advancement: concurrent calls now receive `AIOS_REX_STORE_BUSY` instead of silently double-consuming the same token.
- Add a typed Wayfinder Artifact schema (`wayfinder-artifact.mjs`): Navigation Map, Decision Graph, Decision Ticket, and Next Slice structure validation; a partial/blocked artifact cannot claim a Decision Ticket or Next Slice.
- Add a typed Planning Artifact schema (`planning-artifact.mjs`): Frontier ready/blocked mutual exclusion with no overlap, Parallel Group cross-group uniqueness, Convergence Gate, and Runtime Artifact Contract validation.
- Add `normalizeEvidenceRefs()`: evidence refs must carry a protocol prefix (`artifact:`, `receipt:`, etc.) and reject TODO/TBD/placeholder values, across Wayfinder, Planning, and Requirements artifacts.
- Client projection now re-validates the backup marker digest against `projection-history.json` before restoring an interrupted backup, preventing a forged junction from being promoted (`interrupted-backup-untrusted`).
- Plan evidence mirroring (`syncEvidenceToMatchingPlan`) returns a structured `planEvidence.status = 'failed'` on failure instead of throwing, keeping already-committed Rex state visible.
- The AIOS MCP server gains `wayfinderArtifact` / `planningArtifact` tool parameters.
- All 13 canonical Skills complete the S1-S5 SkillOpt eval batches; digests are appended to `projection-history.json`.

### Availability boundary

- The typed artifact schemas in this release validate inside the rex runtime only; existing `.aios/workflow-activations/` state is backward compatible and needs no migration.
- Protocol-prefix evidence-ref validation applies to evidence submitted from this release forward; previously stored refs are not retroactively rejected.

## v5.3.0 (2026-07-30) - Context Lifecycle safety and compatibility

### Breaking changes

- Structured plans are upgraded to schema v3 on the next explicit plan write; older runtimes cannot read upgraded plan state.
- Session close writes a reviewable memo candidate sidecar instead of publishing a shared memo automatically.
- Dream approve, reject, archive, restore, and GC return DENY receipts until a trusted broker and concurrency authority exist; Dream apply remains proposal-only.

### Availability boundary

- Context Lifecycle V1 is released as S0-S2 observe/shadow instrumentation only. Selective enforcement, opt-in pilots, and default hard enforcement are not enabled or claimed by this release.
- Context proposals require explicit human confirmation. Plans without confirmed targets or context can deliver zero execution-context units; this release does not promise out-of-the-box context intelligence.

## v5.0.0 (2026-07-20) - Rex-only workflow migration

- `rex-harness` is the only default software-engineering workflow for new AIOS installations and managed client projections. Superpowers is retired as an AIOS workflow and installation component.
- Normal `aios update`, `aios init`, and `aios setup` reconcile Rex without deleting a historical Superpowers projection that lacks AIOS ownership proof; that path is preserved and reported as a conflict.
- Run `aios update --adopt-legacy-superpowers --dry-run` before the explicit adoption command when you want to remove only recognized AIOS legacy links. The coverage includes Codex, Claude, Gemini, OpenCode, Hermes, Grok, and shared `.agents` projections.
- The previous [Superpowers](/superpowers/) URL now provides the migration guide.
- Changed Skills use `skill certify --changed` to create checked-in, reproducible evidence; the release gate reruns the deterministic probe instead of trusting a status file or content hash alone.

## Docs And Workflow Notes

- **v3.6.0 Headroom token intelligence workflow**: `aios init` now installs the tested Headroom CLI range alongside RTK and Caveman, with a separate `--yes-headroom-mcp` consent for Gemini/Grok user-scope MCP registration. Hermes requires a real TTY and reports `pending-interactive` otherwise. Existing external or conflicting entries are not overwritten; AIOS records owned entries in `~/.aios/integrations/headroom-mcp.json`. MCP-only compression is explicit and does not claim transparent input interception. See: [Token Intelligence and Compression](token-compression.md) and the [Headroom + Ponytail post](/blog/2026-07-headroom-token-intelligence/).
- Added agent governance coverage to the Team docs, scenario guide, ContextDB reference, and blog.
- New smoke evidence guidance now points to `.aios/agents/smoke/<agent>.json`, `.aios/agents/provenance/<agent>.json`, and `.aios/interception/metrics/agents-smoke-<agent>.jsonl`.
- Skill edits now point readers to `node scripts/aios.mjs skill verify-training --changed --base HEAD --json` before trusting live agent workflows.
- **Memo stale-lock repair**: `aios memo storage repair-locks` quarantines only locks whose recorded owner PID is confirmed dead; active and malformed lock files remain untouched.
- **Grok Build as first-class AIOS client**: xAI Grok Build (`grok` CLI, runtime id `grok-build`) is now a full AIOS client with skills, agents, native, team, and harness. MCP uses Codex-shaped TOML (`~/.grok/config.toml` / `.grok/config.toml`). See: [Grok Build + AIOS blog post](/blog/2026-07-grok-build-aios-client/).
- **Hermes Agent as first-class AIOS client**: Hermes (Nous Research) is registered with skills, native, and harness capabilities. An MCP bridge server (`scripts/aios-mcp-server.mjs`) exposes 5 AIOS tools inside Hermes sessions. See: [Hermes Agent + AIOS blog post](/blog/2026-06-hermes-agent-aios-client/).

## Official Release History

## v4.0.1 (2026-07-14) - Public content and SEO/GEO coverage

- Synchronize the documentation version badge, the root `VERSION`, the GitHub release, and public changelog records around `4.0.1`.
- Expand the public documentation and blog coverage for current AIOS workflows, release navigation, and search-friendly explanations.

## v4.0.0 (2026-07-14) - Adaptive workflow policy

- Add adaptive routing for `noop`, `direct`, `guarded`, and `planned` work so each request receives an appropriate level of process.
- Document persistent plans, edit-safety gates, and evidence-based verification for multi-step AI agent work.
- Read the release story: [v4.0 Adaptive Workflow Policy](/blog/2026-07-v400-adaptive-workflow-policy/).

## v3.6.0 (2026-07-10) - Headroom + Ponytail token intelligence workflow

### Added

- Detect and install `headroom-ai[all]>=0.31.0,<0.32.0` in an isolated `uv tool` or `pipx` environment; Python 3.10+ is required.
- Add `--yes-headroom-mcp` so unattended package installation and MCP user-configuration consent stay independent.
- Register the official `headroom mcp serve` with Gemini CLI, Grok Build, and Hermes Agent through their native MCP commands; Hermes stays `pending-interactive` without a TTY.

### Safety and compatibility

- Persist AIOS-owned MCP registration fingerprints in `~/.aios/integrations/headroom-mcp.json`; preserve external or conflicting entries.
- Clarify that MCP tools (`headroom_compress`, `headroom_retrieve`, `headroom_stats`) are explicit on-demand compression, not transparent interception for the current request.
- Document RTK, Caveman, ContextDB, Headroom, and the Ponytail-inspired smallest-correct-change gate as distinct layers.

## v3.4.0 (2026-07-09) — Grok Build first-class client

### Added

- **Grok Build (`grok` / `grok-build`)** joins Codex, Claude Code, Gemini CLI, OpenCode, and Hermes as a first-class AIOS client.
- Capabilities: `skills`, `agents`, `superpowers`, `native`, `team`, `harness`.
- Project skill root: `.grok/skills`; agent root: `.grok/agents`; instruction file: shared `AGENTS.md`.
- MCP: TOML `[mcp_servers.*]` at home `~/.grok/config.toml` and project `.grok/config.toml`.
- One-shot / unattended: `grok --always-approve -p "..."`.
- Harness / team provider: `--provider grok` / `--team-provider grok` / `--agent grok-build`.
- Codemap injects CRG MCP into Grok home config; `aios init` detects the `grok` CLI.

### Docs

- Quick Start, Use Cases, CLI Comparison, Solo Harness, ContextDB, Troubleshooting, and homepage copy list Grok Build.
- Blog: [Grok Build Is Now a First-Class AIOS Client](/blog/2026-07-grok-build-aios-client/).

## v3.3.0 (2026-07-02) — 废弃原生拦截运行时，全自动安装 RTK + Caveman

### Breaking Change: AIOS 原生拦截运行时废弃

AIOS 原生 token 拦截运行时（`scripts/aios-mcp-proxy.mjs`、`scripts/aios-intercept.mjs`、`config/aios-interception.json`）已标记为 deprecated。代码保留但不再积极维护。

替代方案是社区维护的工具：

- **RTK** (https://github.com/rtk-ai/rtk) — Rust CLI 代理，压缩命令输出 60-90%。单二进制，<10ms 开销，100+ 支持命令。本地运行，无外部服务。
- **Caveman** (https://github.com/JuliusBrussee/caveman) — Claude Code skill，压缩 agent 输出 token ~75%。保持技术准确性，仅压缩表述风格。本地 prompt skill。

### 新功能：全自动安装

`aios init` 现在自动检测并安装 RTK + Caveman：

```bash
# 交互式安装（用户确认后全自动）
node scripts/aios.mjs init --all

# CI/无人值守（跳过确认）
node scripts/aios.mjs init --all --yes-compression-tools

# 仅检测不安装
node scripts/aios.mjs init --dry-run
```

安装流程：检测 → 用户确认 → 下载安装 → 验证 → PATH 配置 → `rtk init -g` 客户端初始化。

平台支持：macOS (brew)、Linux/WSL (install.sh)、Windows (PowerShell zip 下载 + 自动 PATH 配置)。

### 删除的策略

- `bidirectional-turn-compression` 强制策略全部删除
- `pre_send` / `post_receive` 压缩验证要求删除
- `uncontrolled_host_output` 策略违规标记删除
- "Do not install RTK, Caveman" 禁令删除

### 迁移指南

1. 运行 `aios init` 安装 RTK + Caveman
2. 旧的 `scripts/aios-mcp-proxy.mjs` 不需要删除，但不再维护
3. 旧配置 `config/aios-interception.json` 不再被读取
4. 重启 AI 客户端激活 RTK hook/plugin
5. 在 Claude Code 中输入 `/caveman` 激活 Caveman

## v3.2.0 (2026-07-01) — Harness 可靠性与技能生命周期升级

### Harness Solo Runtime

- **consecutiveFailures abort**: New dual-counter system (`consecutiveFailures` + `consecutiveInfraFailures`) in `backoff.mjs`. After 5 consecutive non-success outcomes, the harness automatically aborts the session instead of retrying indefinitely — preventing wasted tokens on unrecoverable failures.
- **Emergency compaction tier**: `mermaid-canvas.mjs` now has a third compaction level triggered at 100+ canvas nodes. Emergency mode keeps only 5 recent nodes (vs 10 for mild/aggressive), preventing context overflow in long-running sessions.
- **Dry-run readiness preflight**: New `dry-run-readiness.mjs` checks 4 dimensions (ContextDB index, Git status, Provider config, Session resume) before the harness loop starts. `blocked` level prevents launch entirely; `warning` level logs issues but continues.

### Runtime Directive System

- **Directive injection**: New `directive-inject.mjs` reads `default_mode` from `.aios/config.json` and injects corresponding `systemPromptAdditions` into every harness iteration prompt. Supports 3 built-in presets (`strict-primary`, `harness-runner`, `team-worker`) and custom `mode_presets`. This is an original design — not a copy of oh-my-openagent's ULTRAWORK keyword detection.

### Auto-Dream (Phase A: Manual)

- **Manual dream CLI**: `scripts/lib/memo/autodream.mjs` provides `--preview` (plan only) and `--apply` (execute) modes for memory consolidation. Wraps the existing `runDream` taxonomy + dedup + TTL expiry pipeline. Phase B will add automatic triggering.

### Skill Workshop

- **Stale detection**: `skill-workshop.mjs` apply() now compares the target file's filesystem hash against the lock's `computedHash`. If they differ (skill was modified externally), apply is rejected — preventing accidental overwrites of user edits.
- **File-level rollback snapshot**: apply() saves the complete `previousContent` of `SKILL.md` in `lock.rollbackSnapshot.previousContent`. rollback() can now restore actual file content, not just metadata.

### Verification

All changes verified with 37/37 unit + integration tests passing.

## v3.1.0 (2026-06-30) — Hermes Agent 一等公民客户端集成

- **Hermes Agent 注册为第 7 个 AIOS 一等公民客户端**：具备 skills、native、harness、superpowers 全部能力。
- **MCP 桥接服务器**：`scripts/aios-mcp-server.mjs` 在 Hermes 会话内暴露 5 个 AIOS 工具（`aios_context_pack`、`aios_doctor_suite`、`aios_intercept_compress`、`aios_skill_validate`、`aios_skill_install`）。
- **Native emitter + MCP target**：AGENTS.md 输出 + JSON stdio（`.mcp.json` + `config.yaml` scopes）。
- 多语言文档覆盖（英/中/日/韩）。
- See: [Hermes Agent + AIOS blog post](/blog/2026-06-hermes-agent-aios-client/).

## v2.0.2 (2026-06-15)

- **Skill health validation**: `recordSkillObservation()` now rejects unknown statuses
- **Help-first CLI parsing**: `aios skill ... --help` and `aios session ... --help` now show usage before required positional-argument validation runs.
- **Crush config hygiene**: `.crush.json` and `crush.json` are no longer tracked in the repository; local Crush config files remain supported but are ignored by git.
- See: [v2.0.2 release post](/blog/2026-06-v202-ecc-uplift/).

## v2.0.1 (2026-06-13)

- **Browser MCP alias migration**: fixed legacy alias compatibility while keeping the default browser-use runtime path stable.

## v2.0.0 (2026-06-12)

- **Pull-based runtime context**: removed automatic ContextDB prompt injection and startup-mode injection so agents load runtime context only when needed.

## v1.52.0 (2026-06-11)

- **aios_shell MCP tool**: deterministic shell output compression across all clients via `aios-shell` MCP alias. Shell commands execute through `scripts/shell-mcp-server.mjs` and output is automatically compressed by the MCP proxy at **99%+ saving ratio**.
- **Three-layer interception defense**: MCP tool (all clients) → shim+hook (Claude/all) → prompt guidance. No single point of failure.
- **Shim self-healing**: native shims probe 4 fallback paths (`AIOS_ROOT_DIR` → baked root → `~/.rexcil/aios` → `~/cool.cnb/rex-ai-boot`) before failing open to the real client binary.
- **Sensitive command guard**: `git push` and `npm publish` are intercepted before execution and require host permission review.
- **aios-shell in all client configs**: registered via `doctor --fix` in `.mcp.json`, `.codex/config.toml`, `.gemini/settings.json`, `opencode.json`, and `crush.json`.
- See: [v1.52.0 blog post](/blog/2026-06-v152-aios-shell-mcp/).

## v1.51.0 (2026-06-10)

- **Crush smoke verification**: added Crush (charmbracelet) to pending-smoke gating with hardened live execution blocks.
- **Native strict mode upgrade**: `clients doctor --native-strict` now verifies real downstream clients exist behind managed shims.
- See: [v1.51.0 blog post](/blog/2026-06-v151-crush-smoke/).

## v1.50.1 (2026-06-05)

- **All-client turn compression compliance**: every AIOS-managed client/host now shares the `bidirectional-turn-compression` metric with required `pre_send` and `post_receive` records.
- **No fake savings for bypasses**: direct host output outside the AIOS-managed runner is recorded as `policy-violation` / `non_compliant`, with `saved_bytes=0`.
- **Proof matrix**: `node scripts/aios.mjs interception proof --json` and `doctor --json` include `turn_compression_matrix` for Codex, Claude, Gemini, Antigravity, OpenCode, Crush, Cursor, `aios-harness`, and `generic-mcp`.
- **Skill training evidence**: `aios-interception-runtime` was trained with SkillOpt-Lite; artifacts live under `.skillopt/aios-interception-runtime-2026-06-05`.
- **Release tutorial**: See the [v1.50.1 token compression compliance post](/blog/2026-06-v1501-token-compression-compliance/) and [Token Intelligence and Compression](token-compression.md).

## v1.50.0 (2026-06-04)

- **Unified AIOS Search**: `node scripts/aios.mjs search "<query>"` searches project memory, pinned memo, docs, plans, and code from one CLI surface.
- **Cross-client memory safety**: Search keeps `project_shared` visible across clients and filters `agent_private` records unless the matching `--agent <runtime-client-id>` is supplied.
- **All-client native guidance**: The same search instruction is projected to Codex/OpenCode/Crush through `AGENTS.md`, Claude through `CLAUDE.md`, and Gemini/Antigravity through `GEMINI.md`.
- **Release tutorials**: See the [v1.50.0 unified search tutorial](/blog/2026-06-v150-unified-aios-search/) and [ContextDB](contextdb.md#unified-project-search-v1500).

[⭐ Star on GitHub](https://github.com/rexleimo/aios){ .md-button .md-button--primary }
[📦 View Releases](https://github.com/rexleimo/aios/releases){ .md-button }

## Latest Stable

- `1.17.0` (2026-05-16):
  - **Memo Storage**: `aios memo` now uses a storage abstraction with two public implementations: `file` (default append-only JSONL at `.aios/memo/file/events.jsonl`) and `split` (one JSON file per memo event). Manage it with `aios memo storage status`, `aios memo storage use split`, `aios memo storage use file`, `aios memo storage rebuild`, and `aios memo storage doctor`.
  - **Git-friendly memo source of truth**: `.aios/memo/` is the canonical project memo root. ContextDB/SQLite remain compatibility mirrors and rebuildable caches, not the memo source of truth.
  - **Runtime state alignment**: new ContextDB runtime state is written under `.aios/context-db/`; legacy `memory/context-db` paths are read only for compatibility when present.
  - See [ContextDB](contextdb.md#memory-with-memo) for the memo storage boundary.

- `1.13.0` (2026-05-15):
  - **Context Registry (Pull-Based Context)**: Replaces push-based context injection (~30KB every session) with a lightweight ~350 byte registry pointer. Agents now read `.aios/context-db/index.json` and load only what they need. Startup drops from ~5 minutes to near-instant.
  - **`aios init`**: One-command setup for all four coding agents (Claude Code, Codex CLI, Gemini CLI, OpenCode). Detects installed agents, writes registry marker to config files, configures save guard hooks. Idempotent — safe to run multiple times.
  - **Multi-client native sync fix**: Gemini now writes to `GEMINI.md` (the file Gemini CLI actually reads). OpenCode reads `AGENTS.md` directly (no separate file needed). Old `.gemini/AIOS.md` and `.opencode/AIOS.md` deprecated.
  - **`--context-mode slim`**: Team/harness routes and wrapped agents automatically use slim injection when the registry marker is detected. Falls back to full injection for unwrapped agents.
  - See [ContextDB](contextdb.md) for the full architecture.

- `1.11.0` (2026-05-09):
  - **debug-hub v0.3**: Instrumentation tracking and automatic cleanup. New MCP tools: `instrument`, `list_instruments`, `cleanup_instruments`. Marker convention `DH:<sessionId>` for zero-dependency debug log injection with dual-mode cleanup (explicit via instrument records, discovery via workspace grep). Dry-run support for safe cleanup preview. Cross-model debug protocol via workspace memory. Replaces upstream debug skill with debug-hub skill. See [debug-hub](debug-hub.md).

- `1.10.0` (2026-05-09):
  - **debug-hub v0.2**: Adds automatic trace materialization (debounced), agent debugging sessions, structured evidence events, `/api/health`, and MCP tools for `timeline`, `health`, and `compact_context`. Includes input validation on HTTP endpoints, MCP argument validation, path-traversal hardening, case-insensitive search, and debounced trace indexing. See [debug-hub](debug-hub.md).

- `1.8.0` (2026-05-08):
  - Adds self-trigger harness routing for wrapped `codex`, `claude`, `gemini`, and `opencode` sessions.
  - **Model Router**: Intelligent multi-model dispatch for Agent Teams. Includes model capability registry (8 models), task-type to model routing, three CLI protocol adapters (claude/codex/gemini), cost-ascending fallback chains, agent-callable `model-router` skill, `AIOS_MODEL_{ROLE}` env var overrides, and perception feedback loop integration. See [Model Router](model-router.md) for full documentation.
  - **GroupChat Runtime**: `aios team` live mode now uses round-based agent execution with shared conversation history. Agents in each round run in parallel; all agents see the full accumulated thread. Blocked agents trigger automatic re-plan rounds. Contrasts with the old one-shot isolated dispatch model.
  - **OpenCode CLI subagent support**: `opencode-cli` is now a fully supported `AIOS_SUBAGENT_CLIENT` for all orchestration paths (subagent, team, and GroupChat runtimes).

## Earlier Stable

- `1.7.1` (2026-04-26):
  - Adds a Solo Harness release post.
  - Clarifies the existing persona/user profile memory layer (`aios memo persona ...`, `aios memo user ...`) that was previously under-documented.

- `1.7.0` (2026-04-26):
  - Adds `aios harness` for single-agent overnight runs with run journals, stop/resume controls, HUD surfacing, and optional worktree isolation.
  - Adds official Solo Harness documentation across English, Chinese, Japanese, and Korean docs.

## Previous Stable

- `1.6.3` (2026-04-25):
  - Syncs the Chinese visual onboarding structure to English, Japanese, and Korean pages.
  - Rewrites localized Overview, Quick Start, scenario commands, and Agent Team pages around the same beginner-first path.

- `1.6.2` (2026-04-25):
  - Adds visual onboarding for the official docs: beginner path, TUI Setup/Doctor, ContextDB memory loop, and Agent Team/HUD diagrams.
  - Reorients onboarding around task-first commands before advanced ContextDB, Agent Team, and orchestration concepts.

- `1.6.1` (2026-04-25):
  - Restores the GitHub Release pipeline for clean Linux checkouts.
  - Simplifies Chinese onboarding docs so new users can find commands by task first.

## Recent Versions

- `main` (Unreleased):
  - **debug-hub MCP-native debug log service** (2026-05-06): MCP-native debug log collection for coding agents with Node.js/Browser/Go SDKs, embedded Web UI, file-based storage under `~/.debug-hub/`, and 5 MCP tools for agent self-diagnosis (`list_traces`, `get_trace`, `search_logs`, `get_stats`, `clear_logs`); agents can now introspect their own runtime logs without human intervention
	  - **Agent self-trigger harness routing** (2026-05-05): wrapped `codex` / `claude` / `gemini` / `opencode` sessions now advertise `single/subagent/team/harness`; long-running, overnight, resumable objectives can self-trigger `aios harness run ... --workspace <project-root>` with `--max-iterations`, plus env controls `CTXDB_HARNESS_PROVIDER` and `CTXDB_HARNESS_MAX_ITERATIONS`
  - **Privacy Shield for wrapped coding agents** (2026-04-24): interactive ContextDB shell launches now print a colored privacy panel with Privacy Guard status, custom relay/model endpoint detection, and the safe `aios privacy read --file <path>` path; auto prompts now clarify that LLM privacy instructions are advisory while deterministic AIOS gates provide verifiable enforcement
  - **Workspace-aware routed startup + project Node selection** (2026-04-23): routed `ctx-agent` startup now preserves the active git workspace even when launched from a non-AIOS repo; `mcp-server` package scripts run through `scripts/with-project-node.mjs` so `.nvmrc` / Node 24 is honored consistently, avoiding external SQLite addon ABI drift via built-in `node:sqlite` and surfacing a clear error when Node 24 is unavailable
  - **ContextDB Shell startup optimization** (2026-04-22): `ctx()` now prefers compiled `mcp-server/dist/contextdb/cli.js` over `npm run -s contextdb`, cutting per-call overhead from ~0.3s to ~0.06s; one-shot agent launch improved from ~2.2s to ~0.5s (~78% faster); shell-bridge `detectRunner` no longer requires `tsx`; install flow auto-builds `dist/` when missing and gracefully falls back to npm-run mode on build failure
  - **Default core skills update** (2026-04-19): `awesome-design-md`, `frontend-design`, and `cap-commit-push` promoted to default core skills
  - **ContextDB lazy load** (2026-04-18 to 2026-04-19): interactive sessions now default to lazy context loading (`CTXDB_LAZY_LOAD=on`); agents self-discover memory via facade prompt instead of receiving a full context pack upfront; added [lazy-load documentation](contextdb.md#lazy-load) and multilingual blog posts
  - **AIOS workflow router skill** (2026-04-18): added `.claude/skills/aios-workflow-router` for reliable task-to-skill routing and discovery
  - **Route/concurrency docs refresh + default concurrency = 3** (2026-04-20): documented a compact profile for interactive routing and parallel settings (`CTXDB_INTERACTIVE_AUTO_ROUTE`, `CTXDB_CODEX_DISABLE_MCP`, `CTXDB_TEAM_WORKERS`, `AIOS_SUBAGENT_CONCURRENCY`); added core-overview links to the selection guide; changed live subagent runtime default concurrency from `2` to `3`
  - **Documentation: Agent Team & HUD** (2026-04-11): Added comprehensive documentation for Team Operations - new pages [Agent Team & HUD](team-ops.md), [HUD Guide](hud-guide.md), and [Skill Candidates](skill-candidates.md); updated [Superpowers](superpowers.md) and [Architecture](architecture.md) with Team Ops references
  - **Browser MCP migration to browser-use CDP** (2026-04-10): default browser runtime switched from Playwright to browser-use MCP over CDP; new launcher `scripts/run-browser-use-mcp.sh`; migration command `aios internal browser mcp-migrate`; screenshot timeout guard with configurable `BROWSER_USE_SCREENSHOT_TIMEOUT_MS`
  - **HUD/Team skill-candidate enhancements** (2026-04-09 to 2026-04-10): `--show-skill-candidates` flag for detailed view; `--skill-candidate-limit <N>` configurable limit; fast-watch mode defaults to 3 candidates (down from 6); artifact reads cached for performance; HUD suggests `skill-candidate apply` commands; team status surfaces skill-candidate artifacts and drafts
  - **Quality-gate visibility** (2026-04-08 to 2026-04-09): quality-gate category surfaced in HUD minimal status and team history summaries; quality-failed-only filter; quality prefix filters with multi-value support
  - **Learn-eval draft recommendations** (2026-04-07 to 2026-04-09): hindsight lesson drafts; skill patch draft candidates; draft recommendation apply flow; persist skill-candidate draft artifacts
  - **Turn-envelope v0** (2026-04-07): event linkage for turn-based telemetry; clarity entropy memo coverage in harness
  - **Browser doctor auto-heal** (2026-04-06 to 2026-04-08): `doctor --fix` auto-heals CDP service; setup/update lifecycle auto-heals browser doctor; CDP quick commands in docs
  - **Multi-environment RL training system**: shared `rl-core` control plane with shell, browser, and orchestrator adapters; three-pointer checkpoint lineage; four-lane replay pool; PPO + teacher distillation training
  - **Mixed-environment campaigns** (`rl-mixed-v1`): one live batch can span shell + browser + orchestrator episodes with unified rollback decision
  - ContextDB `search` now defaults to SQLite FTS5 + `bm25(...)` ranking, with automatic lexical fallback when FTS is unavailable
  - ContextDB semantic rerank now operates on query-scoped lexical candidates, reducing drops of older exact matches
  - `subagent-runtime` live execution for `aios orchestrate` (opt-in via `AIOS_EXECUTE_LIVE=1`)
  - bounded work-item queue scheduling with ownership hints
  - no-op fast path: auto-complete `reviewer` / `security-reviewer` when upstream handoffs touched no files
  - Windows PowerShell shell-smoke workflow on each push to `main` (`.github/workflows/windows-shell-smoke.yml`)
  - scope-aware `skills` install flow with `global` / `project` target selection
  - canonical skill authoring now lives in `skill-sources/`, with repo-local client roots generated via `node scripts/sync-skills.mjs`
  - default skills install mode is now portable `copy`; explicit `--install-mode link` remains available for local development
  - release packaging/preflight now validates generated skill roots with `check-skills-sync`
  - catalog-driven skill picker with core defaults, optional business skills, and uninstall showing installed items only
  - TUI skill picker groups entries into `Core` and `Optional` with truncated descriptions for terminal readability
  - `doctor` now warns when a project skill overrides a global install of the same name
  - Node runtime guidance is now explicitly aligned on Node 24 LTS
  - **Ink TUI refactor** (v1.1.0): full TypeScript + Ink-based TUI with React components; startup banner with REXCLI ASCII art; adaptive watch intervals; left-right option cycling; native enhancement visibility panel
- `0.17.0` (2026-03-17):
  - TUI uninstall picker now scrolls in smaller terminals and keeps `Select all` / `Clear all` / `Done` anchored at the bottom
  - uninstall cursor selection now stays aligned with the rendered grouped list
  - setup/update skill pickers now label already-installed skills with `(installed)`
- `0.16.0` (2026-03-10): add orchestrator agent catalog and generators
- `0.15.0` (2026-03-10): gate live orchestrate execution behind `AIOS_EXECUTE_LIVE`
- `0.14.0` (2026-03-10): add `subagent-runtime` runtime adapter (stub)
- `0.13.0` (2026-03-10): externalize runtime manifest spec
- `0.11.0` (2026-03-10): expand local orchestrate preflight coverage
- `0.10.4` (2026-03-08): wrapper fallback for non-git workspaces and docs sync
- `0.10.3` (2026-03-08): fix Windows cmd-backed CLI launch
- `0.10.0` (2026-03-08): consolidate lifecycle flow into Node
- `0.8.0` (2026-03-05): add strict Privacy Guard with Ollama support and setup integration
- `0.5.0` (2026-03-03): ContextDB SQLite sidecar index (`index:rebuild`), optional `--semantic` search, unified `ctx-agent` core

## 2026-03-16 Operational Status

- Continuous live samples are succeeding (`dispatchRun.ok=true`) with latest artifact:
  - `.aios/context-db/sessions/codex-cli-20260303T080437-065e16c0/artifacts/dispatch-run-20260316T111419Z.json`
- `learn-eval` still recommends:
  - `[fix] runbook.failure-triage` (`clarity-needs-input=5`)
  - `[observe] sample.latency-watch` (`avgElapsedMs=160678`)
- Timeout budgets remain unchanged while latency-watch observation continues.

## Related Reading

- [Blog: Skills install experience update](/blog/2026-03-rexcli-skills-install-experience/)
- [Quick Start](getting-started.md)
- [ContextDB](contextdb.md)
- [Troubleshooting](troubleshooting.md)

## Update Rule

When a release changes setup, runtime behavior, or compatibility, docs are updated in the same PR and reflected here.
