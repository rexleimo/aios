# AIOS `work` 统一并发调度入口实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: TDD 分批实现，每批先写失败测试再实现；步骤使用 checkbox（`- [ ]`）语法跟踪。

**Goal:** 新增系统级统一入口 `aios work --task "..."`，让日常"给个任务就干活"的路径默认走**智能规划 + 多 Agent 并发调度**，替代当前"单主 Agent 串行等待"的体验。复用并默认开启已有 `orchestrate` + `subagent-runtime` 调度引擎，不重写引擎。

**Architecture:** `work` 是 `orchestrate` 的语义化薄包装：任务 → 自动分解（已有 `buildDecomposedWorkItems` + planner 阶段）→ DAG 并发调度（`runDispatchJobs`，默认 concurrency=3，merge-gate 收口）→ 汇总报告。与 `team` 一样复用 `runOrchestrate`，差异只在默认值：**`work` 默认 live 并发，dry-run 需显式**。

**Tech Stack:** Node.js 24 ESM CLI、`node --test`、现有 `scripts/lib/lifecycle/orchestrate.mjs`、`scripts/lib/harness/subagent-runtime/*`、`scripts/lib/cli/dispatch/runtime.mjs`。

---

## Source Analysis（现状证据）

引擎已存在且完整，问题在"默认关闭 + 不在日常路径"：

- `scripts/lib/lifecycle/orchestrate.mjs`：完整编排管线（DAG 规划 → preflight → dispatch policy → 本地 dispatch → 并发执行 → 后置报告 + 变更观测 + retry-blocked replay）。
- `scripts/lib/harness/orchestrator/plan.mjs`：`buildOrchestrationPlan` 用 blueprint phases + `buildDecomposedWorkItems`（任务/上下文自动拆 work items，最多 4 个，类型 + 路径归属推断）。
- `scripts/lib/harness/subagent-runtime/dispatch-executor.mjs`：`runDispatchJobs` 有界并发（`concurrency` 默认 3）、依赖解析、merge-gate、blocked 传播、pre-mutation snapshot。
- `scripts/lib/harness/subagent-runtime/phase-job.mjs`：真实子 agent 执行（codex/claude/gemini/opencode one-shot），结构化 handoff 校验、file-policy 所有权检查、成本遥测、plan sync、死亡通知。
- `scripts/lib/cli/dispatch/runtime.mjs` `buildTeamRuntimeEnv`：CLI 参数 → 子 agent 环境变量（`AIOS_SUBAGENT_CLIENT` / `AIOS_SUBAGENT_CONCURRENCY` / `AIOS_EXECUTE_LIVE` / `AIOS_MODEL_ROUTER`）。
- `scripts/lib/harness/orchestrator-runtimes/registry.mjs`：live 默认 gate（`AIOS_EXECUTE_LIVE=1` 才放行）——这是单 Agent 体验的根因之一。
- `scripts/lib/cli/dispatch.mjs`：`team` 命令已示范"翻译团队语义 → runOrchestrate + runtimeEnv"的接入模式；`work` 沿用同一模式。

## 非目标

- 不重写 `orchestrate` / `subagent-runtime` / DAG 引擎。
- 不改 rex workflow 单 current Command 语义；`work` 是并行调度执行入口，与 rex 逐阶段 Provider 选择并存。
- 不引入新客户端、新 ContextDB schema、新队列存储（`.aios/tasks/` 现状不动）。
- 不做 Agent 层自动触发（本次是 CLI 系统级入口；Agent 层自动调用留待后续）。
- 不做跨 repo worktree 隔离（`harness` 命令已覆盖该场景）。

## PR Boundaries

| PR | Slice | Primary command | Why this slice stands alone |
|---|---|---|---|
| PR-1 | CLI 表面 + 选项归一化 + dry-run 接线 | `aios work --task "..." --dry-run --json` | 先把入口、默认值契约、零成本预览建起来，验证 runOrchestrate 复用正确。 |
| PR-2 | 默认 live + runtime env + 安全门 | `aios work --task "..."`（默认并发执行） | 让 work 默认真正并发调度，保留 readiness/ownership/merge-gate 保护。 |
| PR-3 | 文档 + skill 同步 + 验证门 | `npm run test:scripts` + 模拟 live smoke | 收口运营面：README/help、技能文档同步、回归验证。 |

## 命令契约

```bash
# 默认：live 并发调度（AIOS_EXECUTE_LIVE=1，concurrency=3，merge-gate 收口）
node scripts/aios.mjs work --task "Ship the release checklist"

# 零成本预览（不唤起模型客户端）
node scripts/aios.mjs work --task "Ship the release checklist" --dry-run --json

# 多 work item 分解提示（分号/换行分隔 → 自动拆任务）
node scripts/aios.mjs work --task "..." --context "mcp-server 重构; docs 更新; 测试补充"

# 指定客户端与并发度
node scripts/aios.mjs work --task "..." --client codex-cli --concurrency 4

# 强制串行（并发度=1，耦合任务安全路径）
node scripts/aios.mjs work --task "..." --serial

# 关联 ContextDB session 续跑 / 重放 blocked
node scripts/aios.mjs work --task "..." --session <id>
node scripts/aios.mjs work --task "..." --resume <id> --retry-blocked
```

**选项（`normalizeWorkOptions` 契约）：**

```js
{
  taskTitle: string,          // 必填（--resume 场景可由 session goal 兜底，与 orchestrate 一致）
  contextSummary: string,     // 分解提示，默认 ''
  clientId: string,           // 默认 env AIOS_SUBAGENT_CLIENT || 'codex-cli'
  concurrency: number,        // 默认 3；--serial 强制 1
  serial: boolean,            // --serial → AIOS_SUBAGENT_CONCURRENCY=1
  dryRun: boolean,            // --dry-run → executionMode='dry-run'，不设 AIOS_EXECUTE_LIVE
  blueprint: string,          // 默认 'feature'
  sessionId: string,          // ContextDB session
  resumeSessionId: string,    // --resume
  retryBlocked: boolean,
  force: boolean,             // 覆盖 readiness blocked
  preflightMode: 'auto'|'none'|'explicit',  // 默认：有 --session 时 'auto'，否则 'none'
  format: 'text'|'json',      // --json 等价 format=json
}
```

**默认值决策（与 team/orchestrate 的关键差异）：**

- `executionMode`：`work` 默认 `live`；`--dry-run` 显式降级为 `dry-run`。
- runtime env：`AIOS_EXECUTE_LIVE=1`（除非 dry-run）、`AIOS_MODEL_ROUTER=1`、`AIOS_SUBAGENT_CLIENT`、`AIOS_SUBAGENT_CONCURRENCY`。
- 安全门全部保留：preflight readiness（blocked 时 live 拒绝执行，`--force` 才放行）、capability guard（首次 live 若 executor capability manifest 有 unknown network/browser/sideEffect 面则拒绝，需先 dry-run 建立证据或 `--force`/`AIOS_ALLOW_UNKNOWN_CAPABILITIES=1` 覆盖——与 team live 相同行为）、ownedPathPrefixes/file-policy、merge-gate。

> 验证记录：`AIOS_SUBAGENT_SIMULATE=1 aios work --task "..." --force` 已实测通过——`mode: live`、`ok: true`、5 个 jobRuns（plan/implement 串行、review/security 并行、merge-gate 收口）、finalOutputs 完整。首次 live 无 `--force` 时被 capability guard 正确阻断（`guardrail.capability-unknown`，exitCode 1），与既有 team live 语义一致。

## File Structure Map

### New files

- `scripts/lib/lifecycle/work.mjs`
  `runWorkCommand(options, { rootDir, io, orchestrateRunner = runOrchestrate })`：归一化选项 → 构建 runtime env → 调用 `orchestrateRunner`；依赖注入便于测试。
- `scripts/lib/lifecycle/work/options.mjs`
  纯函数 `normalizeWorkOptions(raw)`、`buildWorkRuntimeEnv(options, baseEnv)`。
- `scripts/lib/cli/parse-args/work.mjs`
  `parseWorkArgs(argv)`（--task/--context/--client/--concurrency/--serial/--dry-run/--blueprint/--session/--resume/--retry-blocked/--force/--preflight/--format/--json）。
- `scripts/lib/cli/commander/specs/work.mjs`
  `WORK_COMMAND_SPECS`（对齐 workflow.mjs 的 spec 格式）。
- `scripts/tests/aios-work.test.mjs`
  选项契约 / env 契约 / CLI parse / dry-run 集成 / 守卫测试。

### Modified files

- `scripts/lib/cli/parse-args.mjs`：注册 `parseWorkArgs`。
- `scripts/lib/cli/commander/specs/*`（按现有 specs 聚合方式）：注册 `WORK_COMMAND_SPECS`。
- `scripts/lib/cli/dispatch.mjs`：新增 `work` 路由（复用 `team` 的 runOrchestrate 模式）。
- `scripts/lib/cli/dispatch/runtime.mjs`：`WORKSPACE_SCOPED_COMMANDS` 增加 `work`。
- `scripts/lib/cli/help.mjs`：根帮助与 `work` 帮助文本。
- `package.json`：`test:scripts` 显式加入 `scripts/tests/aios-work.test.mjs`（若 run-test-suite 是显式清单；是 glob 则只补清单注释）。
- `README.md`：中文 CLI 示例。
- 技能文档同步（若 `.codex/skills/*` / `.claude/skills/*` 有命令表）：按 AGENTS.md 规则对齐。

## PR-1: CLI 表面 + 选项归一化 + dry-run 接线

**Goal:** `aios work` 可发现、可解析、可零成本预览；复用 runOrchestrate 的 dry-run 输出验证接线正确。

**Files:** 上述 New 全部 + parse-args/dispatch/help/package.json/README 修改。

**Tasks:**

- [ ] **Step 1: 写选项与环境契约失败测试**

  新建 `scripts/tests/aios-work.test.mjs`，至少覆盖：

  ```js
  const opts = normalizeWorkOptions({ taskTitle: 'Ship X' });
  assert.equal(opts.executionMode, 'live');          // work 默认 live
  assert.equal(opts.clientId, 'codex-cli');          // 默认客户端
  assert.equal(opts.concurrency, 3);
  assert.equal(opts.dispatchMode, 'local');

  const dry = normalizeWorkOptions({ taskTitle: 'Ship X', dryRun: true });
  assert.equal(dry.executionMode, 'dry-run');

  const serial = normalizeWorkOptions({ taskTitle: 'Ship X', serial: true });
  assert.equal(serial.concurrency, 1);

  assert.throws(() => normalizeWorkOptions({}), /task/i);  // 缺任务拒绝

  const env = buildWorkRuntimeEnv(opts, {});
  assert.equal(env.AIOS_EXECUTE_LIVE, '1');          // 默认 live 放行
  assert.equal(env.AIOS_MODEL_ROUTER, '1');
  assert.equal(env.AIOS_SUBAGENT_CONCURRENCY, '3');

  const dryEnv = buildWorkRuntimeEnv(dry, {});
  assert.equal(dryEnv.AIOS_EXECUTE_LIVE, undefined); // dry-run 不放行
  ```

- [ ] **Step 2: 运行失败测试确认当前无 work 命令**

  ```bash
  node --test scripts/tests/aios-work.test.mjs
  ```
  预期：导入 `work/options.mjs` 失败；`parseArgs(['work', ...])` 报 Unknown command。

- [ ] **Step 3: 实现选项归一化与 env 构建**

  - `scripts/lib/lifecycle/work/options.mjs`：按上方契约实现 `normalizeWorkOptions` / `buildWorkRuntimeEnv`。
  - 校验规则：`--serial` 与 `--concurrency > 1` 冲突时 `--serial` 优先（并发度=1）；`--resume` 且无 `--task` 时 taskTitle 允许空（session goal 兜底，沿用 orchestrate 语义）；`--dry-run` 与 `--retry-blocked` 组合允许（dry-run 重放预览）。

- [ ] **Step 4: CLI 解析 + 帮助 + 路由**

  - `parse-args/work.mjs` 注册选项；`parse-args.mjs` 接入 `parseWorkArgs`。
  - `commander/specs/work.mjs` 注册 spec（按仓库现有 specs 聚合方式，参考 workflow.mjs）。
  - `dispatch/runtime.mjs` 的 `WORKSPACE_SCOPED_COMMANDS` 增加 `work`。
  - `dispatch.mjs` 增加 `work` 路由：`runWorkCommand(parsed.options, { rootDir: workspaceFor(parsed) })`。
  - `help.mjs` 增加示例（上方命令契约里的 dry-run/serial/session 示例）。

- [ ] **Step 5: 实现 `runWorkCommand` dry-run 接线**

  ```js
  export async function runWorkCommand(options = {}, { rootDir, io = console, orchestrateRunner = runOrchestrate } = {}) {
    const opts = normalizeWorkOptions(options);
    const runtimeEnv = buildWorkRuntimeEnv(opts, process.env);
    return orchestrateRunner({
      blueprint: opts.blueprint,
      taskTitle: opts.taskTitle,
      contextSummary: opts.contextSummary,
      sessionId: opts.sessionId,
      resumeSessionId: opts.resumeSessionId,
      retryBlocked: opts.retryBlocked,
      force: opts.force,
      limit: opts.limit,
      dispatchMode: opts.dispatchMode,
      executionMode: opts.executionMode,
      preflightMode: opts.preflightMode,
      format: opts.format,
    }, { rootDir, env: runtimeEnv, io });
  }
  ```

  禁止在 work 层重写任何编排逻辑；只做语义翻译 + env。

- [ ] **Step 6: 验证 PR-1**

  ```bash
  node --test scripts/tests/aios-work.test.mjs
  node scripts/aios.mjs work --task "Ship the release checklist" --dry-run --json
  node scripts/aios.mjs work --task "mcp-server 重构" --serial --dry-run --json
  ```

  预期：新测试通过；dry-run 输出 `kind: aios.orchestration-run.v1` / 或 orchestrate 报告结构，零模型调用；`work --help` 可见。

## PR-2: 默认 live + 安全门 + 模拟验证

**Goal:** `aios work --task "..."` 默认真实并发调度；守卫在 blocked 时拒绝执行；提供模拟路径供 CI 验证。

**Files:** Modify `scripts/lib/lifecycle/work.mjs`、`scripts/tests/aios-work.test.mjs`。

**Tasks:**

- [ ] **Step 1: 写守卫与 live 接线失败测试**

  ```js
  // live + readiness blocked → 拒绝执行（mock orchestrateRunner 断言未调用）
  const blocked = { verdict: 'blocked', blockedReasons: ['quality gate'] };
  const result = await runWorkCommand(
    { taskTitle: 'Ship X', preflightMode: 'auto', sessionId: 's1' },
    { rootDir, orchestrateRunner: async () => { called = true; return { exitCode: 0 }; } }
  );
  // 守卫逻辑在 runOrchestrate 内部（readiness blocked + live + !force → guardrail 返回）
  // work 层断言：live 时 env 放行、dry-run 时不放行、--force 透传
  ```

  守卫断言策略：readiness 拒绝是 `runOrchestrate` 既有行为（`guardrail.preflight-readiness`），work 层不复制；work 测试用 `orchestrateRunner` 注入断言**入参正确透传**（executionMode/dry-run/force/env），并断言默认 live 路径真的放行（env.AIOS_EXECUTE_LIVE=1）。

- [ ] **Step 2: 运行失败测试确认 live 默认未接线**

  预期：`normalizeWorkOptions` 默认 executionMode 不是 live（若 PR-1 未实现）或 env 未放行。

- [ ] **Step 3: 实现默认 live 语义（若 PR-1 已含则复核）**

  - `normalizeWorkOptions` 默认 `executionMode='live'`、`dispatchMode='local'`。
  - `buildWorkRuntimeEnv` 默认 `AIOS_EXECUTE_LIVE=1`、`AIOS_MODEL_ROUTER=1`、`AIOS_SUBAGENT_CONCURRENCY=<n>`、`AIOS_SUBAGENT_CLIENT=<client>`。
  - 确认 `runOrchestrate` 的 live 守卫链路：preflight readiness blocked + live + !force → `guardrail.preflight-readiness`（exitCode 1）——work 不绕过。

- [ ] **Step 4: 模拟 live smoke（CI 安全验证）**

  ```bash
  AIOS_SUBAGENT_SIMULATE=1 node scripts/aios.mjs work --task "Ship the release checklist" --session codex-cli-demo --json
  ```

  （`AIOS_EXECUTE_LIVE=1` 由 work 默认注入；`AIOS_SUBAGENT_SIMULATE=1` 让 job 走 simulation，不真实唤起客户端。）
  预期：报告含 `dispatchRun.jobRuns`，多 job 并发路径可观测，merge-gate 收口。

- [ ] **Step 5: 验证 PR-2**

  ```bash
  node --test scripts/tests/aios-work.test.mjs
  node scripts/aios.mjs work --task "Ship the release checklist" --dry-run --json   # 仍零成本
  AIOS_SUBAGENT_SIMULATE=1 node scripts/aios.mjs work --task "Ship the release checklist" --json
  ```

## PR-3: 文档 + skill 同步 + 回归验证

**Goal:** work 成为可运营命令面；help/README/技能文档对齐；回归全绿。

**Files:** Modify `README.md`、`scripts/lib/cli/help.mjs`（复核）、技能文档（按需）、`package.json`（复核）。

**Tasks:**

- [ ] **Step 1: README 中文示例**

  ```markdown
  # 多 Agent 并发干活（默认并发调度）
  node scripts/aios.mjs work --task "Ship the release checklist"
  node scripts/aios.mjs work --task "重构 mcp-server 并补测试" --client codex-cli --concurrency 4
  node scripts/aios.mjs work --task "..." --serial          # 耦合任务强制串行
  node scripts/aios.mjs work --task "..." --dry-run --json  # 零成本预览
  ```

- [ ] **Step 2: 技能文档同步**

  按 AGENTS.md 规则检查 `.codex/skills/*`、`.claude/skills/*` 是否有 CLI 命令表/调度说明（如 `aios-workflow-router`、`aios-long-running-harness`），有则补 `aios work` 入口说明；无则跳过并记录。

- [ ] **Step 3: 回归验证**

  ```bash
  npm run test:scripts
  ```

- [ ] **Step 4: 版本与变更记录评估**

  按 versioning-by-impact 评估 scripts 包是否需 VERSION/CHANGELOG 更新；若需要则在同批提交。

## Final Verification Gate

- [ ] `node --test scripts/tests/aios-work.test.mjs`
- [ ] `node scripts/aios.mjs work --task "Ship the release checklist" --dry-run --json`
- [ ] `AIOS_SUBAGENT_SIMULATE=1 node scripts/aios.mjs work --task "Ship the release checklist" --json`（模拟 live，jobRuns 可见）
- [ ] `node scripts/aios.mjs work --help`
- [ ] `npm run test:scripts`

## Self-Review Notes

- `work` 只做语义翻译（选项 → env → runOrchestrate），所有调度/守卫/证据逻辑复用既有引擎，避免平行实现。
- 默认 live 是**产品语义决策**：work 的承诺就是"干活即并发"；安全兜底不降级（readiness/ownership/merge-gate/capability guard 全保留，`--force` 才可绕过 readiness）。
- 与 `team` 的关系：`team` 是团队观测/历史视角，`work` 是干活入口；`work status` 不新增，观测走 `aios team status` / `hud`。
- 与 rex workflow 的关系：`work` 不创建/推进 rex activation；并行调度与 rex 单 Command 串行语义正交，AGENTS.md 的 rex Command 权威性不受影响。
- 不修改 `.aios/tasks/` 队列现状；work item 分解沿用 `buildDecomposedWorkItems`（确定性拆分，最大 4 项）。
