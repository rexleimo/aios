# 竞品源码级差距分析 — 实施计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 实际 clone 竞品仓库、读源码，对照本项目已有代码做逐项差距分析，找出真正值得借鉴的功能和具体实现路径。不是再跑一遍 README 扫描。

**核心原则:** 每个结论必须有双端代码引用——竞品 `repo:file:line` + 本项目 `path:line`。没有代码引用的结论不写进报告。

---

## 为什么要重做

��一份计划（已删除）本质上是"再用 GitHub API 拉 README + CHANGELOG 再扫一遍"。这种做法的问题是：
- 产出是二手推断，不能指导工程决策
- 已经做过两次（5/22 和 6/4），模式重复，ROI 递减
- 12 个 P0/P1 功能簇中哪些已经落地、哪些还是空壳，从未做过代码级核实

**本次的核心区别:** 先读本项目源码确认现状，再定向 clone 竞品仓库的特定模块，逐函数对比。

---

## 本项目现状审计（已完成初步扫描）

通过实际读取源码，确认以下竞品分析报告中的 P0 功能在本项目的落地状态：

| 竞品报告 P0 项 | 本项目实际状态 | 证据 |
|----------------|----------------|------|
| 受控技能自生成闭环 (skill workshop) | **已实现骨架** | `scripts/lib/skills/skill-workshop.mjs` (319行) propose/review/apply/rollback/index 全套 |
| Operator install policy | **已实现** | `scripts/lib/skills/install-policy.mjs` (203行) glob allow/deny + requireProvenance |
| Skill compliance dry-run | **已实现骨架** | `scripts/lib/skills/compliance.mjs` (85行) — 只支持 --dry-run, 无实跑 |
| Skill health/evolution | **已有文件** | `scripts/lib/skills/health.mjs` — 需读源码确认深度 |
| Mermaid 符号化压缩 + offload | **已实现** | `scripts/lib/offload/mermaid-canvas.mjs` (257行) canvas + auto-compact (20/50 节点阈值) |
| Tool output offload | **已实现** | `scripts/lib/offload/tool-offload.mjs` + refs-store + backfill |
| Harness solo loop + backoff | **已实现** | `scripts/lib/harness/solo-runtime/loop.mjs` (278行) + backoff.mjs (30s×2^n, cap 300s) |
| Session changed-files ledger | **已实现** | `scripts/lib/session/changed-files.mjs` JSONL append + dedup |
| ContextDB continuity summary | **已实现** | `scripts/lib/contextdb/continuity.mjs` + facade + handoff |
| Dispatch insights | **已实现** | `docs/reports/2026-04-23-harness-intelligence-upgrade-report.md` 有 commit 记录 |
| **Dry-run readiness** | **未实现** | 搜索 `dry.?run|readiness` 在 scripts/lib/ 下 0 结果 |
| **default_mode 自动激活** | **未实现** | 搜索 `default.?mode|defaultMode` 0 结果 |
| **Sleep-Time / Auto-Dream** | **未实现** | 搜索 `dream|autodream|sleep.?time` 0 结果 |
| **4 段 mentor verdict / 两阶段审查** | **未实现** | 搜索 `verdict|mentor|quality.?gate` 0 结果 |
| **Vendor superpowers skill 子集** | **未实现** | skill-sources/ 下无 superpowers/ 目录，AGENTS.md 引用是契约式占位符 |
| **worker_died 兜底** | **未实现** | 搜索 `worker.?died|death.?notice` 0 结果 |

**结论:** 6/12 个 P0 项已有不同程度的实现，但竞品报告从未核实过这些。另外 6 项确实缺失。

---

## 需要竞品源码验证的 4 个关键问题

本次 deep-dive 聚焦这 4 个问题，不做泛泛扫描：

### 问题 1: 我们的 skill-workshop.mjs 和 OpenClaw Skill Workshop 差多少？

我们的实现（319 行）已经有 propose/review/apply/rollback/index。
需要 clone OpenClaw 对比：
- OpenClaw 的 `skill_workshop` agent tool 支持什么操作我们没做？
- proposal 的 scanner + hash + rollback safeguards 具体怎么做的？
- "today view / revision dialog / file preview modal" 这套 UI 我们需要吗？
- 我们 rollback 只恢复 metadata，不恢复文件内容——OpenClaw 怎么做的？

### 问题 2: 我们的 backoff.mjs 和 gnhf orchestrator.ts 差多少？

我们的实现（39 行）：只区分 infra-retry + runtime-error/tool-error，30s×2^n cap 300s。
需要 clone gnhf 对比：
- gnhf 的 `getPreIterationAbortReason()` / `getPostIterationAbortReason()` 分类器具体分了哪些类？
- `PermanentAgentError` 立即 abort 的判定条件？
- `pendingCommitFailure` → `buildCommitRepairPrompt` 的具体实现？
- 连续失败 ≥3 → abort 的计数逻辑？

### 问题 3: 我们的 mermaid-canvas.mjs 和 TencentDB 的符号化压缩差多少？

我们的实现（257 行）：canvas nodes/edges → Mermaid graph LR，auto-compact (20节点 mild / 50节点 aggressive)。
需要 clone TencentDB 对比：
- TencentDB 的 offload 触发阈值（0.5/0.85 窗口比例）vs 我们的固定节点数阈值——哪个更合理？
- TencentDB 的 `mmdMaxTokenRatio=0.2` 有没有类似机制？
- TencentDB 的 `node_id` grep 回原始文件的机制——我们的 refs-store 等价吗？
- 三档阈值 vs 两档——差距在哪？

### 问题 4: 我们完全没实现的 4 项，竞品源码中最小可抄的实现是什么？

- **Dry-run readiness** → clone OpenHarness `src/openharness/cli.py` 的 `_evaluate_dry_run_readiness()`
- **default_mode** → clone oh-my-openagent 的 `default_mode` config 读取逻辑
- **Sleep-Time / Auto-Dream** → clone OpenHarness `services/autodream/` 的 4 个文件
- **4 段 mentor verdict** → clone the-pair `src-tauri/src/quality_gate.rs:45-67`

---

## 任务分解

### Task 1: 深读本项目已有实现（TDD 准备）

**Objective:** 把上表中标记"已实现"的 6 个模块的源码完整读一遍，记录 API surface + 设计决策 + 已知局限。

**Files to read:**
- `scripts/lib/skills/skill-workshop.mjs` (319行)
- `scripts/lib/skills/install-policy.mjs` (203行)
- `scripts/lib/skills/compliance.mjs` (85行)
- `scripts/lib/skills/health.mjs`
- `scripts/lib/offload/mermaid-canvas.mjs` (257行)
- `scripts/lib/offload/tool-offload.mjs`
- `scripts/lib/harness/solo-runtime/backoff.mjs` (39行)
- `scripts/lib/harness/solo-runtime/loop.mjs` (278行)
- `scripts/lib/harness/solo-runtime/state.mjs` (124行)
- `scripts/lib/session/changed-files.mjs` (82行)

**产出:** 每个模块一段 3-5 行的"现状摘要"——API + 设计 + 局限。

**验证:** 所有引用的行号和函数名来自实际 read_file，不是推测。

---

### Task 2: Clone OpenHarness + 读 dry-run + autodream 源码

**Objective:** 获取 OpenHarness 的 dry-run readiness 和 autodream 源码级证据。

**Step 1: Shallow clone**

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/HKUDS/OpenHarness.git temp/competitor-repos/HKUDS__OpenHarness
cd temp/competitor-repos/HKUDS__OpenHarness
git sparse-checkout set src/openharness/cli.py src/openharness/services/autodream
```

**Step 2: 读 dry-run 实现**

重点读 `src/openharness/cli.py` 中的 `_evaluate_dry_run_readiness()`:
- 6 个检查维度各是什么条件？
- `ready` / `warning` / `blocked` 的判定逻辑
- `next_actions[]` 怎么生成的
- `mcp_validation` 字段的具体值

**Step 3: 读 autodream 实现**

重点读 `src/openharness/services/autodream/` 下 4 个文件:
- `service.py` — mtime 扫描 + LLM 触发 + 锁机制
- `prompt.py` — 5 类 taxonomy + PREVIEW/APPLY 双模式模板
- `backup.py` — 备份 + diff 机制
- `lock.py` — `try_acquire_consolidation_lock` 实现

**产出:** 两段源码级分析，每段含 file:line 引用 + "本项目如何落地"的具体建议。

---

### Task 3: Clone gnhf + 读 orchestrator 退避/abort 源码

**Objective:** 获取 gnhf 的退避算法和 abort 分类器源码级证据。

**Step 1: Shallow clone**

```bash
git clone --depth 1 https://github.com/kunchenguid/gnhf.git temp/competitor-repos/kunchenguid__gnhf
```

**Step 2: 读 orchestrator.ts**

重点读 `src/core/orchestrator.ts` (~843行):
- `getPreIterationAbortReason()` 的分类枚举
- `getPostIterationAbortReason()` 的分类枚举
- `PermanentAgentError` 的判定条件
- `pendingCommitFailure` → `buildCommitRepairPrompt` 的实现
- `consecutiveFailures` 计数 + `maxConsecutiveFailures` 阈值
- `interruptibleSleep` 的实现

**Step 3: 对比我们的 backoff.mjs**

逐字段对比：
- 我们的 infra-retry + runtime-error/tool-error 二分类 vs gnhf 的多分类
- 我们的 30s×2^n cap 300s vs gnhf 的 60s×2^n (无 cap?)
- 我们没有的：pre-iteration abort、commit repair prompt、consecutive failure 计数

**产出:** 差距表 + 具体改进建议（file:line 级别）。

---

### Task 4: Clone TencentDB + 读符号化压缩源码

**Objective:** 获取 TencentDB 的 Mermaid 符号化压缩源码级证据。

**Step 1: Shallow clone**

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/TencentCloud/TencentDB-Agent-Memory.git temp/competitor-repos/TencentCloud__TencentDB-Agent-Memory
cd temp/competitor-repos/TencentCloud__TencentDB-Agent-Memory
git sparse-checkout set src/offload src/memory
```

**Step 2: 读 offload + canvas 实现**

重点找：
- offload 触发阈值（`mildOffloadRatio=0.5` / `aggressiveCompressRatio=0.85`）的读取和判断逻辑
- `mmdMaxTokenRatio=0.2` 的计算方式
- Mermaid 图的提取逻辑——是 LLM 提取还是规则引擎？
- `node_id` 到原始文件的 grep 回查机制

**Step 3: 对比我们的 mermaid-canvas.mjs**

逐功能对比：
- 触发机制：我们用节点数 (20/50)，TencentDB 用窗口比例 (0.5/0.85)
- 压缩产出：我们生成 graph LR，TencentDB 生成什么格式？
- 回查机制：我们的 refs-store vs TencentDB 的 node_id grep

**产出:** 差距表 + 改进建议。

---

### Task 5: Clone the-pair + 读 4 段 verdict schema

**Objective:** 获取 the-pair 的结构化 mentor verdict 源码级证据。

**Step 1: Shallow clone**

```bash
git clone --depth 1 https://github.com/timwuhaotian/the-pair.git temp/competitor-repos/timwuhaotian__the-pair
```

**Step 2: 读 quality_gate.rs**

重点读 `src-tauri/src/quality_gate.rs`:
- 第 45-67 行的 4 段 verdict schema 定义
- `FILES_REVIEWED:` / `CHECKS:` / `CODE:` 各字段的类型和约束
- `validate_review` 缺段 reject 的实现
- v2.0.2 修的"无变更时跳过 typecheck"逻辑

**Step 3: 对比我们的 verification-evidence.mjs**

读 `scripts/lib/harness/verification-evidence.mjs`，对比：
- 我们的 evidence schema vs the-pair 的 4 段 verdict
- 我们有没有"缺段 reject"机制
- acceptance check 在无文件变更时的行为

**产出:** schema 对比表 + 落地建议。

---

### Task 6: Clone oh-my-openagent + 读 default_mode

**Objective:** 获取 oh-my-openagent 的 default_mode 自动激活源码级证据。

**Step 1: Shallow clone (大仓库，只拉关键包)**

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/code-yeongyu/oh-my-openagent.git temp/competitor-repos/code-yeongyu__oh-my-openagent
cd temp/competitor-repos/code-yeongyu__oh-my-openagent
git sparse-checkout set packages/model-core packages/boulder-state packages/omo-codex
```

**Step 2: 读 default_mode 实现**

重点找：
- config 中 `default_mode` 的读取位置
- 自动注入 system prompt + skill 的逻辑
- `ULTRAWORK MODE ENABLED!` directive 的生成
- `restrictedAgents` (PR #2827) 的 per-agent skill filtering 实现

**Step 3: 评估本项目落地路径**

我们的 `scripts/aios.mjs` 启动时有没有类似的 config 读取钩子？
`.aios/config.json` 的 schema 是否需要扩展？

**产出:** 落地路径 + 预估工作量。

---

### Task 7: Clone OpenClaw + 读 Skill Workshop（定向）

**Objective:** 获取 OpenClaw Skill Workshop 的治理流程源码证据。

**注意:** OpenClaw 仓库巨大 (376K★)，不能全 clone。用 GitHub API 定向读关键文件。

**Step 1: 用 GitHub API 读关键文件**

```bash
# 用 gh api 或 curl 读特定文件
gh api repos/openclaw/openclaw/contents/src/skills/workshop --jq '.[].name'
gh api repos/openclaw/openclaw/contents/src/skills/index.json --jq '.content' | base64 -d
```

重点找：
- Skill proposal 的 scanner 实现（扫描什么？怎么 hash？）
- rollback safeguards 的文件级实现（不只是 metadata）
- `skill_workshop` agent tool 的 schema

**Step 2: 对比我们的 skill-workshop.mjs**

- 我们 rollback 只恢复 metadata（319行中 276-319），OpenClaw 怎么做文件级 rollback？
- 我们没有 scanner——OpenClaw 的 scanner 检测什么？
- proposal 的 approved support files 机制——我们有吗？

**产出:** 差距表 + 改进建议。

---

### Task 8: 撰写差距分析报告

**Objective:** 基于 Task 1-7 的源码级证据，产出可执行的优化报告。

**Files:**
- Create: `docs/reports/2026-07-01-source-level-gap-analysis.md`

**报告结构:**

```markdown
# 竞品源码级差距分析

> 方法: 本项目源码审计 + 竞品 shallow clone + 逐函数对比
> 每条结论有双端代码引用: 竞品 repo:file:line + 本项目 path:line

## 1. 已实现功能: 我们 vs 竞品的差距

### 1.1 Skill Workshop
- 我们的实现: skill-workshop.mjs:319行, propose/review/apply/rollback/index
- OpenClaw 实现: [file:line]
- 差距: [逐项列出]
- 建议: [具体改进路径]

### 1.2 Mermaid 符号化压缩
- 我们的实现: mermaid-canvas.mjs:257行
- TencentDB 实现: [file:line]
- 差距: [逐项列出]

### 1.3 Harness Backoff
- 我们的实现: backoff.mjs:39行
- gnhf 实现: orchestrator.ts:843行
- 差距: [逐项列出]

### 1.4 Skill Compliance
- 我们的实现: compliance.mjs:85行
- 竞品: [file:line]
- 差距: [逐项列出]

## 2. 未实现功能: 竞品最小可抄实现

### 2.1 Dry-Run Readiness (OpenHarness)
- 源码: cli.py:_evaluate_dry_run_readiness() [file:line]
- 6 个检查维度: [逐项列出]
- 本项目落地: aios harness run --dry-run
- 工作量: S/M/L + 理由

### 2.2 default_mode 自动激活 (oh-my-openagent)
### 2.3 Sleep-Time / Auto-Dream (OpenHarness)
### 2.4 4 段 Mentor Verdict (the-pair)

## 3. 建议执行顺序

[按 ROI 排序: 工作量 × 用户价值 × 证据强度]

## 4. 不建议借鉴的（以及原因）
[明确列出不值得抄的，避免后续重复讨论]
```

---

## 验证标准

- [ ] 每个"差距"结论有竞端 `repo:file:line` 引用
- [ ] 每个"差距"结论有本项目 `path:line` 引用
- [ ] clone 的仓库实际存在于 `temp/competitor-repos/`
- [ ] 没有"README 声称"的未验证数据被当作事实
- [ ] 报告无 [TBD] 占位符
- [ ] "不建议借鉴"部分非空（不是所有竞品功能都值得抄）

---

## 关键文件路径

### 本项目（已确认存在）
- `scripts/lib/skills/skill-workshop.mjs`
- `scripts/lib/skills/install-policy.mjs`
- `scripts/lib/skills/compliance.mjs`
- `scripts/lib/skills/health.mjs`
- `scripts/lib/offload/mermaid-canvas.mjs`
- `scripts/lib/offload/tool-offload.mjs`
- `scripts/lib/harness/solo-runtime/backoff.mjs`
- `scripts/lib/harness/solo-runtime/loop.mjs`
- `scripts/lib/harness/solo-runtime/state.mjs`
- `scripts/lib/harness/verification-evidence.mjs`
- `scripts/lib/session/changed-files.mjs`

### 竞品 clone 目标（Task 2-7 创建）
- `temp/competitor-repos/HKUDS__OpenHarness/` — dry-run + autodream
- `temp/competitor-repos/kunchenguid__gnhf/` — orchestrator 退避
- `temp/competitor-repos/TencentCloud__TencentDB-Agent-Memory/` — 符号化压缩
- `temp/competitor-repos/timwuhaotian__the-pair/` — 4 段 verdict
- `temp/competitor-repos/code-yeongyu__oh-my-openagent/` — default_mode
- OpenClaw — 用 GitHub API 定向读，不 clone

### 产出
- `docs/reports/2026-07-01-source-level-gap-analysis.md` — 主报告
