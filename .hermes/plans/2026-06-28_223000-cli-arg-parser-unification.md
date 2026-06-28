# CLI 参数解析统一重构实施计划

> **针对 Hermes 代理：** 使用 subagent-driven-development skill 按任务逐一分派执行，每任务独立验证。

**目标：** 消除项目中所有手写 `parseArgs` 循环，统一迁移至 Commander 声明式解析。

**架构：** 分为两层迁移：
1. **核心 CLI**（`scripts/lib/cli/parse-args/*`） — Commander 壳已存在，但 `parseArgs()` 绕过了 Commander；改为直接利用 Commander 的 `.option()` 声明式自动解析
2. **独立脚本**（`scripts/*.mjs` + `scripts/lib/*/args.mjs`） — 11 处手写 parseArgs 统一用一个公共 `createCliParser` 模块

**技术栈：** Node.js ESM + Commander ^14.0.3（已安装）

---
## 当前状态盘点

### 核心 CLI 层（scripts/lib/cli/）

| 文件 | 行数 | 内容 |
|------|------|------|
| `parse-args.mjs` | 339 | 主入口，13个子命令分发 |
| `parse-args/shared.mjs` | 215 | 共用工具函数 |
| `parse-args/interception.mjs` | 83 | interception 子命令 |
| `parse-args/harness.mjs` | 242 | harness 子命令 |
| `parse-args/skill.mjs` | ~50 | skill 子命令 |
| `parse-args/session.mjs` | ~40 | session 子命令 |
| `parse-args/search.mjs` | ~50 | search 子命令 |
| `parse-args/top-level.mjs` | 54 | 顶层命令路由器 |
| `parse-args/*.mjs` 其他 | ~10个 | 各子命令各自的解析器 |
| **合计** | **~1500** | |

Commander 壳（`commander/` 目录）已注册了 help/version，但 `action` 里又把 argv 传给手写 parseArgs，完全绕过了 Commander 的 `.option()` 解析。

### 独立脚本层（11 处）

| # | 脚本 | 行数 | 解析器特点 |
|---|------|------|-----------|
| 1 | `scripts/privacy-guard.mjs` | 114 | `parseOptions` + 手动 switch command |
| 2 | `scripts/rl-shell-v1.mjs` | 267 | `parseArgs` + 手动 switch command |
| 3 | `scripts/rl-mixed-v1.mjs` | 101 | `parseArgs` + 手动 help+subcommand |
| 4 | `scripts/doctor-bootstrap-task.mjs` | 91 | `parseArgs` switch-case |
| 5 | `scripts/check-native-sync.mjs` | 65 | `parseArgs` for+if |
| 6 | `scripts/check-skills-sync.mjs` | 56 | `parseArgs` for+if |
| 7 | `scripts/perf-orchestrate-learn-eval-smoke.mjs` | 217 | `parseArgs` for+if |
| 8 | `scripts/perf-team-status-watch-smoke.mjs` | 248 | `parseArgs` for+if |
| 9 | `scripts/generate-rl-shell-v1-benchmark.mjs` | 30 | `parseArgs` for+if |
| 10 | `scripts/lib/ctx-agent-core/args.mjs` | 115 | `parseArgs` switch-case |
| 11 | `scripts/lib/doctor/security-config/args.mjs` | 43 | `parseArgs` for+if |

---

### 任务 1：创建公共 `createCliParser` 模块

**目的：** 为独立脚本提供一个统一、声明式的参数解析工厂，消除 11 处手写 parseArgs。

**文件：**
- 创建: `src/shared/cli-parser.mjs`

**接口设计：**

```js
// src/shared/cli-parser.mjs
import { Command } from 'commander';

/**
 * 创建轻量 CLI 解析器，返回已解析的 options 对象。
 * 提供 commander 声明式 .option()，但无需 program.parse()，
 * 直接从 argv 中提取当前命令的 options。
 */
export function createCliParser({ name, description, version, subcommands, options, helpText }) {
  // 返回 { parse(argv): { command, flags, help } }
}
```

关键设计：Commander 的 `.parse()` 有副作用（从 process.argv 直接读），所以这里用 Commander 的 `Command` 实例但手动调用 `.parse(argv, { from: 'user' })`，并捕获 parsed options + args。

**验证：**
- 单元测试: `tests/shared/cli-parser.test.mjs`
- 覆盖：支持 `--flag value`、`--flag=value`、`--no-flag`、`-h`、`-V`
- 覆盖：支持子命令（positional subcommand）

---

### 任务 2：迁移 `privacy-guard.mjs`

**文件：**
- 修改: `scripts/privacy-guard.mjs`

**步骤：**

1. 导入 `createCliParser`
2. 声明子命令：`init | status | set | read | redact`
3. 用 Commander 声明 options（`--mode`, `--file`, `--path`, `--enabled`, `--model`, `--endpoint`, `--timeout-ms` 等）
4. 移除 `function usage()` 和 `function parseOptions(argv)`
5. Commander 自动生成 help 文本

**验证：**
```bash
node scripts/privacy-guard.mjs --help
node scripts/privacy-guard.mjs status
node scripts/privacy-guard.mjs read --file some-file.txt
```

---

### 任务 3：迁移 `rl-shell-v1.mjs`

**文件：**
- 修改: `scripts/rl-shell-v1.mjs`

**步骤：**

1. 声明子命令：`train | campaign | eval | phase3-train`
2. 声明 options：`--config`, `--seed`, `--teacher`, `--phase`, `--dry-run`, `--max-tasks`, `--initial-checkpoint`
3. 移除 `function parseArgs(argv)` 和 `printHelp()`
4. Commander 自动排序 help

**验证：**
```bash
node scripts/rl-shell-v1.mjs --help
node scripts/rl-shell-v1.mjs phase3-train --dry-run --config experiments/rl-shell-v1/configs/benchmark-v1.json
```

---

### 任务 4：迁移 `rl-mixed-v1.mjs`

**文件：**
- 修改: `scripts/rl-mixed-v1.mjs`

**步骤：**

1. 声明子命令：`browser-only | orchestrator-only | mixed | mixed-resume | mixed-eval`
2. options：`--dry-run`, `--window <n>`, `--json-output <path>`, `--batch-count <n>`, `--initial-checkpoint <id>`
3. 移除 `function parseArgs(argv)` 和 `printHelp()`

**验证：**
```bash
node scripts/rl-mixed-v1.mjs --help
node scripts/rl-mixed-v1.mjs browser-only --dry-run
node scripts/rl-mixed-v1.mjs mixed-eval --window 30 --json-output /tmp/test.json
```

---

### 任务 5：迁移 `doctor-bootstrap-task.mjs`

**文件：**
- 修改: `scripts/doctor-bootstrap-task.mjs`

**步骤：**

1. 声明 options：`--workspace <path>`, `-h/--help`
2. 移除 `function parseArgs(argv)` 和 `function usage()`
3. Commander 自动管理 help

**验证：**
```bash
node scripts/doctor-bootstrap-task.mjs --help
node scripts/doctor-bootstrap-task.mjs --workspace /tmp
```

---

### 任务 6：迁移 `check-native-sync.mjs` 和 `check-skills-sync.mjs`

两个脚本模式完全一致（同一个作者，同一个 `--materialize-temp` `--target-root`）。

**文件：**
- 修改: `scripts/check-native-sync.mjs`
- 修改: `scripts/check-skills-sync.mjs`

**每个脚本步骤：**

1. 声明 options：`--materialize-temp`, `--target-root <path>`, `-h/--help`
2. 移除本地 `function parseArgs(argv)`

**验证：**
```bash
node scripts/check-native-sync.mjs --help
node scripts/check-native-sync.mjs --materialize-temp
node scripts/check-skills-sync.mjs --help
node scripts/check-skills-sync.mjs --materialize-temp
```

---

### 任务 7：迁移 `perf-*` 两个性能测试脚本

**文件：**
- 修改: `scripts/perf-orchestrate-learn-eval-smoke.mjs`
- 修改: `scripts/perf-team-status-watch-smoke.mjs`

**每个脚本步骤：**

1. 声明 options：
   - `perf-orchestrate-learn-eval-smoke`: `--orchestrate-max-ms <n>`, `--learn-eval-max-ms <n>`, `--json-out <path>`
   - `perf-team-status-watch-smoke`: `--frames <n>`, `--max-p95-ms <n>`, `--max-avg-ms <n>`, `--json-out <path>`
2. 移除本地 `function parseArgs(argv)` 和 `parseNumber()`（Commander 有内置 `parseInt`）
3. 建议：Commander 的 `.argParser((value) => parseInt(value, 10))` 可以消除 `parseNumber`

**验证：**
```bash
node scripts/perf-orchestrate-learn-eval-smoke.mjs --help
node scripts/perf-team-status-watch-smoke.mjs --help
```

---

### 任务 8：迁移 `generate-rl-shell-v1-benchmark.mjs`

**文件：**
- 修改: `scripts/generate-rl-shell-v1-benchmark.mjs`

**步骤：**

1. 声明 options：`--config <path>`, `--seed <n>`, `-h/--help`
2. 移除 `function parseArgs(argv)`
3. 使用 Commander 的 `parseInt` 类型解析自动处理 seed

**验证：**
```bash
node scripts/generate-rl-shell-v1-benchmark.mjs --help
node scripts/generate-rl-shell-v1-benchmark.mjs --seed 42 --config my-config.json
```

---

### 任务 9：迁移 `scripts/lib/` 内部库的 args 模块

**文件：**
- 修改: `scripts/lib/ctx-agent-core/args.mjs`
- 修改: `scripts/lib/doctor/security-config/args.mjs`

注意：这些是库模块（export parseArgs 被其他模块 import），不适合直接使用 Commander。但可以把手写 switch-case 统一成 `createCliParser` 包装。

对于 `ctx-agent-core/args.mjs`（115 行，16 个 flag + subcommand + extraArgs 处理）：
- 这比较特殊，因为它还处理 `--` 后的 extraArgs
- 保留 `parseArgs` 函数签名不变（避免破坏 caller），但内部用 `createCliParser` 实现的子命令解析来简化
- 或者保留现有实现——因为它是库函数不暴露给用户直接调用

**验证：**
```bash
node -e "import { parseArgs } from './scripts/lib/ctx-agent-core/args.mjs'; console.log(parseArgs(['--agent', 'codex-cli', '--goal', 'test']))"
node -e "import { parseArgs } from './scripts/lib/doctor/security-config/args.mjs'; console.log(parseArgs(['--workspace', '/tmp', '--strict']))"
```

---

### 任务 10：核心 CLI parse-args 层——充分利用 Commander

**这是最大/影响最广的任务，应放在最后执行。**

**当前问题：**
- `commander/root-program.mjs` 注册了子命令的 helm 元信息
- 但每个子命令的 `action` handler 调用 `parseArgs()`，把 argv 传回手写解析器
- `parse-args.mjs` + 15 个子模块约 1500 行全是重复的 for+if+switch 模式

**方案选项（需要在 plan 阶段先讨论）：**

**选项 A：全面转入 Commander `program.parse()`（推荐）**
- 为每个子命令在 Commander spec 中声明所有 `.option()`（已经有一半了）
- 移除 `parse-args.mjs` 及其子模块
- `root-program.mjs` 的 action handler 直接读取 `command.opts()` + `command.args`
- 好处：最彻底的统一，Commander 完全接管类型校验、默认值、help 自动生成
- 风险：影响所有子命令（20+），需要逐一验证

**选项 B：混合模式**
- 保留 `parse-args.mjs` 的分发层，但让每个子命令的 options 声明走 Commander `spec.options`
- 在 Commander spec 中声明所有 `.option()`，但 action handler 继续用手写 parseArgs 做兼容
- 逐步迁移，每个 PR 迁移 1-2 个子命令

**选项 C：放弃 parse-args 层，每个命令独立 Commander**
- 不像当前一个 `createAiosProgram` 管理所有子命令
- 改为每个命令调用自己的 `new Command()` 实例
- 但 `scripts/aios.mjs` 的入口分发逻辑需要调整

**建议：** 采用选项 A，但分阶段实现，每个子命令一个 commit。

**核心 CLI 子命令清单：**
- setup | update | uninstall | doctor | status | agents | clients | quality-gate | orchestrate | workflow | team | hud | harness | interception | learn-eval | entropy-gc | snapshot-rollback | release-status | refs | canvas | search | skill | session | dream | init | memo | perception | model-router | internal

**验证策略：**
- 每个子命令至少测一次：`--help` + 无参数 + 完整参数
- 集成测试在 `scripts/tests/` 中验证 CLI 输出
- 用 `npm run test:scripts` 确保无回归

---

### 风险与未决问题

1. **`ctx-agent-core/args.mjs`** 的 `--` extraArgs 处理和 `usage()` 是 Commander `allowExcessArguments(true)` 不能满足的 case，需要特殊处理
2. **`perf-*` 脚本** 的 `parseNumber(process.env.FOO, fallback)` 模式——环境变量默认值需要保留，Commander 没有原生 env 支持，需要在 `createCliParser` 中加一个 `envFallback` 选项
3. **`parse-args.mjs`** 的 `expandEqualsOptions` 功能——Commander 原生 `Combined properties` 模式可以处理 `--foo=bar`，需要验证 `allowUnknownOption(true)` 下是否正常工作
4. **迁移顺序：** 独立脚本（低风险，非核心功能）应该先做，核心 CLI 最后做
5. **`--` 后参数**（extraArgs）需要 Commander 的 `allowExcessArguments(true)` + 手动捕获 `command.args` 或 rawArgs
