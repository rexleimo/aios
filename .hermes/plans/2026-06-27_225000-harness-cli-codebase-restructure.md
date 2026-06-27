# harness-cli 代码仓库结构化重构计划

> **执行方式**：按子任务顺序执行，每个子任务独立验证后提交

**目标**：将现有的 `scripts/lib/` 单层命名空间重构为按职责分层、单向依赖、封装合理的 `src/` 架构

**现状**：
- 66K+ 行代码、689 个模块、34 个直接子域，全堆在 `scripts/lib/` 下
- 顶层 `scripts/*.mjs` 入口文件 26 个，混合入口+工具职责
- 关键域（`harness` 11.5K 行、`lifecycle` 9.3K 行、`cli` 5.2K 行）用 barrel index 但没有架构分层
- 公共工具函数（`normalizeText` 出现 14 次、`computeHash` 出现 8 次、`clone` 出现 6 次）在各模块重复定义
- 当前 cross-domain 引用没有强制约束，形成网状依赖
- mcp-server 用 TypeScript，scripts 用 ESM JavaScript，技术栈不统一

**目标架构**：

```
src/
├── entries/              # 入口层 — 替换 scripts/*.mjs，薄壳，只做参数解析+dispatch
│   ├── aios.mjs
│   ├── sync-native.mjs
│   ├── rl-shell-v1.mjs
│   └── ...
├── core/                 # 核心层 — 被所有层依赖，不依赖任何业务层
│   ├── index.mjs         # barrel — 导出所有 core 工具
│   ├── paths.mjs         # 路径解析（原 scripts/lib/aios/ + scripts/lib/platform/paths）
│   ├── registry.mjs      # 客户端注册表（原 scripts/lib/clients/registry）
│   ├── atomic-write.mjs  # 原子写入（原 scripts/lib/fs/atomic-write）
│   ├── repo-lock.mjs     # 仓库锁（原 scripts/lib/fs/repo-lock）
│   └── normalize.mjs     # 统一 normalizeText / toPosixPath / clone / computeHash 等
├── services/             # 服务层 — 业务编排，依赖 core
│   ├── skills/           # 技能同步/安装/workshop
│   ├── agents/           # Agent 同步/发射器
│   ├── clients/          # Client 运行时管理
│   ├── native/           # Native 增强
│   ├── interception/     # 拦截压缩
│   └── contextdb/        # 上下文数据库
├── adapters/             # 适配层 — 对接外部系统，依赖 core + services
│   ├── platform/         # 平台适配（mac/linux/windows 差异）
│   ├── opencode/         # OpenCode Plugin
│   ├── shell/            # Shell MCP
│   └── codemap/          # CodeMap MCP
├── harness/              # Harness 运行层 — 隔离的复杂域
│   ├── core/             # Harness 基础类型
│   ├── solo/             # Solo runtime
│   ├── groupchat/        # Groupchat runtime
│   └── orchestrator/     # 编排器
├── rl/                   # RL 域 — 隔离的复杂域
│   ├── core/             # RL 公共（schema, trainer, checkpoint）
│   ├── browser-v1/
│   ├── shell-v1/
│   ├── orchestrator-v1/
│   └── mixed-v1/
├── cli/                  # CLI 层 — 参数解析 + dispatch
│   ├── parse-args/       # 参数解析
│   ├── dispatch/         # 调度
│   └── help/             # 帮助系统
├── hud/                  # HUD 层 — 独立的 UI 域
├── memo/                 # 记忆系统
├── model-router/         # 模型路由
├── search/               # 搜索
├── perception/           # 感知
├── offload/              # 卸荷
├── doctor/               # 诊断
├── skills/               # Skill 系统
└── shared/               # 跨域共享工具（只被 core 或 services 引用）
    └── normalize.mjs     # 统一公共函数
```

**单向依赖链**：
```
entries → cli → services → core
harness → core, services
rl → core
adapters → core, services
hud → core
```

---

## Phase 1：基础设施加固（高价值-低风险）

### Task 1.1：建立 `src/` 目录骨架 + 创建 `shared/` 统一工具

**Objective**：创建目标目录结构，提取 3 个高频重复函数到 `src/shared/normalize.mjs`

**Files**：
- Create: `src/shared/normalize.mjs` — 合并 normalizeText / computeHash / clone
- Modify: `scripts/lib/` 下 15 个文件去掉内联的 normalizeText 实现

**Step 1：提取 shared/normalize.mjs**

```js
// src/shared/normalize.mjs — 统一文本/哈希/克隆工具函数

/** 统一文本归一化：null/undefined → fallback，trim */
export function normalizeText(value, fallback = '') {
  if (value == null) return fallback
  const s = String(value).trim()
  return s || fallback
}

/** 快速哈希（非加密） */
export function computeHash(value) {
  let hash = 0
  const s = String(value)
  for (let i = 0; i < s.length; i++) {
    const chr = s.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

/** 深拷贝纯对象/数组 */
export function clone(value) {
  if (value == null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value))
}
```

**Step 2：替换 15 个文件的内联实现**

在以下文件中删除内联定义，改为 `import { normalizeText, computeHash, clone } from '../../shared/normalize.mjs'`：

| 文件 | 重复定义 |
|---|---|
| `scripts/lib/native/emitters/shared.mjs` | normalizeText |
| `scripts/lib/native/sync/fs-ops.mjs` | normalizeText |
| `scripts/lib/rl-orchestrator-v1/decision-runner/shared.mjs` | normalizeText + computeHash |
| `scripts/lib/lifecycle/entropy-gc/shared.mjs` | normalizeText |
| `scripts/lib/lifecycle/release-status/shared.mjs` | normalizeText |
| `scripts/lib/lifecycle/team-ops/shared.mjs` | normalizeText |
| `scripts/lib/lifecycle/preflight-contracts.mjs` | normalizeText |
| `scripts/lib/lifecycle/harness/shared.mjs` | normalizeText |
| `scripts/lib/lifecycle/watchdog/shared.mjs` | normalizeText |
| `scripts/lib/lifecycle/hud.mjs` | normalizeText |
| `scripts/lib/lifecycle/snapshot-rollback/shared.mjs` | normalizeText |
| `scripts/lib/harness/groupchat-runtime/shared.mjs` | normalizeText |
| `scripts/lib/rl-mixed-v1/shared.mjs` | computeHash + clone |
| `scripts/lib/rl-core/trainer/core.mjs` | computeHash + clone |
| `scripts/lib/rl-shell-v1/run-orchestrator/helpers.mjs` | clone |
| `scripts/lib/agents/emitters/opencode.mjs` | normalizeText |
| `scripts/lib/agents/emitters/codex.mjs` | normalizeText |
| `scripts/lib/agents/emitters/crush.mjs` | normalizeText |
| `scripts/lib/rl-shell-v1/eval-harness.mjs` | clone + computeHash |
| `scripts/lib/rl-shell-v1/task-registry.mjs` | computeHash |
| `scripts/lib/rl-browser-v1/browser-runner.mjs` | computeHash |
| `scripts/lib/rl-browser-v1/task-registry.mjs` | computeHash |
| `scripts/lib/model-router/shared.mjs` | clonePlain |

**验证**：
```bash
# 确认 normalizeText 只剩 shared 文件中的定义
grep -rn "function normalizeText" scripts/lib/ --include='*.mjs' | grep -v node_modules
# 预期：只剩 scripts/lib/shared/normalize.mjs
```

**Commit message**：`refactor: extract normalizeText/computeHash/clone to shared/normalize.mjs`

---

### Task 1.2：拆分 `scripts/lib/skills/sync.mjs`（481 行）

**Objective**：将 481 行的 skill 同步模块拆成 3 个 < 200 行的子模块

**Files**：
- Create: `scripts/lib/skills/sync/check.mjs` — checkGeneratedSkillsSync 逻辑
- Create: `scripts/lib/skills/sync/run.mjs` — syncGeneratedSkills 逻辑
- Modify: `scripts/lib/skills/sync.mjs` → 收缩为 barrel index，只 re-export

**拆法**：

`sync.mjs` 导出 2 个函数：`syncGeneratedSkills`（行 352）和 `checkGeneratedSkillsSync`（行 369）。约 200 行辅助函数（`collectManagedGeneratedTargets`、`resolveTomlFormat`、`resolveClientTargets` 等）在两个函数之间共享。

方案：拆成 `sync/targets.mjs`（目标收集）+ `sync/check.mjs`（检查）+ `sync/run.mjs`（执行）

**验证**：
```bash
node -e "import('./scripts/lib/skills/sync.mjs').then(m => { console.log('OK:', Object.keys(m)) })"
# 预期：['syncGeneratedSkills', 'checkGeneratedSkillsSync']
```

**Commit message**：`refactor(skills): split 481-line sync.mjs into 3 sub-modules`

---

### Task 1.3：拆分 `scripts/lib/clients/capability-report.mjs`（447 行）

**Objective**：将 447 行的 capability report 拆成 2 个子模块

**Files**：
- Create: `scripts/lib/clients/capability-report/builder.mjs`
- Create: `scripts/lib/clients/capability-report/formatter.mjs`
- Modify: `scripts/lib/clients/capability-report.mjs` → barrel index

**拆法**：`buildClientCapabilityReport`（行 358）内部有明显的两阶段：先 build 结构化数据（~200 行），再 format 输出（~200 行）。头部的 constants + helpers 约 150 行。

---

### Task 1.4：拆分 `scripts/lib/cli/dispatch.mjs`（425 行）

**Objective**：将 dispatch 模块拆成 dispatch 策略 + dispatch 执行

**Files**：
- Create: `scripts/lib/cli/dispatch/policy.mjs` — dispatch 策略选择
- Create: `scripts/lib/cli/dispatch/execute.mjs` — dispatch 执行
- Modify: `scripts/lib/cli/dispatch.mjs` → barrel

---

### Task 1.5：拆分 `scripts/lib/workflows/recipes.mjs`（381 行）

**Objective**：将 recipe 列表 + recipe 渲染拆开

**Files**：
- Create: `scripts/lib/workflows/recipes/definitions.mjs` — recipe 数据定义
- Create: `scripts/lib/workflows/recipes/render.mjs` — recipe 渲染
- Modify: `scripts/lib/workflows/recipes.mjs` → barrel

---

## Phase 2：目录结构重组（中投入-高价值）

### Task 2.1：创建 `src/` 顶层结构，建立 barrel index

**Objective**：创建完整的 `src/` 目录骨架，所有域创建 barrel index，外部引用只通过 barrel 走

**Files**：
- Create: `src/core/`, `src/services/`, `src/adapters/`, `src/harness/`, `src/rl/`, `src/cli/`, `src/entries/`, `src/hud/`, `src/memo/`, `src/shared/`
- each with `index.mjs` barrel
- Maintain backward compat: `scripts/lib/` 内的 barrel index re-export 新的 `src/` 路径

**关键决策**：第一阶段保持 `scripts/lib/` 作为向后兼容的 barrel（`export * from '../../src/xxx.mjs'`），等所有入口确认不中断后再删除旧 barrel。

**验证**：
```bash
node scripts/aios.mjs --help  # 确认命令链不中断
node scripts/sync-native.mjs --dry-run
```

**Commit message**：`refactor: scaffold src/ layer with barrel index, maintain backward compat`

---

### Task 2.2：`scripts/lib/shared/` → `src/shared/`（最小迁移）

**Objective**：把 Task 1.1 创建的 shared 目录搬到 src 层，更新所有引用

**Files**：
- Move: `scripts/lib/shared/normalize.mjs` → `src/shared/normalize.mjs`
- Update: Task 1.1 中修改过的 15 个文件的 import 路径

---

### Task 2.3：`scripts/lib/aios/` + `scripts/lib/platform/` → `src/core/`

**Objective**：将基础设施级模块收拢到 core 层

**Files**：
- Move:
  - `scripts/lib/aios/state-root.mjs` → `src/core/state-root.mjs`
  - `scripts/lib/platform/paths.mjs` → `src/core/paths.mjs`
  - `scripts/lib/platform/process.mjs` → `src/core/process.mjs`
  - `scripts/lib/platform/fs.mjs` → `src/core/fs.mjs`
  - `scripts/lib/fs/atomic-write.mjs` → `src/core/atomic-write.mjs`
  - `scripts/lib/fs/repo-lock.mjs` → `src/core/repo-lock.mjs`
  - `scripts/lib/clients/registry.mjs` → `src/core/registry.mjs`
  - `scripts/lib/clients/core/definitions.mjs` → `src/core/definitions.mjs`
- Create: `src/core/index.mjs` — barrel
- Update: 所有引用这些文件的 import 路径

---

### Task 2.4：`scripts/lib/skills/` → `src/services/skills/`

**Objective**：技能相关服务重组

**Files**：
- Move: `scripts/lib/skills/{sync,install,source-tree,catalog,doctor,constants,normalizers,path-utils,safety,uninstall,install-metadata,install-policy,frontmatter,directory-snapshot,skill-workshop,emitters/}.mjs` → `src/services/skills/`
- Create: `src/services/skills/index.mjs` — barrel
- Update: 所有引用

---

### Task 2.5：`scripts/lib/harness/` → `src/harness/`

**Objective**：Harness 域——最大域（11.5K 行），保持内部结构但移到 src

**Files**：
- Move `scripts/lib/harness/` → `src/harness/`（保持内部子目录结构）
- Create: `src/harness/index.mjs` — 只导出公共 API
- Update: 所有引用

注意：harness 的内部引用本来就多，这次只做物理移动+更新 import，不改变内部结构。后续再考虑更细的拆分。

---

### Task 2.6：`scripts/lib/cli/` → `src/cli/`

**Objective**：CLI 层重组——parse-args、dispatch、help 各自子目录

**Files**：
- Move `scripts/lib/cli/` → `src/cli/`（保持子目录结构）
- Create: `src/cli/index.mjs` — barrel

---

### Task 2.7：`scripts/lib/rl-*/` → `src/rl/`

**Objective**：5 个 RL 域合并到一个 `src/rl/` 命名空间

**Files**：
- Create: `src/rl/`
- Move:
  - `scripts/lib/rl-core/` → `src/rl/core/`
  - `scripts/lib/rl-browser-v1/` → `src/rl/browser-v1/`
  - `scripts/lib/rl-shell-v1/` → `src/rl/shell-v1/`
  - `scripts/lib/rl-orchestrator-v1/` → `src/rl/orchestrator-v1/`
  - `scripts/lib/rl-mixed-v1/` → `src/rl/mixed-v1/`
- Create: `src/rl/index.mjs` — 只导出公共类型/接口

---

## Phase 3：入口层瘦身（可选，低风险）

### Task 3.1：`scripts/*.mjs` 入口缩减为薄壳

**Objective**：将 26 个入口文件中的逻辑迁移到 `src/entries/`，入口只做 `import + dispatch`

**Files**：
- Create: `src/entries/` 每个入口对应的文件
- Update: `scripts/aios.mjs` 等 → 变成 `import { run } from '../src/entries/aios.mjs'; run(process.argv)`

**验证**：
```bash
# 所有入口命令正常
node scripts/aios.mjs status
node scripts/check-native-sync.mjs
node scripts/rl-shell-v1.mjs --help
```

---

## 总工作量估算

| Phase | 子任务数 | 文件变更数 | 估算工时 | 风险 |
|-------|----------|-----------|----------|------|
| Phase 1 | 5 | ~40 | 2-3h | 低 — 纯新增+替换，不改变运行时 |
| Phase 2 | 7 | ~200+ | 4-6h | 中 — 需验证所有入口不中断 |
| Phase 3 | 1 | ~30 | 1h | 低 — 纯入口层 |

**总计**：13 个任务，~270+ 文件变更，约 7-10 小时

## 风险与注意事项

1. **不要停服**：每个 commit 后
   `node scripts/aios.mjs --help` 和 `node -e "import('./scripts/aios.mjs')"` 必须正常运行
2. **mcp-server 的 TypeScript** 不受影响——它原本就在 `mcp-server/` 目录下独立构建，import 的是 `scripts/` 路径不涉及这次重构
3. **技能模板**（`scripts/lib/skills/emitters/toml-command.mjs`）中生成的文件路径不要因重构而改变——外部消费方依赖固定路径
4. **后向兼容 barrel**：Phase 2 中必须保留旧路径 barrel 直到所有入口确认不依赖旧路径

## 验收标准

- [ ] Phase 1：`normalizeText` / `computeHash` / `clone` 不再有重复定义
- [ ] Phase 1：5 个大文件全部拆成 ≤250 行
- [ ] Phase 2：`src/` 目录完整，旧 `scripts/lib/` 文件全部替换为 barrel index
- [ ] Phase 2：`node scripts/aios.mjs --help` 正常输出
- [ ] Phase 2：`node scripts/sync-native.mjs --dry-run` 正常输出
- [ ] Phase 2：`npm run typecheck`（mcp-server 部分）不中断
- [ ] Phase 2：每个 `scripts/*.mjs` 入口文件正常启动
