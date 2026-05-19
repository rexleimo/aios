---
title: 更新日志
description: 版本历史、升级说明与文档变更入口。
---

# 更新日志

本页用于追踪 `RexCLI` 的版本变化，并快速跳转到相关文档。

## 官方发布记录

- GitHub 变更文件：[CHANGELOG.md](https://github.com/rexleimo/rex-cli/blob/main/CHANGELOG.md)
- GitHub Releases：[releases](https://github.com/rexleimo/rex-cli/releases)

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
  - 新增包装式 `codex`、`claude`、`gemini`、`opencode` 会话的自触发 harness 路由。
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
	  - **Agent 自触发 harness 路由**（2026-05-05）：包装后的 `codex` / `claude` / `gemini` / `opencode` 会话现在会提示 `single/subagent/team/harness`；长任务、过夜任务、可恢复目标可自触发 `aios harness run ... --workspace <project-root>`，支持 `--max-iterations`，并可用 `CTXDB_HARNESS_PROVIDER`、`CTXDB_HARNESS_MAX_ITERATIONS` 控制
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
