---
title: 更新日志
description: 版本历史、升级说明与文档变更入口。
---

# 更新日志

## 文档与工作流说明

- **v3.6.0 Headroom token 智能工作流**：`aios init` 现会与 RTK、Caveman 一起安装经过测试范围的 Headroom；Gemini/Grok 的用户级 MCP 注册需单独传 `--yes-headroom-mcp` 授权。Hermes 必须在真实 TTY 中完成，否则显示 `pending-interactive`。已有外部或冲突条目不会被覆盖，AIOS-owned 条目记录在 `~/.aios/integrations/headroom-mcp.json`。MCP-only 是显式按需压缩，不是透明输入拦截。详见：[Token 智能与压缩](token-compression.md) 与 [Headroom + Ponytail 博文](/blog/zh/2026-07-headroom-token-intelligence/)。
- 已把 agent 治理说明补到 Team 文档、按场景指南、ContextDB 参考页和博客中。
- 新的 smoke 证据说明会指向 `.aios/agents/smoke/<agent>.json`、`.aios/agents/provenance/<agent>.json` 和 `.aios/interception/metrics/agents-smoke-<agent>.jsonl`。
- skill 修改后的 live 使用前，请先运行 `node scripts/aios.mjs skill verify-training --changed --base HEAD --json`。
- **Grok Build 成为 AIOS 一等公民客户端**：xAI Grok Build（`grok` / runtime id `grok-build`）现已支持 skills、agents、superpowers、native、team、harness。MCP 使用 Codex 形态 TOML（`~/.grok/config.toml`）。详见：[Grok Build + AIOS 博客](/blog/zh/2026-07-grok-build-aios-client/)。
- **Hermes Agent 成为 AIOS 一等公民客户端**：Hermes（Nous Research）具备 skills、native、harness、superpowers。详见：[Hermes Agent + AIOS 博客文章](/blog/zh/2026-06-hermes-agent-aios-client/)。

## v3.6.0（2026-07-10）— Headroom + Ponytail Token 智能工作流

### 新增

- 在隔离的 `uv tool` 或 `pipx` 环境中检测并安装 `headroom-ai[all]>=0.31.0,<0.32.0`；要求 Python 3.10+。
- 新增 `--yes-headroom-mcp`，让无人值守的包安装授权与 MCP 用户配置授权保持独立。
- Gemini CLI、Grok Build、Hermes Agent 通过自己的官方 MCP 命令注册 `headroom mcp serve`；Hermes 无真实 TTY 时保留为 `pending-interactive`。

### 安全与兼容

- AIOS-owned MCP 注册指纹写入 `~/.aios/integrations/headroom-mcp.json`；外部或冲突条目保持不动。
- 明确 `headroom_compress`、`headroom_retrieve`、`headroom_stats` 是模型显式调用的按需压缩，不是当前请求的透明拦截。
- 文档区分 RTK、Caveman、ContextDB、Headroom 与 Ponytail 启发的最小正确改动门禁。

## v3.4.0（2026-07-09）— Grok Build 一等公民客户端

- 注册 `grok` / `grok-build`，完整能力集（含 team + harness）
- 项目 skills/agents：`.grok/skills`、`.grok/agents`；指令文件共用 `AGENTS.md`
- 无人值守：`grok --always-approve -p "..."`
- 官方文档、更新日志与多语言博客已同步

## v3.3.0（2026-07-02）— 废弃原生拦截运行时，全自动安装 RTK + Caveman

### Breaking Change：AIOS 原生拦截运行时废弃

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

## v3.2.0（2026-07-01）— Harness 可靠性与技能生命周期升级

### Harness Solo Runtime

- **consecutiveFailures 自动中止**：`backoff.mjs` 新增双计数器（`consecutiveFailures` + `consecutiveInfraFailures`）。连续 5 次非成功 outcome 后自动 abort session，不再无限重试浪费 token。
- **Emergency 压缩第三级**：`mermaid-canvas.mjs` 在 mild（20 节点）/ aggressive（50 节点）之上新增 emergency 级别（100 节点触发），仅保留 5 个最近节点，防止 canvas 溢出。
- **Dry-run Readiness 预检**：新增 `dry-run-readiness.mjs`，在 harness 启动前检查 4 个维度（ContextDB、Git、Provider、Session）。`blocked` 级别直接阻止启动。

### Runtime Directive 系统

- **Directive 注入**：新增 `directive-inject.mjs`，从 `.aios/config.json` 读取 `default_mode`，将对应的 `systemPromptAdditions` 注入每轮 harness 迭代 prompt。支持 3 个内置预设和自定义 `mode_presets`。

### Auto-Dream（Phase A：手动）

- **手动记忆整理 CLI**：`scripts/lib/memo/autodream.mjs` 提供 `--preview`（预览）和 `--apply`（执行）模式，封装已有的 taxonomy + 去重 + TTL 过期管道。

### Skill Workshop

- **Stale 检测**：apply 前比对目标 `SKILL.md` 的文件系统 hash 与 lock 中的 `computedHash`，不一致则拒绝 apply，防止覆盖用户手动修改。
- **文件级 rollback**：apply 前将完整 `SKILL.md` 内容存入 `lock.rollbackSnapshot.previousContent`，rollback 时恢复实际文件内容。

### 验证

全部改动通过 37/37 单元 + 集成测试。

详见：[v3.2.0 发布文章](/blog/zh/2026-07-v320-harness-reliability-upgrade/)。

## v3.1.0（2026-06-30）— Hermes Agent 一等公民客户端集成

- **Hermes Agent 注册为第 7 个 AIOS 一等公民客户端**：具备 skills、native、harness、superpowers 全部能力。
- **MCP 桥接服务器**：`scripts/aios-mcp-server.mjs` 在 Hermes 会话内暴露 5 个 AIOS 工具（`aios_context_pack`、`aios_doctor_suite`、`aios_intercept_compress`、`aios_skill_validate`、`aios_skill_install`）。
- **Native emitter + MCP target**：AGENTS.md 输出 + JSON stdio（`.mcp.json` + `config.yaml` scopes）。
- 多语言文档覆盖（英/中/日/韩）。
- 详见：[Hermes Agent + AIOS 博客文章](/blog/zh/2026-06-hermes-agent-aios-client/)。

## v2.0.2（2026-06-15）

- **技能健康记录校验**：`recordSkillObservation()` 现在会拒绝未知 status，不再把生产端拼写错误静默落成 failure，避免污染失败率统计。
- **Help 优先解析**：`aios skill ... --help` 与 `aios session ... --help` 会先展示用法，再执行必填位置参数校验。
- **Crush 配置卫生**：`.crush.json` 与 `crush.json` 不再由仓库跟踪；本地 Crush 配置仍可生成/读取，但会被 git 忽略。
- 详情参见：[v2.0.2 发布文章](/blog/zh/2026-06-v202-ecc-uplift/)。

## v2.0.1（2026-06-13）

- **Browser MCP alias 迁移**：修复 legacy alias 兼容路径，同时保持默认 browser-use runtime 稳定。

## v2.0.0（2026-06-12）

- **拉取式运行时上下文**：移除自动 ContextDB prompt 注入和 startup-mode 注入，agent 只在需要时读取运行时上下文。

## v1.52.0（2026-06-11）

- **aios_shell MCP 工具**：通过 `aios-shell` MCP 别名实现跨所有客户端的确定性 shell 输出压缩。shell 命令通过 `scripts/shell-mcp-server.mjs` 执行，输出由 MCP proxy 自动压缩，**压缩率超过 99%**。
- **三层拦截防线**：MCP 工具（全客户端）→ shim+hook（Claude/全客户端）→ 提示词引导。无单点故障。
- **Shim 自愈**：原生 shim 探测 4 条回退路径（`AIOS_ROOT_DIR` → baked root → `~/.rexcil/harness-cli` → `~/cool.cnb/rex-ai-boot`），全部失败后 fail-open 执行真实客户端。
- **敏感命令守卫**：`git push` 和 `npm publish` 在执行前被拦截，需宿主权限审查。
- **aios-shell 注册到全客户端配置**：通过 `doctor --fix` 注册到 `.mcp.json`、`.codex/config.toml`、`.gemini/settings.json`、`opencode.json`、`crush.json`。
- 详情参见：[v1.52.0 博客文章](/blog/zh/2026-06-v152-aios-shell-mcp/)。

## v1.51.0（2026-06-10）

- **Crush smoke 验证**：将 Crush（charmbracelet）加入 pending-smoke 门控，强化 live execution 拦截。
- **Native strict 模式升级**：`clients doctor --native-strict` 现在验证受管 shim 背后是否存在真实下游客户端。

## v1.50.1（2026-06-05）

- **全客户端 turn compression 合规**：所有 AIOS 托管客户端/宿主共享 `bidirectional-turn-compression` 指标，并强制记录 `pre_send` 与 `post_receive`。
- **绕过不再冒充省 token**：未经过 AIOS-managed runner 的 direct host output 会记录为 `policy-violation` / `non_compliant`，且 `saved_bytes=0`。
- **Proof 矩阵**：`node scripts/aios.mjs interception proof --json` 和 `doctor --json` 输出 Codex、Claude、Gemini、Antigravity、OpenCode、Crush、Cursor、`aios-harness`、`generic-mcp` 的 `turn_compression_matrix`。
- **技能训练证据**：`aios-interception-runtime` 已通过 SkillOpt-Lite 训练，产物位于 `.skillopt/aios-interception-runtime-2026-06-05`。
- **发布教程**：阅读 [v1.50.1 token 压缩合规文章](/blog/zh/2026-06-v1501-token-compression-compliance/) 和 [Token 智能与压缩](token-compression.md)。

## v1.50.0（2026-06-04）

- **统一 AIOS 搜索**：`node scripts/aios.mjs search "<query>"` 可以一次搜索项目记忆、pinned memo、文档、计划和代码。
- **跨客户端记忆安全**：`project_shared` 对所有客户端可见；`agent_private` 只有匹配 `--agent <runtime-client-id>` 时可见。
- **全客户端 native 指令**：Codex/OpenCode/Crush 通过 `AGENTS.md`，Claude 通过 `CLAUDE.md`，Gemini/Antigravity 通过 `GEMINI.md` 接收同一套 search 指令。
- **发布教程**：阅读 [v1.50.0 统一搜索教程](/blog/zh/2026-06-v150-unified-aios-search/) 和 [ContextDB](contextdb.md#统一项目搜索v1500)。

本页用于追踪 `Harness CLI` 的版本变化，并快速跳转到相关文档。

## 官方发布记录

[⭐ 在 GitHub 上 Star](https://github.com/rexleimo/harness-cli){ .md-button .md-button--primary }
[📦 查看 Releases](https://github.com/rexleimo/harness-cli/releases){ .md-button }

## 最新稳定版

- `1.17.0`（2026-05-16）：
  - **Memo Storage**：`aios memo` 现在使用 storage 抽象，公开实现只有 `file`（默认 append-only JSONL：`.aios/memo/file/events.jsonl`）和 `split`（每条 memo 一个 JSON 文件）。通过 `aios memo storage status`、`aios memo storage use split`、`aios memo storage use file`、`aios memo storage rebuild` 和 `aios memo storage doctor` 管理。
  - **适合 Git 共享的 memo 源数据**：`.aios/memo/` 是项目 memo 的规范根目录。ContextDB/SQLite 只保留兼容镜像和可重建缓存角色，不再是 memo source of truth。
  - **运行时状态对齐**：新的 ContextDB 运行时状态写入 `.aios/context-db/`；legacy `memory/context-db` 仅在已存在时作为兼容读路径。
  - 详见 [ContextDB](contextdb.md#workspace-memory-aios-memo) 中的 memo 存储边界。

- `1.13.0`（2026-05-15）：
  - **Context Registry（拉取式上下文）**：用 ~350 字节的 registry 指针替代每次 ~30KB 的推送式注入。Agent 读取 `.aios/context-db/index.json` 后按需加载上下文。启动从 ~5 分钟降到近乎即时。
  - **`aios init`**：一条命令初始化全部四种 coding agent（Claude Code、Codex CLI、Gemini CLI、OpenCode）。自动检测已安装的 agent，写入 registry 标记到配置文件，配置 save guard hooks。幂等操作。
  - **多客户端 native sync 修复**：Gemini 现在写入 `GEMINI.md`（Gemini CLI 实际读取的文件）。OpenCode 直接读取 `AGENTS.md`（无需单独文件）。旧的 `.gemini/AIOS.md` 和 `.opencode/AIOS.md` 已标记废弃。
  - **`--context-mode slim`**：Team/harness 路由和包装后的 agent 在检测到 registry 标记时自动使用 slim 注入。未包装的 agent 回退到完整注入。
  - 详见 [ContextDB](contextdb.md)。

- `1.11.0`（2026-05-09）：
  - **debug-hub v0.3**：注入追踪与自动清理。新增 MCP 工具：`instrument`、`list_instruments`、`cleanup_instruments`。标记约定 `DH:<sessionId>` 实现零依赖调试代码注入与双模清理（显式通过 instrument 记录，回退通过 workspace grep）。支持 `dryRun` 安全预览。跨模型调试协议通过 workspace memory 共享。用 debug-hub skill 替换上游 debug skill。详见 [debug-hub](debug-hub.md)。

- `1.10.0`（2026-05-09）：
  - **debug-hub v0.2**：新增自动 Trace 物化（防抖合并）、agent 调试会话、结构化证据事件、`/api/health`，以及 `timeline`、`health`、`compact_context` MCP 工具。包含 HTTP 端点输入校验、MCP 参数校验、路径穿越防护、大小写不敏感搜索和防抖索引优化。详见 [debug-hub](debug-hub.md)。

- `1.8.0`（2026-05-08）：
  - 新增包装式 `codex`、`claude`、`gemini`、`opencode`、`hermes`、`grok` 会话的自触发 harness 路由。
  - **Model Router（模型路由器）**：Agent Team 的智能多模型调度。包含模型能力注册表（8个模型）、任务类型到模型的路由、三种CLI协议适配器（claude/codex/gemini）、按成本升序的降级链、Agent可调用的 `model-router` skill、`AIOS_MODEL_{ROLE}` 环境变量覆盖，以及感知反馈循环集成。详见 [Model Router](model-router.md)。
  - **GroupChat Runtime**：`aios team` live 模式现在使用基于轮次的 agent 执行，共享对话历史。每轮中的 agent 并行运行；所有 agent 都能看到完整的累积对话线程。被阻塞的 agent 会触发自动 re-plan 轮次。与旧的单次隔离 dispatch 模式形成对比。
  - **OpenCode CLI subagent 支持**：`opencode-cli` 现已成为所有编排路径（subagent、team 和 GroupChat runtime）完全支持的 `AIOS_SUBAGENT_CLIENT`。

## 较早稳定版

- `1.7.1`（2026-04-26）：
  - 新增 Solo Harness 发布博客。
  - 补齐既有 persona/user profile 记忆层说明（`aios memo persona ...`、`aios memo user ...`），修正此前文档漏写。

- `1.7.0`（2026-04-26）：
  - 新增 `aios harness`，支持单 Agent 过夜执行、run journal、stop/resume 控制、HUD 可见性和可选 worktree 隔离。
  - 新增并同步官方 `Solo Harness` 文档到英文、中文、日文、韩文站点。

## 更早稳定版

- `1.6.3`（2026-04-25）：
  - 将中文官方文档的新手视觉引导同步到英文、日文、韩文站点。
  - 重写多语言首页、快速开始、按场景命令和多 Agent 实战页，让各语言用户都按任务上手。

- `1.6.2`（2026-04-25）：
  - 增加中文官方文档的新手三步路径、TUI Setup/Doctor、ContextDB 记忆循环和 Agent Team/HUD 视觉示意图。
  - 让新用户先按任务找到命令，再按需进入 ContextDB、多 Agent 和高级编排。

- `1.6.1`（2026-04-25）：
  - 修复 GitHub Release workflow 在干净 Linux checkout 中因 generated skills/native 输出漂移导致的预检失败。
  - 简化中文首页、快速开始、按场景用法和多 Agent 实战入口，让新用户先按任务找到命令。

## 最近版本

- `main`（未发布）：
  - **debug-hub MCP 原生调试日志服务**（2026-05-06）：面向 coding agent 的 MCP 原生 debug 日志采集服务，提供 Node.js/Browser/Go 三种 SDK、内嵌 Web UI、`~/.debug-hub/` 文件存储、5 个 MCP 工具供 agent 自我诊断（`list_traces`、`get_trace`、`search_logs`、`get_stats`、`clear_logs`）；agent 无需人工介入即可内省自身运行时日志
	  - **Agent 自触发 harness 路由**（2026-05-05）：包装后的 `codex` / `claude` / `gemini` / `opencode` / `hermes` / `grok` 会话现在会提示 `single/subagent/team/harness`；长任务、过夜任务、可恢复目标可自触发 `aios harness run ... --workspace <project-root>`，支持 `--max-iterations`，并可用 `CTXDB_HARNESS_PROVIDER`、`CTXDB_HARNESS_MAX_ITERATIONS` 控制
  - **包装式 coding agent 的 Privacy Shield**（2026-04-24）：ContextDB shell 启动交互式 CLI 时会打印彩色隐私面板，展示 Privacy Guard 状态、自定义模型中转端点检测，以及 `aios privacy read --file <path>` 安全读取路径；自动提示词也明确 LLM 隐私规则只是提示约束，可验证保护来自确定性的 AIOS gate
  - **按工作区路由启动 + 项目级 Node 选择**（2026-04-23）：`ctx-agent` 的路由启动现在会保留当前 git 工作区，即使它是从非 AIOS 仓库触发；`mcp-server` 的 npm scripts 统一经由 `scripts/with-project-node.mjs` 运行，持续遵循 `.nvmrc` / Node 24，使用内置 `node:sqlite` 避免外部 SQLite addon ABI 漂移，并在本机缺少 Node 24 时给出明确报错
  - **ContextDB Shell 启动优化**（2026-04-22）：`ctx()` 优先使用编译后的 `mcp-server/dist/contextdb/cli.js`，单次调用开销从 ~0.3s 降至 ~0.06s；one-shot 代理启动从 ~2.2s 优化到 ~0.5s（快约 78%）；shell-bridge 的 `detectRunner` 不再依赖 `tsx`；安装时如缺少 `dist/` 自动触发 build，build 失败则优雅回退到 npm-run 模式
  - **默认核心技能更新**（2026-04-19）：`awesome-design-md`、`frontend-design`、`cap-commit-push` 提升为默认核心技能
  - **ContextDB 懒加载**（2026-04-18 至 2026-04-19）：交互式会话默认启用懒加载上下文（`CTXDB_LAZY_LOAD=on`）；代理通过 facade prompt 自主发现记忆，不再直接注入完整上下文包；新增[懒加载文档](contextdb.md#lazy-load)及多语言博客文章
  - **AIOS 工作流路由 skill**（2026-04-18）：新增 `.claude/skills/aios-workflow-router`，提供可靠的任务到技能路由与发现能力
  - **路由/并发文档更新 + 默认并发改为 3**（2026-04-20）：补充交互路由与并发参数的简化配置指南（`CTXDB_INTERACTIVE_AUTO_ROUTE`、`CTXDB_CODEX_DISABLE_MCP`、`CTXDB_TEAM_WORKERS`、`AIOS_SUBAGENT_CONCURRENCY`）；在概览核心能力中增加指南入口；live subagent runtime 默认并发从 `2` 调整为 `3`
  - **Browser MCP 迁移到 browser-use CDP**（2026-04-10）：默认浏览器运行时从 Playwright 切换到 browser-use MCP over CDP；新增启动器 `scripts/run-browser-use-mcp.sh`；迁移命令 `aios internal browser mcp-migrate`；截图超时保护可配置 `BROWSER_USE_SCREENSHOT_TIMEOUT_MS`
  - **HUD/Team skill-candidate 增强**（2026-04-09 至 2026-04-10）：`--show-skill-candidates` 详细视图参数；`--skill-candidate-limit <N>` 可配置限制数；fast-watch 模式默认限制从 6 降到 3；artifact 读取缓存优化性能；HUD 建议 `skill-candidate apply` 命令；team status 显示 skill-candidate artifacts 和 drafts
  - **Quality-gate 可见性**（2026-04-08 至 2026-04-09）：quality-gate category 在 HUD minimal status 和 team history summary 中显示；quality-failed-only 过滤器；quality prefix 过滤器支持多值
  - **Learn-eval draft 推荐**（2026-04-07 至 2026-04-09）：hindsight lesson drafts；skill patch draft candidates；draft recommendation apply flow；持久化 skill-candidate draft artifacts
  - **Turn-envelope v0**（2026-04-07）：基于 turn 的事件链路 telemetry；harness 中的 clarity entropy memo 覆盖
  - **Browser doctor 自动修复**（2026-04-06 至 2026-04-08）：`doctor --fix` 自动修复 CDP 服务；setup/update 生命周期自动修复 browser doctor；文档中添加 CDP 快速命令
  - **多环境强化学习训练系统**：统一的 `rl-core` 控制平面，支持 shell、browser、orchestrator 三种环境适配器；三指针 checkpoint lineage；四车道 replay pool；PPO + teacher distillation 训练
  - **Mixed-environment campaigns**（`rl-mixed-v1`）：一次 live batch 可跨越 shell + browser + orchestrator episode，统一 rollback 决策
  - ContextDB `search` 默认走 SQLite FTS5 + `bm25(...)` 排序；当 FTS 不可用时自动回退 lexical 检索
  - ContextDB 语义重排改为基于当前 query 的 lexical 候选集执行，降低旧但精确命中的误丢失
  - `aios orchestrate` 上线 `subagent-runtime` live 执行（需 `AIOS_EXECUTE_LIVE=1`）
  - 新增有界 work-item 队列调度与 ownership hints 传播
  - 新增 no-op 快路径：上游 `filesTouched=[]` 时自动完成 `reviewer` / `security-reviewer`
  - 新增 Windows PowerShell 冒烟工作流：每次 push `main` 触发（`.github/workflows/windows-shell-smoke.yml`）
  - `skills` 安装支持 `global` / `project` 两种范围选择
  - 仓库内 canonical skill authoring tree 收口到 `skill-sources/`，repo-local client roots 改为 `node scripts/sync-skills.mjs` 生成
  - `skills` 默认安装模式改为可移植的 `copy`，保留显式 `--install-mode link` 作为本地开发选项
  - release 打包与 preflight 会通过 `check-skills-sync` 校验生成目录没有漂移
  - skill 选择器改为 catalog 驱动，区分核心默认项与按需业务项；卸载时只显示已安装技能
  - TUI skill picker 新增 `Core` / `Optional` 分组，并对长描述做终端友好截断
  - `doctor` 会提示同名 skill 的 `project` 安装覆盖 `global` 安装
  - Node 运行时口径统一到 24 LTS
  - **Ink TUI 重构**（v1.1.0）：基于 TypeScript + Ink 的全屏 TUI，采用 React 组件；启动横幅显示 REXCLI ASCII art；自适应 watch 间隔；左右选项循环
- `0.17.0`（2026-03-17）：
  - TUI 卸载选择器在小终端中可滚动，`-Select all` / `Clear all` / `Done` 按钮固定在底部
  - 卸载光标选择现在与渲染后的分组列表保持对齐
  - setup/update skill 选择器对已安装技能标注 `(installed)` 标签
- `0.16.0`（2026-03-10）：新增 orchestrator agent catalog 与生成器
- `0.15.0`（2026-03-10）：`orchestrate live` 默认门禁（`AIOS_EXECUTE_LIVE`）
- `0.14.0`（2026-03-10）：新增 `subagent-runtime` 运行时适配器（stub）
- `0.13.0`（2026-03-10）：运行时 manifest 外置化
- `0.11.0`（2026-03-10）：扩展本地 orchestrate preflight 覆盖范围
- `0.10.4`（2026-03-08）：非 git 工作区 wrapper fallback 与文档同步
- `0.10.3`（2026-03-08）：修复 Windows cmd-backed CLI 启动
- `0.10.0`（2026-03-08）：安装/更新/卸载生命周期统一为 Node
- `0.8.0`（2026-03-05）：新增严格 Privacy Guard（支持 Ollama）并接入安装流程
- `0.5.0`（2026-03-03）：ContextDB SQLite sidecar 索引（`index:rebuild`）、可选 `--semantic` 检索路径、统一 `ctx-agent` 运行核心

## 2026-03-16 运行观测状态

- 连续 live sample 维持成功（`dispatchRun.ok=true`），最新 artifact：
  - `.aios/context-db/sessions/codex-cli-20260303T080437-065e16c0/artifacts/dispatch-run-20260316T111419Z.json`
- `learn-eval` 当前仍给出：
  - `[fix] runbook.failure-triage`（`clarity-needs-input=5`）
  - `[observe] sample.latency-watch`（`avgElapsedMs=160678`）
- 结论：timeout 暂不下调，继续按 latency-watch 观测。

## 相关阅读

- [博客：Skills 安装体验更新](https://cli.rexai.top/blog/zh/2026-03-rexcli-skills-install-experience/)
- [快速开始](getting-started.md)
- [ContextDB](contextdb.md)
- [故障排查](troubleshooting.md)

## 更新规则

凡是涉及安装、运行行为、兼容性的发布，必须在同一 PR 同步更新文档并在本页体现。
