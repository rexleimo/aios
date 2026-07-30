# Context Lifecycle V1 未提交实现——问题清单

日期：2026-07-29
审阅对象：工作树未提交变更（51 个已跟踪文件修改 + 83 个未跟踪文件）
基线：`main@bfb9ce23`
审阅目标：实现是否正确，是否符合「为工作流编排提升 Agent 智力与能力」的初衷

## 总体判断

接线是真实的，不是库级原型。但**能力提升与治理建设的比例严重失衡**，且唯一一条真正提智的通道在默认路径下不触发。

| 维度 | 结论 |
|---|---|
| 代码是否接入生产调用链 | 是。`orchestrate → assembleExecutionContext → plan.executionContext → subagent/groupchat prompt` 全通 |
| 定向测试 | `context-lifecycle-orchestrate-integration` / `mcp-integration` / `runtime-context-delivery` / `execution-context-packet` / `production-correction`：**23 pass / 0 fail** |
| 是否符合初衷 | **部分符合，约 20%**。80% 工作量是治理/审计/证据链，不是 Agent 能力 |
| 是否可直接提交 | **否**。见 P0/P1 |

---

## P0 — 提智通道默认不触发（阻断）

### 现象

`assembleExecutionContext()` 的输入完全来自 `task.contextRequirements`。全仓检索该字段的生产者：

```text
scripts/lib/planning/schema.mjs:213      normalizeTask 读取
scripts/lib/planning/contract.mjs:67     buildPlanMarkdown 渲染
```

**没有任何 CLI、MCP、planner 或 skill 写入该字段。** `seedTasksFromObjective()`（`scripts/lib/planning/schema.mjs:150-172`）产出的 4 个脚手架任务不含 `contextRequirements`、`targets`、`allowedWrites`。

### 复现证据

临时工作区调用 `startPlan()` + `prepareOrchestrateContextLifecycle()`：

```text
tasks: [
  { id: 't1-understand', ctx: 0, targets: 0 },
  { id: 't2-plan',       ctx: 0, targets: 0 },
  { id: 't3-implement',  ctx: 0, targets: 0 },
  { id: 't4-verify',     ctx: 0, targets: 0 }
]

不带 --context-task:
  {"status":"not_applicable","reason":"ambiguous_context_task",
   "eligibleTaskIds":["t1-understand","t2-plan","t3-implement","t4-verify"]}

带 --context-task t1-understand:
  status=observed  deliveryUnits=0  contextText.length=0
```

即：`aios plan start` 生成的计划，**投递给 Agent 的上下文恒为 0 字节**。

### 为什么集成测试是绿的

`scripts/tests/context-lifecycle-orchestrate-integration.test.mjs:37-47` 的 fixture 手写了 `contextRequirements` 与 `targets`。测试验证的是「字段存在时链路正确」，不是「真实用户路径会产生该字段」。

### 影响

对「提升 Agent 智力」这一初衷，**当前净收益为 0**，除非人工手改 `.aios/planning/state.json`。

### 建议修复

1. 给 `contextRequirements` 加生产者。最低成本：`aios plan task` 增加 `--context <ref>[:reason]` / `--target <path>` / `--allow-write <glob>`；或在 `rex-planning` Provider 里要求声明。
2. 进阶：从 `targets` + codemap（`query_graph` callers_of/tests_for）自动推导候选必需上下文，人工确认后落库。
3. 无第 1 步，本版本不应对外声称提升了 Agent 能力。

---

## P1 — 任务选择策略过于保守

`scripts/lib/lifecycle/orchestrate/context-lifecycle.mjs:13-25`：

```js
if (candidates.length === 1) return { task: candidates[0], reason: '' };
if (candidates.length === 0) return { task: null, reason: 'no_eligible_context_task' };
return { task: null, reason: 'ambiguous_context_task' };
```

任何多任务计划（即默认脚手架的 4 任务）在不传 `--context-task` 时直接放弃装配。真实计划几乎总是多任务，等于要求每次调用都显式传 id。

**建议**：按 `dependsOn` 拓扑序取第一个 `pending` 任务作为默认；仍允许 `--context-task` 覆盖。

---

## P1 — 未跟踪垃圾文件在仓库根

```text
?? "a.textContent.includes('ステマ')"    95B
内容：{"success":false,"data":null,"error":"Evaluation error: SyntaxError: Unexpected end of input"}
```

浏览器 eval 事故产物。提交前必须删除。

---

## P1 — 134 个变更未分批

安全修复、新能力、测试文件拆分、installer file:// 支持、competitor-watchlist 刷新全部混在一次工作树里。建议至少拆分：

1. `fix(memo)`: private/shared 隔离 + 写锁 + provenance/ACL
2. `feat(context-lifecycle)`: packet/receipt/preflight/reconciliation + orchestrate/MCP 接线
3. `feat(dream)`: proposal/archive governance CLI
4. `test`: `harness-runtime.test.mjs` 拆分为 `scripts/tests/harness-runtime/**`
5. `fix(install)`: `aios-install.sh` 的 `file://` 分支

---

## P2 — 需要在 changelog 明确声明的行为变更

这些在决策文档中是有意为之，但对现有用户是可感知的破坏性变更，不能静默提交。

| 变更 | 位置 | 影响 |
|---|---|---|
| session close 不再写 shared memo，改为 candidate 侧车 | `scripts/lib/lifecycle/session-hooks/close.mjs` | 依赖自动记忆的流程会静默「失忆」，必须走 `memo candidate promote` |
| dream apply 默认 proposal-only，`gc` 硬禁用 | `scripts/lib/lifecycle/dream/governance.mjs:348-352`（`reasonCode: 'gc_disabled_pending_concurrency_control'`） | 记忆清理能力事实上关闭 |
| plan schema v2 → v3，首次写入即升版 | `scripts/lib/planning/schema.mjs:7`、`contract.mjs:138` | 回滚到旧版本后无法读取新 state |
| plan 路径必须在 workspace 内 | `scripts/lib/lifecycle/preflight-contracts.mjs:47-80` | 工作区外的绝对路径现在返回 `blocked: invalid_plan_path` |

---

## P2 — dream archive index 的失效检测可能漏判

`scripts/lib/lifecycle/dream/archive-index.mjs:29-44` 用 `fs.stat` 的 `size/mtimeMs/ctimeMs` 作为 source token，其中 `proposals` 是**目录**：

```js
proposals: await sourceSignature(paths.proposalsPath),
```

目录 mtime 只在条目增删时更新。若某个已存在的 proposal 文件内容被就地修改（状态变更写回同名文件），目录签名不变 → `readDreamArchivedEventIds()` 返回陈旧索引 → `searchMemoEvents` / `listMemoEvents` 过滤错误。

**建议**：对 proposals 目录做递归文件签名（路径+size+mtime 排序后 hash），或直接记录 proposal 文件数与内容 hash。

---

## 已确认无问题的部分

以下为审阅中重点核查、结论为正确的实现，供交接参考：

- **runtime delivery 未被压缩层吞掉**：`turn-compression.mjs:17-18` 的 redaction 只作用于送往 interception 的 `text`，返回的 `systemPrompt`/`userPrompt`（第 43、53 行）仍是原文。投递内容真实到达模型。
- **redaction 不会误伤 Agent 输出**：`runtime-context-redaction.mjs` 按整段 content/excerpt 做 `split().join()`，部分引用不匹配，只有整文回显才被替换。
- **env 不构成授权面**：旧的 `runtimeIdentityFromEnv()` 环境入口已移除；Candidate/Dream 只接受显式 runtime identity，普通 CLI 环境变量不会进入治理判定。
- **路径包含性检查**：`execution-context.mjs`、`planning/cli.mjs`、`preflight-contracts.mjs` 三处均做了 `realpath` + 包含性双重校验，符号链接逃逸场景有测试覆盖。
- **测试拆分正确**：`harness-runtime.test.mjs` 变为 4 行 import 壳，子文件在 `scripts/tests/harness-runtime/`，`test:scripts` 入口不变。

---

## 验证命令

```powershell
node --test --test-concurrency=1 `
  scripts/tests/context-lifecycle-orchestrate-integration.test.mjs `
  scripts/tests/context-lifecycle-mcp-integration.test.mjs `
  scripts/tests/runtime-context-delivery.test.mjs `
  scripts/tests/execution-context-packet.test.mjs `
  scripts/tests/context-lifecycle-production-correction.test.mjs
# 23 pass / 0 fail

npm run test:scripts   # 全量，本报告出具时仍在运行
```

## 提交前门禁建议

1. P0 修复或明确降级声明（承认本版本只交付治理，不交付能力提升）；
2. 删除仓库根垃圾文件；
3. 按主题拆分 commit；
4. changelog 写明四项行为变更；
5. `npm run test:scripts` 全量绿。
