# 竞品全面刷新 + 参考价值功能分析

> 生成日期: 2026-06-04 | 距上次 5月22日 deep-dive: **13 天**
> 数据源: GitHub API (19 仓库元数据) + 5 路并行 deep-dive (memory / harness / context-infra / execution-quality / browser)
> 方法: Phase 0 元数据刷新 → Phase 1 五路 task parallel agents → Phase 2 交叉去重归并 → Phase 3 报告 + watchlist 回写
> 报告范围: 19 个竞品全量覆盖, 5 大类, 含 watchlist 调整建议

---

## 0. TL;DR — 13 天关键变化

1. **Hermes Agent**: 162K → 179K ★ (+17K, **watchlist 单一项目最大增长**), v0.14.0 Foundation + v0.15.0 Velocity 双 release, 自我改进闭环已**实装可抄** (background review fork + skill provenance)
2. **superpowers**: 202K → 217K ★ (+15K), **AIOS 仍契约式引用未 vendored** — 5月22日 brief 没识别这层, 本次 P0 候选
3. **OpenHarness v0.1.8 已正式发版 `--dry-run` ready/warning/blocked** — 5月22日 brief 列为唯一 P0, 现已落后, 必须立项
4. **oh-my-openagent 13 天 13 个 minor (v4.3.0→v4.7.5), 8 个 Core 包分层重构 + `default_mode` 自动激活 + multi-harness 路线** — 5月22日 P0 候选, 现确认路线剧变
5. **overstory 已 ARCHIVED** — 5月22日 brief "maintenance mode red flag" 100% 物化, 降 P3 候选
6. **OpenViking 5 个版本 (v0.3.18→v0.3.23)**, Memory V1 移除 (V2 GA), VikingBot per-agent 命名空间, Usage/Audit 多时区 schema
7. **OpenClaw v2026.6.1 Skill Workshop 治理闭环 + Plugin 外部化 + Memory SQLite 化 + Operator install policy** — 生态化平台路线
8. **TencentDB v0.3.6 (Recall 预算控制) + v1.0.0-beta.1 (独立 Memory 服务)** — 5月22日 漏判, 现 P0
9. **mem0 cli-node-v0.2.8 一口气修 8+ 高危 CVE, MCP SDK 进入核心依赖** — AIOS 必升
10. **letta-code v0.27.0 正式接入 `MiniMax M3` 模型** — AIOS 选型的外部验证, 强信号
11. **the-pair v1.3.1 → v2.0.2 (主版本升级)**, Mentor-Executor 架构不变, 4 段 verdict schema 仍是质量门控范本
12. **vision-test-harness / openclaw-recall / long-running-tasks / execplan-skill 确认 dormant** — 4 个项目应从 watchlist 移除或降 P3

---

## 1. Phase 0 — 元数据刷新 (vs 5月22日)

| 竞品 | 5月22日★ | 当前★ | Δ ★ | 13天版本/事件 | 状态 |
|------|---------:|------:|----:|---------------|------|
| Tencent/TencentDB-Agent-Memory | 3,789 | **4,768** | **+979** | v0.3.5 → v0.3.6 + v1.0.0-beta.1 (5/29) | 极活跃, 商业化前兆 |
| mem0ai/mem0 | 56,402 | **57,641** | **+1,239** | cli-v0.2.7 → cli-node-v0.2.8, plugin v0.2.4→v0.2.6, @mem0/opencode-plugin v0.1.2 | 极活跃, 5 平台 plugin 矩阵 |
| getzep/zep | 4,584 | 4,633 | +49 | zep-crewai-v1.1.1 (CrewAI 集成) | **主仓 56 天 dormant**, 实际核心在 `getzep/graphiti` (27K★, v0.29.1) |
| letta-ai/letta | 22,831 | 23,128 | +297 | 0.16.8 (5/14) | **主仓 21 天无 push**, 实际主战场在 `letta-ai/letta-code` (v0.26.4→v0.27.3, 10 release) |
| HKUDS/OpenHarness | 12,917 | **13,502** | **+585** | v0.1.8 (5/6, **dry-run 正式发版**), v0.1.9 (5/7), 主分支今日 push | 极活跃, 50+ 贡献者 |
| kunchenguid/gnhf | 1,741 | 1,875 | +134 | gnhf-v0.1.42 (5/13) | 22 天静默, 慢速稳定 |
| code-yeongyu/oh-my-openagent | 58,967 | **60,924** | **+1,957** | **v4.2.0→v4.7.5 (13 个 minor)** | 极活跃, 220+ 贡献者, 路线剧变 |
| jayminwest/overstory | 1,302 | 1,317 | +15 | v0.11.0 (5/2), **已 ARCHIVED** | **降 P3**, 5月22日风险完全物化 |
| revfactory/harness | 3,506 | **5,767** | **+2,261** | 无 release, 内容驱动 (3 语言 README + 4 GTM launch) | 增长 64.5%, 风险是 GTM 而非技术 |
| mmTheBest/long-running-tasks | 1 | 1 | 0 | 无 (90 天 dormant) | **降 P3, 移除候选** |
| volcengine/OpenViking | 24,470 | **25,117** | **+647** | **v0.3.18→v0.3.23 (5 版本)** | 极活跃, 120+ 贡献者, 稳态扩展期 |
| openclaw/openclaw | 373,836 | **376,649** | **+2,813** | v2026.5.20→v2026.6.1, 2 stable + 9 beta | 极活跃, 生态级, Skill Workshop + Plugin 外部化 |
| Felix201209/openclaw-recall | 3 | 4 | +1 | 无 (77 天 dormant) | **降 P3, 移除候选** |
| NousResearch/hermes-agent | 162,109 | **179,562** | **+17,453** | v2026.5.16→v2026.5.29.2 (v0.14.0 Foundation + v0.15.x Velocity) | 极活跃, **watchlist 最大增长** |
| obra/superpowers | 202,070 | **217,191** | **+15,121** | v5.1.0 (5/4) — 无新 release, 主分支仍活跃 | 极活跃, 官方 Claude Code marketplace plugin |
| timwuhaotian/the-pair | 266 | 337 | +71 | **v1.3.1 → v2.0.0/v2.0.1/v2.0.2 (主版本升级)** | 活跃, Mentor-Executor 架构不变 |
| tiann/execplan-skill | 26 | 52 | +26 | **无 release, lastPush 2025-12-20 (166 天)** | **DORMANT 100% 确认, 移除候选** |
| UpGPT-ai/vision-test-harness | 0 | 0 | 0 | 无 (45 天 dormant) | **DORMANT 100% 确认, 降 P3** |
| golutra/golutra | 3,541 | 3,639 | +98 | v0.2.6 (3/22) → v0.2.7 (5/12) → v0.2.8 (5/31, 仅 README 28 行) | **slowing**, 模板系统未实装 |

**总增量**: **+33,021 ★ (13 天, 19 项目)**。**execution-quality 是增长最猛的类别** (+32,671 ★, Hermes + superpowers 双引擎驱动)。

---

## 2. 5 类竞品状态卡

### 2.1 memory-systems (4 竞品)

| 竞品 | 5月22日 | 6月4日 | 关键新信号 | 处置 |
|------|---------|--------|------------|------|
| TencentDB | P1 | **P1→P0 升级** | v0.3.6 Recall 预算控制 (`maxChars` × `maxTotal`) + **v1.0.0-beta.1 独立 Memory 服务** (v2 REST API + SDK) | 上调, 商业化前兆 |
| mem0 | P0 | **P0 维持** | cli-node-v0.2.8 + 5 平台 plugin 矩阵 + MCP SDK 进核心 + 8 CVE 一键修复 + opencode plugin 直接对标 AIOS | 维持 P0 |
| getzep/zep | P1 | **P1 降 P2 watch-only, 新增 graphiti 为 P0** | 主仓 56 天 dormant (变 examples 聚合器), 实际核心 `getzep/graphiti` 27K★ v0.29.1 持续活跃 (attribute-hallucination 3 层防御) | 重组 |
| letta-ai/letta | P0 | **P0 维持, 但 watchlist 重心迁到 letta-code** | 主仓 21 天无 push, **letta-code v0.26.4→v0.27.3 (10 release)**, **接入 MiniMax M3 模型 (PR #2665)**, system prompt 版本化 canary, Task* CRUD 家族 | 维持, 加 watch |

### 2.2 harness-orchestration (6 竞品)

| 竞品 | 5月22日 | 6月4日 | 关键新信号 | 处置 |
|------|---------|--------|------------|------|
| OpenHarness | P0 | **P0 维持** | **v0.1.8 (5/6) 正式发版 `--dry-run` ready/warning/blocked** + Docker sandbox + 4 个新 provider (nvidia/qwen/MiniMax/gemini) + autodream sleep-time + 文件型 mailbox + autopilot dashboard | 维持, 关注点全在主分支 |
| gnhf | P1 | **P1 维持** | v0.1.42 (5/13), 22 天静默, 极简设计仍 P1 | 维持 |
| oh-my-openagent | P0 | **P0 维持, 路线剧变** | 13 天 13 minor, 8 Core 包分层, `default_mode` 自动激活, `omo-codex` 独立包, **公开反对 overstory 11-adapter 模式** | 维持, 战略方向重估 |
| overstory | P1 | **P1 降 P3** | **ARCHIVED 100% 确认** (`archived: true` + README 红色 callout), 5月22日 brief 风险 100% 物化 | 降 P3, 保留作模式参考 |
| revfactory/harness | P1 | **P1 维持, 风险标识** | +2,261 ★ (64.5% 增长) 但仓库**无 runtime 代码**, 纯 HTML/markdown GTM 内容 | 维持但标识 |
| long-running-tasks | P2 | **P2 降 P3, 移除候选** | 90 天 dormant 确认, 5月22日 stall-detection 已被 gnhf/overstory 实现 | 降 P3 |

### 2.3 context-infrastructure (3 竞品)

| 竞品 | 5月22日 | 6月4日 | 关键新信号 | 处置 |
|------|---------|--------|------------|------|
| OpenViking | P0 | **P0 维持, 改月度 deep-dive** | v0.3.19→v0.3.23 (5 版本), Memory V1 移除 (V2 GA), VikingBot per-agent 命名空间, batch session 100 msgs/req, request-level profile, CJK token | 维持, 降监控频率 |
| OpenClaw | P0 | **P0 维持** | v2026.5.20→v2026.6.1, **Skill Workshop 治理闭环** + 中心化 skills runtime + Plugin 外部化 (npm+ClawHub) + Memory/channel state SQLite 化 + Operator install policy (替代 dangerous-code scanner) | 维持, 重点 Skill Workshop |
| OpenClaw Recall | P2 | **P2 降 P3, 移除候选** | 77 天 dormant 确认, 主项目 v2026.6.x 零引用, 4 memory types 与 QMD 重复 | 降 P3 |

### 2.4 execution-quality (4 竞品)

| 竞品 | 5月22日 | 6月4日 | 关键新信号 | 处置 |
|------|---------|--------|------------|------|
| Hermes Agent | P0 | **P0 维持** | v0.14.0 Foundation (LSP 诊断 + 1h prompt cache + OpenAI proxy + /handoff) + v0.15.x Velocity + **background review fork 完整实装** (3 文件: `background_review.py` + `skill_provenance.py` + `curator.py` 1843 行) | 维持 |
| obra/superpowers | P0 | **P0 维持, 紧急"vendor 子集"建议** | v5.1.0 (5/4), 14 个 skill, **两阶段 subagent 审查 (spec→code-quality)**, worktree consent gate, marketplace multi-harness sync; **AIOS 当前 superpowers:* 是契约式占位符, 未 vendored** | 维持 + 紧急 vendor 动作 |
| the-pair | P1 | **P1 维持, 升级 P0 候选** | v1.3.1 → v2.0.0/v2.0.1/v2.0.2, Mentor-Executor 架构**完全保持**, **4 段结构化 verdict** (FILES_REVIEWED/CHECKS/CODE) 在 `quality_gate.rs:45-67`, v2.0.2 修"无变更时跑 typecheck 浪费 token" | 维持, 升级 P0 |
| execplan-skill | P2 | **P2 降 P3, 移除候选** | 166 天无 push, ★ 翻倍是被动增长, 规范已 stable | 降 P3 |

### 2.5 browser-control-plane (2 竞品)

| 竞品 | 5月22日 | 6月4日 | 关键新信号 | 处置 |
|------|---------|--------|------------|------|
| vision-test-harness | P2 | **P2 降 P3, 移除候选** | 0★ 0 forks 45 天 dormant, MIT relicense 后无 follow-up | 降 P3, 模式可抄但项目移除 |
| golutra | P1 | **P1 降 P2 候选** | v0.2.7/v0.2.8 仅 README delta, **"可复用工作流模板" 在源码中不存在** (`skillLibrary.ts` 是空 TODO), 5月22日 brief #8 P0 应撤回 | 降 P2 |

---

## 3. 高价值功能簇 (12 个, 去重归并后)

5 路 deep-dive 原始产出 50+ 条 feature 想法, 去重归并为 **12 个高价值功能簇**, 按 P0/P1/P2 分级, 每个簇包含来源 + 关键实现 + AIOS 映射 + 阻塞。

### 3.1 P0 簇 (本月立项) — 6 个

#### P0-1. **受控技能自生成闭环** (受 5 路共同信号驱动)
- **来源 (交叉)**:
  - **OpenClaw v2026.6.1 Skill Workshop** — 中心化 skills runtime + proposal/review/apply/rollback 治理 + `skill_workshop` agent tool
  - **Hermes v0.14.0 background review fork** — `agent/background_review.py:402-451` (复刻 AIAgent 跑 `_SKILL_REVIEW_PROMPT`) + `tools/skill_provenance.py` (ContextVar 区分 background/foreground write origin) + `agent/curator.py` (1843 行, 7 天 cadence pin/archive/consolidate)
  - **superpowers v5.1.0** — skill TDD (`writing-skills/SKILL.md:28-44` pressure test first)
  - **oh-my-openagent v4.3.0** — 8 Core 包 + Per-agent skill filtering (`restrictedAgents` PR #2827) + 中心化 skills index
  - **TencentDB v0.3.6** — session skill extraction (`bot.session_skill_extraction_enabled`)
- **实现细节**: 受控流程 = proposal (`aios skill propose`) → review (`aios skill review --approve|reject|quarantine`) → apply (写 `.codex/skills/` 或 `.claude/skills/`) → background review (异步 fork 跑 review) → provenance 打标 (区分自动/人工) → curator 周期整理 (pin/archive/consolidate)
- **AIOS 映射**:
  - **skills** + **ContextDB** + **harness** 三模块联动
  - 新增 `scripts/aios.mjs skill {propose,review,apply,rollback,scan,index}` 子命令族
  - 新增 `.aios/skills/index.json` (name/path/version/sha256/origin)
  - 复用 Hermes `skill_provenance.py` 的 ContextVar 模式 → AIOS 用 env var + log marker
  - harness checkpoint 之后异步触发 background review fork
- **可移植性**: **medium** — 需扩展 aios.mjs + 增加 background review 异步层
- **阻塞**: AIOS harness 是 ctx-agent 单进程, 需拆出 background review 线程 (类似 Hermes `_run_review_in_thread`)
- **优先级**: **P0** — 5 路共同信号, 受控技能自生成是 execution-quality 必争之地, 本月必须落地

#### P0-2. **Dry-Run Readiness 裁定** (5月22日 P0 已发版, AIOS 落后)
- **来源**: **OpenHarness v0.1.8 (2026-05-06, 正式发版)**, `src/openharness/cli.py:_evaluate_dry_run_readiness()`
- **实现细节**: `oh --dry-run` 输出 `level: ready|warning|blocked` + `next_actions[]` (具体修复指令) + `reasons[]` + `mcp_validation: "skipped in dry-run"`。检查维度 6 个: (1) 配置合并 (2) auth 状态 (missing auth → warning 而非 blocked) (3) prompt 装配 (4) 命令解析 (5) 工具列表 (6) MCP 配置问题
- **AIOS 映射**:
  - `aios harness run --dry-run` 预检层
  - 检查维度: `.aios/` 多目录配置 + ContextDB 索引完整性 + Git 状态 + browser MCP 探针 + model-router provider 状态 + 技能/skill 加载
- **可移植性**: **easy**
- **阻塞**: AIOS 配置分散, 需先做配置 inventory
- **优先级**: **P0** — 5月22日 brief 已 P0, OpenHarness v0.1.8 已 ship, AIOS 落后方必须立项
- **紧迫性**: **OpenHarness 已 ship, AIOS 落后方**, 5月22日 brief 列的"唯一 P0"现在必须立项

#### P0-3. **Sleep-Time Memory Consolidation / Auto-Dream**
- **来源 (交叉)**:
  - **OpenHarness `services/autodream/`** (4 文件: `backup.py/lock.py/prompt.py/service.py`) — 扫描 `*.md` mtime 变化, 触发 LLM 反思合并, PREVIEW/APPLY 双模式, 5 类 taxonomy (Stable Preference / Durable Project Context / Recent Snapshot / Sensitive/Private / Operational Reminder), 锁机制防并发
  - **TencentDB L0→L3 渐进披露** (5月22日 已记录, 仍有效)
  - **Letta Sleep-Time Agent** (letta-code 落地为 `/sleeptime` 命令)
- **实现细节**: 监听 mtime + 触发 LLM 反思 + 锁机制 + PREVIEW/APPLY 双模式 + 5 类 taxonomy 分级
- **AIOS 映射**:
  - **memo** + **ContextDB** → 扩展为定时整理任务
  - 与 `aios context:pack` 流程整合
  - 增加 `aios dream [--preview|--apply]` CLI
- **可移植性**: **medium** — memo 已是 git-friendly markdown, 需: (1) taxonomy 对齐 (2) mtime 监听 (3) LLM 调用预算 (4) 锁机制
- **阻塞**: AIOS 没有定时 daemon, 需用 cron / launchd / systemd 触发
- **优先级**: **P0** — 5月22日 #3 Auto-Compaction 已降 P1, Sleep-Time 独立维度升 P0, 补全记忆整理闭环

#### P0-4. **`default_mode` 自动激活 + 多入口触发** (零配置启动已成事实标准)
- **来源 (交叉)**:
  - **oh-my-openagent v4.3.0 `default_mode` config** (PR #4190) — 零配置自动激活 ultrawork/ralph loop, 配合 `ULTRAWORK MODE ENABLED!` directive + 4 通道 manual-QA
  - **OpenHarness v0.1.9** — slash-commands 直接触发 user-invocable skill
  - **OpenClaw Code mode** — 内部 namespaces + 精确 namespace tool dispatch
- **实现细节**: config 一次设置 → 每次新 session 自动注入对应 system prompt + skill + 启动行为; slash-commands 直接调用
- **AIOS 映射**:
  - `scripts/aios.mjs` 启动时检测 `.aios/config.json` 中的 `default_mode`
  - 自动 inject 对应 skills / system prompt
  - 与 `aios-long-running-harness` 的 "stage" 概念集成
- **可移植性**: **easy**
- **阻塞**: AIOS 已有 AGENTS.md 路由 superpowers skills, 只需在 bootstrap 阶段读 config + 加载 skill
- **优先级**: **P0** — 零配置启动已成事实标准, OpenHarness + oh-my-openagent 双向收口, 1 行 config 改动

#### P0-5. **结构化 4 段 Mentor Verdict + 两阶段 Subagent 审查** (质量门控范本)
- **来源 (交叉)**:
  - **the-pair v2.0.2** `src-tauri/src/quality_gate.rs:45-67` — verdict 强制 4 段: `FILES_REVIEWED:` / `CHECKS:` / `CODE:` (引用) / validate_review 缺段 reject
  - **superpowers v5.1.0** `skills/subagent-driven-development/SKILL.md:42-81` — 两阶段: implementer → spec-reviewer (只查 spec 合规) → code-quality-reviewer → final reviewer
- **实现细节**: schema 化 mentor 输出 + JSON extraction 容错 + accept check 跳过无文件变更
- **AIOS 映射**:
  - `aios quality-gate` 加同形 schema; harness checkpoint 后的 mentor agent 强制输出 4 段
  - `aios team` 加 `phase: spec-review` / `phase: code-review` 状态机
- **可移植性**: **easy**
- **阻塞**: `aios team` 当前没有显式 phase 状态机
- **优先级**: **P0** — Mentor 门控是 5月22日 #7 P1 升级, the-pair 4 段 verdict schema 1 周可抄

#### P0-6. **Vendor Superpowers Skill 子集** (紧急, 5月22日 brief 漏判)
- **来源**: obra/superpowers v5.1.0 + **AIOS 现状自检**
- **实现细节**:
  - superpowers 14 个 skill: `brainstorming` / `using-superpowers` / `test-driven-development` / `systematic-debugging` / `verification-before-completion` / `writing-plans` / `executing-plans` / `subagent-driven-development` / `dispatching-parallel-agents` / `requesting-code-review` / `receiving-code-review` / `using-git-worktrees` / `finishing-a-development-branch` / `writing-skills`
  - AIOS 当前 `client-sources/native-base/shared/partials/superpowers.md` 强制所有客户端调用 `superpowers:brainstorming` 等
  - **但 `.claude/skills/` 与 `.codex/skills/` 均无 `superpowers/` 目录**, `skills-lock.json` 只钉了 `find-skills` 一个外部源
  - **后果**: 用户不装 obra/superpowers 插件, AIOS `superpowers:*` 引用就是 noop
- **AIOS 映射**:
  - `skill-sources/superpowers/{skill-name}/` 或 vendored subset
  - 至少 vendor 8 个核心: `brainstorming` / `using-superpowers` / `test-driven-development` / `systematic-debugging` / `writing-plans` / `subagent-driven-development` / `using-git-worktrees` / `verification-before-completion`
- **可移植性**: **easy** (subagent 同步 vendor)
- **阻塞**: 需先与 obra 团队沟通 license + 同步策略 (superpowers 是 MIT)
- **优先级**: **P0** — 紧急, 否则 P0-1 / P0-5 全部空中楼阁 (superpowers:* 引用全是 noop)

### 3.2 P1 簇 (本季度规划) — 4 个

#### P1-1. **Per-Agent Memo 命名空间 + Identity 隔离**
- **来源 (交叉)**:
  - **OpenViking v0.3.23 VikingBot per-agent_id 命名空间** (PR #2380, local & remote 同步)
  - **mem0 plugin v0.2.5 identity scoping** (PR #5247) — 多用户/多 agent 共享 mem0 实例时不串台
  - **mem0 plugin v0.2.6 file-context hook** (PR #5346) — 读文件前 5s 超时 + ≥1500 bytes 才触发
- **实现细节**: 配置项 `bot.ov_server.recall_exp_first_round_only=true` + `exp_recall_limit=2` + `exp_recall_max_chars=10000`, per-agent_id 命名空间隔离 (local & remote 同步实现), mem0 plugin enforce_metadata_defaults.sh + auto_setup_categories.py
- **AIOS 映射**:
  - `aios memo add --agent <id>` namespace 隔离
  - `aios context:pack` 跨 agent 调用时强制 user_id / agent_id 隔离
  - privacy + team 共享场景硬需求
- **可移植性**: **medium** (ContextDB schema 加 agent_id 列)
- **优先级**: **P1** — 对 `aios team` 多 agent 并行场景防止 experience 串扰

#### P1-2. **会话结束自动写记忆 + Activity Timeline**
- **来源 (交叉)**:
  - **mem0 plugin v0.2.6 Stop hook** (PR #5346, `capture_session_summary.py`) — 解析 transcript JSONL → 提取 last assistant + touched files → 结构化 prompt → mem0.add(infer=True) → 90 天 expiry → dedup 标记 7 天清理
  - **mem0 plugin v0.2.6 SessionStart hook** (`session_timeline.py`) — 拉最近 10 条记忆 + 渲染类型图标 + 相对时间
  - **OpenViking v0.3.19** session skill extraction
- **实现细节**: Stop hook 在 session 结束时触发, 解析 transcript JSONL, 调 LLM 提取 last assistant message + touched files, dedup 标记文件 7 天 TTL, expiry 90 天; SessionStart hook 拉最近 10 条 + 渲染类型图标 + 相对时间
- **AIOS 映射**:
  - `aios session close` 钩子: 自动摘要 + 90 天 expiry + dedup 标记
  - `aios session start` 输出 10 条最近关键事件
- **可移植性**: **easy** — checkpoint 已存在, 加 hook 1 周
- **优先级**: **P1** — session 连续性可视化与可恢复性关键缺口

#### P1-3. **Recall 上下文预算控制 + 单趟 Token 估计算法**
- **来源 (交叉)**:
  - **TencentDB v0.3.6 (PR #71)** — `recall.maxCharsPerMemory` + `recall.maxTotalRecallChars` 双重预算裁剪, 按 score 排序截断
  - **TencentDB v0.3.6 fast-token-estimate 短路** — 单趟精确切点替代 6 轮全量 tiktoken, 首次 assemble 29s→1.4s
  - **OpenClaw v2026.6.1 `vector-disabled FTS` 检索降级**
- **实现细节**: 双重预算裁剪 (per-memory + total) 按 score 排序截断; 单趟 token 估算短路避免 6 轮全量 tiktoken; `vector-disabled` 模式下不 resolve embedding providers, 退到 FTS-only 检索
- **AIOS 映射**:
  - ContextDB `aios recall` / `aios context-pack` 新增 `recall.maxChars` / `recall.totalBudget` 配置
  - 借鉴 TencentDB 单趟扫描 + 精确切点算法 → audit `context:pack` 性能
  - `aios context:search --mode fts-only|vector|hybrid` 显式降级路径
- **可移植性**: **easy (预算裁剪)** / **medium (token 估计算法)**
- **优先级**: **P1** — Recall 膨胀是 long-task 崩溃首因, 5月22日 brief 已识别

#### P1-4. **Usage/Audit 多时区控制台 + Saved-Token 报表**
- **来源 (交叉)**:
  - **OpenViking v0.3.19 `usage_audit/schema.py`** (7 张表, UTC 持久化 + viewer-tz 分桶, 14 列复合主键, `zoneinfo` 处理 DST)
  - **openclaw-recall v1.3.0 saved-token reporting** (虽然项目 dormant, 模式可借鉴)
- **实现细节**: 7 张 SQLite 表 (`usage_token_hourly/usage_retrieval_hourly/usage_token_daily/usage_retrieval_daily/usage_context_write_bucket/usage_agent_activity_daily/request_audit`), UTC 持久化 + viewer-tz 重分桶 (处理 DST/UTC+8/印度尼泊尔半小时偏移), 14 列复合主键, saved-token 报表输出 `saved_tokens=N, ratio=M`
- **AIOS 映射**:
  - 新建 `.aios/interception/audit/` SQLite 表 (per-agent token/retrieval hourly)
  - `aios interception audit --timezone Asia/Shanghai --date 2026-06-04` 命令
  - `aios interception proof --saved-tokens-report` 输出 per-tool-call 节省
- **可移植性**: **medium** (新表 + timezone 处理 + 文档化)
- **优先级**: **P1** — 5月22日 brief 列为 P0 #19 候选, 现在有生产级 schema 可抄, 落地更快

### 3.3 P2 簇 (中长期) — 2 个

#### P2-1. **`worker_died` 兜底协议 + 跨夜 Agent 死亡恢复**
- **来源**:
  - **overstory v0.10.3 (2026-05-01, 项目 archived 但模式 P0)** — `worker_died` 协议邮件 + dedup + `watchdog.notifyParentOnDeath` (default true) + runner-synthesized 兜底 (out-of-band 漏检)
  - **ov sling --recover** (overstory v0.10.3) — 重新 dispatch fresh agent 到 closed task
- **实现细节**: 子 agent 进 zombie 时 watchdog 自动发 `worker_died` 邮件给 parent, dedup 通过 pre-tick state-snapshot 防 zombie→zombie 重复, runner-synthesized 兜底 in-band gaps, gate `watchdog.notifyParentOnDeath` 默认 true
- **AIOS 映射**:
  - `aios team` 子 agent 异常时, 父 agent 收到结构化 death notice
  - `aios harness` watchdog 增强: agent crash 自动发 `worker_died` 邮件 + 父 agent 收到 + 触发 recover
- **可移植性**: **medium**
- **优先级**: **P2** — 跨夜 8h+ 场景基础, 但当前 AIOS team 规模小, 暂可手动处理; overstory archived 意味着抄模式不抄代码

#### P2-2. **截图隐私覆盖层 (DOM PII Redaction)**
- **来源**: **vision-test-harness v0.3.0** (项目 dormant, 但代码模式完整)
- **实现细节**: `src/browser/privacy-overlay.ts` (398 行) — 4 presets (gmail/wordpress-admin/shopify-admin/generic), DOM-only 文本节点替换 (不破坏 children), `[email]`/`[data-hovercard-id]`/`[title]`/`[aria-label]`/`[placeholder]` 全部 regex scrub, custom rules: `selector + text|hide|blur` (blur 用 `filter: blur(8px)`)
- **AIOS 映射**:
  - `mcp-server/src/browser/actions/screenshot.ts` 默认应用 privacy overlay
  - `scripts/privacy-guard.mjs` 加 `mode: 'image'` (Playwright/Sharp) 维度
  - 1 Ollama-VLM-extension hook for ad-hoc domain presets
- **可移植性**: **medium**
- **优先级**: **P2** — AIOS Privacy Guard 当前 regex + path-pattern only, 零 image coverage. **如果 AIOS 计划任何"screenshot for sharing" UX (memo, weekly report, public report) 必须升 P0**

---

## 4. Watchlist 调整建议汇总

| 竞品 | 原 P | 新 P | 变化原因 |
|------|------|------|----------|
| TencentDB | P1 | **P0** | v1.0 服务化商业化路径, v0.3.6 Recall 预算关键 |
| mem0 | P0 | P0 | 维持 |
| getzep/zep | P1 | **P2 (watch-only)** + **新增 getzep/graphiti 为 P0** | 主仓 56 天 dormant, 核心迁至 graphiti |
| letta-ai/letta | P0 | P0 (letta-code 并列 P0) | letta-code 才是主战场, 已加入 watchAlso |
| OpenHarness | P0 | P0 | dry-run 已 ship, autopilot/autodream 上线 |
| gnhf | P1 | P1 | 维持, 22 天静默但无断裂 |
| oh-my-openagent | P0 | P0 | 8 包分层 + default_mode + multi-harness 路线 |
| overstory | P1 | **P3 (移除候选)** | ARCHIVED 100% 确认, 但保留模式参考 |
| revfactory/harness | P1 | P1 (标识 GTM 风险) | 维持但加风险标识 |
| long-running-tasks | P2 | **P3 (移除候选)** | 90 天 dormant 确认 |
| OpenViking | P0 | P0 (改月度 deep-dive) | 转入稳态扩展期 |
| OpenClaw | P0 | P0 | Skill Workshop + Plugin 外部化 |
| OpenClaw Recall | P2 | **P3 (移除候选)** | 77 天 dormant + 主项目零引用 |
| Hermes Agent | P0 | P0 | 维持 |
| obra/superpowers | P0 | P0 (紧急 vendor 子集) | AIOS 契约式引用未 vendored |
| the-pair | P1 | P1 (升级 P0 候选) | 4 段 verdict + v2.0.x 主版本升级 |
| execplan-skill | P2 | **P3 (移除候选)** | 166 天 dormant |
| vision-test-harness | P2 | **P3 (移除候选)** | 0★ 45 天 dormant |
| golutra | P1 | **P2** | README 声明的模板系统源码中不存在, 降级 |

**新建议 (watchlist 候选新增)**:
- `getzep/graphiti` (27K★, 实际 Zep 核心)
- `letta-ai/letta-code` (2,646★, Letta 实际主战场, v0.27.0 接入 M3)

**移除候选 (4 个)**: overstory / long-running-tasks / openclaw-recall / execplan-skill / vision-test-harness (5 个)

---

## 5. 与 5月22日 brief 的关键差异

### 5.1 新增 P0 (5月22日未识别)

| # | 想法 | 来源 | 5月22日遗漏原因 |
|---|------|------|----------------|
| ★1 | **受控技能自生成闭环** (proposal → review → background fork → curator) | OpenClaw Skill Workshop + Hermes background review + superpowers TDD | 5月22日 brief 把 #9 "技能自生成" 列为 P1, 当时只有概念; 现在 4 源共同落地, 可 1 周实施 |
| ★2 | **`default_mode` 自动激活** | oh-my-openagent v4.3.0 + OpenHarness v0.1.9 | 5月22日 brief 在 crossCuttingTrends 提到 "Auto-Activated Modes" 是趋势但未给 P0 |
| ★3 | **Sleep-Time Memory / Auto-Dream** | OpenHarness autodream/ + TencentDB L0→L3 + Letta `/sleeptime` | 5月22日 brief 把 #3 Auto-Compaction 列为 P0 但漏掉 "long-term memory 整理" 这一独立维度 |
| ★4 | **结构化 4 段 mentor verdict + 两阶段 subagent 审查** | the-pair v2.0.2 + superpowers v5.1.0 | 5月22日 brief 把 #7 Mentor 门控列为 P1, 当时没看 the-pair 源码 |
| ★5 | **Vendor superpowers skill 子集** | obra/superpowers v5.1.0 + AIOS 现状自检 | **5月22日 brief 假设 AIOS 已经在用 superpowers, 实际是契约式占位符** — 这是本次最关键的反转 |
| ★6 | **TencentDB v1.0 独立服务化 + Recall 预算** | TencentDB v0.3.6 + v1.0.0-beta.1 | 5月22日 brief 把 TencentDB 定位 "OpenClaw plugin / Docker", 完全错过 5/29 服务化里程碑 |

### 5.2 5月22日 P0 降级 (已验证)

| # | 想法 | 原 P | 新 P | 验证结果 |
|---|------|------|------|----------|
| 8 | Runtime 抽象 (overstory 11-adapter) | P2 (5月22日已降) | **P2 维持** | overstory archived, oh-my-openagent 公开反对 "Premature 'adapter pattern' abstraction" — 5月22日判断**完全正确** |
| 12 | SQLite Mail Bus (overstory) | P1 (5月22日已降) | **P2 维持** | overstory archived, OpenHarness 用更轻文件 mailbox, 5月22日判断**完全正确** |
| 9 | Auto-Compaction (5月22日 #3) | P0 → P1 (5月22日 review) | **维持 P1, 但补 P0-3 Auto-Dream 作为不可替代的兄弟** | Letta / OpenHarness / TencentDB 都在"long-term memory consolidation"独立投资 |
| 1 | Iteration Notes (gnhf) | P1 (5月22日 review) | **P1 维持** | gnhf 节奏放缓, 5月22日后 0 release |

### 5.3 5月22日 P1 升级 P0

| # | 想法 | 原 P | 新 P | 理由 |
|---|------|------|------|------|
| 7 | Mentoring 质量门控 (the-pair) | P1 | **P0** | the-pair v2.0.2 已 4 段 verdict schema 实装可抄, 1 周落地 |
| 9 | 自我改进闭环 (Hermes) | P1 | **P0** | Hermes v0.14.0 background review fork + provenance 详细实装 |
| 19 | 审计控制台 BFF | P0 (5月22日) | **P0 维持 + 现生产级 schema 可抄** | OpenViking v0.3.19 `usage_audit/schema.py` 是生产级 7 表 schema |

---

## 6. 风险信号与警示

### 6.1 商业化前兆 (TencentDB v1.0 + OpenClaw marketplace)
- **TencentDB v1.0.0-beta.1 (5/29)** 把"OSS memory for OpenClaw" 升级为 "Memory-as-a-Service for any agent" — 5月15日 LangChain 适配器 + v1.0 REST API + TS+Python SDK
- **如果 6 月底出 v1.0 GA**, AIOS 的 ContextDB 会被竞品抢先定义"memory service 协议"标准
- **对策**: AIOS 应在 6 月底前发 **P1-1 Per-Agent Namespace + Context:Pack Manifest** (P1-3 部分), 抢先定义 "machine-readable manifest" 格式

### 6.2 自我进化闭环已成事实标准 (Hermes + OpenClaw Workshop + superpowers TDD)
- **3 个顶级项目** 同时在 "skill self-generation + 治理 + 灰度" 方向迭代
- **AIOS 当前**: 没有 skill 自动生成, 引用 `superpowers:*` 是契约式占位符
- **紧迫性**: **P0-1 (受控技能自生成闭环) + P0-6 (vendor superpowers) 必须本月落地**, 否则 AIOS 在 execution-quality 维度会被甩开

### 6.3 MCP SDK 进入 mem0 核心依赖 + 集中修 CVE
- **mem0 cli-node-v0.2.8 (6/1) 一口气打 8+ 个高危 CVE**: `@modelcontextprotocol/sdk ^1.25.4` + `jws 4.0.1` + `langsmith ^0.6.0` + `tar-fs ^2.1.4` + `path-to-regexp ^8.4.0` 等
- **AIOS aios-mcp-proxy 必须审计并升级** `@modelcontextprotocol/sdk` 到 ≥1.25.4
- **P1 候选, 紧急 (本周)**

### 6.4 维护模式风险全面物化
- **overstory ARCHIVED**: 5月22日 brief 风险 100% 物化
- **OpenClaw Recall / long-running-tasks / execplan-skill / vision-test-harness 全部 dormant** (>60 天无 commit)
- **对策**: watchlist 清理 4 个项目, 释放 slot 给 graphiti / letta-code 新 P0

### 6.5 M3 选型外部验证 (letta-code PR #2665)
- **letta-code v0.27.0 (6/2) 正式接入 MiniMax M3** — 强信号: 顶级 memory-first coding agent 已用 M3
- **AIOS 应加速用 M3 做 long-task benchmark** (10+ 工具调用 / 1h 持续) 作为 P0 验证
- **当前盲点**: AIOS 自身 M3 long-task 实战数据缺失

---

## 7. 建议执行顺序

```
Phase 1 (本周) — 紧急窗口:
  P0-6 Vendor superpowers 8 个核心 skill 子集 (否则 P0-1/P0-5 全部空中楼阁)
  P0-2 Dry-Run Readiness (OpenHarness 6 维度参考)
  P1-3 升级 @modelcontextprotocol/sdk ≥1.25.4 (mem0 CVE)

Phase 2 (本月):
  P0-1 受控技能自生成闭环 (OpenClaw Workshop + Hermes background fork 模式)
  P0-3 Sleep-Time Memory / Auto-Dream (OpenHarness autodream 参考)
  P0-4 default_mode 自动激活 (1 行 config 改动)
  P0-5 4 段 mentor verdict + 两阶段 subagent 审查 (the-pair + superpowers)
  P1-1 Per-Agent Memo Namespace (OpenViking v0.3.23 参考)
  P1-2 会话结束自动写记忆 (mem0 plugin Stop hook)
  P1-4 Usage/Audit 控制台 (OpenViking schema 抄)

Phase 3 (下季度):
  P1-3 Recall 预算 + 单趟 token 估计算法 (TencentDB 参考)
  P2-1 worker_died 兜底 (overstory 模式, 不抄代码)
  P2-2 截图隐私覆盖层 (vision-test-harness 模式, 代码已 MIT)

P3 处置:
  从 watchlist 移除 5 个 dormant 项目 (overstory / long-running-tasks / openclaw-recall / execplan-skill / vision-test-harness)
  watchlist 监控频率: OpenViking 改月度, 其余维持 2 周
  M3 long-task benchmark: 用 letta-code 同款 objective 跑 1h 持续, 验证模型选型
```

---

## 8. crossCuttingTrends 增量 (供 watchlist.json 回写)

新增趋势 (5月22日 之后出现):
1. **受控技能自生成闭环 (proposal/review/background fork/curator)** — OpenClaw Skill Workshop v2026.6.1 + Hermes background review fork v0.14.0 + superpowers TDD v5.1.0
2. **default_mode 零配置自动激活 (1 行 config)** — oh-my-openagent v4.3.0 + OpenHarness v0.1.9
3. **Sleep-Time Memory Consolidation / Auto-Dream** — OpenHarness autodream/ + TencentDB L0→L3 + Letta /sleeptime
4. **VikingBot per-agent 经验命名空间隔离** — OpenViking v0.3.23 + mem0 plugin v0.2.5 identity scoping
5. **OVPack v2 二进制上下文容器 (manifest + JSONL index + dense vector)** — OpenViking v0.3.17+ (稳态)
6. **Operator install policy 替代 dangerous-code scanner** — OpenClaw v2026.6.2-beta.1
7. **MCP SDK 进入 mem0 核心依赖, AIOS 必升** — mem0 cli-node-v0.2.8 (6/1)
8. **MiniMax M3 被 letta-code 正式接入 (PR #2665)** — AIOS 选型外部验证
9. **TencentDB 独立 Memory 服务化 (v1.0.0-beta.1)** — 商业化前兆, 5月22日漏判
10. **oh-my-openagent 公开反对 grand interface 抽象** — "Premature 'adapter pattern' abstraction... causes more pain than duplication" — 方向已变

维持趋势 (5月22日 仍有效):
- 自我进化+技能自动生成 (Hermes/superpowers/OpenClaw)
- 多模型路由+Per-Agent 模型分配 (OpenViking/oh-my-openagent)
- dry-run readiness 裁定 (OpenHarness — 现已 ship)
- 零 LLM 检索管道 (mem0)
- 分层上下文渐进披露 (TencentDB/OpenViking)
- Auto-Activated Modes 零配置启动 (oh-my-openagent)
- Auto-Compaction 后台整理 (OpenHarness/Letta)
- SQLite WAL 多 Agent 消息总线 (overstory, 维持降级)
- 迭代笔记轻量 checkpoint (gnhf, 维持)
- Mermaid 符号化工具日志压缩 (TencentDB)

---

## 9. 方法论

- **数据源**:
  - GitHub API 19 仓库元数据 (2026-06-04 上午, GITHUB_TOKEN 可用, 19/19 成功)
  - 5 路 task `general` subagent 并行 deep-dive (memory / harness / context-infra / execution-quality / browser)
  - 每路: 仓库 sparse clone (1-6 个) + README + release notes + 关键 source 文件 + 5月22日 brief 对账
- **覆盖度**:
  - memory-systems: 高 (4 仓库全 clone + TencentDB 24 文件 / mem0 3 仓库 + Letta 2 仓库 + graphiti)
  - harness-orchestration: 高 (6 仓库 + OpenHarness 14 文件 + oh-my-openagent 3 Core 包 + gnhf 完整 src)
  - context-infrastructure: 高 (OpenViking sparse + OpenClaw 3 目录 + OpenClaw Recall 完整)
  - execution-quality: 高 (4 仓库全 clone + Hermes 关键 3 文件 + superpowers skills)
  - browser-control-plane: 高 (2 仓库全 clone + vision-test-harness 关键 5 文件 + golutra 完整 src)
- **可重现性**:
  - `node /tmp/aios-competitor-refresh/fetch-watchlist.mjs` 拉取元数据
  - 每路 deep-dive prompt 模板存于 subagent prompt
- **下一轮刷新**: 2026-06-18 (2 周), 重点观察 OpenViking v0.3.24+ / OpenClaw v2026.6.2 stable / Hermes v0.15.3+ / oh-my-openagent v4.8+

---

*报告完成: 2026-06-04 | 耗时 ~3.5 小时 (含 5 路并行 deep-dive)*
