# Project Architecture SRP Refactor

## 目标

- 不再只修 `clients registry`，而是持续治理项目中职责过重、依赖聚合、`if/else` 分支堆叠的热点模块。
- 优先处理影响 AIOS Windows、多客户端、ContextDB/HUD、subagent 运行链路的代码。
- 每个拆分都先补架构约束测试，再做实现，防止入口文件重新膨胀。
- 新增纯函数和结构辅助函数的注释使用中文，方便中文维护者继续演进。

## 本轮已处理范围

### `scripts/lib/model-router.mjs`

- 入口改为薄 facade。
- 拆分到 `scripts/lib/model-router/`：`shared.mjs`、`registry.mjs`、`profile.mjs`、`signals.mjs`、`selection.mjs`、`client-cli.mjs`、`routing.mjs`、`reporting.mjs`、`history.mjs`、`command.mjs`。
- 任务信号评分、模型选择、CLI 参数生成、历史记录、命令行输出分离，避免一个文件承担全部职责。

### `scripts/lib/components/codemap.mjs`

- 入口改为薄 facade。
- 拆分到 `scripts/lib/components/codemap/`：常量、路径、状态存储、CRG、客户端选择、说明注入、MCP 目标、OpenCode 插件、环境、安装、卸载、doctor 和命令模块。
- MCP 配置写入改为按客户端策略分发，覆盖 `codex-cli`、`claude-code`、`gemini-cli`、`opencode-cli`，避免后续只改 Codex 特例。

### `scripts/lib/components/browser.mjs`

- 入口改为 8 行 facade，仅负责导出稳定 API。
- 拆分到 `scripts/lib/components/browser/`：
  - `constants.mjs`
  - `shared.mjs`
  - `runtime-paths.mjs`
  - `mcp-config.mjs`
  - `install.mjs`
  - `cdp-service.mjs`
  - `doctor.mjs`
- MCP 配置迁移、browser-use 安装、CDP launchctl 服务、doctor 检查分别独立管理。
- Windows 路径和命令解析集中到 `runtime-paths.mjs`，doctor 也复用平台化的 shell/python/venv 解析，避免硬编码 `bash` 或 `.venv/bin/python`。

### `scripts/lib/harness/subagent-runtime.mjs`

- 入口收敛为 facade，继续拆出子任务运行时调度职责。
- 拆分到 `scripts/lib/harness/subagent-runtime/` 和 `scripts/lib/harness/subagent-clients/`，覆盖参数构建、上下文包、角色记忆、prompt、handoff、job run、merge gate、dispatch executor、one-shot/invocation/codex exec/spawn result 等模块。
- 新增四客户端 one-shot 策略测试，显式覆盖 `codex-cli`、`claude-code`、`gemini-cli`、`opencode-cli`。

### `scripts/lib/harness/solo-runtime.mjs`

- 入口压缩为 8 行 facade，只导出 solo runtime 的稳定 API。
- 拆分到 `scripts/lib/harness/solo-runtime/`：`constants.mjs`、`normalizers.mjs`、`backoff.mjs`、`hooks.mjs`、`checkpoint.mjs`、`state.mjs`、`loop.mjs`。
- outcome 规范化、失败分类、退避计算、生命周期 hook、checkpoint 写入、状态持久化、主循环执行分离，避免 solo runtime 再次堆成单文件状态机。

### `scripts/lib/hud/state.mjs`

- 入口改为薄 facade。
- 拆分到 `scripts/lib/hud/state/`：provider、质量门禁、dispatch insight/progress、IO、session、artifact、command、compose 等模块。
- 同步加固 Windows JSON 缓存：文件签名优先使用 `mtimeNs/ctimeNs`，非 `meta.json` 的同签名缓存只允许复用一次，避免 HUD 读到旧 `state.json`。

### `scripts/lib/lifecycle/team-ops.mjs`

- 入口收敛为 8 行 facade。
- 拆分状态选项、状态 artifact、状态渲染、历史格式化、历史摘要、历史命令和 skill candidates。

### `scripts/lib/lifecycle/orchestrate.mjs`

- 入口压到 320 行预算内。
- 拆分 plan、overlay、preflight、release guard、retry replay、runtime capability guard、post-dispatch report 等职责。

### `scripts/lib/lifecycle/harness.mjs`

- 入口压缩为 2 行 facade，只导出 `buildIterationPrompt` 和 `runHarnessCommand`。
- 拆分到 `scripts/lib/lifecycle/harness/`：`shared.mjs`、`session.mjs`、`dry-run.mjs`、`status.mjs`、`prompt.mjs`、`execute-turn.mjs`、`worktree.mjs`、`hooks.mjs`、`commands.mjs`。
- harness session 初始化、dry-run 检查、状态渲染、iteration prompt、provider 执行、worktree 恢复、生命周期 hook、命令分发分别独立维护。

### `scripts/lib/harness/orchestrator.mjs`

- 入口压缩为 facade，只对外导出稳定 API。
- 拆分 blueprint、normalizer、work item、计划、local job、handoff、local execution、dispatch policy、report wrapper、report、executor capabilities。

### `scripts/lib/rl-mixed-v1/run-orchestrator.mjs`

- 入口压缩为 facade，只导出 mixed campaign/evaluation/epoch/reward API。
- 拆分 shared、reward、control、shell adapter、trajectory、epoch、campaign、policy、evaluation 等模块。

### `scripts/contextdb-shell-bridge.mjs`

- 入口压缩为 6 行 facade，只负责加载 `scripts/lib/contextdb/shell-bridge/main.mjs` 并处理 fatal 日志。
- 拆分 CLI 参数、Codex Home 规范化、隐私横幅、workspace/runner 探测、交互提示、多客户端 provider/client 映射、进程启动、ContextDB index 写入和 debug 输出。
- 多客户端路由复用 `scripts/lib/clients/registry.mjs`。

### `scripts/lib/memo/memo.mjs`

- 入口压缩为 7 行 facade，只导出 `buildMemoGuiLaunchPlan`、`runMemoGuiServer`、`runMemo`。
- 拆分 GUI、workspace state、records、legacy、storage API、rendering、capacity、flags、persona/pin/events/storage/space 命令。

### `scripts/lib/memo/storage.mjs`

- 入口压缩为 35 行 facade，只导出 memo storage 稳定 API。
- 拆分配置、路径、文件 IO、normalizer、事件读写、查询、pinned memo、派生索引、legacy migration、status 和 doctor。

## 新增架构约束

- `scripts/lib/architecture/governance.mjs` 集中维护 facade 行数预算和必需子模块清单。
- `DEFAULT_ARCHITECTURE_RULES` 覆盖 model-router、codemap、browser、subagent-runtime、solo-runtime、HUD state、orchestrator、learn-eval、lifecycle orchestrate、lifecycle harness、team-ops、rl-mixed、contextdb shell bridge、memo CLI 和 memo storage。
- `node scripts/aios.mjs quality-gate full|pre-pr` 将 Architecture 作为一等质量门禁，可通过 `quality:architecture` 开关控制。
- `scripts/tests/platform-smoke.test.mjs` 改为检查 browser 子模块，而不是把所有平台逻辑继续压在 `browser.mjs` 里。

## 后续候选热点

- `scripts/ctx-agent-core.mjs` 和 `mcp-server/src/contextdb/core.ts` 仍然很大，但风险更高；建议下一轮按 CLI 入口、状态存储、渲染输出、运行时适配继续拆。
- `mcp-server/src/contextdb/sqlite.ts`、`mcp-server/src/browser/actions/snapshot.ts`、`scripts/lib/lifecycle/harness.mjs`、`scripts/lib/harness/solo-runtime.mjs` 仍需后续治理。

## 验证策略

- 每个热点先加失败的架构测试，再拆分实现。
- 每轮拆分后先跑聚焦测试，再跑 `npm run test:scripts`。
- 提交前检查 `.aios/`、cache、tmp、`dist/`、`node_modules/`、`mcp-server/.npm-cache` 等文件没有进入提交范围。
