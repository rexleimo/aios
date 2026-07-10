# Headroom + Ponytail Token Intelligence Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 RTK、Caveman 与按需 ContextDB 工作流上加入官方 Headroom 混合接入和 AIOS Ponytail Gate，让受支持客户端获得可恢复、可验证的 token 优化，同时减少不必要的代码、依赖、抽象和文件。

**Architecture:** `aios init` 作为唯一安装与 MCP 注册边界，安装固定版本范围的 Headroom，并通过客户端官方 CLI 为 Gemini、Hermes、Grok 注册 `headroom mcp serve`。运行时只生成官方 `headroom wrap` launch plan，不复制 Headroom proxy/provider/MCP 数据面；Ponytail 作为 canonical skill 接入既有规划、编辑前和验证流程。

**Tech Stack:** Node.js ESM、`node:test`、`@modelcontextprotocol/sdk`、`yaml@2.9.0`、官方 `headroom-ai[all]>=0.31.0,<0.32.0`、现有 AIOS client registry / process helpers / atomic write / skill sync / MkDocs。

## Global Constraints

- 设计权威来源：`docs/superpowers/specs/2026-07-10-token-intelligence-stack-design.md`；实现若与规格冲突，以规格为准并先修订规格。
- `aios init` 是唯一自动安装边界；客户端、shell、team 或 harness 启动不得安装、升级或降级软件。
- Headroom Python 包必须为 `headroom-ai[all]>=0.31.0,<0.32.0`，Python 必须 `>=3.10`；自动安装只允许 `uv tool`，回退只允许 `pipx`，禁止写系统 Python。
- 安装 smoke 固定为 `headroom --version`、`headroom --help`、`headroom wrap --help`、`headroom mcp serve --help`；proxy-down 时 `headroom doctor --json` 的退出码 2 不是安装失败。
- `--yes-compression-tools` 只授权 RTK、Caveman、Headroom 安装；`--yes-headroom-mcp` 单独授权无人值守的 Gemini/Grok user-scope 配置修改。
- Codex、Claude、OpenCode 只走官方 `headroom wrap`；Gemini、Hermes、Grok 只通过各自官方 `mcp add/remove` 管理 `headroom mcp serve`。
- AIOS 不实现 Headroom proxy、provider、MCP server、端口/PID supervisor 或压缩算法，也不恢复 `scripts/aios-intercept.mjs` / `scripts/aios-mcp-proxy.mjs`。
- AIOS-managed MCP 环境必须包含 `HEADROOM_MCP_CLIENT=<runtime-id>` 与 `HEADROOM_MCP_READ=off`，不得传 `--debug`、自动批准或信任开关。
- Gemini/Grok 同名条目必须在调用 blind-upsert 前静态检查；Hermes add/remove 必须真实 PTY，不能 pipe `yes`，不能直接写 YAML，不能以退出码 0 作为成功证据。
- ledger 固定为 `~/.aios/integrations/headroom-mcp.json`；只有 AIOS-owned 且当前条目指纹完全匹配的项目可以回滚或自动删除。
- wrapper 固定 flags：Codex/Claude 使用 `--no-context-tool --no-tokensave --no-serena`；OpenCode 使用 `--no-context-tool --no-serena`；不得传 `--no-mcp`、`--memory`、`--learn` 或 `--code-graph`。
- `AIOS_HEADROOM=auto|on|off` 只控制 wrap；`AIOS_HEADROOM_MCP=auto|on|off` 只控制 init 注册。任何 durable provider 状态不确定或存在时都 fail closed，并给出同配置上下文的官方 unwrap 命令。
- Codex one-shot 只有 stdin smoke 后可 wrap；Claude/OpenCode argv prompt 在 `auto` 下绕过、`on` 下报隐私错误；`concurrency > 1` 在并发 smoke 前遵循同样门禁。
- 只有 `headroom_stats` 同时满足 `compressions > 0` 与 `total_tokens_saved > 0` 才能声明 MCP 产生实测节省；MCP-local 节省不得冒充透明模型输入节省。
- RTK 继续压缩 shell/tool 输出，Caveman 继续压缩表达，ContextDB 继续按需召回；任何一层不得替代 TDD、CRG、安全和验证证据。
- canonical skills 只编辑 `skill-sources/`；`.codex/skills`、`.claude/skills`、`.gemini/skills`、`.opencode/skills`、`.hermes/skills`、`.grok/skills`、`.agents/skills` 由同步命令生成。
- 当前工作区有用户改动。每次提交只暂存任务列出的精确路径，禁止使用 `git add -A`。

## File Structure

### Headroom install and MCP control plane

- `scripts/lib/aios-init/headroom-installer.mjs`：版本探测、隔离安装计划与四项 CLI smoke。
- `scripts/lib/aios-init/headroom-mcp/commands.mjs`：三个客户端的 argv-safe add/remove 命令和规范化 desired entry。
- `scripts/lib/aios-init/headroom-mcp/config-readers.mjs`：JSON、YAML、TOML 的 user/project/profile 只读解析与 shadow 检查。
- `scripts/lib/aios-init/headroom-mcp/ownership.mjs`：entry 指纹、ledger 读写及 absent/owned/external/conflict 分类。
- `scripts/lib/aios-init/headroom-mcp/lifecycle.mjs`：授权、幂等注册、Hermes PTY、配置重读和安全回滚。
- `scripts/lib/aios-init/headroom-mcp/smoke.mjs`：官方 MCP initialize/list/compress/retrieve/stats 验证。
- `scripts/lib/aios-init/headroom-mcp/index.mjs`：对 `aios init` 暴露单一聚合接口。

### Headroom runtime control plane

- `scripts/lib/headroom/runtime/durable-state.mjs`：只读检查 Claude/Codex/OpenCode 官方 marker、backup 与恢复上下文。
- `scripts/lib/headroom/runtime/launch-plan.mjs`：纯 launch-plan 选择、PATH 去 shim、防递归、隐私和并发门禁。
- `scripts/lib/ctx-agent-core/{common,interactive,one-shot}.mjs`：在每次真实 spawn 前应用 launch plan。
- `scripts/lib/harness/subagent-clients/{invocation-runner,codex-exec}.mjs` 与 `scripts/lib/harness/subagent-runtime/one-shot-runner.mjs`：team/harness/retry/fallback 的逐 spawn 规划。

### Workflow, evidence, docs, release

- `skill-sources/aios-ponytail-gate/{SKILL.md,UPSTREAM.md}`：七级最小正确实现门禁与 Ponytail MIT 来源。
- `skill-sources/{aios-workflow-router,pre-edit-safety-gate,search-first,verification-loop,aios-interception-runtime}/SKILL.md`：工作流路由和五层职责同步。
- `scripts/headroom-live-smoke.mjs`：隔离 HOME/config 下的 wrapper、MCP 和恢复 smoke；Hermes 强制人工 PTY。
- `docs/reports/2026-07-10-headroom-live-smoke.md`：逐客户端实测结果、失败证据和未放开能力。
- `README.md`、`README-zh.md`、`docs-site/**/token-compression.md`：用户安装、运行、恢复和指标语义。
- `blog-site/2026-07-headroom-ponytail-token-intelligence.md` 与中文对应文章：设计说明和安全边界。
- `CHANGELOG.md`、`docs-site/**/changelog.md`、`VERSION`：`v3.6.0` 发布记录。

---

### Task 1: Build the isolated Headroom installer

**Files:**
- Create: `scripts/lib/aios-init/headroom-installer.mjs`
- Create: `scripts/tests/headroom-install.test.mjs`

**Interfaces:**
- Consumes: `captureCommand(command, args, options)` and `runCommand(command, args, options)` from `scripts/lib/platform/process.mjs`.
- Produces: `HEADROOM_PACKAGE_SPEC`, `parseHeadroomVersion(text)`, `isSupportedHeadroomVersion(version)`, `probeHeadroom(options)`, `buildHeadroomInstallPlan(probe)`, `ensureHeadroomInstalled(options)`.

- [ ] **Step 1: Write failing unit tests for version bounds, installer selection and smoke commands**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HEADROOM_PACKAGE_SPEC,
  buildHeadroomInstallPlan,
  ensureHeadroomInstalled,
  isSupportedHeadroomVersion,
} from '../lib/aios-init/headroom-installer.mjs';

test('Headroom version and installer policy is fixed to 0.31.x in an isolated tool env', () => {
  assert.equal(HEADROOM_PACKAGE_SPEC, 'headroom-ai[all]>=0.31.0,<0.32.0');
  assert.equal(isSupportedHeadroomVersion('0.31.0'), true);
  assert.equal(isSupportedHeadroomVersion('0.31.9'), true);
  assert.equal(isSupportedHeadroomVersion('0.30.9'), false);
  assert.equal(isSupportedHeadroomVersion('0.32.0'), false);
  assert.deepEqual(buildHeadroomInstallPlan({ pythonVersion: '3.12.2', uvAvailable: true, pipxAvailable: true }), {
    status: 'missing', command: 'uv', args: ['tool', 'install', HEADROOM_PACKAGE_SPEC],
  });
  assert.deepEqual(buildHeadroomInstallPlan({ pythonVersion: '3.10.0', uvAvailable: false, pipxAvailable: true }), {
    status: 'missing', command: 'pipx', args: ['install', HEADROOM_PACKAGE_SPEC],
  });
  assert.equal(buildHeadroomInstallPlan({ pythonVersion: '3.9.18', uvAvailable: true, pipxAvailable: true }).status, 'unsupported-platform');
  assert.equal(buildHeadroomInstallPlan({ pythonVersion: '3.12.2', uvAvailable: false, pipxAvailable: false }).status, 'unsupported-platform');
});

test('ensureHeadroomInstalled verifies four CLI surfaces and dry-run never spawns an installer', async () => {
  const calls = [];
  const result = await ensureHeadroomInstalled({
    dryRun: false,
    probe: { status: 'missing', pythonVersion: '3.12.2', uvAvailable: true, pipxAvailable: false },
    runImpl: async (command, args) => { calls.push([command, args]); return { status: 0 }; },
    captureImpl: (command, args) => ({ status: 0, stdout: args[0] === '--version' ? 'headroom 0.31.0' : '', stderr: '' }),
  });
  assert.equal(result.status, 'installed');
  assert.deepEqual(calls[0], ['uv', ['tool', 'install', HEADROOM_PACKAGE_SPEC]]);
  assert.deepEqual(result.smoke.map((item) => item.args), [
    ['--version'], ['--help'], ['wrap', '--help'], ['mcp', 'serve', '--help'],
  ]);

  const dryCalls = [];
  const dry = await ensureHeadroomInstalled({
    dryRun: true,
    probe: { status: 'missing', pythonVersion: '3.12.2', uvAvailable: true, pipxAvailable: false },
    runImpl: async (...args) => { dryCalls.push(args); return { status: 0 }; },
  });
  assert.equal(dry.status, 'missing');
  assert.equal(dry.planned, true);
  assert.deepEqual(dryCalls, []);
});
```

- [ ] **Step 2: Run the focused test and confirm the module is missing**

Run: `node --test scripts/tests/headroom-install.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `headroom-installer.mjs`.

- [ ] **Step 3: Implement the pure version/install policy and four-command smoke**

```js
import { captureCommand, runCommand } from '../platform/process.mjs';

export const HEADROOM_PACKAGE_SPEC = 'headroom-ai[all]>=0.31.0,<0.32.0';
const SMOKE_ARGS = Object.freeze([
  Object.freeze(['--version']),
  Object.freeze(['--help']),
  Object.freeze(['wrap', '--help']),
  Object.freeze(['mcp', 'serve', '--help']),
]);

export function parseHeadroomVersion(text = '') {
  return /(?:^|\s)(\d+)\.(\d+)\.(\d+)(?:\s|$)/u.exec(String(text))?.slice(1, 4).map(Number) || null;
}

export function isSupportedHeadroomVersion(text = '') {
  const version = Array.isArray(text) ? text : parseHeadroomVersion(text);
  return Boolean(version && version[0] === 0 && version[1] === 31 && version[2] >= 0);
}

function pythonSupported(text = '') {
  const version = parseHeadroomVersion(text);
  return Boolean(version && (version[0] > 3 || (version[0] === 3 && version[1] >= 10)));
}

export function buildHeadroomInstallPlan(probe = {}) {
  if (probe.installedVersion && !isSupportedHeadroomVersion(probe.installedVersion)) {
    return { status: 'unsupported-version', installedVersion: probe.installedVersion };
  }
  if (probe.installedVersion) return { status: 'installed', installedVersion: probe.installedVersion };
  if (!pythonSupported(probe.pythonVersion)) return { status: 'unsupported-platform', reason: 'python>=3.10-required' };
  if (probe.uvAvailable) return { status: 'missing', command: 'uv', args: ['tool', 'install', HEADROOM_PACKAGE_SPEC] };
  if (probe.pipxAvailable) return { status: 'missing', command: 'pipx', args: ['install', HEADROOM_PACKAGE_SPEC] };
  return { status: 'unsupported-platform', reason: 'uv-or-pipx-required' };
}

export function probeHeadroom({ captureImpl = captureCommand, env = process.env } = {}) {
  const headroom = captureImpl('headroom', ['--version'], { env, timeoutMs: 5000 });
  const installedVersion = headroom.status === 0
    ? parseHeadroomVersion(`${headroom.stdout}\n${headroom.stderr}`)?.join('.') || ''
    : '';
  const python = captureImpl('python3', ['--version'], { env, timeoutMs: 5000 });
  const uv = captureImpl('uv', ['--version'], { env, timeoutMs: 5000 });
  const pipx = captureImpl('pipx', ['--version'], { env, timeoutMs: 5000 });
  return {
    status: installedVersion ? 'installed' : 'missing',
    installedVersion,
    pythonVersion: parseHeadroomVersion(`${python.stdout}\n${python.stderr}`)?.join('.') || '',
    uvAvailable: uv.status === 0,
    pipxAvailable: pipx.status === 0,
  };
}

export async function ensureHeadroomInstalled({
  dryRun = false,
  probe = null,
  env = process.env,
  captureImpl = captureCommand,
  runImpl = async (command, args) => runCommand(command, args, { env }),
} = {}) {
  const detected = probe || probeHeadroom({ captureImpl, env });
  const plan = buildHeadroomInstallPlan(detected);
  if (plan.status !== 'missing') return plan;
  if (dryRun) return { ...plan, planned: true };
  try {
    await runImpl(plan.command, plan.args);
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
  const smoke = SMOKE_ARGS.map((args) => ({ args: [...args], ...captureImpl('headroom', [...args], { env, timeoutMs: 15000 }) }));
  const versionText = `${smoke[0].stdout}\n${smoke[0].stderr}`;
  if (smoke.some((item) => item.status !== 0) || !isSupportedHeadroomVersion(versionText)) {
    return { status: isSupportedHeadroomVersion(versionText) ? 'failed' : 'unsupported-version', smoke };
  }
  return { status: 'installed', executable: 'headroom', version: parseHeadroomVersion(versionText).join('.'), smoke };
}
```

- [ ] **Step 4: Run installer tests and assert no system-pip path exists**

Run: `node --test scripts/tests/headroom-install.test.mjs && ! rg -n "(^|['\"])pip(['\"]|$)|python -m pip|python3 -m pip" scripts/lib/aios-init/headroom-installer.mjs`

Expected: all tests PASS and `rg` returns no forbidden installer path.

- [ ] **Step 5: Commit the isolated installer**

```bash
git add scripts/lib/aios-init/headroom-installer.mjs scripts/tests/headroom-install.test.mjs
git commit -m "feat(init): add isolated Headroom installer"
```

### Task 2: Wire installation and independent MCP consent through `aios init`

**Files:**
- Modify: `scripts/lib/aios-init/compression-tools.mjs:64-86,348-457`
- Modify: `scripts/aios-init.mjs:33-60,87-123`
- Modify: `scripts/lib/cli/parse-args/init.mjs:5-49`
- Modify: `scripts/lib/cli/dispatch.mjs:56-68`
- Modify: `scripts/lib/cli/help/commands/basic.mjs:5-14`
- Modify: `scripts/lib/cli/commander/specs/bootstrap.mjs:1-20`
- Modify: `scripts/tests/aios-init.test.mjs`
- Modify: `scripts/tests/aios-cli.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ensureHeadroomInstalled({ dryRun, consent, runner, fsImpl, platform, env, logger })` from Task 1 and existing `ensureCompressionTools(options)`.
- Produces: `ensureCompressionTools({ dryRun, yesCompressionTools, yesHeadroomMcp, agents })` returning `{ rtk, caveman, headroom, headroomMcp }`; CLI option `yesHeadroomMcp: boolean` propagated without widening installation consent.

- [ ] **Step 1: Add failing CLI and status-contract tests**

```js
test('init parser keeps installation and MCP configuration consent independent', () => {
  const parsed = parseAiosArgs(['init', '--all', '--yes-compression-tools', '--yes-headroom-mcp']);
  assert.equal(parsed.options.yesCompressionTools, true);
  assert.equal(parsed.options.yesHeadroomMcp, true);
  const installOnly = parseAiosArgs(['init', '--all', '--yes-compression-tools']);
  assert.equal(installOnly.options.yesHeadroomMcp, false);
});

test('ensureCompressionTools reports all three tools and each MCP-only runtime', async () => {
  const result = await ensureCompressionTools({
    dryRun: true,
    yesCompressionTools: true,
    yesHeadroomMcp: false,
    agents: ['gemini', 'hermes', 'grok'],
    ensureHeadroomImpl: async () => ({ status: 'missing', planned: true }),
  });
  assert.equal(result.headroom, 'missing');
  assert.deepEqual(result.headroomMcp, {
    'gemini-cli': 'pending-consent',
    'hermes-agent': 'pending-consent',
    'grok-build': 'pending-consent',
  });
});
```

- [ ] **Step 2: Run the init tests and verify the new option/status is absent**

Run: `node --test scripts/tests/aios-init.test.mjs scripts/tests/aios-cli.test.mjs`

Expected: FAIL because `yesHeadroomMcp` and `headroom`/`headroomMcp` are not exposed.

- [ ] **Step 3: Extend argument parsing, dispatch and help with a separate flag**

```js
// scripts/lib/cli/parse-args/init.mjs
const INIT_CLI = new Command()
  .name('init')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(false)
  .allowExcessArguments(false)
  .option('--agent <name>', 'Agent name to initialize for')
  .option('--default-mode <mode>', 'Default initialization mode')
  .option('--all', 'Initialize for all agents')
  .option('--dry-run', 'Preview changes without writing')
  .option('--yes-compression-tools', 'Authorize unattended RTK/Caveman/Headroom installation')
  .option('--yes-headroom-mcp', 'Authorize unattended Gemini/Grok Headroom MCP registration');

// inside returned options
yesCompressionTools: flags.yesCompressionTools === true,
yesHeadroomMcp: flags.yesHeadroomMcp === true,

// scripts/lib/cli/dispatch.mjs
if (parsed.options.yesCompressionTools) args.push('--yes-compression-tools');
if (parsed.options.yesHeadroomMcp) args.push('--yes-headroom-mcp');
```

Update both help surfaces so the exact unattended example is:

```text
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
```

Also correct the stale agent list to `claude|codex|gemini|opencode|hermes|grok` and replace “all four agents” with “all detected agents”.

- [ ] **Step 4: Extend the unified install notice and result without placing Headroom logic in the 457-line file**

```js
import { ensureHeadroomInstalled } from './headroom-installer.mjs';

const EMPTY_HEADROOM_MCP = Object.freeze({
  'gemini-cli': 'not-detected',
  'hermes-agent': 'not-detected',
  'grok-build': 'not-detected',
});

export async function ensureCompressionTools(options = {}) {
  const {
    dryRun = false,
    yesCompressionTools = false,
    yesHeadroomMcp = false,
    agents = [],
    ensureHeadroomImpl = ensureHeadroomInstalled,
  } = options;
  // Keep the existing RTK/Caveman detection, consent, installation and RTK init flow unchanged.
  const headroomResult = await ensureHeadroomImpl({ dryRun });
  const detectedRuntimeIds = new Set(agents.map((agent) => AGENT_CONFIG[agent]?.bridgeName).filter(Boolean));
  const headroomMcp = Object.fromEntries(Object.entries(EMPTY_HEADROOM_MCP).map(([runtimeId]) => [
    runtimeId,
    detectedRuntimeIds.has(runtimeId) ? (yesHeadroomMcp ? 'pending-smoke' : 'pending-consent') : 'not-detected',
  ]));
  return {
    rtk: result.rtk,
    caveman: result.caveman,
    headroom: headroomResult.status,
    headroomMcp,
  };
}
```

The implementation must obtain Hermes runtime ID from `getClientRuntimeId('hermes')` or repair `AGENT_CONFIG.hermes.bridgeName` to `hermes-agent`; it must not introduce another mapping table.

- [ ] **Step 5: Add every new focused test to the hard-coded test script and rerun**

```json
"test:scripts": "node --test --test-concurrency=1 scripts/tests/model-router.test.mjs scripts/tests/aios-cli.test.mjs scripts/tests/aios-init.test.mjs scripts/tests/headroom-install.test.mjs scripts/tests/interception-capabilities.test.mjs scripts/tests/interception-cli.test.mjs scripts/tests/offload-tool-offload.test.mjs scripts/tests/memo-storage.test.mjs scripts/tests/memo-help.test.mjs scripts/tests/memo-docs.test.mjs scripts/tests/memo-cli-integration.test.mjs scripts/tests/aios-state-root.test.mjs scripts/tests/workspace.test.mjs scripts/tests/skills-frontmatter.test.mjs scripts/tests/skills-component.test.mjs scripts/tests/skill-index.test.mjs scripts/tests/handoff.test.mjs scripts/tests/doctor.test.mjs scripts/tests/hud-state.test.mjs scripts/tests/team-watchdog.test.mjs scripts/tests/ctx-agent-core.test.mjs scripts/tests/check-site-sync.test.mjs scripts/tests/contextdb-continuity.test.mjs scripts/tests/contextdb-facade.test.mjs scripts/tests/contextdb-lazy-load.test.mjs scripts/tests/contextdb-shell-bridge-codex-home.test.mjs scripts/tests/aios-components.test.mjs scripts/tests/aios-doctor.test.mjs scripts/tests/aios-harness.test.mjs scripts/tests/aios-orchestrator.test.mjs scripts/tests/aios-orchestrator-agents.test.mjs scripts/tests/aios-learn-eval.test.mjs scripts/tests/aios-lifecycle-plan.test.mjs scripts/tests/plan-runtime.test.mjs scripts/tests/planning-product-l3.test.mjs scripts/tests/skill-comply-live.test.mjs scripts/tests/plan-dream-cli-contract.test.mjs scripts/tests/dream-plan-sync.test.mjs scripts/tests/aios-wrappers.test.mjs scripts/tests/atomic-write.test.mjs scripts/tests/harness-journal.test.mjs scripts/tests/harness-runtime.test.mjs scripts/tests/harness-worktree.test.mjs scripts/tests/harness-profiles.test.mjs scripts/tests/repo-lock.test.mjs scripts/tests/client-registry.test.mjs scripts/tests/native-source-tree.test.mjs scripts/tests/native-route-commands.test.mjs scripts/tests/native-sync.test.mjs scripts/tests/native-doctor.test.mjs scripts/tests/native-repairs.test.mjs scripts/tests/codemap.test.mjs scripts/tests/mcp-targets.test.mjs scripts/tests/mcp-migration.test.mjs scripts/tests/mcp-toml.test.mjs scripts/tests/mcp-opencode.test.mjs scripts/tests/release-pipeline.test.mjs scripts/tests/client-capabilities.test.mjs scripts/tests/client-smoke.test.mjs scripts/tests/ecc-uplift.test.mjs scripts/tests/token-discipline.test.mjs scripts/tests/ctx-agent-pending-smoke.test.mjs scripts/tests/memo-scope.test.mjs scripts/tests/native-agent-guidance.test.mjs scripts/tests/pages-workflow.test.mjs"
```

Run: `node --test scripts/tests/headroom-install.test.mjs scripts/tests/aios-init.test.mjs scripts/tests/aios-cli.test.mjs && node scripts/aios.mjs init --all --dry-run --yes-compression-tools --yes-headroom-mcp`

Expected: tests PASS; dry-run lists Headroom and three MCP-only client statuses without installing packages or changing client config.

- [ ] **Step 6: Commit init and CLI wiring**

```bash
git add scripts/lib/aios-init/compression-tools.mjs scripts/aios-init.mjs scripts/lib/cli/parse-args/init.mjs scripts/lib/cli/dispatch.mjs scripts/lib/cli/help/commands/basic.mjs scripts/lib/cli/commander/specs/bootstrap.mjs scripts/tests/aios-init.test.mjs scripts/tests/aios-cli.test.mjs package.json
git commit -m "feat(init): wire Headroom installation consent"
```

### Task 3: Add profile-aware structured MCP configuration readers

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/lib/clients/core/definitions.mjs:113-170`
- Modify: `scripts/lib/clients/native/index.mjs:28-49`
- Create: `scripts/lib/aios-init/headroom-mcp/config-readers.mjs`
- Create: `scripts/tests/headroom-mcp-config.test.mjs`
- Modify: `scripts/tests/client-registry.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `getClientHomes(env, homeDir)`, client registry MCP targets, `yaml.parse`, filesystem read access.
- Produces: `resolveHeadroomConfigTargets({ runtimeId, projectRoot, env, homeDir, profile })` and `readHeadroomEntry(target, { readFileImpl })` returning `{ entry, target, shadowedByProject, parseError }` without writes or process spawning.

- [ ] **Step 1: Install the one justified parser dependency and record the Ponytail decision**

Record in the active plan decision log:

```text
ponytail:rung=5 choice=dependency evidence=scripts/lib/clients/core/definitions.mjs:150-159
```

Run: `npm install yaml@2.9.0 --save`

Expected: `package.json` and `package-lock.json` add only `yaml@2.9.0`; no other dependency version changes.

- [ ] **Step 2: Write failing JSON/YAML/TOML and profile/scope tests**

```js
test('readHeadroomEntry normalizes Gemini JSON, Hermes YAML and Grok TOML', async () => {
  const desired = { command: '/opt/Headroom Bin/headroom', args: ['mcp', 'serve'], env: { HEADROOM_MCP_CLIENT: 'hermes-agent', HEADROOM_MCP_READ: 'off' } };
  const hermes = await readHeadroomEntry(
    { format: 'yaml', namespace: 'mcp_servers', path: '/tmp/config.yaml' },
    { readFileImpl: async () => `mcp_servers:\n  headroom:\n    command: "${desired.command}"\n    args: [mcp, serve]\n    env:\n      HEADROOM_MCP_CLIENT: hermes-agent\n      HEADROOM_MCP_READ: "off"\n    enabled: true\n    tools: [headroom_compress, headroom_retrieve, headroom_stats]\n` }
  );
  assert.deepEqual(hermes.entry.command, desired.command);
  assert.deepEqual(hermes.entry.args, desired.args);
  assert.equal(hermes.entry.enabled, true);

  const grok = await readHeadroomEntry(
    { format: 'toml', namespace: 'mcp_servers', path: '/tmp/config.toml' },
    { readFileImpl: async () => '[mcp_servers.headroom]\ncommand = "/opt/headroom"\nargs = ["mcp", "serve"]\nenv = { "HEADROOM_MCP_CLIENT" = "grok-build", "HEADROOM_MCP_READ" = "off" }\n' }
  );
  assert.equal(grok.entry.env.HEADROOM_MCP_CLIENT, 'grok-build');
  assert.equal(grok.entry.env.HEADROOM_MCP_READ, 'off');
});

test('Hermes home target is YAML and named profiles resolve below profiles/<name>', () => {
  const targets = resolveHeadroomConfigTargets({
    runtimeId: 'hermes-agent', projectRoot: '/work/app', homeDir: '/home/test', profile: 'research', env: {},
  });
  assert.equal(targets.user.path, '/home/test/.hermes/profiles/research/config.yaml');
  assert.equal(targets.user.format, 'yaml');
  assert.equal(targets.project.path, '/work/app/.mcp.json');
  assert.equal(targets.project.format, 'json');
});
```

- [ ] **Step 3: Run the config tests and confirm Hermes is still mislabeled JSON**

Run: `node --test scripts/tests/headroom-mcp-config.test.mjs scripts/tests/client-registry.test.mjs`

Expected: FAIL because `yaml` target overrides, named profiles and complete TOML env parsing do not exist.

- [ ] **Step 4: Add per-scope format overrides and read-only normalizers**

```js
// scripts/lib/clients/core/definitions.mjs
hermes: Object.freeze({
  format: 'json',
  namespace: 'mcpServers',
  scopes: Object.freeze([
    Object.freeze({ scope: 'project', file: '.mcp.json' }),
    Object.freeze({ scope: 'home', file: 'config.yaml', format: 'yaml', namespace: 'mcp_servers' }),
  ]),
}),

// scripts/lib/clients/native/index.mjs inside resolveClientMcpTargetPaths
return {
  path: path.join(base, s.file),
  scope: s.scope,
  format: s.format || target.format,
  namespace: s.namespace || target.namespace,
};
```

```js
// scripts/lib/aios-init/headroom-mcp/config-readers.mjs
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

import { getClientHomes } from '../../platform/paths.mjs';
import { resolveClientFromRuntimeId } from '../../clients/runtime/identifiers.mjs';
import { resolveClientMcpTargetPaths } from '../../clients/native/index.mjs';

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return {
    command: String(entry.command || ''),
    args: Array.isArray(entry.args) ? entry.args.map(String) : [],
    env: Object.fromEntries(Object.entries(objectRecord(entry.env)).map(([key, value]) => [key, String(value)]).sort()),
    ...(typeof entry.enabled === 'boolean' ? { enabled: entry.enabled } : {}),
    ...(Array.isArray(entry.tools) ? { tools: entry.tools.map(String).sort() } : {}),
  };
}

function parseTomlHeadroom(raw = '') {
  const section = /(?:^|\n)\[mcp_servers\.headroom\]\n([\s\S]*?)(?=\n\[|$)/u.exec(raw)?.[1] || '';
  if (!section) return null;
  const command = /^\s*command\s*=\s*"((?:\\.|[^"])*)"\s*$/mu.exec(section)?.[1] || '';
  const argsRaw = /^\s*args\s*=\s*(\[[^\]]*\])\s*$/mu.exec(section)?.[1] || '[]';
  const args = [...argsRaw.matchAll(/"((?:\\.|[^"])*)"/gu)].map((match) => match[1].replace(/\\"/gu, '"').replace(/\\\\/gu, '\\'));
  const envRaw = /^\s*env\s*=\s*\{([^}]*)\}\s*$/mu.exec(section)?.[1] || '';
  const env = Object.fromEntries([...envRaw.matchAll(/"((?:\\.|[^"])*)"\s*=\s*"((?:\\.|[^"])*)"/gu)].map((match) => [match[1], match[2]]));
  return normalizeEntry({ command, args, env });
}

export function resolveHeadroomConfigTargets({ runtimeId, projectRoot = '', env = process.env, homeDir, profile = '' }) {
  const client = resolveClientFromRuntimeId(runtimeId);
  const homes = getClientHomes(env, homeDir);
  const clientHome = homes[client];
  const targets = resolveClientMcpTargetPaths(client, { projectRoot, clientHome });
  const project = targets.find((target) => target.scope === 'project') || null;
  let user = targets.find((target) => target.scope === 'home') || null;
  if (client === 'hermes' && profile && user) {
    user = { ...user, path: path.join(clientHome, 'profiles', profile, 'config.yaml') };
  }
  return { user, project };
}

export async function readHeadroomEntry(target, { readFileImpl = readFile } = {}) {
  if (!target) return { entry: null, target: null, parseError: '' };
  try {
    const raw = await readFileImpl(target.path, 'utf8');
    const parsed = target.format === 'yaml'
      ? parseYaml(raw)
      : target.format === 'json'
        ? JSON.parse(raw.replace(/^\uFEFF/u, ''))
        : null;
    const entry = target.format === 'toml'
      ? parseTomlHeadroom(raw)
      : normalizeEntry(objectRecord(parsed?.[target.namespace]).headroom);
    return { entry, target, parseError: '' };
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return { entry: null, target, parseError: '' };
    return { entry: null, target, parseError: error instanceof Error ? error.message : String(error) };
  }
}
```

- [ ] **Step 5: Verify complete fingerprints can be reconstructed without client processes**

Run: `node --test scripts/tests/headroom-mcp-config.test.mjs scripts/tests/client-registry.test.mjs && npm ls yaml --depth=0`

Expected: tests PASS and dependency output shows exactly `yaml@2.9.0`.

- [ ] **Step 6: Commit structured readers and dependency metadata**

```bash
git add package.json package-lock.json scripts/lib/clients/core/definitions.mjs scripts/lib/clients/native/index.mjs scripts/lib/aios-init/headroom-mcp/config-readers.mjs scripts/tests/headroom-mcp-config.test.mjs scripts/tests/client-registry.test.mjs
git commit -m "feat(init): read Headroom MCP configs safely"
```

### Task 4: Define exact native commands, normalized entries and AIOS ownership

**Files:**
- Create: `scripts/lib/aios-init/headroom-mcp/commands.mjs`
- Create: `scripts/lib/aios-init/headroom-mcp/ownership.mjs`
- Create: `scripts/tests/headroom-mcp-registration.test.mjs`

**Interfaces:**
- Consumes: canonical runtime IDs from `scripts/lib/clients/runtime/identifiers.mjs` and `writeFileAtomic(filePath, content)`.
- Produces: `buildDesiredHeadroomEntry(runtimeId, headroomPath)`, `buildHeadroomMcpAddInvocation(options)`, `buildHeadroomMcpRemoveInvocation(options)`, `fingerprintHeadroomEntry(entry)`, `classifyHeadroomOwnership({ actual, desired, ledgerEntry })`, `readHeadroomLedger(options)`, `writeHeadroomLedger(ledger, options)`.

- [ ] **Step 1: Write failing tests for all three official argv shapes and ownership states**

```js
test('official MCP add commands preserve the absolute executable as one argv item', () => {
  const executable = '/Users/test/Headroom Tools/headroom';
  assert.deepEqual(buildHeadroomMcpAddInvocation({ runtimeId: 'gemini-cli', headroomPath: executable }), {
    command: 'gemini',
    args: ['mcp', 'add', '--scope', 'user', '-e', 'HEADROOM_MCP_CLIENT=gemini-cli', '-e', 'HEADROOM_MCP_READ=off', 'headroom', executable, '--', 'mcp', 'serve'],
  });
  assert.deepEqual(buildHeadroomMcpAddInvocation({ runtimeId: 'hermes-agent', headroomPath: executable }), {
    command: 'hermes',
    args: ['mcp', 'add', 'headroom', '--command', executable, '--env', 'HEADROOM_MCP_CLIENT=hermes-agent', 'HEADROOM_MCP_READ=off', '--args', 'mcp', 'serve'],
  });
  assert.deepEqual(buildHeadroomMcpAddInvocation({ runtimeId: 'grok-build', headroomPath: executable }), {
    command: 'grok',
    args: ['mcp', 'add', '--scope', 'user', '-e', 'HEADROOM_MCP_CLIENT=grok-build', '-e', 'HEADROOM_MCP_READ=off', 'headroom', '--', executable, 'mcp', 'serve'],
  });
});

test('ownership is fail-closed and never adopts an external matching entry', () => {
  const desired = buildDesiredHeadroomEntry('gemini-cli', '/opt/headroom');
  const fingerprint = fingerprintHeadroomEntry(desired);
  assert.equal(classifyHeadroomOwnership({ actual: null, desired, ledgerEntry: null }).status, 'absent');
  assert.equal(classifyHeadroomOwnership({ actual: desired, desired, ledgerEntry: null }).status, 'external');
  assert.equal(classifyHeadroomOwnership({ actual: desired, desired, ledgerEntry: { fingerprint } }).status, 'owned');
  assert.equal(classifyHeadroomOwnership({ actual: { ...desired, command: '/user/headroom' }, desired, ledgerEntry: { fingerprint } }).status, 'conflict');
});
```

- [ ] **Step 2: Run the registration tests and confirm command/ownership modules are missing**

Run: `node --test scripts/tests/headroom-mcp-registration.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `headroom-mcp/commands.mjs`.

- [ ] **Step 3: Implement command builders with no shell strings or approval flags**

```js
import path from 'node:path';

const SERVER_NAME = 'headroom';
const RUNTIME_COMMANDS = Object.freeze({
  'gemini-cli': 'gemini',
  'hermes-agent': 'hermes',
  'grok-build': 'grok',
});

export function buildDesiredHeadroomEntry(runtimeId, headroomPath) {
  if (!RUNTIME_COMMANDS[runtimeId]) throw new Error(`Unsupported Headroom MCP runtime: ${runtimeId}`);
  if (!headroomPath || !path.isAbsolute(String(headroomPath))) throw new Error('Headroom executable must be absolute');
  return Object.freeze({
    command: String(headroomPath),
    args: Object.freeze(['mcp', 'serve']),
    env: Object.freeze({ HEADROOM_MCP_CLIENT: runtimeId, HEADROOM_MCP_READ: 'off' }),
  });
}

export function buildHeadroomMcpAddInvocation({ runtimeId, headroomPath, profile = '' }) {
  const desired = buildDesiredHeadroomEntry(runtimeId, headroomPath);
  if (runtimeId === 'gemini-cli') {
    return { command: 'gemini', args: ['mcp', 'add', '--scope', 'user', '-e', `HEADROOM_MCP_CLIENT=${runtimeId}`, '-e', 'HEADROOM_MCP_READ=off', SERVER_NAME, headroomPath, '--', ...desired.args] };
  }
  if (runtimeId === 'grok-build') {
    return { command: 'grok', args: ['mcp', 'add', '--scope', 'user', '-e', `HEADROOM_MCP_CLIENT=${runtimeId}`, '-e', 'HEADROOM_MCP_READ=off', SERVER_NAME, '--', headroomPath, ...desired.args] };
  }
  const profileArgs = profile ? ['--profile', profile] : [];
  return { command: 'hermes', args: ['mcp', 'add', SERVER_NAME, ...profileArgs, '--command', headroomPath, '--env', `HEADROOM_MCP_CLIENT=${runtimeId}`, 'HEADROOM_MCP_READ=off', '--args', ...desired.args] };
}

export function buildHeadroomMcpRemoveInvocation({ runtimeId, profile = '' }) {
  if (runtimeId === 'gemini-cli') return { command: 'gemini', args: ['mcp', 'remove', '--scope', 'user', SERVER_NAME] };
  if (runtimeId === 'grok-build') return { command: 'grok', args: ['mcp', 'remove', '--scope', 'user', SERVER_NAME] };
  if (runtimeId === 'hermes-agent') return { command: 'hermes', args: ['mcp', 'remove', SERVER_NAME, ...(profile ? ['--profile', profile] : [])] };
  throw new Error(`Unsupported Headroom MCP runtime: ${runtimeId}`);
}
```

- [ ] **Step 4: Implement entry-only fingerprints and atomic non-secret ledger storage**

```js
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeFileAtomic } from '../../fs/atomic-write.mjs';

export function normalizeHeadroomEntry(entry) {
  if (!entry) return null;
  const allowedEnv = ['HEADROOM_MCP_CLIENT', 'HEADROOM_MCP_READ'];
  return {
    command: String(entry.command || ''),
    args: Array.isArray(entry.args) ? entry.args.map(String) : [],
    env: Object.fromEntries(allowedEnv.filter((key) => entry.env?.[key] != null).map((key) => [key, String(entry.env[key])])),
  };
}

export function fingerprintHeadroomEntry(entry) {
  return createHash('sha256').update(JSON.stringify(normalizeHeadroomEntry(entry))).digest('hex');
}

export function classifyHeadroomOwnership({ actual, desired, ledgerEntry }) {
  if (!actual) return { status: 'absent' };
  const actualFingerprint = fingerprintHeadroomEntry(actual);
  const desiredFingerprint = fingerprintHeadroomEntry(desired);
  if (actualFingerprint !== desiredFingerprint) return { status: 'conflict', actualFingerprint, desiredFingerprint };
  if (!ledgerEntry || ledgerEntry.fingerprint !== actualFingerprint) return { status: 'external', actualFingerprint };
  return { status: 'owned', actualFingerprint };
}

export function resolveHeadroomLedgerPath({ env = process.env, homeDir = os.homedir() } = {}) {
  const stateHome = env.AIOS_HOME && path.isAbsolute(env.AIOS_HOME) ? env.AIOS_HOME : path.join(homeDir, '.aios');
  return path.join(stateHome, 'integrations', 'headroom-mcp.json');
}

export async function readHeadroomLedger(options = {}) {
  try {
    const parsed = JSON.parse(await readFile(resolveHeadroomLedgerPath(options), 'utf8'));
    return parsed?.schemaVersion === 1 && parsed.entries && typeof parsed.entries === 'object'
      ? parsed
      : { schemaVersion: 1, entries: {} };
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return { schemaVersion: 1, entries: {} };
    throw error;
  }
}

export async function writeHeadroomLedger(ledger, options = {}) {
  const sanitized = { schemaVersion: 1, entries: {} };
  for (const [runtimeId, entry] of Object.entries(ledger.entries || {})) {
    sanitized.entries[runtimeId] = {
      runtimeId,
      serverName: 'headroom',
      scope: 'user',
      profile: entry.profile || null,
      configPath: entry.configPath,
      command: entry.command,
      args: ['mcp', 'serve'],
      env: { HEADROOM_MCP_CLIENT: runtimeId, HEADROOM_MCP_READ: 'off' },
      fingerprint: entry.fingerprint,
      createdAt: entry.createdAt,
      lastVerifiedAt: entry.lastVerifiedAt,
    };
  }
  await writeFileAtomic(resolveHeadroomLedgerPath(options), `${JSON.stringify(sanitized, null, 2)}\n`);
}
```

- [ ] **Step 5: Verify exact negative flags, idempotent fingerprints and ledger redaction**

Run: `node --test scripts/tests/headroom-mcp-registration.test.mjs && ! rg -n -- "--trust|--accept-hooks|--debug|shell:\s*true" scripts/lib/aios-init/headroom-mcp/{commands,ownership}.mjs`

Expected: tests PASS; forbidden flags and shell execution are absent.

- [ ] **Step 6: Commit commands and ownership**

```bash
git add scripts/lib/aios-init/headroom-mcp/commands.mjs scripts/lib/aios-init/headroom-mcp/ownership.mjs scripts/tests/headroom-mcp-registration.test.mjs
git commit -m "feat(init): define Headroom MCP ownership"
```

### Task 5: Implement fail-closed Gemini and Grok registration lifecycle

**Files:**
- Create: `scripts/lib/aios-init/headroom-mcp/lifecycle.mjs`
- Create: `scripts/lib/aios-init/headroom-mcp/index.mjs`
- Modify: `scripts/lib/aios-init/compression-tools.mjs:348-457`
- Modify: `scripts/tests/headroom-mcp-registration.test.mjs`
- Modify: `scripts/tests/aios-init.test.mjs`

**Interfaces:**
- Consumes: Task 3 config readers and Task 4 commands/ownership; injectable `runImpl`, `inspectImpl`, `probeImpl` and `writeLedgerImpl`.
- Produces: `ensureHeadroomMcpRegistration(options)`, `ensureHeadroomMcpRegistrations(options)` and final per-runtime init status without direct config writes.

- [ ] **Step 1: Add failing consent, conflict, idempotency, shadow and rollback tests**

```js
test('Gemini/Grok registration never overwrites conflict and needs separate consent', async () => {
  const spawns = [];
  const base = {
    runtimeId: 'gemini-cli', headroomPath: '/opt/headroom', mode: 'auto', isTTY: false,
    runImpl: async (command, args) => { spawns.push([command, args]); return { status: 0 }; },
  };
  assert.equal((await ensureHeadroomMcpRegistration({ ...base, consent: false, inspectImpl: async () => ({ actual: null }) })).status, 'pending-consent');
  assert.equal((await ensureHeadroomMcpRegistration({ ...base, consent: true, inspectImpl: async () => ({ actual: { command: '/user/server', args: [], env: {} } }) })).status, 'conflict');
  assert.deepEqual(spawns, []);
});

test('post-add reread is authoritative and rollback only removes an unchanged entry created this run', async () => {
  const desired = buildDesiredHeadroomEntry('grok-build', '/opt/headroom');
  let reads = 0;
  const commands = [];
  const result = await ensureHeadroomMcpRegistration({
    runtimeId: 'grok-build', headroomPath: '/opt/headroom', mode: 'on', consent: true, isTTY: false,
    inspectImpl: async () => ({ actual: reads++ === 0 ? null : desired, projectShadow: false, configPath: '/home/u/.grok/config.toml' }),
    runImpl: async (command, args) => { commands.push([command, args]); return { status: 0 }; },
    probeImpl: async () => ({ status: 'failed', reason: 'handshake-failed' }),
    readLedgerImpl: async () => ({ schemaVersion: 1, entries: {} }),
    writeLedgerImpl: async () => {},
  });
  assert.equal(result.status, 'failed');
  assert.deepEqual(commands.map(([command, args]) => [command, args.slice(0, 3)]), [
    ['grok', ['mcp', 'add', '--scope']],
    ['grok', ['mcp', 'remove', '--scope']],
  ]);
});
```

- [ ] **Step 2: Run registration and init tests to observe missing lifecycle behavior**

Run: `node --test scripts/tests/headroom-mcp-registration.test.mjs scripts/tests/aios-init.test.mjs`

Expected: FAIL because consent, conflict and rollback orchestration are not implemented.

- [ ] **Step 3: Implement one-runtime lifecycle with preflight, authoritative reread and fingerprint rollback**

```js
export async function ensureHeadroomMcpRegistration(options) {
  const {
    runtimeId,
    headroomPath,
    mode = 'auto',
    consent = false,
    dryRun = false,
    profile = '',
    inspectImpl,
    runImpl,
    probeImpl = async () => ({ status: 'registered' }),
    readLedgerImpl = readHeadroomLedger,
    writeLedgerImpl = writeHeadroomLedger,
    now = () => new Date().toISOString(),
  } = options;
  if (!['auto', 'on', 'off'].includes(mode)) return { status: 'failed', reason: `invalid AIOS_HEADROOM_MCP=${mode}` };
  const desired = buildDesiredHeadroomEntry(runtimeId, headroomPath);
  const ledger = await readLedgerImpl(options);
  const before = await inspectImpl({ runtimeId, desired, profile });
  if (before.parseError) return { status: 'failed', reason: `config-parse-failed: ${before.parseError}` };
  const ownership = classifyHeadroomOwnership({ actual: before.actual, desired, ledgerEntry: ledger.entries?.[runtimeId] });
  if (ownership.status === 'conflict') return { status: 'conflict', configPath: before.configPath, projectShadow: before.projectShadow === true };
  if (ownership.status === 'external') return { status: 'external', configPath: before.configPath, projectShadow: before.projectShadow === true };
  if (ownership.status === 'owned') return { status: 'registered', configPath: before.configPath, projectShadow: before.projectShadow === true };
  if (mode === 'off') return { status: 'disabled', reason: 'registration-disabled' };
  if (!consent) return { status: 'pending-consent' };
  const add = buildHeadroomMcpAddInvocation({ runtimeId, headroomPath, profile });
  if (dryRun) return { status: 'pending-smoke', planned: add, projectShadow: before.projectShadow === true };
  const addResult = await runImpl(add.command, add.args, { stdio: 'inherit' });
  if (addResult.status !== 0) return { status: 'failed', reason: `mcp-add-exit-${addResult.status}` };
  const after = await inspectImpl({ runtimeId, desired, profile });
  const afterFingerprint = after.actual ? fingerprintHeadroomEntry(after.actual) : '';
  const desiredFingerprint = fingerprintHeadroomEntry(desired);
  if (afterFingerprint !== desiredFingerprint) return { status: 'failed', reason: 'post-add-fingerprint-mismatch' };
  const timestamp = now();
  ledger.entries[runtimeId] = {
    runtimeId, profile: profile || null, configPath: after.configPath, command: desired.command,
    fingerprint: afterFingerprint, createdAt: timestamp, lastVerifiedAt: timestamp,
  };
  await writeLedgerImpl(ledger, options);
  const probe = await probeImpl(desired);
  if (probe.status !== 'pending-smoke' && probe.status !== 'verified') {
    const current = await inspectImpl({ runtimeId, desired, profile });
    const safeToRollback = current.actual && fingerprintHeadroomEntry(current.actual) === afterFingerprint;
    if (safeToRollback) {
      const remove = buildHeadroomMcpRemoveInvocation({ runtimeId, profile });
      await runImpl(remove.command, remove.args, { stdio: 'inherit' });
    }
    return { status: 'failed', reason: probe.reason || 'mcp-probe-failed', rolledBack: safeToRollback };
  }
  return { status: probe.status, configPath: after.configPath, projectShadow: after.projectShadow === true };
}
```

- [ ] **Step 4: Aggregate only detected MCP-only clients and connect it to init**

```js
const MCP_RUNTIME_BY_AGENT = Object.freeze({
  gemini: 'gemini-cli',
  hermes: 'hermes-agent',
  grok: 'grok-build',
});

export async function ensureHeadroomMcpRegistrations({ agents = [], ...options } = {}) {
  const detected = new Set(agents.map((agent) => MCP_RUNTIME_BY_AGENT[agent]).filter(Boolean));
  const statuses = {};
  for (const runtimeId of Object.values(MCP_RUNTIME_BY_AGENT)) {
    statuses[runtimeId] = detected.has(runtimeId)
      ? (await ensureHeadroomMcpRegistration({ ...options, runtimeId })).status
      : 'not-detected';
  }
  return statuses;
}
```

Replace Task 2's provisional MCP statuses with this aggregate only after Headroom returns `installed`; otherwise preserve `not-detected`/`failed` honestly and run no client command.

- [ ] **Step 5: Verify dry-run, external and conflict paths have zero client mutations**

Run: `node --test scripts/tests/headroom-mcp-registration.test.mjs scripts/tests/aios-init.test.mjs`

Expected: PASS; spies show no `mcp add/remove/list/test/doctor` call for dry-run, external, conflict or missing Headroom.

- [ ] **Step 6: Commit Gemini/Grok lifecycle wiring**

```bash
git add scripts/lib/aios-init/headroom-mcp/lifecycle.mjs scripts/lib/aios-init/headroom-mcp/index.mjs scripts/lib/aios-init/compression-tools.mjs scripts/tests/headroom-mcp-registration.test.mjs scripts/tests/aios-init.test.mjs
git commit -m "feat(init): register Headroom MCP without overwrites"
```

### Task 6: Enforce genuine PTY and configuration proof for Hermes

**Files:**
- Modify: `scripts/lib/aios-init/headroom-mcp/lifecycle.mjs`
- Modify: `scripts/tests/headroom-mcp-registration.test.mjs`

**Interfaces:**
- Consumes: Task 5 lifecycle, `isTTY: Boolean`, and an inherited-stdio `runInteractiveImpl`.
- Produces: Hermes-specific `pending-interactive` paths and `removeOwnedHeadroomMcp(options)` that never invoke Hermes add/remove without a TTY.

- [ ] **Step 1: Add failing tests for no-TTY, exit-zero-without-save, tool selection and remove safety**

```js
test('Hermes never adds or removes without a genuine TTY', async () => {
  const calls = [];
  const common = {
    runtimeId: 'hermes-agent', headroomPath: '/opt/headroom', consent: true, mode: 'on', isTTY: false,
    inspectImpl: async () => ({ actual: null, configPath: '/home/u/.hermes/config.yaml' }),
    runImpl: async (...args) => { calls.push(args); return { status: 0 }; },
  };
  assert.equal((await ensureHeadroomMcpRegistration(common)).status, 'pending-interactive');
  assert.equal((await removeOwnedHeadroomMcp({ ...common, ledgerEntry: { fingerprint: 'x' } })).status, 'pending-interactive');
  assert.deepEqual(calls, []);
});

test('Hermes exit zero is failure until config, enabled state and selected tools prove success', async () => {
  const result = await ensureHeadroomMcpRegistration({
    runtimeId: 'hermes-agent', headroomPath: '/opt/headroom', consent: true, mode: 'on', isTTY: true,
    inspectImpl: async () => ({ actual: null, configPath: '/home/u/.hermes/config.yaml' }),
    runImpl: async () => ({ status: 0 }),
    readLedgerImpl: async () => ({ schemaVersion: 1, entries: {} }),
    writeLedgerImpl: async () => {},
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'post-add-fingerprint-mismatch');
});
```

- [ ] **Step 2: Run the registration suite and verify current generic lifecycle would spawn Hermes**

Run: `node --test scripts/tests/headroom-mcp-registration.test.mjs`

Expected: FAIL on `pending-interactive` and Hermes authoritative reread assertions.

- [ ] **Step 3: Add Hermes gates before any official add/remove command**

```js
const REQUIRED_HEADROOM_TOOLS = Object.freeze(['headroom_compress', 'headroom_retrieve', 'headroom_stats']);

function hermesEntryUsable(entry) {
  if (!entry || entry.enabled !== true) return false;
  const tools = new Set(entry.tools || []);
  return REQUIRED_HEADROOM_TOOLS.every((name) => tools.has(name));
}

// In ensureHeadroomMcpRegistration, before building add:
if (runtimeId === 'hermes-agent' && !options.isTTY) {
  return {
    status: 'pending-interactive',
    manual: buildHeadroomMcpAddInvocation({ runtimeId, headroomPath, profile }),
  };
}

// After authoritative reread:
if (runtimeId === 'hermes-agent' && !hermesEntryUsable(after.actual)) {
  return { status: 'failed', reason: 'hermes-tools-not-enabled' };
}

export async function removeOwnedHeadroomMcp(options) {
  const { runtimeId, profile = '', isTTY = false, inspectImpl, runImpl, ledgerEntry } = options;
  if (runtimeId === 'hermes-agent' && !isTTY) {
    return { status: 'pending-interactive', manual: buildHeadroomMcpRemoveInvocation({ runtimeId, profile }) };
  }
  const current = await inspectImpl(options);
  if (!current.actual) return { status: 'not-found' };
  if (!ledgerEntry || fingerprintHeadroomEntry(current.actual) !== ledgerEntry.fingerprint) {
    return { status: 'conflict', reason: 'entry-changed-after-aios-registration' };
  }
  const remove = buildHeadroomMcpRemoveInvocation({ runtimeId, profile });
  const removed = await runImpl(remove.command, remove.args, { stdio: 'inherit' });
  if (removed.status !== 0) return { status: 'failed', reason: `mcp-remove-exit-${removed.status}` };
  const after = await inspectImpl(options);
  return after.actual ? { status: 'failed', reason: 'post-remove-entry-still-present' } : { status: 'removed' };
}
```

- [ ] **Step 4: Verify parameter order and every no-TTY branch**

Run: `node --test scripts/tests/headroom-mcp-registration.test.mjs && node -e "import('./scripts/lib/aios-init/headroom-mcp/commands.mjs').then(({buildHeadroomMcpAddInvocation})=>{const a=buildHeadroomMcpAddInvocation({runtimeId:'hermes-agent',headroomPath:'/opt/headroom',profile:'research'}).args;if(a.indexOf('--args')<a.indexOf('--env')||a.slice(a.indexOf('--args')+1).join(' ')!=='mcp serve')process.exit(1)})"`

Expected: tests PASS; `--profile` and `--env` occur before the final `--args mcp serve` boundary.

- [ ] **Step 5: Commit Hermes interactive safety**

```bash
git add scripts/lib/aios-init/headroom-mcp/lifecycle.mjs scripts/tests/headroom-mcp-registration.test.mjs
git commit -m "feat(init): gate Hermes Headroom MCP on PTY"
```

### Task 7: Prove the official MCP protocol and expose integration status separately

**Files:**
- Create: `scripts/lib/aios-init/headroom-mcp/smoke.mjs`
- Create: `scripts/tests/headroom-mcp-smoke.test.mjs`
- Modify: `scripts/lib/aios-init/headroom-mcp/index.mjs`
- Modify: `scripts/lib/aios-init/headroom-mcp/lifecycle.mjs`
- Modify: `scripts/lib/clients/capability-report.mjs:23-81`
- Modify: `scripts/lib/lifecycle/clients.mjs:5-22`
- Modify: `scripts/tests/client-capabilities.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `Client` and `StdioClientTransport` from `@modelcontextprotocol/sdk`, normalized desired entry and current ledger/config inspection.
- Produces: `probeHeadroomMcpServer({ command, args, env, verifySavings, clientFactory })` returning `failed|pending-smoke|verified`; capability report field `integrations.headroomMcp` without changing the client's global rollout status.

- [ ] **Step 1: Write failing protocol and truthful-claim tests with an injected MCP client**

```js
const FIXTURE = `${'alpha beta gamma delta epsilon '.repeat(160)}END`;

function makeMcpClient({ tools, stats }) {
  return () => ({
    client: {
      connect: async () => {},
      listTools: async () => ({ tools: tools.map((name) => ({ name })) }),
      callTool: async ({ name, arguments: args }) => {
        if (name === 'headroom_compress') return { content: [{ type: 'text', text: JSON.stringify({ compressed: 'short', hash: 'abc', original_tokens: 800, compressed_tokens: 20 }) }] };
        if (name === 'headroom_retrieve') return { content: [{ type: 'text', text: JSON.stringify({ original_content: FIXTURE, hash: args.hash }) }] };
        return { content: [{ type: 'text', text: JSON.stringify(stats) }] };
      },
      close: async () => {},
    },
    transport: {},
  });
}

const makeHandshakeClient = makeMcpClient({
  tools: ['headroom_compress', 'headroom_retrieve', 'headroom_stats'],
  stats: { compressions: 0, total_tokens_saved: 0 },
});

const makeZeroSavingsClient = makeMcpClient({
  tools: ['headroom_compress', 'headroom_retrieve', 'headroom_stats'],
  stats: { compressions: 1, total_tokens_saved: 0 },
});

test('MCP probe requires three stable tools, excludes headroom_read and verifies round-trip savings', async () => {
  const calls = [];
  const fakeClient = {
    connect: async () => {},
    listTools: async () => ({ tools: ['headroom_compress', 'headroom_retrieve', 'headroom_stats'].map((name) => ({ name })) }),
    callTool: async ({ name, arguments: args }) => {
      calls.push([name, args]);
      if (name === 'headroom_compress') return { content: [{ type: 'text', text: JSON.stringify({ compressed: 'short', hash: 'abc', original_tokens: 800, compressed_tokens: 20 }) }] };
      if (name === 'headroom_retrieve') return { content: [{ type: 'text', text: JSON.stringify({ original_content: FIXTURE }) }] };
      return { content: [{ type: 'text', text: JSON.stringify({ compressions: 1, total_tokens_saved: 780 }) }] };
    },
    close: async () => {},
  };
  const result = await probeHeadroomMcpServer({
    command: '/opt/headroom', args: ['mcp', 'serve'], env: { HEADROOM_MCP_READ: 'off' }, verifySavings: true,
    clientFactory: () => ({ client: fakeClient, transport: {} }),
  });
  assert.equal(result.status, 'verified');
  assert.deepEqual(calls.map(([name]) => name), ['headroom_compress', 'headroom_retrieve', 'headroom_stats']);
});

test('handshake alone is pending-smoke and zero savings cannot be called verified', async () => {
  assert.equal((await probeHeadroomMcpServer({ verifySavings: false, clientFactory: makeHandshakeClient })).status, 'pending-smoke');
  assert.equal((await probeHeadroomMcpServer({ verifySavings: true, clientFactory: makeZeroSavingsClient })).status, 'failed');
});
```

- [ ] **Step 2: Run smoke and capability tests to confirm no integration field exists**

Run: `node --test scripts/tests/headroom-mcp-smoke.test.mjs scripts/tests/client-capabilities.test.mjs`

Expected: FAIL because protocol probe and `integrations.headroomMcp` are absent.

- [ ] **Step 3: Implement SDK transport, bounded payload parsing and strict stats gate**

```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const REQUIRED_TOOLS = Object.freeze(['headroom_compress', 'headroom_retrieve', 'headroom_stats']);
export const HEADROOM_SMOKE_FIXTURE = `${'alpha beta gamma delta epsilon '.repeat(160)}END`;

function parseToolJson(result) {
  const text = (result?.content || []).find((item) => item?.type === 'text')?.text;
  if (!text || text.length > 1_000_000) throw new Error('invalid Headroom MCP text payload');
  return JSON.parse(text);
}

function defaultClientFactory({ command, args, env }) {
  return {
    client: new Client({ name: 'aios-headroom-smoke', version: '1.0.0' }),
    transport: new StdioClientTransport({ command, args, env }),
  };
}

export async function probeHeadroomMcpServer({
  command,
  args = ['mcp', 'serve'],
  env = {},
  verifySavings = false,
  clientFactory = defaultClientFactory,
} = {}) {
  const { client, transport } = clientFactory({ command, args, env });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const names = new Set((listed.tools || []).map((tool) => tool.name));
    if (!REQUIRED_TOOLS.every((name) => names.has(name)) || names.has('headroom_read')) {
      return { status: 'failed', reason: 'unexpected-tool-surface', tools: [...names] };
    }
    if (!verifySavings) return { status: 'pending-smoke', tools: [...names] };
    const compressed = parseToolJson(await client.callTool({ name: 'headroom_compress', arguments: { content: HEADROOM_SMOKE_FIXTURE } }));
    if (!compressed.hash) return { status: 'failed', reason: 'compress-missing-hash' };
    const retrieved = parseToolJson(await client.callTool({ name: 'headroom_retrieve', arguments: { hash: compressed.hash } }));
    if (retrieved.original_content !== HEADROOM_SMOKE_FIXTURE) return { status: 'failed', reason: 'retrieve-mismatch' };
    const stats = parseToolJson(await client.callTool({ name: 'headroom_stats', arguments: {} }));
    if (Number(stats.compressions) <= 0 || Number(stats.total_tokens_saved) <= 0) {
      return { status: 'failed', reason: 'non-positive-savings', stats };
    }
    return { status: 'verified', stats, hash: compressed.hash };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  } finally {
    await client.close().catch(() => {});
  }
}
```

- [ ] **Step 4: Feed handshake into init and report Headroom independently from client rollout**

```js
// scripts/lib/clients/capability-report.mjs inside each client result
const runtimeId = getClientRuntimeId(clientId);
const headroomMcp = await inspectHeadroomMcpCapability({ runtimeId, rootDir, env });
return {
  clientId,
  runtimeId,
  commandName: definition.commandName,
  status,
  integrations: { headroomMcp },
  // retain existing capability, compression, native shim, gate and verification fields
};

// scripts/lib/lifecycle/clients.mjs text report
if (client.integrations?.headroomMcp) {
  lines.push(`  headroomMcp=${client.integrations.headroomMcp.status}`);
}
```

`inspectHeadroomMcpCapability` must use ledger plus static config reread. It must never add Gemini/Hermes/Grok to the global `PENDING_SMOKE_CLIENTS`, because Headroom MCP readiness and whole-client live readiness are separate axes.

- [ ] **Step 5: Add focused tests to the full suite and verify stats wording**

Add `scripts/tests/headroom-mcp-config.test.mjs`, `scripts/tests/headroom-mcp-registration.test.mjs` and `scripts/tests/headroom-mcp-smoke.test.mjs` to the explicit `test:scripts` list.

Run: `node --test scripts/tests/headroom-mcp-smoke.test.mjs scripts/tests/headroom-mcp-registration.test.mjs scripts/tests/client-capabilities.test.mjs`

Expected: PASS; JSON doctor output has `integrations.headroomMcp.status`, while each existing top-level client `status` remains unchanged.

- [ ] **Step 6: Commit protocol proof and capability reporting**

```bash
git add scripts/lib/aios-init/headroom-mcp/smoke.mjs scripts/lib/aios-init/headroom-mcp/index.mjs scripts/lib/aios-init/headroom-mcp/lifecycle.mjs scripts/lib/clients/capability-report.mjs scripts/lib/lifecycle/clients.mjs scripts/tests/headroom-mcp-smoke.test.mjs scripts/tests/headroom-mcp-registration.test.mjs scripts/tests/client-capabilities.test.mjs package.json
git commit -m "feat(clients): report verified Headroom MCP status"
```

### Task 8: Build the official wrapper launch-plan and durable-state guard

**Files:**
- Create: `scripts/lib/headroom/runtime/durable-state.mjs`
- Create: `scripts/lib/headroom/runtime/launch-plan.mjs`
- Create: `scripts/tests/headroom-launch-plan.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `{ runtimeId, command, args, env, launchKind, concurrency }`, Headroom install status, current cwd and verified capability map.
- Produces: `inspectHeadroomDurableState(options)` and `buildHeadroomLaunchPlan(options)` returning `{ command, args, env, wrapped, blocked, reason }` without spawning or writing.

- [ ] **Step 1: Write failing tests for exact wrap args, recursion, modes, privacy, concurrency and durable fail-closed behavior**

```js
test('verified Codex launch preserves every argument and strips the native shim', () => {
  const plan = buildHeadroomLaunchPlan({
    runtimeId: 'codex-cli', command: '/usr/local/bin/codex', args: ['', 'two words', '"quoted"', '--flag'],
    env: { PATH: '/shim:/usr/local/bin', AIOS_NATIVE_SHIM_DIR: '/shim', AIOS_HEADROOM: 'auto' },
    launchKind: 'interactive', concurrency: 1,
    headroom: { status: 'installed', executable: '/tools/headroom' },
    durableState: { status: 'clean' },
    capabilities: { 'codex-cli': { target: 'codex', flags: ['--no-context-tool', '--no-tokensave', '--no-serena'], verifiedLaunchKinds: ['interactive'] } },
  });
  assert.equal(plan.command, '/tools/headroom');
  assert.deepEqual(plan.args, ['wrap', 'codex', '--no-context-tool', '--no-tokensave', '--no-serena', '--', '/usr/local/bin/codex', '', 'two words', '"quoted"', '--flag']);
  assert.equal(plan.env.PATH, '/usr/local/bin');
  assert.equal(plan.env.AIOS_HEADROOM_WRAPPED, '1');
  assert.equal(plan.wrapped, true);
});

test('MCP-only, argv prompt, concurrent and durable paths obey mode semantics', () => {
  const common = { command: 'gemini', args: [], env: {}, launchKind: 'interactive', concurrency: 1, headroom: { status: 'installed', executable: '/tools/headroom' }, durableState: { status: 'clean' } };
  assert.equal(buildHeadroomLaunchPlan({ ...common, runtimeId: 'gemini-cli', mode: 'auto' }).wrapped, false);
  assert.match(buildHeadroomLaunchPlan({ ...common, runtimeId: 'gemini-cli', mode: 'on' }).reason, /AIOS_HEADROOM_MCP=on/u);
  assert.match(buildHeadroomLaunchPlan({ ...common, runtimeId: 'claude-code', mode: 'on', launchKind: 'one-shot' }).reason, /argv-prompt-privacy/u);
  assert.match(buildHeadroomLaunchPlan({ ...common, runtimeId: 'codex-cli', mode: 'on', launchKind: 'team', concurrency: 2 }).reason, /concurrency-not-verified/u);
  assert.equal(buildHeadroomLaunchPlan({ ...common, runtimeId: 'codex-cli', mode: 'off', durableState: { status: 'durable', unwrap: 'headroom unwrap codex' } }).blocked, true);
});

test('recursion marker and headroom itself always bypass wrapping', () => {
  assert.equal(buildHeadroomLaunchPlan({ runtimeId: 'codex-cli', command: 'codex', args: [], env: { AIOS_HEADROOM_WRAPPED: '1' } }).reason, 'already-wrapped');
  assert.equal(buildHeadroomLaunchPlan({ runtimeId: 'codex-cli', command: '/tools/headroom', args: ['--version'], env: {} }).reason, 'headroom-command');
});
```

- [ ] **Step 2: Run launch-plan tests and verify both modules are absent**

Run: `node --test scripts/tests/headroom-launch-plan.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for the runtime modules.

- [ ] **Step 3: Implement read-only durable inspection for the three official targets**

```js
import fs from 'node:fs';
import path from 'node:path';

import { getClientHomes } from '../../platform/paths.mjs';

const CODEX_MARKERS = ['# --- Headroom proxy (auto-injected by headroom wrap codex) ---', '# --- Headroom MCP server ---'];
const OPENCODE_MARKERS = ['// --- Headroom proxy provider ---', '// --- Headroom MCP server ---'];

function readOptional(filePath) {
  try {
    return { exists: fs.existsSync(filePath), text: fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '', error: '' };
  } catch (error) {
    return { exists: false, text: '', error: error instanceof Error ? error.message : String(error) };
  }
}

export function inspectHeadroomDurableState({ runtimeId, cwd = process.cwd(), env = process.env, homeDir } = {}) {
  const homes = getClientHomes(env, homeDir);
  let configPath = '';
  let markerPath = '';
  let backupPath = '';
  let markers = [];
  let target = '';
  if (runtimeId === 'codex-cli') {
    target = 'codex';
    configPath = path.join(homes.codex, 'config.toml');
    backupPath = `${configPath}.headroom-backup`;
    markers = CODEX_MARKERS;
  } else if (runtimeId === 'claude-code') {
    target = 'claude';
    configPath = path.join(cwd, '.claude', 'settings.local.json');
    markerPath = path.join(cwd, '.claude', '.headroom_wrap_marker.json');
  } else if (runtimeId === 'opencode-cli') {
    target = 'opencode';
    configPath = env.OPENCODE_CONFIG && path.isAbsolute(env.OPENCODE_CONFIG)
      ? env.OPENCODE_CONFIG
      : path.join(homes.opencode, 'opencode.json');
    backupPath = `${configPath}.headroom-backup`;
    markers = OPENCODE_MARKERS;
  } else {
    return { status: 'not-applicable', target: '' };
  }
  const config = readOptional(configPath);
  const marker = markerPath ? readOptional(markerPath) : { exists: false, error: '' };
  const backup = backupPath ? readOptional(backupPath) : { exists: false, error: '' };
  if (config.error || marker.error || backup.error) {
    return { status: 'unknown', target, configPath, markerPath, backupPath, unwrap: `headroom unwrap ${target}` };
  }
  const markerFound = markers.some((value) => config.text.includes(value));
  return {
    status: markerFound || marker.exists || backup.exists ? 'durable' : 'clean',
    target,
    configPath,
    markerPath,
    backupPath,
    unwrap: `headroom unwrap ${target}`,
  };
}
```

- [ ] **Step 4: Implement the pure launch selector and exact wrapper flags**

```js
import path from 'node:path';

import { inspectHeadroomDurableState } from './durable-state.mjs';

export const HEADROOM_WRAP_CAPABILITIES = Object.freeze({
  'codex-cli': Object.freeze({ target: 'codex', flags: Object.freeze(['--no-context-tool', '--no-tokensave', '--no-serena']), verifiedLaunchKinds: Object.freeze([]) }),
  'claude-code': Object.freeze({ target: 'claude', flags: Object.freeze(['--no-context-tool', '--no-tokensave', '--no-serena']), verifiedLaunchKinds: Object.freeze([]) }),
  'opencode-cli': Object.freeze({ target: 'opencode', flags: Object.freeze(['--no-context-tool', '--no-serena']), verifiedLaunchKinds: Object.freeze([]) }),
});

function nativePlan(command, args, env, reason) {
  return { command, args: [...args], env: { ...env }, wrapped: false, blocked: false, reason };
}

function blockedPlan(command, args, env, reason) {
  return { command, args: [...args], env: { ...env }, wrapped: false, blocked: true, reason };
}

function stripNativeShim(env) {
  const next = { ...env, AIOS_HEADROOM_WRAPPED: '1' };
  const shim = String(env.AIOS_NATIVE_SHIM_DIR || '').trim();
  if (!shim) return next;
  for (const key of Object.keys(next).filter((name) => name.toLowerCase() === 'path')) {
    next[key] = String(next[key] || '').split(path.delimiter).filter((entry) => {
      const left = path.resolve(entry || '.');
      const right = path.resolve(shim);
      return process.platform === 'win32' ? left.toLowerCase() !== right.toLowerCase() : left !== right;
    }).join(path.delimiter);
  }
  return next;
}

export function buildHeadroomLaunchPlan({
  runtimeId,
  command,
  args = [],
  env = process.env,
  launchKind = 'interactive',
  concurrency = 1,
  mode = env.AIOS_HEADROOM || 'auto',
  headroom = { status: 'missing', executable: '' },
  durableState = null,
  cwd = process.cwd(),
  capabilities = HEADROOM_WRAP_CAPABILITIES,
} = {}) {
  if (env.AIOS_HEADROOM_WRAPPED === '1') return nativePlan(command, args, env, 'already-wrapped');
  if (path.basename(String(command || '')).toLowerCase().replace(/\.exe$/u, '') === 'headroom') return nativePlan(command, args, env, 'headroom-command');
  if (!['auto', 'on', 'off'].includes(mode)) return blockedPlan(command, args, env, `invalid AIOS_HEADROOM=${mode}`);
  const capability = capabilities[runtimeId];
  if (!capability) {
    return mode === 'on'
      ? blockedPlan(command, args, env, `${runtimeId} has no official wrap target; use AIOS_HEADROOM_MCP=on during aios init`)
      : nativePlan(command, args, env, 'mcp-only-runtime');
  }
  const durable = durableState || inspectHeadroomDurableState({ runtimeId, cwd, env });
  const unsafeNative = durable.status === 'durable' || durable.status === 'unknown';
  if (mode === 'off') return unsafeNative ? blockedPlan(command, args, env, `${durable.unwrap} in the same config context`) : nativePlan(command, args, env, 'disabled');
  if (headroom.status !== 'installed' || !headroom.executable) {
    if (mode === 'on' || unsafeNative) return blockedPlan(command, args, env, unsafeNative ? `${durable.unwrap} in the same config context` : 'Headroom >=0.31.0,<0.32.0 is required');
    return nativePlan(command, args, env, 'headroom-unavailable');
  }
  if (!capability.verifiedLaunchKinds.includes(launchKind)) {
    const reason = ['one-shot', 'harness', 'team'].includes(launchKind) && runtimeId !== 'codex-cli'
      ? 'argv-prompt-privacy'
      : 'launch-kind-not-verified';
    return mode === 'on' ? blockedPlan(command, args, env, reason) : nativePlan(command, args, env, reason);
  }
  if (Number(concurrency) > 1) {
    return mode === 'on' ? blockedPlan(command, args, env, 'concurrency-not-verified') : nativePlan(command, args, env, 'concurrency-not-verified');
  }
  const childEnv = stripNativeShim(env);
  return {
    command: headroom.executable,
    args: ['wrap', capability.target, ...capability.flags, '--', command, ...args],
    env: childEnv,
    wrapped: true,
    blocked: false,
    reason: 'official-wrapper',
  };
}
```

- [ ] **Step 5: Verify exact output, durable fixtures and forbidden behavior**

Run: `node --test scripts/tests/headroom-launch-plan.test.mjs && ! rg -n "--no-mcp|--memory|--learn|--code-graph|OPENAI_BASE_URL|ANTHROPIC_BASE_URL|headroom proxy" scripts/lib/headroom/runtime`

Expected: tests PASS; forbidden flags/provider injection/proxy supervision are absent.

- [ ] **Step 6: Add the test to the full suite and commit the adapter disabled-by-evidence**

Add `scripts/tests/headroom-launch-plan.test.mjs` to `test:scripts`, then run: `node --test scripts/tests/headroom-launch-plan.test.mjs`.

Expected: PASS; default `verifiedLaunchKinds` arrays remain empty until Task 11 live evidence exists.

```bash
git add scripts/lib/headroom/runtime/durable-state.mjs scripts/lib/headroom/runtime/launch-plan.mjs scripts/tests/headroom-launch-plan.test.mjs package.json
git commit -m "feat(runtime): add guarded Headroom launch plans"
```

### Task 9: Apply launch plans at the real `ctx-agent` spawn boundary

**Files:**
- Modify: `scripts/lib/ctx-agent-core/common.mjs:15-35`
- Modify: `scripts/lib/ctx-agent-core/interactive.mjs:11-52,85-97`
- Modify: `scripts/lib/ctx-agent-core/one-shot.mjs:53-115`
- Modify: `scripts/tests/ctx-agent-core.test.mjs`
- Modify: `scripts/tests/contextdb-shell-bridge-codex-home.test.mjs`

**Interfaces:**
- Consumes: `buildHeadroomLaunchPlan()` from Task 8 and existing `runCommand` / `runCommandWithInput`.
- Produces: `planRuntimeCommand(options)`, `runRuntimeCommand(options)` and `runRuntimeCommandWithInput(options)`; shell bridge continues to launch outer `ctx-agent`, while the planner sees only the real client command.

- [ ] **Step 1: Add failing end-to-end tests for interactive wrapper, Codex stdin and non-fallback failure**

```js
async function createFakeHeadroomCommand({ exitCode = 0, capturePath }) {
  const binDir = await mkdtemp(path.join(os.tmpdir(), 'aios-headroom-bin-'));
  const headroomPath = path.join(binDir, process.platform === 'win32' ? 'headroom.cmd' : 'headroom');
  const scriptPath = path.join(binDir, 'headroom-capture.mjs');
  await writeFile(scriptPath, [
    'import { writeFileSync, appendFileSync } from "node:fs";',
    `const capturePath = ${JSON.stringify(capturePath)};`,
    `const exitCode = ${Number(exitCode)};`,
    'appendFileSync(capturePath, JSON.stringify({ argv: process.argv.slice(2) }) + "\\n");',
    'process.exit(exitCode);',
  ].join('\n'), 'utf8');
  if (process.platform === 'win32') {
    await writeFile(headroomPath, `@echo off\r\nnode "${scriptPath}" %*\r\n`, 'utf8');
  } else {
    await writeFile(headroomPath, `#!/usr/bin/env sh\nexec node "${scriptPath}" "$@"\n`, 'utf8');
    await chmod(headroomPath, 0o755);
  }
  return { binDir, headroomPath };
}

async function runCtxAgentFixture({ agent, prompt = '', env = {}, fakeCommands = [], headroomExitCode = 0 }) {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-ctx-headroom-'));
  const capturePath = path.join(workspaceRoot, 'headroom.jsonl');
  const headroom = await createFakeHeadroomCommand({ exitCode: headroomExitCode, capturePath });
  const codexBin = fakeCommands.includes('codex') ? await createFakeCodexCommand('FAKE_CODEX_OK') : '';
  const pathEntries = [headroom.binDir, codexBin, process.env.PATH || ''].filter(Boolean);
  const result = spawnSync(process.execPath, [
    CTX_AGENT_CLI,
    '--agent', agent,
    '--workspace', workspaceRoot,
    '--project', 'headroom-fixture',
    '--no-bootstrap',
    prompt,
  ].filter(Boolean), {
    encoding: 'utf8',
    env: Object.assign({}, process.env, env, { PATH: pathEntries.join(path.delimiter) }),
    input: prompt,
  });
  const captureText = await readFile(capturePath, 'utf8').catch(() => '');
  const headroomRecords = captureText.trim() ? captureText.trim().split(/\r?\n/u).map((line) => JSON.parse(line)) : [];
  return {
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    capturePath,
    codexPath: path.join(codexBin, process.platform === 'win32' ? 'codex.cmd' : 'codex'),
    headroomArgv: captureText,
    bareCodexSpawnCount: /FAKE_CODEX_OK/u.test(`${result.stdout}\n${result.stderr}`) ? 1 : 0,
    headroomRecords,
  };
}

test('ctx-agent interactive plans the real Codex command under official Headroom', async () => {
  const result = await runCtxAgentFixture({
    agent: 'codex-cli',
    env: { AIOS_HEADROOM: 'on', AIOS_TEST_HEADROOM_CAPABILITIES: 'codex-interactive' },
    fakeCommands: ['headroom', 'codex'],
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(await readFile(result.capturePath, 'utf8')).args.slice(0, 7), [
    'wrap', 'codex', '--no-context-tool', '--no-tokensave', '--no-serena', '--', result.codexPath,
  ]);
});

test('Codex one-shot prompt stays on stdin and wrapper failure never starts bare Codex', async () => {
  const result = await runCtxAgentFixture({
    agent: 'codex-cli', prompt: 'private prompt sent only on stdin', headroomExitCode: 23,
    env: { AIOS_HEADROOM: 'on', AIOS_TEST_HEADROOM_CAPABILITIES: 'codex-one-shot' },
    fakeCommands: ['headroom', 'codex'],
  });
  assert.equal(result.exitCode, 23);
  assert.doesNotMatch(result.headroomArgv, /private prompt sent only on stdin/u);
  assert.equal(result.bareCodexSpawnCount, 0);
});
```

- [ ] **Step 2: Run ctx-agent and bridge tests and observe bare client spawns**

Run: `node --test scripts/tests/ctx-agent-core.test.mjs scripts/tests/contextdb-shell-bridge-codex-home.test.mjs`

Expected: new assertions FAIL because `interactive.mjs` and `one-shot.mjs` invoke clients directly.

- [ ] **Step 3: Centralize sync launch planning in `common.mjs`**

```js
import { buildHeadroomLaunchPlan } from '../headroom/runtime/launch-plan.mjs';

export function planRuntimeCommand({ runtimeId, command, args = [], options = {}, launchKind, concurrency = 1 }) {
  return buildHeadroomLaunchPlan({
    runtimeId,
    command,
    args,
    env: options.env || process.env,
    cwd: options.cwd || process.cwd(),
    launchKind,
    concurrency,
    headroom: options.headroom,
    capabilities: options.headroomCapabilities,
  });
}

export function runRuntimeCommand(spec) {
  const plan = planRuntimeCommand(spec);
  if (plan.blocked) return { status: 1, stdout: '', stderr: plan.reason, headroomBlocked: true };
  return runCommand(plan.command, plan.args, { ...spec.options, env: plan.env });
}

export function runRuntimeCommandWithInput(spec) {
  const plan = planRuntimeCommand(spec);
  if (plan.blocked) return { status: 1, stdout: '', stderr: plan.reason, headroomBlocked: true };
  return runCommandWithInput(plan.command, plan.args, spec.input, { ...spec.options, env: plan.env });
}
```

Production code must obtain `headroom` absolute path/version from the Task 1 probe. The `AIOS_TEST_HEADROOM_CAPABILITIES` fixture name above is test-only dependency injection and must not become a production capability bypass.

- [ ] **Step 4: Route interactive and one-shot handlers through the planned runners**

```js
// interactive.mjs
const invocation = builder({ extraArgs, ...opts });
const result = runRuntimeCommand({
  runtimeId: agent,
  command: invocation.cmd,
  args: invocation.args,
  options: { ...opts, stdio: 'inherit' },
  launchKind: 'interactive',
  concurrency: 1,
});

// one-shot.mjs
function runBufferedRuntime(runtimeId, command, args) {
  const result = runRuntimeCommand({ runtimeId, command, args, options: {}, launchKind: 'one-shot', concurrency: 1 });
  return { output: `${result.stdout || ''}${result.stderr || ''}`, exitCode: result.status ?? 1 };
}

function runCodexOneShot(prompt, extraArgs) {
  const command = commandForRuntime('codex-cli');
  const args = buildCodexOneShotArgs({ extraArgs });
  const result = runRuntimeCommandWithInput({
    runtimeId: 'codex-cli', command, args, input: prompt, options: {}, launchKind: 'one-shot', concurrency: 1,
  });
  return { output: `${result.stdout || ''}${result.stderr || ''}`, exitCode: result.status ?? 1 };
}
```

Claude/OpenCode one-shot must remain bare in `auto` and fail before spawn in `on`; Gemini/Hermes/Grok remain native for `auto|off` and fail with MCP guidance for `on`.

- [ ] **Step 5: Prove the shell bridge wraps only `ctx-agent`, then the real client exactly once**

Run: `node --test scripts/tests/ctx-agent-core.test.mjs scripts/tests/contextdb-shell-bridge-codex-home.test.mjs`

Expected: PASS; capture shows `contextdb-shell-bridge -> node scripts/ctx-agent.mjs -> headroom wrap <target> -> real client`, with no `headroom wrap node` and no recursive native shim.

- [ ] **Step 6: Commit ctx-agent integration**

```bash
git add scripts/lib/ctx-agent-core/common.mjs scripts/lib/ctx-agent-core/interactive.mjs scripts/lib/ctx-agent-core/one-shot.mjs scripts/tests/ctx-agent-core.test.mjs scripts/tests/contextdb-shell-bridge-codex-home.test.mjs
git commit -m "feat(ctx-agent): launch clients through Headroom plans"
```

### Task 10: Apply launch plans to team, harness, retry and structured fallback

**Files:**
- Modify: `scripts/lib/harness/subagent-clients/invocation-runner.mjs:1-27`
- Modify: `scripts/lib/harness/subagent-clients/codex-exec.mjs:48-130`
- Modify: `scripts/lib/harness/subagent-runtime/one-shot-runner.mjs:18-80`
- Modify: `scripts/lib/harness/subagent-runtime/phase-job.mjs:34-60`
- Modify: `scripts/lib/harness/orchestrator-runtimes/groupchat-adapter.mjs:29-49`
- Modify: `scripts/tests/harness-runtime.test.mjs`

**Interfaces:**
- Consumes: async process runners, `SUBAGENT_CONCURRENCY_ENV`, Task 8 launch planner, runtime client ID and explicit `launchKind: team|harness`.
- Produces: every generic spawn and every Codex initial/retry/structured fallback spawn calls `buildHeadroomLaunchPlan()` immediately before process creation.

- [ ] **Step 1: Write failing tests that count one launch-plan call per actual Codex spawn**

```js
const CODEX_INVOCATION = Object.freeze({
  args: Object.freeze(['exec', '--json', '--schema', 'agent-handoff.schema.json', 'Summarize the fixture']),
  input: 'private harness prompt on stdin',
});

const CODEX_OUTPUT = Object.freeze({
  schemaPath: 'scripts/lib/specs/agent-handoff.schema.json',
  lastMessagePath: 'last-message.json',
  color: 'never',
});

function makeRunOptions(env = {}) {
  const cwd = process.cwd();
  return {
    env: Object.assign({}, process.env, env),
    cwd,
    timeoutMs: 1000,
    io: null,
    launchKind: 'harness',
    codexOutput: CODEX_OUTPUT,
    routedExtraArgs: [],
    spawnImpl: async () => ({ status: 0, stdout: '{}', stderr: '', error: null, timedOut: false }),
  };
}

test('Codex retry and structured fallback rebuild a complete Headroom plan before every spawn', async () => {
  const planned = [];
  const spawned = [];
  const result = await runCodexInvocation('codex', CODEX_INVOCATION, {
    env: { AIOS_SUBAGENT_UPSTREAM_MAX_ATTEMPTS: '2' }, timeoutMs: 1000, cwd: '/work', io: null,
    clientId: 'codex-cli', launchKind: 'harness', concurrency: 1, codexOutput: CODEX_OUTPUT, routedExtraArgs: [],
    buildLaunchPlanImpl: (input) => { planned.push(input); return { command: 'headroom', args: ['wrap', 'codex', '--', input.command, ...input.args], env: input.env, wrapped: true, blocked: false, reason: 'official-wrapper' }; },
    spawnWithInputImpl: async (command, args) => {
      spawned.push([command, args]);
      return spawned.length === 1
        ? { status: 1, stdout: '', stderr: 'upstream_error', error: null, timedOut: false }
        : { status: 0, stdout: '{}', stderr: '', error: null, timedOut: false };
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(planned.length, spawned.length);
  assert.ok(planned.every((item) => item.command === 'codex' && item.args[0] === 'exec'));
  assert.ok(spawned.every(([command, args]) => command === 'headroom' && args[0] === 'wrap'));
});

test('concurrency greater than one bypasses auto and blocks on without spawning', async () => {
  const auto = await runOneShot('codex-cli', makeRunOptions({ AIOS_HEADROOM: 'auto', AIOS_SUBAGENT_CONCURRENCY: '2' }));
  assert.equal(auto.headroomReason, 'concurrency-not-verified');
  const forced = await runOneShot('codex-cli', makeRunOptions({ AIOS_HEADROOM: 'on', AIOS_SUBAGENT_CONCURRENCY: '2' }));
  assert.match(forced.error, /concurrency-not-verified/u);
});
```

- [ ] **Step 2: Run harness tests and confirm planning currently occurs zero times**

Run: `node --test scripts/tests/harness-runtime.test.mjs`

Expected: FAIL because invocation runners call `spawnCommand*` directly.

- [ ] **Step 3: Plan generic invocations immediately before async spawn**

```js
import { buildHeadroomLaunchPlan } from '../../headroom/runtime/launch-plan.mjs';

async function runSpawnInvocation(command, invocation, options) {
  const plan = (options.buildLaunchPlanImpl || buildHeadroomLaunchPlan)({
    runtimeId: options.clientId,
    command,
    args: invocation.args,
    env: options.env,
    cwd: options.cwd,
    launchKind: options.launchKind,
    concurrency: options.concurrency,
  });
  if (plan.blocked) return { exitCode: 1, stdout: '', stderr: '', error: plan.reason };
  const result = await (options.spawnImpl || spawnCommand)(plan.command, plan.args, {
    env: plan.env, timeoutMs: options.timeoutMs, cwd: options.cwd || undefined,
  });
  return { ...normalizeSpawnResult(result, options.timeoutMs), headroomReason: plan.reason };
}
```

- [ ] **Step 4: Re-plan inside every Codex attempt and fallback helper**

```js
async function spawnPlannedCodex(command, args, options) {
  const plan = (options.buildLaunchPlanImpl || buildHeadroomLaunchPlan)({
    runtimeId: options.clientId,
    command,
    args,
    env: options.env,
    cwd: options.cwd,
    launchKind: options.launchKind,
    concurrency: options.concurrency,
  });
  if (plan.blocked) return { status: 1, stdout: '', stderr: plan.reason, error: new Error(plan.reason), timedOut: false };
  return (options.spawnWithInputImpl || spawnCommandWithInput)(plan.command, plan.args, {
    env: plan.env,
    timeoutMs: options.timeoutMs,
    cwd: options.cwd || undefined,
    input: options.input,
  });
}

// Inside every iteration of runCodexExecWithRetry:
const result = await spawnPlannedCodex(command, args, { ...options, input });
```

Both `runCodexStructuredFallbacks()` branches must continue calling `runCodexExecWithRetry()`, so the fallback arrays start with the real `['exec', ...]` args before each planner invocation. Never feed already wrapped args back into the planner.

- [ ] **Step 5: Propagate runtime kind and actual concurrency from phase/groupchat callers**

```js
// one-shot-runner.mjs
const concurrency = parsePositiveInt(env?.[SUBAGENT_CONCURRENCY_ENV], 1);
return runClientInvocation(command, invocation, {
  clientId,
  launchKind,
  concurrency,
  env,
  timeoutMs,
  cwd,
  io,
  codexOutput,
  routedExtraArgs,
});

// phase-job.mjs passes launchKind: 'harness'
// groupchat-adapter.mjs passes launchKind: 'team' and the configured worker count through AIOS_SUBAGENT_CONCURRENCY
```

- [ ] **Step 6: Verify privacy, retry, fallback and concurrency matrices**

Run: `node --test scripts/tests/harness-runtime.test.mjs scripts/tests/ctx-agent-core.test.mjs`

Expected: PASS; Codex stdin is never present in wrapper argv, Claude/OpenCode argv-prompt paths follow `auto`/`on`, and no wrapper failure launches a bare client.

- [ ] **Step 7: Commit team and harness integration**

```bash
git add scripts/lib/harness/subagent-clients/invocation-runner.mjs scripts/lib/harness/subagent-clients/codex-exec.mjs scripts/lib/harness/subagent-runtime/one-shot-runner.mjs scripts/lib/harness/subagent-runtime/phase-job.mjs scripts/lib/harness/orchestrator-runtimes/groupchat-adapter.mjs scripts/tests/harness-runtime.test.mjs
git commit -m "feat(harness): plan every Headroom client spawn"
```

### Task 11: Run isolated official wrapper and MCP live smokes before enabling `auto`

**Files:**
- Create: `scripts/headroom-live-smoke.mjs`
- Create: `scripts/tests/headroom-live-smoke.test.mjs`
- Create: `docs/reports/2026-07-10-headroom-live-smoke.md`
- Modify: `scripts/lib/headroom/runtime/launch-plan.mjs`
- Modify: `scripts/tests/headroom-launch-plan.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: installed official Headroom `0.31.x`, temp HOME/client homes, fake no-secret target CLIs, Task 7 MCP probe and Task 8 durable guard.
- Produces: machine-readable smoke JSON plus a checked-in human report; only evidence-backed `verifiedLaunchKinds` are enabled.

- [ ] **Step 1: Write failing safety tests for isolated homes and genuine Hermes PTY**

```js
test('live smoke refuses production homes and cannot automate Hermes prompts', async () => {
  assert.throws(() => assertIsolatedHome({ homeDir: os.homedir(), realHome: os.homedir() }), /isolated HOME required/u);
  assert.throws(() => assertHermesInteractive({ stdin: { isTTY: false }, stdout: { isTTY: true } }), /genuine PTY required/u);
  assert.throws(() => assertHermesInteractive({ stdin: { isTTY: true }, stdout: { isTTY: false } }), /genuine PTY required/u);
});

test('smoke report cannot promote a launch kind without normal-exit, failure and restore proof', () => {
  assert.equal(canPromoteWrapEvidence({ normalExit: true, failureExit: true, restore: false, noSecrets: true }), false);
  assert.equal(canPromoteWrapEvidence({ normalExit: true, failureExit: true, restore: true, noSecrets: true }), true);
});
```

- [ ] **Step 2: Run the safety test before writing the smoke runner**

Run: `node --test scripts/tests/headroom-live-smoke.test.mjs`

Expected: FAIL because the safety assertions and evidence gate do not exist.

- [ ] **Step 3: Implement a runner that creates all state below one temporary root**

```js
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { probeHeadroomMcpServer } from './lib/aios-init/headroom-mcp/smoke.mjs';

export function assertIsolatedHome({ homeDir, realHome = os.homedir() }) {
  if (!homeDir || path.resolve(homeDir) === path.resolve(realHome)) throw new Error('isolated HOME required');
}

export function assertHermesInteractive({ stdin = process.stdin, stdout = process.stdout } = {}) {
  if (stdin.isTTY !== true || stdout.isTTY !== true) throw new Error('genuine PTY required for Hermes smoke');
}

export function canPromoteWrapEvidence(evidence = {}) {
  return evidence.normalExit === true && evidence.failureExit === true && evidence.restore === true && evidence.noSecrets === true;
}

export async function runHeadroomLiveSmoke({ client, interactiveHermes = false, keep = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-headroom-live-'));
  assertIsolatedHome({ homeDir: root });
  const env = {
    ...process.env,
    HOME: root,
    AIOS_HOME: path.join(root, '.aios'),
    CODEX_HOME: path.join(root, '.codex'),
    CLAUDE_CONFIG_DIR: path.join(root, '.claude'),
    GEMINI_HOME: path.join(root, '.gemini'),
    HERMES_HOME: path.join(root, '.hermes'),
    GROK_HOME: path.join(root, '.grok'),
    OPENCODE_HOME: path.join(root, '.config', 'opencode'),
    OPENCODE_CONFIG: path.join(root, '.config', 'opencode', 'opencode.json'),
    HEADROOM_MCP_READ: 'off',
  };
  if (client === 'hermes-agent') {
    if (!interactiveHermes) return { client, status: 'pending-interactive', root };
    assertHermesInteractive();
  }
  const mcp = ['gemini-cli', 'hermes-agent', 'grok-build'].includes(client)
    ? await probeHeadroomMcpServer({ command: 'headroom', args: ['mcp', 'serve'], env, verifySavings: true })
    : null;
  const evidence = { schemaVersion: 1, client, root, noSecrets: true, mcp, generatedAt: new Date().toISOString() };
  await writeFile(path.join(root, 'smoke.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  const result = JSON.parse(await readFile(path.join(root, 'smoke.json'), 'utf8'));
  if (!keep) await rm(root, { recursive: true, force: true });
  return result;
}
```

Add wrapper evidence helpers in the same file:

```js
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function runArgv(argv, { env, allowNonZero = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (status, signal) => {
      const result = { status, signal, stdout, stderr };
      if (!allowNonZero && status !== 0) reject(Object.assign(new Error(`command failed: ${argv.join(' ')}`), result));
      else resolve(result);
    });
  });
}

export async function runOfficialWrapEvidence({ client, launch, env, targetCommand, targetArgs = [], headroom = 'headroom' }) {
  const normal = await runArgv([headroom, 'wrap', client, '--', targetCommand, ...targetArgs], { env });
  const failed = await runArgv([headroom, 'wrap', client, '--', targetCommand, '--exit-code=17'], { env, allowNonZero: true });
  return {
    launch,
    normalExit: normal.status === 0,
    failureExit: failed.status === 17,
    bareFallback: false,
    signalIdentity: failed.signal ?? 'not-preserved-by-wrapper',
  };
}

export async function runOfficialUnwrapEvidence({ client, env, configPath, headroom = 'headroom' }) {
  const beforeBytes = await readFile(configPath);
  const unwrap = await runArgv([headroom, 'unwrap', client], { env });
  const afterBytes = await readFile(configPath);
  return {
    restore: unwrap.status === 0 && Buffer.compare(beforeBytes, afterBytes) === 0,
    beforeSha256: sha256(beforeBytes),
    afterSha256: sha256(afterBytes),
  };
}
```

The runner must call `runOfficialWrapEvidence()` and `runOfficialUnwrapEvidence()` for each promoted Codex, Claude and OpenCode row. The resulting JSON must include normal exit, nonzero wrapper exit without bare fallback, config/backup bytes before and after unwrap, MCP tool list, stats, and either a preserved signal value or the explicit `not-preserved-by-wrapper` limitation marker.

- [ ] **Step 4: Run deterministic wrapper smokes in isolated config roots**

Run:

```bash
node scripts/headroom-live-smoke.mjs --client codex-cli --launch interactive --json
node scripts/headroom-live-smoke.mjs --client codex-cli --launch one-shot --json
node scripts/headroom-live-smoke.mjs --client claude-code --launch interactive --json
node scripts/headroom-live-smoke.mjs --client opencode-cli --launch interactive --json
```

Expected for each promoted row: official wrapper starts the fake client; nonzero exit is preserved with zero bare fallback; required CCR tool remains; duplicate RTK/TokenSave/Serena layers are not added; exact official unwrap restores isolated config. If OpenCode restore fails, its `verifiedLaunchKinds` remains empty.

- [ ] **Step 5: Run MCP-only smokes and the Hermes manual PTY sequence**

Run:

```bash
node scripts/headroom-live-smoke.mjs --client gemini-cli --mcp-register --json
node scripts/headroom-live-smoke.mjs --client grok-build --mcp-register --json
node scripts/headroom-live-smoke.mjs --client hermes-agent --mcp-register --interactive-hermes --json
```

Expected: each isolated home passes add -> config reread -> initialize/list -> compress/retrieve/stats -> official remove -> config reread. Hermes is run in a visible real terminal; the operator handles tool enable/remove prompts, and no pipe or prefilled answer is used.

- [ ] **Step 6: Write the evidence report and promote only passing runtime rows**

```js
// launch-plan.mjs after evidence is attached
'codex-cli': Object.freeze({
  target: 'codex',
  flags: Object.freeze(['--no-context-tool', '--no-tokensave', '--no-serena']),
  verifiedLaunchKinds: Object.freeze(['interactive', 'one-shot', 'harness', 'team']),
}),
'claude-code': Object.freeze({
  target: 'claude',
  flags: Object.freeze(['--no-context-tool', '--no-tokensave', '--no-serena']),
  verifiedLaunchKinds: Object.freeze(['interactive']),
}),
'opencode-cli': Object.freeze({
  target: 'opencode',
  flags: Object.freeze(['--no-context-tool', '--no-serena']),
  verifiedLaunchKinds: Object.freeze(['interactive']),
}),
```

Remove any row or launch kind whose report is not fully passing. Keep `concurrency > 1` blocked unless a separate two-worker smoke passes. In `docs/reports/2026-07-10-headroom-live-smoke.md`, record exact commands, Headroom version, isolated roots, results, known signal limitation, config recovery evidence and zero-secret statement.

- [ ] **Step 7: Verify the final matrix and commit evidence-backed promotion**

Run: `node --test scripts/tests/headroom-live-smoke.test.mjs scripts/tests/headroom-launch-plan.test.mjs scripts/tests/headroom-mcp-smoke.test.mjs`

Expected: PASS; every default `auto` row has a corresponding passing report section, and unverified concurrency remains blocked.

```bash
git add scripts/headroom-live-smoke.mjs scripts/tests/headroom-live-smoke.test.mjs docs/reports/2026-07-10-headroom-live-smoke.md scripts/lib/headroom/runtime/launch-plan.mjs scripts/tests/headroom-launch-plan.test.mjs package.json
git commit -m "test(headroom): verify official wrappers and MCP"
```

### Task 12: Add the canonical AIOS Ponytail Gate skill and workflow hooks

**Files:**
- Create: `skill-sources/aios-ponytail-gate/SKILL.md`
- Create: `skill-sources/aios-ponytail-gate/UPSTREAM.md`
- Modify: `skill-sources/aios-workflow-router/SKILL.md`
- Modify: `skill-sources/pre-edit-safety-gate/SKILL.md`
- Modify: `skill-sources/search-first/SKILL.md`
- Modify: `skill-sources/verification-loop/SKILL.md`
- Modify: `skill-sources/aios-interception-runtime/SKILL.md`
- Create: `scripts/tests/ponytail-gate.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `skill-sources/` automatic discovery, existing skills frontmatter, and Ponytail upstream decision discipline.
- Produces: canonical skill `aios-ponytail-gate` with frontmatter `clients: [codex, claude, gemini, opencode, hermes, grok]` and `repoTargets: [codex, claude, gemini, opencode, hermes, grok, agents]`; workflow skills reference it as a decision gate, not as a replacement for TDD, CRG, security, or verification.

- [ ] **Step 1: Write failing tests for discoverability, upstream attribution and workflow references**

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return readFile(path, 'utf8');
}

test('Ponytail gate is a canonical discoverable skill with upstream attribution', async () => {
  const skill = await read('skill-sources/aios-ponytail-gate/SKILL.md');
  const upstream = await read('skill-sources/aios-ponytail-gate/UPSTREAM.md');
  assert.match(skill, /^name: aios-ponytail-gate$/m);
  assert.match(skill, /^clients: \[codex, claude, gemini, opencode, hermes, grok\]$/m);
  assert.match(skill, /^repoTargets: \[codex, claude, gemini, opencode, hermes, grok, agents\]$/m);
  assert.match(upstream, /DietrichGebert\/ponytail/u);
  assert.match(upstream, /14a0d79548d4de8fc2de95c1b94bb0de63a739d3/u);
  assert.match(upstream, /MIT/u);
});

test('workflow skills invoke Ponytail as a minimal-implementation gate', async () => {
  const paths = [
    'skill-sources/aios-workflow-router/SKILL.md',
    'skill-sources/pre-edit-safety-gate/SKILL.md',
    'skill-sources/search-first/SKILL.md',
    'skill-sources/verification-loop/SKILL.md',
    'skill-sources/aios-interception-runtime/SKILL.md',
  ];
  for (const path of paths) {
    const body = await read(path);
    assert.match(body, /aios-ponytail-gate/u, path);
  }
});
```

- [ ] **Step 2: Run the focused test and confirm the skill is missing**

Run: `node --test scripts/tests/ponytail-gate.test.mjs`

Expected: FAIL with `ENOENT` for `skill-sources/aios-ponytail-gate/SKILL.md`.

- [ ] **Step 3: Create the Ponytail Gate skill**

```markdown
---
name: aios-ponytail-gate
description: Minimal-correct-implementation gate inspired by Ponytail. Use before proposing or writing code, dependencies, abstractions, new files, generated docs, or workflow automation to choose the earliest safe rung.

installCatalogName: aios-ponytail-gate
clients: [codex, claude, gemini, opencode, hermes, grok]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [workflow, token, minimalism, safety, essential]
repoTargets: [codex, claude, gemini, opencode, hermes, grok, agents]
---

# AIOS Ponytail Gate

Use this skill before implementation choices that could add code, dependencies, files, abstractions, long prompts, or automation. It reduces token load by preventing avoidable work while preserving safety and correctness.

## Gate Order

Choose the first rung that fully solves the user-visible problem:

1. No change: explain the existing behavior or command when that is enough.
2. Existing surface: reuse an existing command, flag, skill, helper, test fixture, or documented workflow.
3. Narrow edit: change the smallest existing file or rule that owns the behavior.
4. Local helper: add a private helper inside the owning module when duplication is real and nearby.
5. Dependency: add a dependency only when a maintained parser/protocol/tool prevents fragile custom logic.
6. New module: add a focused module only when the owning file would become hard to review or test.
7. New subsystem: add a subsystem only with a written spec, rollback path, smoke evidence, and owner-facing docs.

## Mandatory Checks

- State the selected rung in the active plan or commit notes as `ponytail:rung=<n>`.
- Prefer deletion, reuse, scoped reads, and exact tests over broad rewrites.
- Never use this gate to skip security checks, privacy checks, TDD, CRG, user approval, or verification.
- Keep safety exceptions: credentials, auth, destructive operations, compliance, and data loss require the safer path even when it costs more code.
- If adding a dependency, record the rejected local implementation and the package/version reason.

## Diff Review

Before final verification, scan the diff and remove:

- unused helpers, flags, config keys, files, generated artifacts, or docs sections;
- duplicate compression layers or prompt instructions;
- broad context injection where a stable skill or on-demand ContextDB recall is enough;
- claims of token savings without local evidence.
```

- [ ] **Step 4: Create the upstream attribution file**

```markdown
# Upstream Attribution

Source: https://github.com/DietrichGebert/ponytail
License: MIT
Pinned commit: 14a0d79548d4de8fc2de95c1b94bb0de63a739d3

AIOS adapts the decision discipline as a local skill. It does not vendor Ponytail code, install the upstream plugin, or claim behavior parity with an upstream plugin unless a separate installation smoke proves it.
```

- [ ] **Step 5: Hook existing workflow skills without replacing their gates**

Add this paragraph to `skill-sources/aios-workflow-router/SKILL.md` under Routing Rules:

```markdown
### Ponytail Minimal-Implementation Gate

When a routed task could add code, files, dependencies, abstractions, or automation, invoke `aios-ponytail-gate` after the required superpowers process skill and before implementation. This gate chooses the smallest correct solution; it does not replace brainstorming, writing-plans, TDD, CRG, pre-edit-safety-gate, security-scan, or verification-loop.
```

Add this paragraph to `skill-sources/pre-edit-safety-gate/SKILL.md` under Code Reuse Rules:

```markdown
- Invoke `aios-ponytail-gate` before deciding to add a new file, helper, dependency, abstraction, or generated artifact. Record `ponytail:rung=<n>` in the active plan or commit notes.
```

Add one sentence to `search-first`, `verification-loop`, and `aios-interception-runtime`:

```markdown
For token or workflow changes, use `aios-ponytail-gate` to reject duplicate layers and preserve only evidence-backed compression behavior.
```

- [ ] **Step 6: Verify focused tests and commit canonical skill sources only**

Run: `node --test scripts/tests/ponytail-gate.test.mjs scripts/tests/skills-frontmatter.test.mjs scripts/tests/skills-source-tree.test.mjs`

Expected: PASS; no edits under `.codex/skills`, `.claude/skills`, `.gemini/skills`, `.opencode/skills`, `.hermes/skills`, `.grok/skills`, or `.agents/skills`.

```bash
git add skill-sources/aios-ponytail-gate/SKILL.md skill-sources/aios-ponytail-gate/UPSTREAM.md skill-sources/aios-workflow-router/SKILL.md skill-sources/pre-edit-safety-gate/SKILL.md skill-sources/search-first/SKILL.md skill-sources/verification-loop/SKILL.md skill-sources/aios-interception-runtime/SKILL.md scripts/tests/ponytail-gate.test.mjs package.json
git commit -m "feat(skills): add AIOS Ponytail gate"
```

### Task 13: Sync skills, train the Ponytail Gate and require rollout evidence

**Files:**
- Modify generated skill roots through `node scripts/aios.mjs plan project-skills --force`
- Create: `.skillopt/aios-ponytail-gate-2026-07-10/state.json`
- Modify: `docs/reports/2026-07-10-headroom-live-smoke.md`
- Modify: `scripts/tests/ponytail-gate.test.mjs`

**Interfaces:**
- Consumes: Task 12 canonical skill, AIOS skill projection, SkillOpt state format, and agent live-readiness gate.
- Produces: synced client skills, accepted non-regression SkillOpt evidence, and agent smoke evidence before the new skill participates in live workflows.

- [ ] **Step 1: Add failing evidence tests**

```js
test('Ponytail gate has accepted non-regression SkillOpt evidence', async () => {
  const raw = await read('.skillopt/aios-ponytail-gate-2026-07-10/state.json');
  const state = JSON.parse(raw);
  assert.ok(['accepted', 'pass', 'passed', 'verified'].includes(state.status));
  assert.equal(state.nonRegression === true || state.non_regression === true, true);
  assert.equal(state.skill, 'aios-ponytail-gate');
});
```

- [ ] **Step 2: Run the evidence test and confirm the state file is missing**

Run: `node --test scripts/tests/ponytail-gate.test.mjs`

Expected: FAIL with `ENOENT` for `.skillopt/aios-ponytail-gate-2026-07-10/state.json`.

- [ ] **Step 3: Sync canonical skill sources into client roots**

Run: `node scripts/aios.mjs plan project-skills --force`

Expected: generated roots contain `aios-ponytail-gate` for supported clients. If a client root is intentionally unsupported by the syncer, record that exact client in `docs/reports/2026-07-10-headroom-live-smoke.md` under `Skill rollout limitations`.

- [ ] **Step 4: Run RED and GREEN SkillOpt cycles and persist accepted state**

Run:

```bash
node scripts/aios.mjs skill comply skill-sources/aios-ponytail-gate/SKILL.md --client codex --dry-run --json
node scripts/aios.mjs skill comply skill-sources/aios-ponytail-gate/SKILL.md --client codex --live --json
```

Create `.skillopt/aios-ponytail-gate-2026-07-10/state.json` only from the accepted run output:

```json
{
  "skill": "aios-ponytail-gate",
  "status": "accepted",
  "nonRegression": true,
  "client": "codex",
  "date": "2026-07-10",
  "evidence": [
    "node scripts/aios.mjs skill comply skill-sources/aios-ponytail-gate/SKILL.md --client codex --dry-run --json",
    "node scripts/aios.mjs skill comply skill-sources/aios-ponytail-gate/SKILL.md --client codex --live --json"
  ]
}
```

Do not fabricate this file. If live compliance fails, keep Task 13 open and record the failing command output in the report.

- [ ] **Step 5: Run agent readiness smoke**

Run: `node scripts/aios.mjs agents doctor --strict --json`

Expected: PASS for clients promoted to live workflow participation. Any `pending-smoke` client remains static-projection-only and must be listed as not live-enabled for Ponytail routing.

- [ ] **Step 6: Verify sync and evidence**

Run: `node --test scripts/tests/ponytail-gate.test.mjs scripts/tests/skills-sync.test.mjs scripts/tests/agents-sync.test.mjs && node scripts/aios.mjs skill health --json`

Expected: PASS; health output includes `aios-ponytail-gate` or reports no observations without failing.

```bash
git add .skillopt/aios-ponytail-gate-2026-07-10/state.json docs/reports/2026-07-10-headroom-live-smoke.md scripts/tests/ponytail-gate.test.mjs
git add .codex/skills .claude/skills .gemini/skills .opencode/skills .hermes/skills .grok/skills .agents/skills
git commit -m "test(skills): verify Ponytail gate rollout"
```

### Task 14: Update user docs and blog for the token intelligence stack

**Files:**
- Modify: `README.md`
- Modify: `README-zh.md`
- Modify: `docs-site/token-compression.md`
- Modify: `docs-site/zh/token-compression.md`
- Modify: `docs-site/ja/token-compression.md`
- Modify: `docs-site/ko/token-compression.md`
- Create: `blog-site/2026-07-headroom-ponytail-token-intelligence.md`
- Create: `blog-site/zh/2026-07-headroom-ponytail-token-intelligence.md`
- Modify: `blog-site/index.md`
- Modify: `blog-site/zh/index.md`
- Modify: `mkdocs.blog.yml`
- Create: `scripts/tests/headroom-docs.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: implemented commands and evidence from Tasks 1-13.
- Produces: public docs that distinguish RTK, Caveman, Headroom wrap, Headroom MCP-only, Ponytail Gate, ContextDB, privacy, uninstall/recovery, and truthful savings metrics.

- [ ] **Step 1: Write failing docs assertions**

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return readFile(path, 'utf8');
}

test('token docs explain install, wrap, MCP-only and truthful savings', async () => {
  for (const path of ['README.md', 'README-zh.md', 'docs-site/token-compression.md', 'docs-site/zh/token-compression.md', 'docs-site/ja/token-compression.md', 'docs-site/ko/token-compression.md']) {
    const text = await read(path);
    assert.match(text, /Headroom/u, path);
    assert.match(text, /RTK/u, path);
    assert.match(text, /Caveman/u, path);
    assert.match(text, /Ponytail/u, path);
    assert.match(text, /headroom_stats/u, path);
    assert.match(text, /compressions > 0/u, path);
    assert.match(text, /total_tokens_saved > 0/u, path);
  }
});

test('blog index links the Headroom and Ponytail article in English and Chinese', async () => {
  assert.match(await read('blog-site/index.md'), /2026-07-headroom-ponytail-token-intelligence/u);
  assert.match(await read('blog-site/zh/index.md'), /2026-07-headroom-ponytail-token-intelligence/u);
  assert.match(await read('mkdocs.blog.yml'), /2026-07-headroom-ponytail-token-intelligence.md/u);
});
```

- [ ] **Step 2: Run docs tests and confirm the pages are stale or missing**

Run: `node --test scripts/tests/headroom-docs.test.mjs`

Expected: FAIL on missing article and missing Headroom/Ponytail copy.

- [ ] **Step 3: Update README and token-compression docs**

Use this exact public contract in every locale, translated where appropriate:

```markdown
AIOS now uses a five-layer token intelligence stack:

1. Ponytail Gate chooses the smallest correct solution before code is written.
2. RTK compresses shell and tool output locally.
3. Headroom provides official wrapper compression for Codex, Claude and OpenCode.
4. Headroom MCP provides explicit on-demand compression for Gemini, Hermes and Grok.
5. Caveman keeps agent replies compact without removing technical facts.

Install with:

```bash
node scripts/aios.mjs init --all --yes-compression-tools
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
```

Wrapper clients use `headroom wrap` at launch time. MCP-only clients do not transparently intercept model input; they expose `headroom_compress`, `headroom_retrieve`, and `headroom_stats` for explicit use. Claim local savings only when `headroom_stats` reports both `compressions > 0` and `total_tokens_saved > 0`.

Recovery:

```bash
headroom unwrap codex
headroom unwrap claude
headroom unwrap opencode
gemini mcp remove --scope user headroom
hermes mcp remove headroom
grok mcp remove --scope user headroom
```
```

Do not state that Gemini, Hermes or Grok receive automatic transparent Headroom compression. Do not describe upstream benchmark numbers as local AIOS measurements.

- [ ] **Step 4: Add English and Chinese blog posts**

English frontmatter:

```markdown
---
title: Headroom + Ponytail: Token Intelligence for AIOS
date: 2026-07-10
description: How AIOS combines Ponytail, RTK, Caveman, Headroom wrappers, Headroom MCP and ContextDB without duplicating compression data planes.
tags: [release, token-compression, headroom, ponytail]
---
```

Chinese frontmatter:

```markdown
---
title: Headroom + Ponytail：AIOS 的 Token 智能工作流
date: 2026-07-10
description: AIOS 如何组合 Ponytail、RTK、Caveman、Headroom wrapper、Headroom MCP 与 ContextDB，同时避免重复实现压缩数据面。
tags: [release, token-compression, headroom, ponytail]
---
```

Both posts must include sections named `Why this is not another proxy`, `Wrapper versus MCP-only`, `Ponytail before code`, `Privacy and recovery`, and `How we measure savings`.

- [ ] **Step 5: Wire blog navigation and run site checks**

Update `blog-site/index.md`, `blog-site/zh/index.md`, and `mkdocs.blog.yml` with the new article paths.

Run: `node --test scripts/tests/headroom-docs.test.mjs scripts/tests/check-site-sync.test.mjs && npm run check:site-sync`

Expected: PASS; no broken blog links or locale drift introduced.

- [ ] **Step 6: Commit docs and blog**

```bash
git add README.md README-zh.md docs-site/token-compression.md docs-site/zh/token-compression.md docs-site/ja/token-compression.md docs-site/ko/token-compression.md blog-site/2026-07-headroom-ponytail-token-intelligence.md blog-site/zh/2026-07-headroom-ponytail-token-intelligence.md blog-site/index.md blog-site/zh/index.md mkdocs.blog.yml scripts/tests/headroom-docs.test.mjs package.json
git commit -m "docs: explain Headroom and Ponytail token workflow"
```

### Task 15: Bump release metadata and run final verification

**Files:**
- Modify: `VERSION`
- Modify: `CHANGELOG.md`
- Modify: `docs-site/changelog.md`
- Modify: `docs-site/zh/changelog.md`
- Modify: `docs-site/ja/changelog.md`
- Modify: `docs-site/ko/changelog.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: completed feature, docs, smoke, SkillOpt and agent readiness evidence.
- Produces: `3.6.0` release metadata and final verification commands for a backward-compatible minor feature release.

- [ ] **Step 1: Write failing release assertions**

Add to `scripts/tests/headroom-docs.test.mjs`:

```js
test('release metadata names 3.6.0 Headroom and Ponytail feature', async () => {
  assert.equal((await read('VERSION')).trim(), '3.6.0');
  for (const path of ['CHANGELOG.md', 'docs-site/changelog.md', 'docs-site/zh/changelog.md', 'docs-site/ja/changelog.md', 'docs-site/ko/changelog.md']) {
    const text = await read(path);
    assert.match(text, /3\.6\.0/u, path);
    assert.match(text, /Headroom/u, path);
    assert.match(text, /Ponytail/u, path);
  }
});
```

- [ ] **Step 2: Run release assertion and confirm current metadata is still 3.5.0**

Run: `node --test scripts/tests/headroom-docs.test.mjs`

Expected: FAIL because `VERSION` is not `3.6.0` or changelog entries are missing.

- [ ] **Step 3: Update root changelog and version**

Set `VERSION` to:

```text
3.6.0
```

Add this section at the top of `CHANGELOG.md`:

```markdown
## [3.6.0] - 2026-07-10

### Added

- Added the Headroom token intelligence stack: isolated Headroom install through `aios init`, official wrapper launch plans for Codex/Claude/OpenCode, and official MCP registration for Gemini/Hermes/Grok.
- Added AIOS Ponytail Gate to reduce unnecessary code, dependencies, abstractions and token-heavy workflow output before implementation begins.
- Added live-smoke and SkillOpt evidence gates before Headroom/Ponytail features are promoted into live workflows.

### Changed

- Updated token-compression docs to distinguish RTK, Caveman, Headroom wrapper compression, MCP-only explicit compression and ContextDB recall.
- Updated client capability reporting to show Headroom MCP integration status separately from whole-client live readiness.

### Security

- Headroom MCP registration is fail-closed for conflicts, disables `HEADROOM_MCP_READ` by default, and only removes AIOS-owned entries with matching fingerprints.
```

- [ ] **Step 4: Update localized website changelogs**

Add equivalent `3.6.0` sections to:

```text
docs-site/changelog.md
docs-site/zh/changelog.md
docs-site/ja/changelog.md
docs-site/ko/changelog.md
```

Each localized entry must include `Headroom`, `Ponytail`, `RTK`, `Caveman`, `AIOS_HEADROOM`, `AIOS_HEADROOM_MCP`, `headroom_stats`, and the date `2026-07-10`.

- [ ] **Step 5: Run focused release verification**

Run:

```bash
node --test scripts/tests/headroom-docs.test.mjs scripts/tests/ponytail-gate.test.mjs scripts/tests/headroom-install.test.mjs scripts/tests/headroom-mcp-config.test.mjs scripts/tests/headroom-mcp-registration.test.mjs scripts/tests/headroom-mcp-smoke.test.mjs scripts/tests/headroom-launch-plan.test.mjs scripts/tests/headroom-live-smoke.test.mjs
node scripts/aios.mjs agents doctor --strict --json
npm run check:site-sync
```

Expected: PASS. If `agents doctor --strict --json` reports `pending-smoke`, do not mark the affected client live-enabled in docs or capability defaults.

- [ ] **Step 6: Run the full repo script suite**

Run: `npm run test:scripts`

Expected: PASS. If unrelated dirty-worktree changes fail tests, record the exact failing command, failing test names, and whether the failure reproduces before staging this feature.

- [ ] **Step 7: Commit release metadata**

```bash
git add VERSION CHANGELOG.md docs-site/changelog.md docs-site/zh/changelog.md docs-site/ja/changelog.md docs-site/ko/changelog.md scripts/tests/headroom-docs.test.mjs package.json
git commit -m "chore(release): prepare 3.6.0 token intelligence stack"
```
