# Context Lifecycle V1 第二轮审阅——问题清单

日期：2026-07-29
审阅对象：工作树未提交变更（53 个已跟踪文件修改 + 87 个未跟踪文件，共 140 项）
基线：`main@bfb9ce23`（`bfb9ce23..HEAD` = **0 commits**）
上轮报告：[`docs/reports/2026-07-29-context-lifecycle-v1-review-findings.md`](../docs/reports/2026-07-29-context-lifecycle-v1-review-findings.md)
审阅目标：上轮 P0/P1/P2 是否修复；是否符合「为工作流编排提升 Agent 智力与能力」的初衷

## 总体判断

治理与可用性确有推进，**但唯一一条提智通道在默认路径下仍投递 0 字节**。上轮的核心阻断项未真正解除。

| 维度 | 结论 |
|---|---|
| P1/P2 修复完成度 | 4/5 已修（分批提交未做） |
| P0 修复完成度 | **半修**。机制已加，实际产出仍为空 |
| 是否符合初衷 | **约 25%**（上轮 20%）。增量来自可用性，不是 Agent 能力 |
| 是否可直接提交 | **否**。见 P0、P1-分批 |

---

## 逐条对照

| 上轮问题 | 现状 | 证据 |
|---|---|---|
| P0 提智通道默认不触发 | ⚠️ **半修** | 见下节 |
| P1 任务选择策略过于保守 | ✅ 已修 | `scripts/lib/lifecycle/orchestrate/context-lifecycle.mjs:17-87` |
| P1 仓库根垃圾文件 | ✅ 已删 | `git status --porcelain` 无该条目 |
| P1 134 个变更未分批 | ❌ **未做** | `git log bfb9ce23..HEAD` = 0；工作树由 134 增至 140 |
| P2 changelog 行为变更声明 | ✅ 已写 | `CHANGELOG.md` +14 行 |
| P2 dream archive index 漏判 | ✅ 已修 | `scripts/lib/lifecycle/dream/archive-index.mjs:51-72` |

---

## P0 — 提智通道仍不产出内容（阻断，降级为「半修」）

### 已完成的部分

新增手工声明通道，与上轮建议第 1 条一致：

```text
scripts/lib/cli/parse-args/plan.mjs:28-30    --context <ref[:reason]> / --target <path> / --allow-write <glob>（可重复）
scripts/lib/planning/cli.mjs:70-92           parseContextDeclaration() / taskDeclarations()
scripts/lib/cli/help/commands/maintenance.mjs:145-156   help 已同步
```

`parseContextDeclaration()` 对 Windows 盘符做了偏移处理（`path.win32.isAbsolute(declaration) ? 2 : 0`），`C:\x\y.md:原因` 不会被误切——这点是对的。

测试覆盖存在：`scripts/tests/context-lifecycle-orchestrate-integration.test.mjs:249-251` 走了真实 CLI 三个新 flag。

### 未解决的部分

默认路径实测仍为 0 字节。临时工作区复现（`startPlan()` + `prepareOrchestrateContextLifecycle()`）：

```text
TASKS: [
  {"id":"t1-understand","status":"pending","ctx":0,"targets":0},
  {"id":"t2-plan",      "status":"pending","ctx":0,"targets":0},
  {"id":"t3-implement", "status":"pending","ctx":0,"targets":0},
  {"id":"t4-verify",    "status":"pending","ctx":0,"targets":0}
]

DEFAULT_PATH   status=observed  taskId=t1-understand  deliveryUnits=0  contextTextLen=0
EXPLICIT_TASK  status=observed  (t3-implement)        deliveryUnits=0  contextTextLen=0
```

与上轮相比唯一变化：不再返回 `ambiguous_context_task` 而能选中任务——这是 P1 的功劳，不是 P0 的。选中之后投递内容依旧为空。

三个原因：

1. `seedTasksFromObjective()`（`scripts/lib/planning/schema.mjs:149-172`）产出的脚手架任务仍不含 `contextRequirements` / `targets` / `allowedWrites`。
2. **没有任何 skill / prompt / planner 指导 agent 调用新 flag。** 全仓检索：

   ```text
   grep -rn "plan task|contextRequirements" skill-sources/**/*.md   →  0 命中
   ```

   即新通道只有人类手敲 CLI 时才会被使用，Agent 自主路径不经过它。
3. 上轮建议第 2 条（由 `targets` + codemap `callers_of` / `tests_for` 自动推导候选上下文）未实施。`docs/plans/2026-07-29-context-lifecycle-review-findings-remediation-minimal-construction.md:6,14` 的决策明确只选了 CLI 声明这一层。

### 结论

对「提升 Agent 智力」这一初衷，**净收益仍接近 0**，除非人工对每个任务额外执行：

```powershell
node scripts/aios.mjs plan task t3-implement --context "docs/policy.md:策略依赖" --target "src/feature.mjs"
```

### 建议（二选一，不能都不做）

- **要么补生产者**：在 `rex-planning` / `aios-workflow-router` 的 skill 文档中强制声明步骤；或让 `seedTasksFromObjective()` 从 objective 关键词 + codemap 推导候选，落库前人工确认。
- **要么明确降级声明**：在 CHANGELOG 与对外说明中写清「本版本交付上下文治理与审计能力，不交付 Agent 能力提升」。

---

## P1 — 分批提交未执行（提交前必修）

```text
git log bfb9ce23..HEAD   →  0 commits
git status --porcelain   →  140 项（上轮 134）
```

安全修复、新能力、测试拆分、installer `file://` 支持、competitor-watchlist 刷新仍混在一次工作树。上轮建议的 5 组拆分未开始。本次审阅新增的 `review-reports/` 两个文件也计入该总数，提交时请一并归组（建议归入 `docs` 或独立 `chore(review)`）。

---

## 已确认修复的实现细节

以下为本轮重点复核、结论为正确的修复：

- **默认任务选择**（`context-lifecycle.mjs:17-87`）：`topologicalTasks()` 用 indegree + 稳定序取 `dependsOn` 拓扑序，取首个 `pending`；环状/悬空依赖有 declared-order 兜底（第 64-67 行）；`--context-task` 仍最高优先级（第 74-79 行），`context_task_not_found` 语义保留。集成测试 `context-lifecycle-orchestrate-integration.test.mjs:305-312` 覆盖了乱序 `dependsOn`。
- **archive index 失效检测**（`archive-index.mjs:51-72`）：`proposalsSignature()` 递归收集 `.json`，按相对路径排序后 `hashParts()` 算内容摘要，不再依赖目录 `mtime`；`sourceToken.schemaVersion` 由 1 升到 2，旧索引自动作废重建（`normalizeIndex()` + `sourceTokensMatch()`）。就地改写同名 proposal 的漏判场景已封堵。
- **changelog 行为变更**：`CHANGELOG.md` Unreleased 段 4 条 Changed + 4 条 Migration，与上轮列出的四项破坏性变更逐一对应（candidate 侧车、dream GC 禁用、plan schema v3、路径包含性）。

---

## 需要指出的表述问题

`docs/reports/2026-07-29-context-lifecycle-v1-implementation-verification.md:9`：

> "This report supersedes stale statements that the current working implementation has no CLI/MCP/orchestrate reachability."

该句误述了上轮结论。上轮报告判断表首行即写明「代码是否接入生产调用链 = **是**」，P0 从来不是「接不通」，而是「接得通但无生产者写入 `contextRequirements`，投递恒为空」。以此为由认定原结论过期，会掩盖仍然存在的阻断项——本轮复现数据见上。

建议修订该句，或在其中补充默认路径 `deliveryUnits=0` 的现状。

---

## 工作量配比

未跟踪新增文件：

| 类别 | 文件数 | 行数 |
|---|---|---|
| docs | 59 | 7677 |
| test | 17 | 3873 |
| **src** | **11** | **2493** |
| benchmark | 1 | 1972 |

已跟踪改动：53 files changed, 2010 insertions(+), 1977 deletions(-)。

治理 / 证据链 / 文档仍占主体。初衷达成度由上轮的约 20% 提升至约 25%，增量主要来自默认任务选择可用性，而非 Agent 能力。

---

## 验证命令

```powershell
# 定向（上轮 23 pass / 0 fail）
node --test --test-concurrency=1 `
  scripts/tests/context-lifecycle-orchestrate-integration.test.mjs `
  scripts/tests/context-lifecycle-mcp-integration.test.mjs `
  scripts/tests/runtime-context-delivery.test.mjs `
  scripts/tests/execution-context-packet.test.mjs `
  scripts/tests/context-lifecycle-production-correction.test.mjs

# 本轮新增修复的定向覆盖
node --test --test-concurrency=1 `
  scripts/tests/planning-contract.test.mjs `
  scripts/tests/memo-archive-index.test.mjs

# 全量
npm run test:scripts
```

**全量结果（本轮实测，exit code 0）：**

```text
ℹ tests 991
ℹ pass 982
ℹ fail 0
ℹ cancelled 0
ℹ skipped 9
ℹ todo 0
ℹ duration_ms 435981
```

全量绿。9 项 skipped 为既有跳过项，非本轮引入的失败。

---

## 提交前门禁状态

| # | 门禁 | 状态 |
|---|---|---|
| 1 | P0 修复或明确降级声明 | ❌ 两者皆无 |
| 2 | 删除仓库根垃圾文件 | ✅ |
| 3 | 按主题拆分 commit | ❌ 0 commits |
| 4 | changelog 写明四项行为变更 | ✅ |
| 5 | `npm run test:scripts` 全量绿 | ✅ 991 tests / 982 pass / 0 fail / 9 skipped |

**3 项通过、2 项未过 → 当前不可提交。**

阻断项只剩两条，都不是代码质量问题：

1. **P0**：补生产者（skill 文档强制声明，或 codemap 自动推导），或写明降级声明。
2. **分批提交**：按上轮 5 组主题拆 commit。
