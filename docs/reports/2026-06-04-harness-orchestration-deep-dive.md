# Harness/Orchestration Category — Deep-Dive Competitive Analysis

> 生成日期: 2026-06-04 | 范围: harness-orchestration 类别 (6 个竞品)
> 数据源: GitHub API + repo source (递归 tree) + CHANGELOG + 源码抽取
> 距上次 5月22日 review-brief: **13 天** | 距 5月22日 verdict: 13 天
> 关键新信号: **OpenHarness v0.1.8 已把 `--dry-run` ready/warning/blocked 正式发版**; **overstory 已 ARCHIVED (read-only)**; **oh-my-openagent 13 天连发 v4.3→v4.7.5, 8 个 Core 包分层重构完成**

---

## 一、6 个竞品状态卡

### 1. HKUDS/OpenHarness — 仍为 P0, 干跑落地是核心

| 字段 | 值 |
|---|---|
| Stars | 13,502 (↑ 585, +4.5%) |
| Forks | 2,211 (↑ 92) |
| 最新版 | v0.1.9 (2026-05-07, 28 天前) |
| 末次 push | **2026-06-04 02:42 UTC (今天, 几小时前)** |
| License | MIT |
| 状态 | **active, 50+ 贡献者, 极活跃** |
| Open issues | 28 |
| 主页仓库活跃度 | 极强 (28 天内 70+ commits) |

**5月22日 之后 (2026-05-22 → 2026-06-04) 关键变化:**

1. **v0.1.8 (2026-05-06) — `--dry-run` ready/warning/blocked 已发版, 不再是 unreleased**
   - CHANGELOG 原文: "`oh --dry-run` safe preview mode for inspecting resolved runtime settings, auth state, prompt assembly, commands, skills, tools, and configured MCP servers without executing the model or tools."
   - Changed 段: "Dry-run output now reports a `ready` / `warning` / `blocked` readiness verdict, concrete `next_actions`, likely matching skills/tools for normal prompts, and richer slash-command previews for read-only vs stateful command paths."
   - 源码已确认 (`src/openharness/cli.py`): `_evaluate_dry_run_readiness()` 显式分支 `level = "ready" | "warning" | "blocked"`, 含 `next_actions`/`reasons`/`mcp_validation` 字段; `auth_status.startswith("missing")` 不直接 blocked, 而是 warning (合理); MCP 错误升级为 warning
   - **5月22日 review brief 中 "the only consensus P0" 已完成发版, 现在 AIOS 是落后方**

2. **v0.1.8 — Docker sandbox backend**
   - `sandbox.backend = "docker"` 配 resource limits / network isolation / image auto-mgmt
   - 配合 `test_docker_sandbox_e2e.py` 已有 e2e
   - 替代 `bash -lc` subprocess (Windows 上 Git Bash escape bug 已修)

3. **v0.1.8 — 4 个新 provider**: `nvidia` (NIM) / `qwen` (DashScope) / `minimax` (M2.7 + M2.7-highspeed) / `gemini`
   - OpenAI-compatible 通用客户端 (`--api-format openai`), 覆盖 DashScope / DeepSeek / GitHub Models / Groq / Together / Ollama
   - 加上原有的 Moonshot/Kimi + GitHub Copilot OAuth + Bedrock-style = **生态化 provider 矩阵**

4. **v0.1.8 — Auto-Compaction 增强 (v0.1.6 基础)**
   - "Compaction now detects llama.cpp/OpenAI-compatible context overflow errors, accounts for image blocks in auto-compact token estimates, and strips image payloads from summarizer-only compaction requests."
   - "Large tool results are now bounded in conversation history: oversized outputs are saved under `tool_artifacts`, old MCP results become microcompactable, and context collapse trims stale tool-result payloads."
   - 引擎在 `src/openharness/engine/cost_tracker.py` + `engine/messages.py`

5. **v0.1.9 (2026-05-07) — Bundled skill-creator + slash 触发技能**
   - "Skills marked as user-invocable can now be triggered directly with slash commands."
   - 这与 oh-my-openagent 的 `default_mode` 思路相向: 零配置/低门槛触发

6. **6 月初 commits (06-04): fix(ohmo) media + tee gateway logs + priority hooks + 平台稳定性**
   - "fix(hooks): add priority ordering for lifecycle hooks (#279)" — **hooks 支持 priority 字段**, 5月22日 review brief 没覆盖到的细节

7. **新增 autopilot 子系统 (autopilot-dashboard + .github/workflows/autopilot-{pages,run-next,scan}.yml + src/openharness/autopilot/)**
   - 包含 `autopilot-dashboard/` React UI (PipelineAnimation, HeroBackground)
   - 这是 5月22日 之后才上线的 **计划任务控制面**

**新发现的源码子模块 (5月22日 未覆盖)**:
- `src/openharness/services/autodream/` — **自动梦境 (sleep-time memory consolidation)**: 4 个文件 `backup.py / lock.py / prompt.py / service.py`; 扫描 `*.md` mtime 变化, 触发 LLM 反思合并, prompt 模板写明 "PREVIEW MODE" / "APPLY MODE" 双模式
- `src/openharness/swarm/mailbox.py` — **文件型 mailbox**: `~/.openharness/teams/<team>/agents/<agent_id>/inbox/<timestamp>_<message_id>.json`, 原子写 `.tmp` + rename, 用 `exclusive_file_lock` (lockfile.py) 防止并发, 7 种 MessageType: `user_message / permission_request / permission_response / sandbox_permission_request / sandbox_permission_response / shutdown / idle_notification`
- `src/openharness/swarm/worktree.py` — **worktree 隔离**: slug 校验 64 chars / `[a-zA-Z0-9._-]+` / 拒绝 `.` `..` / 拒绝绝对路径 / 自动 gitignore `node_modules .venv __pycache__ .tox`
- `src/openharness/swarm/subprocess_backend.py` — SubprocessBackend (teammate 跑子进程)
- `src/openharness/hooks/` — `priority` 字段, hot reload, executor, loader, schemas, types

**方向评估**: 加速期, **公测能力大幅超前 5月22日 判断**. 5月22日 把 dry-run 列为唯一 P0, 现在 OpenHarness 不只发布了 dry-run, 还顺带发布了 Docker sandbox / autopilot / autodream / 文件型 mailbox — **整层 baseline 全部升一档**.

---

### 2. kunchenguid/gnhf — 仍为 P1, 节奏放缓, 极简设计仍是亮点

| 字段 | 值 |
|---|---|
| Stars | 1,875 (↑ 134, +7.7%) |
| Forks | 129 (↑ 34) |
| 最新版 | gnhf-v0.1.42 (2026-05-13, **22 天前**) |
| 末次 push | 2026-05-13 19:28 UTC (22 天) |
| License | MIT |
| 状态 | **稳定维护, 但发布速度变慢 (5月22日→6月4日 仅 4 个 release)** |
| Open issues | 3 |

**5月22日 之后关键变化:**

1. **v0.1.42 (2026-05-13) — `recover copilot and opencode JSON output`** — JSON 输出容错持续打磨
2. **v0.1.41 (2026-05-07) — `recover schema-valid agent JSON output`**
3. **v0.1.40 (2026-05-06) — `filter unrelated OpenCode session errors`**
4. **v0.1.39 (2026-05-06) — `render meteors beside content`** (UI)

**5月22日 → 6月4日 之间无新 release.** 22 天静默, 与 4 月底-5 月初的快节奏形成对比 (v0.1.23 之后基本每 1-3 天一发).

**新发现的源码细节 (orchestrator.ts, 843 行)**:
- `OrchestratorState` 字段: `currentIteration, totalInputTokens, totalOutputTokens, tokensEstimated, commitCount, iterations[], consecutiveFailures, consecutiveErrors, waitingUntil, lastMessage, lastAgentError, hasPendingCommitFailure`
- **退避算法**: `60_000 * Math.pow(2, this.state.consecutiveErrors - 1)` — 60s, 120s, 240s, 480s... — **确认 5月22日 review brief 中 "60s × 2^n" 描述完全准确**
- `STOP_CLOSE_AGENT_GRACE_MS = 250` — Ctrl+C 后 250ms 内尽力收尾
- `tokensEstimated` sticky flag — 某轮是 estimated 就一直显示, 防止后续精确值混淆
- **pre-iteration abort + post-iteration abort 双重检查**
- `pendingCommitFailure` → 触发 `buildCommitRepairPrompt` (下一轮让 agent 修复 commit)
- `interruptibleSleep(backoffMs)` — 退避期间可被 stop
- `getPreIterationAbortReason()` / `getPostIterationAbortReason()` — **可观察的"为什么 abort" 分类器**

**5月22日 review brief 中各条目的对账**:
| # | 简报条目 | 现况 (源确认) |
|---|---|---|
| 1 | iteration notes (`notes.md` append) | ✅ `appendNotes()` 在 `run.ts`, IterationRecord 持久化 |
| 4 | 60s × 2^n 退避 | ✅ 源码确认 |
| 4 | `success=false` 不退避, PermanentAgentError 立即 abort | ✅ `getPostIterationAbortReason()` 区分两类; v0.1.28 `abort immediately on Claude low credit` 已发布 |
| 4 | 连续失败 ≥3 → abort | ✅ `consecutiveFailures >= config.maxConsecutiveFailures` |
| 5 | 自然语言 `--stop-when` | ✅ v0.1.23 (2026-04-18) 已实现, `result.shouldFullyStop` |
| 5 | token 预算耗尽 → AbortController 中止 | ✅ `maxTokens` in RunLimits + `activeAbortController?.abort()` |
| 10 | JSON 输出 schema + 鲁棒提取 | ✅ v0.1.42 容错持续打磨 |

**方向评估**: 慢速但稳定, **仍是 "极简 long-running 参考" 最佳来源**. 22 天没新发版说明 v0.1.4x 系列可能在收尾 1.x 重大稳定目标, 但社区无 issue 积累, 没看到断裂信号.

---

### 3. code-yeongyu/oh-my-openagent — **升至 P0 候选 (与 OpenHarness 并列)**

| 字段 | 值 |
|---|---|
| Stars | **60,924** (↑ 2,113, +3.6%) |
| Forks | 4,941 (↑ 254) |
| 最新版 | **v4.7.5 (2026-06-03, 昨天!)** |
| 末次 push | 2026-06-04 05:39 UTC (今天, 1 小时前) |
| License | NOASSERTION |
| 状态 | **极活跃, 220+ 贡献者, 13 天发 13 个 minor** |
| Open issues | 640 |
| ROADMAP | `ROADMAP.md` 明确 "Package Layering Refactor" 为最紧急 |

**5月22日 之后关键变化 (v4.2.0 → v4.7.5, 13 个 minor):**

1. **v4.2.0 (2026-05-15) — `prompt-async-gate` 重构**
   - 779 行 monolith → 6 个子模块 (reservations, queue, message state, dispatch runner, facade)
   - 30s timeout via `Promise.race` (防 dispatch 死锁)
   - post-dispatch 失败时保留 reservation hold (覆盖 AGENTS.md 文档的 race window)
   - 释放前先释放 reservation 再 retry (model-suggestion-retry)

2. **v4.2.3 (2026-05-20) — 4 个 BUG 修复 + 2 个 Core 包**
   - `packages/rules-core` 提取 (rule discovery / matching / caching / nested AGENTS.md)
   - `packages/ast-grep-mcp` native 工具 → MCP server
   - **`prompt-async-gate` post-dispatch hold 250ms → 2000ms (8x)**
   - `runtime-fallback` 识别更多 provider quota 错误 + OpenAI `server_error`
   - team-mode 5 个 BUG 修复 (A-F)

3. **v4.3.0 (Unreleased CHANGELOG, 但实际已发布) — 8 个包分层重构 + 0 配置**
   - **`default_mode` config auto-activates ultrawork and ralph loop** (PR #4190) — **零配置自动激活**, 5月22日 review brief 没列, 这是新发现的 P0 信号
   - 8 个 Core 包提取: `utils / hashline-core / model-core / rules-engine (从 rules-core 改名) / agents-md-core / ast-grep-core / comment-checker-core / boulder-state`
   - **`model-core` DI 化** (host harness 注入 snapshot fetcher, suggestion parser, context-limit resolver)
   - **`boulder-state` Core 包**: todo state machine 独立 (read/write/append session, find plan, get progress, get work by id/plan)
   - **`packages/omo-codex` 独立包** — Codex CLI Light edition; `bunx oh-my-openagent install --platform=codex`; 三个 bin entries `omo` (alias) / `lazycodex` / `oh-my-opencode`
   - **`--platform <opencode|codex|both>`** install flag
   - **Triple-publish npm**: `oh-my-opencode` / `oh-my-openagent` / `lazycodex`
   - PostHog telemetry: `omo_codex_daily_active` 独立 stream
   - `disabled_providers` config
   - **`plan-format-validator` hook** 验证 `.omo/plans/*.md` task label 格式
   - **Per-agent skill filtering** with `restrictedAgents` (PR #2827) — 技能只对指定 agent 可见
   - **`look_at` async refactor** (PR #4098) — 图像分析非阻塞
   - Prometheus spec-driven 框架感知 (OpenSpec, .specify)
   - Toast i18n (en + zh)
   - Grok family models + `reasoningEffort`
   - `taskCleanupDelayMs` 可配置

4. **v4.4 → v4.7.5 (大量 bug 修复, 增量 PR)**
   - 06-04 commits 涵盖: `background-agent session activity`, `runtime-fallback retry message identity`, `delegate-task wait for child tasks in sync polling`, `runtime-fallback restore primary after fallback reopen`, `file-uri home-dir rejection`
   - 大部分 commits 是稳定性 / 边界 bug fix, **没有再出现 major 架构变更**

**ROADMAP 关键信号 (meta-architecture)**:

> "Multi-Harness Support (Exploratory)... Most harnesses share common lifecycle hooks: pre-tool-use guards, post-tool-use transforms, system message injection, model parameter overrides. One could abstract these into a unified hook layer... **We are skeptical of this abstraction. The industry changes too fast. Fixed patterns and agreed conventions should be implemented directly. Uncertain parts should not be over-abstracted. If an adapter for a new harness is needed, an agent can write it in one shot. The connection points are a single question away. Premature 'adapter pattern' abstraction across unstable interfaces causes more pain than duplication. We express what each component does in markdown documentation, not in interface definitions.**"

**这是直接驳斥 overstory 11-adapter 模式的元架构判断**. oh-my-openagent 的立场:
- 优先 markdown doc + agent 自适配
- Core 层零 harness 依赖 (DI 注入)
- Adapter 是 thin wrapper, 不是 grand unified interface

**新增 ultrawork / ulw-loop 组件** (`packages/omo-codex/plugin/components/`)
- ultrawork directive: 强制 `ULTRAWORK MODE ENABLED!` 开头, 4 通道 manual-QA (HTTP / tmux / Browser use / Computer use), 必须 RED→GREEN 测试 + 真实场景跑过才算 done
- ulw-loop: 自动循环组件

**方向评估**: **整个生态方向已变**. 从 "OpenCode 单一 host" → "8 Core 包 + multi-host 路线", **P0 候选**, 路线比 OpenHarness 更激进.

---

### 4. jayminwest/overstory — **降 P3 (ARCHIVED, 风险完全物化)**

| 字段 | 值 |
|---|---|
| Stars | 1,317 (持平) |
| Forks | 212 |
| 最新版 | v0.11.0 (2026-05-02, 33 天前) |
| 末次 push | 2026-05-28 17:12 UTC (7 天前) |
| License | MIT |
| **状态** | **`archived: true` (API 字段 + README 顶端红色警告)** |
| 末次 commit | `docs: mark overstory as no longer maintained / archived` (2026-05-28) |
| 继任者 | **[Warren](https://github.com/jayminwest/warren)** — self-hostable control plane for sandboxed cloud agents |

**5月22日 之后关键变化:**

1. **2026-05-15 — README 顶端红色 callout "maintenance mode"**
2. **2026-05-28 — README 改为 "No longer maintained. Overstory is no longer actively maintained and this repository is archived (read-only)"** + 推荐继任者 Warren
3. **2026-06-03 — `updated_at` 仍然更新** (GitHub UI 调整), 但代码 `pushed_at` 锁定在 2026-05-28

**v0.11.0 (2026-05-02, 5月22日 后唯一 release) 关键内容**:
- spawn-per-turn substates split: 新增 `in_turn` / `between_turns` 状态 (区分 worker 真正执行 vs 等待邮件)
- `migrateRelaxStateCheck` — 移除 SQLite inline `CHECK(state IN (...))` 约束, 允许 schema 演化
- `getActive()` widen: 增加 `booting | in_turn | between_turns | stalled` 选项

**v0.10.3 (2026-05-01) 关键内容 (5月22日 review brief 漏掉的强项)**:
- **`ov sling --recover`** — 重新 dispatch 一个 fresh agent 到 closed task, 绕过 workable-status check
- **Watchdog `worker_died` mail to parent** (overstory-c111) — 子 agent 进 zombie 时, watchdog 自动发 `worker_died` 协议邮件给 `session.parentAgent`, **解决 zombie cascade #1 systemic cause**
  - dedup 通过 pre-tick state-snapshot, 防止 idempotent zombie→zombie 重复触发
  - gate: `watchdog.notifyParentOnDeath` (default `true`)
- **Runner-synthesized `worker_died` for in-band gaps** — turn ends with `finalState=zombie` 或 `terminalMailMissing` 时, runner 自己 emit `worker_died` (out-of-band death detection 漏检兜底)
- **Per-event stall watchdog** — `eventStallTimeoutMs` (default 600_000ms = 10min) 在 parser iteration 前 arm, 每个事件 reset

**v0.9.4 (2026-04-21)**:
- `resolveProjectRoot()` env var + walk-up detection (submodule cascade 修复)
- `OVERSTORY_PROJECT_ROOT` 注入 spawned agent env
- `ov worktree clean` live-children guard (live nested session 阻止移除除非 `--force`)
- tmux session name sanitization (项目名含点会被 tmux 解析为 `session.window.pane`)

**v0.9.2 (2026-03-23) — Runtime 抽象已完成的最后大版本**:
- 11 个 adapter (Aider / Goose / Amp 加入)
- `PersistentAgentSpec` interface 抽象 coordinator / orchestrator 共享
- `ov orchestrator` top-level command

**5月22日 review brief 各项对账**:
| # | 简报条目 | 现况 |
|---|---|---|
| 8 | Runtime 抽象接口规范化 (11 adapters) | ✅ v0.9.2 完成, **但项目 ARCHIVED, 接口无人维护** |
| 9 | Headless NDJSON 事件流 | ✅ v0.11.0 spawn-per-turn substates 进一步增强 |
| 10 | JSON 输出 schema + 鲁棒提取 | ✅ v0.10.3 terminalMailMissing 检测, runner-synthesized mail |
| 12 | SQLite WAL Mail Bus | ✅ 8 种 protocol 消息仍存在, **但无新功能** |

**方向评估**: **5月22日 提出的 "maintenance mode red flag" 已 100% 物化**:
1. 代码已 archived (read-only)
2. 作者明确转移精力到 Warren
3. 13 天内无新 commit, v0.11.0 是最后的功能 release
4. 用户实际 fork 即可继续, MIT 友好

**但**:
- 11-adapter 抽象, `worker_died` 兜底, `ov sling --recover`, `eventStallTimeoutMs` 这些是**实战沉淀的设计**, 即便项目 archived, 模式值得搬到 AIOS
- oh-my-openagent 5月22日 review brief 提出的"对 overstory Runtime 抽象降 P2"判断**完全正确** — 接口已无人演进, 不应作为长期参考
- 5月22日 SQLite Mail Bus 降 P1 的判断也**正确** — overstory-style file-based mailbox 在 OpenHarness `swarm/mailbox.py` 中更轻量, 已成事实标准

---

### 5. revfactory/harness — 维持 P1, 内容驱动而非代码驱动

| 字段 | 值 |
|---|---|
| Stars | **5,767** (↑ 2,261, **+64.5% 暴力增长**) |
| Forks | 766 (↑ 258) |
| 最新版 | main (无 tag) |
| 末次 push | 2026-05-29 17:04 UTC (6 天前) |
| License | Apache-2.0 |
| Language | HTML (README + landing page) |
| 状态 | **活跃但内容驱动, 几乎无 .py/.ts 代码** |

**5月22日 之后关键变化:**

1. **2026-05-15 — "에이전트·스킬 중복 검토 가이드라인 추가 (Phase 3-0, 4-0)"** — 韩文 commit, agent+skill 重复审查指南
2. **2026-05-28 — 3 语言 README 大改** (en, ja, ko)
3. **2026-05-29 — PR #14 (hongsw fix marketplace-owner-email) + PR #17 (myeongseoklee feat/agent-skill-reuse-guideline) + PR #15 (fix/owner-email)** — 社区 3 个新 contributor 提交
4. **2026-05-29 — `b8fb858 Merge pull request #14 from hongsw/fix/marketplace-owner-email`** 是最新 commit

**仓库结构 (5月22日 之后无变化)**:
- 顶层: `index.html / privacy.html / skills/ / docs/ / _workspace/ / harness_*.png` — **几乎纯 HTML/markdown**, 没有 Python/TypeScript runtime
- `skills/harness/` — SKILL.md + references/
- `docs/` — `experimental-dependency.md` / `quickstart.md`
- `_workspace/` — 5 个 GTM / M0 audit markdown: `01_auditor_repo_audit.md / 02_content_launch_contents.md / 03_scout_outreach_map.md / 04_strategist_launch_plan.md` + `release/`

**仓库本质**: 这是个 **Claude Code plugin skill** 而非 runtime
- 定位: "meta-skill that designs domain-specific agent teams, defines specialized agents, and generates the skills they use" (GitHub description)
- 输出: 模板化的 agent + skill 文件 (markdown)
- **不是 OpenHarness / oh-my-openagent 那种可执行 harness**, 是"harness 设计说明书"

**为什么 2.2K ★ 在 13 天内增长?**:
- 韩国 GTM 团队 4 个 launch 内容 (`_workspace/release/`) 已发布
- 3 语言 README (en/ja/ko) — **多语言铺开**
- 定位"team-architecture factory"清晰
- 社区 PR 接力 (hongsw, myeongseoklee, shaun0927)

**AIOS 映射价值**:
- 5月22日 review brief P1 #17: "元技能 + 6 种团队架构" (pipeline / fan-out / expert pool) — **现况**: revfactory 的 SKILL.md 是该模式的最佳实践, 5月22日 review brief 评为 P1 仍然合适
- 不是 runtime, 是元规范, 适合作为 AIOS `orchestrator-blueprints.json` 扩展的参考

**方向评估**: 持续内容迭代, 几乎无代码, **风险是 star 增长可能靠 GTM 而非技术深度**. 维护为 P1 不变.

---

### 6. mmTheBest/long-running-tasks — **降 P3 (dormant 彻底确认, 移除 watchlist 候选)**

| 字段 | 值 |
|---|---|
| Stars | 1 (持平) |
| Forks | 0 |
| 最新版 | main (无 tag) |
| 末次 push | 2026-03-06 02:42 UTC (**90 天前**) |
| 状态 | **dormant (dormant 100% 物化)** |
| 仓库内容 | LICENSE / README.md / SKILL.md / assets / references |

**5月22日 之后无任何变化.** 5月22日 列为 P2 (dormant), 现况进一步确认 dormant. 90 天无 push, 5 个 commit 全部是 2026-03-04~06 的 README + security + stall detection.

**5月22日 后, 此项目应:**
- **从 watchlist 移除**, 或保持 P2 但备注 "90 天 dormant, 移除候选"
- 它的 5月22日 stall-detection 想法已由 gnhf / overstory 实现, 没有独特价值

**方向评估**: 终止关注. 仅作 "dormant pattern" 留底.

---

## 二、可借鉴特性卡 (按 P0 / P1 / P2 分级)

### P0 候选 (建议本月立项)

#### P0-A. Dry-Run Readiness 裁定 — **OpenHarness v0.1.8 (已发版)**
- **来源**: HKUDS/OpenHarness v0.1.8 (2026-05-06)
- **实现细节**: `oh --dry-run` 调用 `_evaluate_dry_run_readiness()`, 输出 `level: ready|warning|blocked`, 字段含 `next_actions[]` (具体修复指令), `reasons[]`, `mcp_validation: "skipped in dry-run (configured only; external servers are not started)"`. 逻辑层级: missing auth → warning (普通 session 不直接 blocked); MCP error → warning; 不识别的 slash command → blocked; 无 prompt 但 dry-run 通过 → ready with reason. CHANGELOG: "Dry-run output now reports a `ready` / `warning` / `blocked` readiness verdict, concrete `next_actions`, likely matching skills/tools for normal prompts, and richer slash-command previews for read-only vs stateful command paths." (源: `src/openharness/cli.py` 直接含 `_evaluate_dry_run_readiness` 函数)
- **AIOS 映射**: `scripts/aios.mjs` → 新增 `aios harness run --dry-run` 预检层; 检查维度: `.aios/` 多目录配置 + ContextDB 索引完整性 + Git 状态 + browser MCP 探针 + model router provider 状态
- **可移植性**: **easy**, 阻塞点: AIOS 现有检查维度分散 (bootstrap task queue, contextdb, model-router, browser-mcp), 需要先做配置 inventory
- **优先级**: **P0** (5月22日 已 P0, 现已发版, AIOS 落后, 必须立项)

#### P0-B. `default_mode` Auto-Activated Modes — **oh-my-openagent v4.3.0 (新发现)**
- **来源**: code-yeongyu/oh-my-openagent v4.3.0 (2026-05-21+)
- **实现细节**: `default_mode` config auto-activates ultrawork and ralph loop without typing commands. Set it once in your plugin config and every new session starts in high-agency mode. (PR #4190) — **零配置自动激活**, 配合 `ultrawork` directive 强制 `ULTRAWORK MODE ENABLED!` 开头 + 4 通道 manual-QA (HTTP / tmux / Browser use / Computer use) + 必须 RED→GREEN 测试
- **AIOS 映射**: `scripts/aios.mjs` 启动时检测 `.aios/config.json` 中的 `default_mode`, 自动 inject 对应 skills / system prompt; 与 `aios-long-running-harness` SKILL.md 的 "stage" 概念集成
- **可移植性**: **easy**, 阻塞点: AIOS 已用 AGENTS.md 路由 superpowers skills, 只需在 aios bootstrap 阶段读 config + 加载对应 skill 即可
- **优先级**: **P0**, 理由: 5月22日 review brief 已把 "零配置启动" 列为 cross-cutting trend, 现已成事实标准, OpenHarness v0.1.9 的 slash-commands 和 oh-my-openagent v4.3.0 的 `default_mode` 是同一方向

#### P0-C. `worker_died` 兜底协议邮件 — **overstory v0.10.3 (项目已 archived, 模式仍 P0)**
- **来源**: jayminwest/overstory v0.10.3 (2026-05-01)
- **实现细节**: 子 agent 进 zombie 时, watchdog 自动发 `worker_died` 协议邮件给 `session.parentAgent`, dedup 通过 pre-tick state-snapshot 防止 zombie→zombie 重复触发. gate: `watchdog.notifyParentOnDeath` (default `true`). 兜底: runner 自己 emit `worker_died` when `finalState=zombie` 或 `terminalMailMissing` (out-of-band death detection 漏检)
- **AIOS 映射**: `scripts/lib/aios.mjs` + `aios team` → 子 agent 异常时, 父 agent 收到结构化 death notice, 而不是阻塞永远等不到
- **可移植性**: **medium**, 阻塞点: AIOS 当前 `aios team` 用独立子进程 IPC, 需扩展通信协议; overstory 项目 archived 意味着抄代码 OK 但需自己维护
- **优先级**: **P0**, 理由: AIOS harness 在 8h+ 跨夜场景下, agent crash 兜底是 **多天连续运行的基础**, 5月22日 没列但属于 P0 必做

#### P0-D. Auto-Dream Sleep-Time Memory Consolidation — **OpenHarness `services/autodream/` (新发现)**
- **来源**: HKUDS/OpenHarness (在 v0.1.6 之后陆续合并, 仍在持续优化)
- **实现细节**: 4 文件模块 `backup.py / lock.py / prompt.py / service.py`. 扫描 `~/.openharness/memory/*.md` mtime 变化, 触发 LLM 反思合并, 提示词分 "PREVIEW MODE" (不写文件, 只提计划) / "APPLY MODE" (直接更新). 锁机制: `try_acquire_consolidation_lock` 防并发, `rollback_consolidation_lock` 失败回滚, backup 机制 `create_memory_backup` / `diff_memory_dirs`. 提示词严格分级: Stable Preference / Durable Project Context / Recent Snapshot (带 `Last observed:`) / Sensitive/Private (带 `Privacy: personal/private`) / Operational Reminder
- **AIOS 映射**: `scripts/lib/memo/` (AIOS 已有 memo 系统) → 扩展为定时整理任务, 整合到 ContextDB 的 `context:pack` 流程
- **可移植性**: **medium**, 阻塞点: AIOS memo 已是 git-friendly markdown, 需要: (1) 分类 taxonomy 对齐 OpenHarness 5 类; (2) mtime 监听; (3) LLM 调用预算; (4) 锁机制防多 harness 并发
- **优先级**: **P0**, 理由: 5月22日 把 Auto-Compaction 列为 P0 #3, 但 Auto-Compaction 是"压缩 token", Auto-Dream 是"长期记忆整理", **两者互补不可替代**, 现况 OpenHarness 已成事实标准

---

### P1 候选 (建议本季度规划)

#### P1-A. Sleep Prevention / System Inhibitor — **gnhf v0.1.9 (小但工程完整)**
- **来源**: kunchenguid/gnhf v0.1.9 (2026-04-03) — 在 5月22日 review 之后无新变化, 维持 P1
- **实现细节**: `src/core/sleep.ts` (~200 行). Linux 用 systemd-inhibit (5s ready timeout, 25ms poll), macOS 用 `caffeinate -i`, Windows 跳过. 复杂部分: reexec 模式 — `GNHF_SLEEP_REEXEC_READY_PATH` 写到 `/tmp/gnhf-sleep-XXX/reexec-ready`, 子进程启动后等待 ready, 然后父进程退出, 子进程接管 sleep-inhibit
- **AIOS 映射**: AIOS harness 跑多日, sleep prevention 是必备; 现有依赖 system preference pane, 不够 robust
- **可移植性**: **medium**, 阻塞点: 需把 systemd-inhibit 改成 macOS 优先 + Windows skip
- **优先级**: P1, 理由: 5月22日 没列, 是 gnhf 标志性能力 (good night have fun tagline), 工程完整可直接抄

#### P1-B. Per-Agent Skill Filtering (`restrictedAgents`) — **oh-my-openagent v4.3.0**
- **来源**: oh-my-openagent v4.3.0 (PR #2827)
- **实现细节**: Skills can declare `restrictedAgents` so only eligible agents see them in prompts and tool descriptions
- **AIOS 映射**: `.claude/skills/*/SKILL.md` frontmatter 加 `restrictedAgents: [codex, gemini]`, AIOS prompt 装配时按当前 client 过滤
- **可移植性**: **easy**
- **优先级**: P1, 理由: AIOS 现在所有 skill 对所有 client 可见, 会触发 prompt 膨胀; 多 CLI 场景下需要

#### P1-C. Backoff Sticky `tokensEstimated` Flag — **gnhf orchestrator.ts (842 行)**
- **来源**: gnhf orchestrator state machine
- **实现细节**: `tokensEstimated: boolean` sticky flag, 一旦某轮 usage 是 estimated (e.g. ACP adapter 不发 usage_update), 整个 run 的 totals 都标记 estimated, 避免后续精确值混入造成 total 不准
- **AIOS 映射**: `aios team` + `aios harness` 输出 token 总数时, 标 `*` 提示 estimated
- **可移植性**: **easy**
- **优先级**: P1, 理由: 5月22日 没列, gnhf 工程细节, 防止数字误导

#### P1-D. Worktree Slug Sanitization — **OpenHarness `swarm/worktree.py`**
- **来源**: OpenHarness v0.1.6+ (持续优化)
- **实现细节**: `validate_worktree_slug`: 64 chars max, `[a-zA-Z0-9._-]+` per segment, reject `.` `..` (path traversal), reject absolute paths. `gitignore common symlink dirs: node_modules / .venv / __pycache__ / .tox`
- **AIOS 映射**: `scripts/lib/harness/solo-worktree.mjs` 已有 worktree, 加强 slug 校验
- **可移植性**: **easy**
- **优先级**: P1, 理由: overstory v0.9.4 出现过 tmux session name 解析 bug, 是同类问题, 早做预防

#### P1-E. `prompt-async-gate` Post-Dispatch Hold 2s — **oh-my-openagent v4.2.3**
- **来源**: oh-my-openagent v4.2.3 (2026-05-20)
- **实现细节**: `DEFAULT_PROMPT_ASYNC_POST_DISPATCH_HOLD_MS` 从 250ms → 2000ms (8x), 吸收 slower-provider `session.error` arrival, 避免 race window. 文档 `docs/reference/prompt-async-gate-rfc.md` 维护变更理由
- **AIOS 映射**: `scripts/aios-intercept.mjs` + `aios mcp-proxy` 已用 reservation 模式, 加 2s post-dispatch hold
- **可移植性**: **medium**, 阻塞点: AIOS 当前 prompt dispatch 同步, 需改 async + reservation
- **优先级**: P1, 理由: 5月22日 没列, oh-my-openagent 5月22日后最实在的稳定性修复

#### P1-F. `boulder-state` Todo State Machine as Core Package — **oh-my-openagent v4.3.0**
- **来源**: oh-my-openagent v4.3.0 packages/boulder-state
- **实现细节**: Pure TypeScript boulder work-tracking state machine. API: `readCurrentTopLevelTask, addBoulderWork, completeBoulder, getBoulderWorks, getWorkById, getWorkByPlanName, getActiveWorks, getPlanProgress, getWorkResumeOptions, getTaskSessionState, upsertTaskSessionState`. 状态机: BoulderTaskStatus, BoulderWorkStatus. 文件位置: `BOULDER_DIR, BOULDER_FILE, BOULDER_STATE_PATH, NOTEPAD_BASE_PATH, NOTEPAD_DIR, PROMETHEUS_PLANS_DIR`
- **AIOS 映射**: `scripts/lib/harness/orchestrator/work-items.mjs` 当前混合在 orchestrator 中, 可参考 boulder-state 抽出 todo 状态机为独立模块
- **可移植性**: **medium**, 阻塞点: AIOS 当前用 TodoWrite 模式 (Claude Code) + opencode todo, 抽象层需重新设计
- **优先级**: P1, 理由: 5月22日 没列, oh-my-openagent 8 Core 包之一, 已实战验证

#### P1-G. Pre-Iteration + Post-Iteration Abort Reason Classifier — **gnhf orchestrator.ts**
- **来源**: gnhf core/orchestrator.ts
- **实现细节**: `getPreIterationAbortReason()` + `getPostIterationAbortReason()` 两阶段分类, 失败原因结构化 (`maxConsecutiveFailures`, `pendingCommitFailure`, `stop condition met`, etc.), 配合 `commitFailedError` 触发 `buildCommitRepairPrompt`
- **AIOS 映射**: `scripts/aios.mjs` harness run 阶段, abort 时输出结构化 reason (不是单纯 stack trace)
- **可移植性**: **easy**
- **优先级**: P1, 理由: gnhf 5月22日 review brief 没列, 工程细节, AIOS 当前 abort 信息不结构化

---

### P2 候选 (中长期 / 观察)

#### P2-A. Runtime 抽象 (overstory 11-adapter) — **降 P2 (oh-my-openagent 公开反对)**
- **来源**: overstory v0.9.2 (项目 archived)
- **实现细节**: `AgentRuntime` interface with `buildSpawnCommand / buildPrintCommand / deployConfig / detectReady / parseTranscript / getTranscriptDir / buildEnv`. 11 adapters
- **5月22日 review brief #8 降 P2 的判断** 现况: **完全验证**
  - overstory archived
  - oh-my-openagent ROADMAP 明确写: "We are skeptical of this abstraction. The industry changes too fast... Premature 'adapter pattern' abstraction across unstable interfaces causes more pain than duplication. We express what each component does in markdown documentation, not in interface definitions."
- **AIOS 映射**: AIOS `scripts/lib/harness/orchestrator-runtimes/` 已有 catalog + registry + env, 维持现状即可, **不要投资 grand interface**
- **优先级**: P2, 维持降级. 警告: **不要按 overstory 接口照抄, 而要按 oh-my-openagent 模式做 thin wrapper + markdown doc**

#### P2-B. SQLite WAL Mail Bus (overstory) — **降 P2 (over-designed for 2-3 agent scale)**
- **来源**: overstory v0.9.4 (项目 archived)
- **实现细节**: SQLite WAL 模式, 8 种类型化协议消息
- **5月22日 降 P1 的判断** 现况: **完全验证**
  - overstory archived
  - OpenHarness `swarm/mailbox.py` 走更轻量的文件 mailbox + `exclusive_file_lock` 路径, 已成事实标准
- **AIOS 映射**: 维持文件 mailbox (类似 OpenHarness), 不上 SQLite
- **优先级**: P2, 维持降级

#### P2-C. Pipeline Animation / Hero Background UI — **OpenHarness `autopilot-dashboard/`**
- **来源**: OpenHarness 6月初新仓库
- **实现细节**: React + Vite + TypeScript, `PipelineAnimation.tsx` + `HeroBackground.tsx` + `snapshot.json` 公网 dashboard
- **AIOS 映射**: `apps/` 或新 `apps/hud/`, 实时显示 harness pipeline
- **可移植性**: **medium**, 阻塞点: 需要先有 snapshot.json 数据源
- **优先级**: P2, 理由: 5月22日 没列, OpenHarness GTM 动作, 不是核心技术

#### P2-D. GTM/营销样板 (revfactory/harness) — **降 P3 (从 watchlist 移除候选)**
- **来源**: revfactory/harness _workspace/release/
- **实现细节**: 4 个 GTM launch 内容 + 2 个 M0 audit, 3 语言 README, 营销为先
- **AIOS 映射**: 不适用 (不是 runtime)
- **优先级**: P2, 维持. 警告: 持续 star 增长可能是 GTM 功劳, **技术深度需独立评估**

---

## 三、聚合判断

### P0 候选 (按推荐顺序)

1. **P0-A Dry-Run Readiness 裁定** (OpenHarness v0.1.8) — 5月22日 review brief 已 P0, 现况已发版
2. **P0-B `default_mode` Auto-Activated Modes** (oh-my-openagent v4.3.0) — 5月22日 之后新发现 P0 信号
3. **P0-C `worker_died` 兜底协议邮件** (overstory v0.10.3) — 5月22日 之后新发现 P0 信号
4. **P0-D Auto-Dream Sleep-Time Memory** (OpenHarness autodream/) — 5月22日 之后新发现 P0 信号, 补全 5月22日 Auto-Compaction P0 #3

### P1 候选 (按推荐顺序)

1. **P1-E `prompt-async-gate` Post-Dispatch Hold 2s** (oh-my-openagent v4.2.3) — 实战稳定性最强
2. **P1-F `boulder-state` Todo State Machine 抽出** (oh-my-openagent v4.3.0) — Core 包分层对齐
3. **P1-A Sleep Prevention (caffeinate + systemd-inhibit)** (gnhf v0.1.9) — 跨夜必备
4. **P1-B Per-Agent Skill Filtering** (oh-my-openagent v4.3.0) — 多 CLI prompt 控制
5. **P1-D Worktree Slug Sanitization** (OpenHarness swarm/worktree.py) — 早做预防
6. **P1-C `tokensEstimated` Sticky Flag** (gnhf orchestrator.ts) — 防止数字误导
7. **P1-G Pre/Post-Iteration Abort Reason Classifier** (gnhf orchestrator.ts) — 结构化失败

### P2 候选

1. **P2-A Runtime 抽象 (overstory)** — 维持降级, 警告反对 grand interface
2. **P2-B SQLite WAL Mail Bus (overstory)** — 维持降级, 用 OpenHarness 文件 mailbox
3. **P2-C OpenHarness Pipeline Animation UI** — 长期可做
4. **P2-D revfactory/harness GTM 样板** — 仅作团队架构设计参考

### 移除 watchlist 候选

- **mmTheBest/long-running-tasks** — 90 天 dormant, 5月22日 P2, 现况 P3, **建议从 watchlist 移除**

### 与 5月22日 review-brief 对比

| 5月22日 评级 | 5月22日 简报 # | 简报主题 | 现况评级 | 变化 |
|---|---|---|---|---|
| P0 (共识) | #2 | Dry-Run Readiness | **P0 (已发版)** | OpenHarness v0.1.8 已 ship, AIOS 落后 |
| P1 (升级) | #1 | Iteration Notes (gnhf) | **P1 维持** | gnhf 节奏放缓, 5月22日后 0 release |
| P1 (升级) | #3 | Auto-Compaction | **P0 升级** | OpenHarness autodream 是补全, oh-my-openagent prompt-async-gate 8x hold 是同向 |
| P0 | #8 | Runtime 抽象 (overstory) | **P2 维持** | overstory archived, oh-my-openagent 公开反对, 验证降级 |
| P1 (降) | #12 | SQLite Mail Bus (overstory) | **P2 维持** | overstory archived, OpenHarness 用更轻文件 mailbox, 验证降级 |

**新增的 P0 信号 (5月22日 未识别)**:
- **P0-B `default_mode` Auto-Activated Modes** (oh-my-openagent)
- **P0-C `worker_died` 兜底协议邮件** (overstory)
- **P0-D Auto-Dream Sleep-Time Memory** (OpenHarness)

### 特别关注 (5月22日 review-brief 提出的风险)

> "Did maintenance-mode risks for overstory materialize? Any new P0 signals?"

**1. Overstory 维护模式风险 — 100% 物化**
- `archived: true` (GitHub API 字段确认)
- README 顶端 "**No longer maintained. Overstory is no longer actively maintained and this repository is archived (read-only)**"
- 5月22日 提出的 "maintenance mode red flag" 已完全兑现
- 5月22日 的两个降级判断 (Runtime 抽象 P2, SQLite Mail Bus P2) 都**完全正确**
- 继任者 Warren (self-hostable control plane) 是不同方向 (云端 sandbox), 不替代 overstory 多 agent 编排

**2. OpenHarness dry-run 风险 — 100% 物化 (但与预期方向相反)**
- 5月22日 review brief 担心 "dry-run 是静态检查还是真的验证了运行时条件?"
- 答案: **已发版, 三档 verdict + next_actions + MCP skipped-aware + 命令分类**, 比预期更成熟
- 5月22日 担心 "AIOS 配置分散在 .aios/ 多目录, dry-run 需要检查哪些维度?"
- 答案: OpenHarness 检查配置合并 + auth 状态 + prompt 装配 + 命令解析 + 工具列表 + MCP 配置问题, **6 个维度**, AIOS 应对齐

**3. gnhf 节奏放缓信号 (新发现)**
- 5月22日 review brief 把 gnhf 列为参考源, 当时 22 天已 7 个 release
- 5月22日 → 6月4日: 22 天, **仅 4 个 release, 全部是 bug fix**
- 评估: gnhf 进入稳定期, 不再是 "极简 long-running" 的最前沿, 但仍是最干净实现
- **风险**: 长期可能 0 contributor 维护, 但目前仍有 PR 流入

**4. oh-my-openagent 路线剧变 (新发现)**
- 5月22日 把 oh-my-openagent 列为 P0 (基于 60K★), 但当时只关注 v4.0 Team Mode
- 5月22日 之后: 13 天 13 个 minor, **8 个 Core 包分层重构** + `default_mode` + multi-harness 路线 + Codex Light edition + 三发布
- 评估: **整个生态方向已变**, 从 "OpenCode 单一 host" → "multi-host 通用工具链"
- 风险: oh-my-openagent 公开反对 overstory 11-adapter 模式, AIOS 跟哪个路线需要明确选择 — **倾向 oh-my-openagent 的 DI + 文档化模式**

---

## 四、建议执行顺序

```
Phase 1 (本周):
  - P0-A Dry-Run Readiness (OpenHarness v0.1.8 reference, 6 维度检查)
  - P0-B default_mode Auto-Activated (oh-my-openagent, 1 行 config 改动)
  - P1-D Worktree Slug Sanitization (OpenHarness reference, 早做预防)

Phase 2 (本月):
  - P0-C worker_died 兜底邮件 (overstory v0.10.3 reference)
  - P0-D Auto-Dream Sleep-Time Memory (OpenHarness autodream reference)
  - P1-E prompt-async-gate 2s hold (oh-my-openagent v4.2.3)
  - P1-F boulder-state 状态机抽出 (oh-my-openagent v4.3.0)
  - P1-A Sleep Prevention (gnhf v0.1.9)

Phase 3 (下月):
  - P1-B Per-Agent Skill Filtering
  - P1-C tokensEstimated Sticky Flag
  - P1-G Pre/Post-Iteration Abort Reason Classifier

Phase 4 (Q3):
  - P2-A 维持 Runtime 抽象降级 (不投资 grand interface)
  - P2-B 维持 SQLite Mail Bus 降级 (用 OpenHarness 文件 mailbox)
  - 评估: 是否立项 OpenHarness autopilot-dashboard 同等物
```

---

## 五、watchlist 调整建议

| 竞品 | 5月22日 评级 | 6月4日 评级 | 变化 |
|---|---|---|---|
| OpenHarness | P0 | **P0 维持** | v0.1.8 发版, autopilot/autodream 上线 |
| gnhf | P1 | **P1 维持** | 22 天静默, 但无断裂 |
| oh-my-openagent | P0 | **P0 维持** | 8 包分层 + default_mode + multi-harness 路线 |
| overstory | P1 | **降 P3 / 移除候选** | archived, 风险完全物化 |
| revfactory/harness | P1 | **P1 维持** | 内容驱动, star 增长 64% |
| long-running-tasks | P2 | **降 P3 / 移除** | 90 天 dormant |

**强烈建议**:
- overstory 降 P3, **保留** 作为"实战模式参考" (worker_died, ov sling --recover, eventStallTimeoutMs 仍是有价值模式, 即便项目 archived, 抄模式不抄代码)
- long-running-tasks 移除 watchlist
- revfactory/harness **降 P2 候选** — 2.2K★ 增长但仓库无 runtime 代码, 风险是 GTM 而非技术

---

*数据源: GitHub API, recursive tree, CHANGELOG, 源码抽取 (`src/openharness/cli.py`, `swarm/mailbox.py`, `swarm/worktree.py`, `services/autodream/{service,prompt}.py`, `engine/messages.py`; `gnhf/src/core/{orchestrator,sleep}.ts`; `oh-my-openagent/ROADMAP.md`, `packages/boulder-state/src/index.ts`, `packages/omo-codex/plugin/components/ultrawork/directive.md`)*
*方法: 单人 deep-dive (无 subagent dispatch — 6 竞品单人可控, 重点是源码抽取) + 与 5月22日 review-brief 逐条对账*
*时间预算: ~45 分钟 (含 8 次 GitHub tree 递归 + 5 次源码 head 抽取)*
