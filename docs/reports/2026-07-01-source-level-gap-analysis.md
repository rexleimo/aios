# 竞品源码级差距分析

> 生成日期: 2026-07-01
> 方法: 本项目源码审计 + 竞品 raw.githubusercontent.com / GitHub API 源码读取 + 逐函数对比
> 每条结论有双端代码引用: 竞品 `repo:file:line` + 本项目 `path:line`
> 网络约束: git clone 不可用（github.com:443 被墙），所有竞品源码通过 raw.githubusercontent.com 和 GitHub Contents/Blobs API 读取

---

## 0. TL;DR

1. **之前竞品报告列的 12 个 P0 中，6 个已经有实现** — 报告从未核实过本项目代码
2. **oh-my-openagent 没有 `default_mode` config 字��** — 竞品报告的核心假设是错的；实际是运行时关键词检测 hook
3. **the-pair 的 4 段 verdict 实现极简** — validate_review 只是 3 个 `is_empty()` 检查，比预想简单得多
4. **gnhf 的退避算法没有 cap** — 我们有 300s cap，gnhf 是无限指数增长
5. **OpenHarness autodream 的核心是 prompt 工程** — 锁机制只是文件级 PID 锁 + 1h stale timeout
6. **OpenHarness dry-run readiness 只有 4 个检查维度** — 不是之前报告说的 6 个

---

## 1. 本项目现状审计（源码级）

### 1.1 已实现模块

#### skill-workshop.mjs (319行)
- **API**: propose / review / apply / rollback / index(--scan)
- **设计**: 纯文件操作 + JSON 簿记，无 LLM 调用
- **局限**:
  - rollback 只恢复 metadata，不恢复文件内容（`skill-workshop.mjs:315` `file content not restored`）
  - propose 写一个空壳 SKILL.md 模板（`skill-workshop.mjs:131-135`），没有从执行轨迹自动提取 skill 内容
  - 没有 scanner（OpenClaw 有）
  - 没有 `skill_workshop` agent tool（OpenClaw 有）

#### install-policy.mjs (203行)
- **API**: readInstallPolicy / checkPolicy / policyDenialError
- **设计**: deny-first glob 匹配（`install-policy.mjs:156`）+ requireProvenance + 坏文件回退默认策略（`install-policy.mjs:114`）
- **完整度**: 高 — 与 OpenClaw v2026.6.2-beta.1 operator install policy 对齐

#### compliance.mjs (85行)
- **API**: evaluateSkillComplianceDryRun / runSkillComply
- **局限**: 只支持 `--dry-run`，3 场景 (supportive/neutral/competing) 是静态模板，不实际运行 agent
- **hook promotion 建议**: 只输出文字建议（`compliance.mjs:64-68`），不自动执行

#### health.mjs (116行)
- **API**: recordSkillObservation (JSONL append) / buildSkillHealthReport (30d window)
- **设计**: successRate + failurePatterns 聚合 + pendingAmendments
- **完整度**: 高 — 已覆盖 ECC skill health/evolution loop 的数据采集层

#### offload/mermaid-canvas.mjs (257行)
- **API**: addNode / canvasToMermaid / compactCanvas / findCanvasMermaid
- **设计**: graph LR 生成 + auto-compact (COMPACT_MILD_NODES=20 / COMPACT_AGGRESSIVE_NODES=50, keep 10 recent)
- **recall cap**: CANVAS_RECALL_MAX_CHARS=12_000（`mermaid-canvas.mjs:9`）
- **node_id 格式**: `n{seq:04d}-{sha1hash[:6]}`（`node-id.mjs:8`）

#### offload/tool-offload.mjs (243行) + refs-store.mjs (254行)
- **API**: capture / shouldOffload / normalizeCapturePayload / grepRefs / listRefs / pruneRefs
- **阈值**: DEFAULT_MIN_BYTES=2048（`tool-offload.mjs:5`），DEFAULT_TOOLS=['Bash','Read','Edit','Write']
- **存储**: file (markdown frontmatter) / split (JSON per month)
- **grep 回查**: grepRefs 支持正则搜索 refs 文件（`refs-store.mjs:128-172`）

#### harness/solo-runtime/backoff.mjs (39行)
- **API**: resolveSoloBackoffState / sleep
- **退避**: 30s×2^n, cap 300s（`backoff.mjs:24`）
- **触发条件**: outcome==='infra-retry' && (failureClass==='runtime-error' || 'tool-error')
- **局限**: 只区分 infra-retry vs 其他，没有 pre/post-iteration abort 分类器

#### harness/solo-runtime/loop.mjs (278行)
- **API**: runSoloHarnessLoop
- **lifecycle hooks**: onTurnStart / onTurnComplete / onBeforeContinuityCommit / onSessionEnd
- **集成**: continuity + canvas + offload 在每轮自动执行（`loop.mjs:109-112`）

#### harness/verification-evidence.mjs (207行)
- **API**: persistQualityGateEvidence
- **设计**: quality-gate artifact JSON 持久化 + ContextDB event:add + checkpoint
- **局限**: 没有 mentor verdict schema（没有 FILES_REVIEWED/CHECKS/CODE 4 段验证）

#### session/changed-files.mjs (82行)
- **API**: recordSessionChangedFile / readSessionChangedFiles
- **设计**: JSONL append + byPath dedup + firstSeenAt/lastSeenAt/count

### 1.2 未实现模块（搜索确认 0 结果）

| 功能 | 搜索关键词 | 结果 |
|------|-----------|------|
| Dry-run readiness | `dry.?run\|readiness\|dryRun` in scripts/lib/ | 0 |
| default_mode | `default.?mode\|defaultMode` | 0 |
| Sleep-Time / Auto-Dream | `dream\|autodream\|sleep.?time` | 0 |
| 4 段 mentor verdict | `verdict\|mentor\|quality.?gate` (schema 部分) | 0 |
| Vendor superpowers | skill-sources/ 下无 superpowers/ 目录 | 不存在 |
| worker_died | `worker.?died\|death.?notice\|notifyParentOnDeath` | 0 |

---

## 2. 竞品源码级分析

### 2.1 the-pair: quality_gate.rs (5010 bytes, 完整读取)

**源码路径**: `timwuhaotian/the-pair:src-tauri/src/quality_gate.rs`

#### 4 段 verdict schema

```rust
// quality_gate.rs:8-16
pub struct ReviewEvidence {
    pub files_reviewed: Vec<String>,      // FILES_REVIEWED:
    pub checks_performed: Vec<String>,     // CHECKS:
    pub code_reference: String,            // CODE:
}
```

#### validate_review 实现

```rust
// quality_gate.rs:29-47
pub fn validate_review(evidence: &ReviewEvidence) -> QualityGateResult {
    if evidence.files_reviewed.is_empty() {
        return QualityGateResult::Fail {
            reason: "No files listed as reviewed..."
        };
    }
    if evidence.checks_performed.is_empty() {
        return QualityGateResult::Fail {
            reason: "No specific checks listed..."
        };
    }
    if evidence.code_reference.trim().is_empty() {
        return QualityGateResult::Fail {
            reason: "No code reference provided..."
        };
    }
    QualityGateResult::Pass
}
```

#### extract_evidence 实现

```rust
// quality_gate.rs:51-68
pub fn extract_evidence(verdict_text: &str) -> Option<ReviewEvidence> {
    let files_line = verdict_text.lines().find(|l| l.starts_with("FILES_REVIEWED:"))?;
    let checks_line = verdict_text.lines().find(|l| l.starts_with("CHECKS:"))?;
    let code_line = verdict_text.lines().find(|l| l.starts_with("CODE:"))?;
    // ... split by comma, trim, filter empty
}
```

**关键发现**: 实现极简——只是 3 个 `is_empty()` 检查 + 行首前缀解析。不是之前报告暗示的复杂 schema 验证。

#### 与本项目对比

| 维度 | the-pair | 本项目 (verification-evidence.mjs) |
|------|---------|-----------------------------------|
| verdict schema | 3 字段: files/checks/code | 无 schema，只有 ok/failed/results[] |
| 缺段 reject | validate_review 缺段返回 Fail | 无此机制 |
| evidence 提取 | extract_evidence 行首前缀解析 | 无（依赖外部传入 report） |
| artifact 持久化 | N/A（在 acceptance.rs 中） | persistQualityGateEvidence:90-207 |

**落地建议**: 在 `verification-evidence.mjs` 中增加 `validateMentorVerdict(text)` 函数，检查 verdict 文本是否包含 `FILES_REVIEWED:` / `CHECKS:` / `CODE:` 三段前缀。工作量: S（半天）。

---

### 2.2 gnhf: orchestrator.ts (843行, 完整读取)

**源码路径**: `kunchenguid/gnhf:src/core/orchestrator.ts`

#### OrchestratorState 字段

```typescript
// orchestrator.ts:42-64
export interface OrchestratorState {
  status: "running" | "waiting" | "aborted" | "stopped";
  gracefulStopRequested: boolean;
  interruptHint: InterruptHint;
  currentIteration: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  tokensEstimated: boolean;        // sticky flag, :52
  commitCount: number;
  iterations: IterationRecord[];
  successCount: number;
  failCount: number;
  consecutiveFailures: number;     // :57
  consecutiveErrors: number;       // :58 (separate from failures!)
  startTime: Date;
  waitingUntil: Date | null;
  lastMessage: string | null;
  lastAgentError?: string | null;
  hasPendingCommitFailure?: boolean; // :63
}
```

#### 退避算法（关键差异）

```typescript
// orchestrator.ts:370-383
if (this.state.consecutiveErrors > 0 && !this.stopRequested) {
    const backoffMs = 60_000 * Math.pow(2, this.state.consecutiveErrors - 1);
    // 60s, 120s, 240s, 480s, 960s, 1920s...  ← NO CAP!
    this.state.status = "waiting";
    this.state.waitingUntil = new Date(Date.now() + backoffMs);
    await this.interruptibleSleep(backoffMs);
}
```

**关键发现**: gnhf **没有 cap**，退避无限指数增长。我们有 300s（5min）cap。

#### consecutiveFailures vs consecutiveErrors（重要区分）

gnhf 区分了两种计数器:
- `consecutiveFailures` (:57) — agent 自报失败（success=false），**触发 abort**（:362 `maxConsecutiveFailures`）
- `consecutiveErrors` (:58) — 进程崩溃/infra 错误，**触发退避**（:370）

```typescript
// orchestrator.ts:361-368
if (this.state.consecutiveFailures >= this.config.maxConsecutiveFailures) {
    this.abort(`${this.config.maxConsecutiveFailures} consecutive failures`);
    break;
}
```

#### Pre/Post-Iteration Abort

```typescript
// orchestrator.ts:739-748
private getPreIterationAbortReason(): string | null {
    if (this.limits.maxIterations !== undefined &&
        this.state.currentIteration >= this.limits.maxIterations) {
        return `max iterations reached (${this.limits.maxIterations})`;
    }
    return this.getTokenAbortReason();
}

// orchestrator.ts:750-759  (identical logic)
private getPostIterationAbortReason(): string | null { ... }
```

**关键发现**: pre 和 post 的逻辑**完全相同**——都是检查 maxIterations 和 maxTokens。之前报告说"双阶段分类器"夸大了。

#### buildCommitRepairPrompt

```typescript
// orchestrator.ts:626-639
private buildCommitRepairPrompt(basePrompt: string): string {
    return `${basePrompt}

## Previous Commit Failure

The previous iteration made workspace changes, but gnhf could not commit them because git commit failed.
Do not start unrelated work.
Inspect and fix the existing uncommitted changes so the commit can pass, then report success.

Git commit output:
\`\`\`
${this.pendingCommitFailure}
\`\`\``;
}
```

**关键发现**: 只是简单的 prompt 拼接，把 git commit 错误信息注入下一轮 prompt。

#### STOP_CLOSE_AGENT_GRACE_MS

```typescript
// orchestrator.ts:81
const STOP_CLOSE_AGENT_GRACE_MS = 250;
```

#### tokensEstimated sticky flag

```typescript
// orchestrator.ts:49-52
// Sticky flag: true when at least one iteration's usage was reported as
// estimated (e.g. an ACP adapter that doesn't emit usage_update). Once set,
// it stays set for the rest of the run so totals are presented honestly.
tokensEstimated: boolean;
```

#### PermanentAgentError

```typescript
// orchestrator.ts:563 (imported from agents/types.js)
// 当 agent 抛出 PermanentAgentError 时立即 abort，不退避
```

#### 与本项目对比

| 维度 | gnhf | 本项目 (backoff.mjs) |
|------|------|---------------------|
| 退避基数 | 60s | 30s |
| 退避 cap | **无 cap** | 300s (5min) |
| failure/error 区分 | consecutiveFailures + consecutiveErrors 两个计数器 | 单一 infra-retry 判定 |
| maxConsecutiveFailures | 有，触发 abort | **无** |
| pre/post abort | 有，但逻辑相同 | **无** |
| commit repair prompt | 有 | **无** |
| tokensEstimated | sticky flag | **无** |
| PermanentAgentError | 有，立即 abort | **无** |
| STOP_CLOSE_AGENT_GRACE_MS | 250ms | **无** |

**落地建议**:
1. 在 backoff.mjs 增加 `consecutiveFailures` 计数器 + `maxConsecutiveFailures` 阈值 abort — S
2. 增加 `buildCommitRepairPrompt` — S
3. 增加 `tokensEstimated` sticky flag — S
4. gnhf 的退避无 cap 是设计缺陷，我们的 300s cap 更好，不要去掉

---

### 2.3 OpenHarness: dry-run readiness + autodream

**源码路径**: `HKUDS/OpenHarness:src/openharness/cli.py` (2551行, 完整读取)

#### _evaluate_dry_run_readiness

```python
# cli.py:333-393
def _evaluate_dry_run_readiness(*, prompt, entrypoint, validation) -> dict:
    level = "ready"
    reasons = []
    next_actions = []

    # Check 1: unknown slash command → blocked
    if entrypoint.get("kind") == "unknown_slash_command":
        level = "blocked"
        # ...

    # Check 2: API client error → blocked (for model_prompt) or warning
    api_client = validation.get("api_client")
    if isinstance(api_client, dict) and api_client.get("status") == "error":
        if entrypoint.get("kind") == "model_prompt":
            level = "blocked"
        elif level != "blocked":
            level = "warning"

    # Check 3: MCP errors → warning (not blocked)
    mcp_errors = int(validation.get("mcp_errors") or 0)
    if mcp_errors > 0 and level != "blocked":
        level = "warning"

    # Check 4: missing auth → warning (not blocked!)
    auth_status = str(validation.get("auth_status") or "")
    if auth_status.startswith("missing") and entrypoint.get("kind") in {"interactive_session", "model_prompt"}:
        level = "warning"

    return {"level": level, "reasons": reasons, "next_actions": deduped_actions}
```

**关键发现**: 实际只有 **4 个检查维度**（unknown command / API client / MCP errors / auth），不是之前报告说的 6 个。而且维度之间的优先级是 blocked > warning > ready。

#### autodream prompt.py (5410 chars, 完整读取)

5 类 taxonomy:
1. **Stable Preference** — 用户陈述或反复展示的持久偏好
2. **Durable Project Context** — 仓库路径、canonical repos、验证命令
3. **Recent Snapshot** — 活跃分支、当前 commit，必须包含 `Last observed: YYYY-MM-DD`
4. **Sensitive/Private Context** — 必须包含 `Privacy: personal/private; do not share externally`
5. **Operational Reminder** — 安全/工作流提醒

PREVIEW/APPLY 双模式:
```python
# prompt.py:24
write_mode = "PREVIEW MODE: do not write files; propose a concise patch plan only." if preview \
    else "APPLY MODE: update memory files directly when changes are clearly warranted."
```

#### autodream lock.py (4290 chars, 完整读取)

```python
# lock.py:18-20
LOCK_FILE = ".consolidate-lock"
HOLDER_STALE_SECONDS = 60 * 60  # 1 hour

# lock.py:57-74 — try_acquire_consolidation_lock
def try_acquire_consolidation_lock(cwd, memory_dir=None) -> float | None:
    path = _lock_path(cwd, memory_dir)
    prior_mtime = path.stat().st_mtime  # 上次成功时间
    holder = _holder_pid(path)
    if prior_mtime is not None and time.time() - prior_mtime < HOLDER_STALE_SECONDS:
        if holder is not None and _is_process_running(holder):
            return None  # locked by another running process
    atomic_write_text(path, f"{os.getpid()}\n")
    # ... verify we own it now
```

**关键发现**: 锁机制只是文件级 PID 锁 + 1h stale timeout。`_is_process_running` 用 `os.kill(pid, 0)` 检测进程存活。

#### 与本项目对比

| 维度 | OpenHarness | 本项目 |
|------|------------|--------|
| dry-run readiness | 有，4 维度 | **无** |
| autodream | 有，prompt 工程 + 锁 | **无** |
| autodream taxonomy | 5 类 | **无** |
| autodream PREVIEW/APPLY | 有 | **无** |

**落地建议**:
1. Dry-run readiness: 在 harness 启动前增加预检，检查 ContextDB 索引 + Git 状态 + MCP 探针 + model-router provider 状态 — M
2. Auto-dream: 复用 memo 系统，增加 `aios dream [--preview]` 命令，prompt 模板直接抄 OpenHarness 5 类 taxonomy — M

---

### 2.4 oh-my-openagent (oh-my-opencode): default_mode

**源码路径**: `code-yeongyu/oh-my-opencode` (仓库已重命名)

#### 重大发现: default_mode config 字段不存在

子代理完整读取了 `src/config/schema.ts:1-342`（整个 `OhMyOpenCodeConfigSchema`），**没有 `default_mode` / `defaultMode` 字段**。

配置顶层字段只有: `disabled_mcps, disabled_agents, disabled_skills, disabled_hooks, disabled_commands, agents, categories, claude_code, sisyphus_agent, comment_checker, experimental, auto_update, skills, ralph_loop, background_task, notification, git_master`

**之前竞品报告的 "default_mode config auto-activates ultrawork" 是错误描述。**

#### 真实机制: 运行时关键词检测 Hook

```typescript
// src/hooks/keyword-detector/index.ts:17-22 — 从 output.parts 提取 prompt
// src/hooks/keyword-detector/index.ts:33-35 — detectKeywordsWithType()
// src/hooks/keyword-detector/index.ts:66-83 — 检测到 ultrawork → 改 variant="max"
// src/hooks/keyword-detector/index.ts:90-96 — 前置注入到用户消息
```

`ULTRAWORK MODE ENABLED!` 不是代码生成的，而是注入到 LLM 上下文的一条指令，要求 LLM 自己说出来。

```typescript
// src/hooks/keyword-detector/constants.ts — KEYWORD_DETECTORS
{ pattern: /\b(ultrawork|ulw)\b/i, message: getUltraworkMessage }
```

#### restrictedAgents 也不存在

per-agent 过滤靠两个独立机制:
1. 静态工具黑名单 `src/shared/agent-tool-restrictions.ts:7-31`
2. 配置层 `agents.<name>.skills: z.array(z.string())` (`config/schema.ts:118`)

#### 与本项目对比

本项目完全没有运行时关键词检测机制。

**落地建议**: 如果要做 "default_mode"，需要在 bootstrap 阶段读 `.aios/config.json` 并主动注入对应 directive。这是原创工作，不是抄竞品。

---

## 3. 差距矩阵与优先级

### P0 — 本月可落地（S/M 工作量）

| # | 功能 | 来源 | 本项目 gap | 工作量 | 证据 |
|---|------|------|-----------|--------|------|
| 1 | **4 段 mentor verdict schema** | the-pair `quality_gate.rs:8-47` | verification-evidence.mjs 无 schema | **S** | validate_review 只是 3 个 is_empty 检查 |
| 2 | **consecutiveFailures abort** | gnhf `orchestrator.ts:361-368` | backoff.mjs 无此计数器 | **S** | 简单 if + abort |
| 3 | **buildCommitRepairPrompt** | gnhf `orchestrator.ts:626-639` | 无 | **S** | prompt 字符串拼接 |
| 4 | **tokensEstimated sticky flag** | gnhf `orchestrator.ts:49-52` | 无 | **S** | boolean sticky |
| 5 | **Dry-run readiness** | OpenHarness `cli.py:333-393` | 无 | **M** | 4 维度预检 |

### P1 — 本季度规划

| # | 功能 | 来源 | 本项目 gap | 工作量 |
|---|------|------|-----------|--------|
| 6 | **Auto-dream / Sleep-Time** | OpenHarness `autodream/prompt.py` | 无 | **M** — prompt 工程 + 锁机制 + memo 集成 |
| 7 | **default_mode (原创)** | oh-my-openagent (不抄) | 无 | **M** — bootstrap config 读取 + directive 注入 |
| 8 | **Skill workshop rollback 文件级恢复** | OpenClaw (待确认) | rollback 只恢复 metadata | **M** |
| 9 | **Skill compliance 实跑** | ECC skill-comply | compliance.mjs 只支持 --dry-run | **M** |

### 不建议借鉴

| 功能 | 来源 | 原因 |
|------|------|------|
| gnhf 无 cap 退避 | gnhf `orchestrator.ts:372` | 无限指数增长是设计缺陷，我们的 300s cap 更好 |
| overstory 11-adapter | overstory (archived) | oh-my-openagent 公开反对 "Premature adapter pattern" |
| SQLite WAL Mail Bus | overstory (archived) | OpenHarness 用更轻的文��� mailbox，已成事实标准 |
| oh-my-openagent default_mode | oh-my-openagent | **不存在**，之前报告描述错误 |

---

## 4. 纠正之前报告的错误

| 之前报告声称 | 实际源码验证 | 纠正 |
|-------------|-------------|------|
| "OpenHarness dry-run 检查 6 个维度" | `_evaluate_dry_run_readiness` 只有 4 个维度 | cli.py:333-393 |
| "gnhf 60s×2^n 退避" | 正确，但没提**无 cap** | orchestrator.ts:372 |
| "gnhf pre/post abort 是双阶段分类器" | pre 和 post 逻辑**完全相同** | orchestrator.ts:739-759 |
| "the-pair 4 段 verdict schema" | 实际是 3 段 (FILES_REVIEWED/CHECKS/CODE)，不是 4 段 | quality_gate.rs:8-16 |
| "oh-my-openagent default_mode config" | **字段不存在**，是运行时关键词检测 hook | config/schema.ts:280-294 |
| "oh-my-openagent restrictedAgents" | **配置项不存在**，靠 agent-tool-restrictions.ts 静态黑名单 | shared/agent-tool-restrictions.ts:7-31 |
| "受控技能自生成闭环未实现" | **skill-workshop.mjs 已实现 319 行** propose/review/apply/rollback | 本项目 skill-workshop.mjs |

---

## 5. 建议执行顺序

```
Phase 1 (本周, S 工作量):
  #1 4 段 mentor verdict schema → verification-evidence.mjs
  #2 consecutiveFailures abort → backoff.mjs
  #3 buildCommitRepairPrompt → solo-runtime/state.mjs
  #4 tokensEstimated sticky flag → solo-runtime/state.mjs

Phase 2 (本月, M 工作量):
  #5 Dry-run readiness → 新文件 scripts/lib/harness/dry-run-readiness.mjs

Phase 3 (本季度, M 工作量):
  #6 Auto-dream → 新文件 scripts/lib/memo/autodream.mjs
  #7 default_mode (原创) → scripts/aios.mjs bootstrap
  #8 Skill workshop rollback 文件级恢复
  #9 Skill compliance 实跑
```

---

## 附录 A: 数据源与置信度

| 竞品 | 读取方式 | 文件 | 置信度 |
|------|---------|------|--------|
| the-pair | raw.githubusercontent.com 完整读取 | quality_gate.rs (5010 bytes / 139行) | **高** |
| gnhf | raw.githubusercontent.com 完整读取 | orchestrator.ts (25206 bytes / 843行) | **高** |
| OpenHarness | raw.githubusercontent.com + 子代理完整读取 | cli.py (93927 bytes / 2551行), autodream/service.py (313行), prompt.py (128行), lock.py (138行), backup.py (104行), usage.py stale 筛选 | **高** |
| oh-my-openagent | 子代理 Git Trees+Blobs API 完整读取 | config/schema.ts, hooks/keyword-detector/*, shared/agent-tool-restrictions.ts | **高** |
| OpenClaw | subagent GitHub API 完整读取 7 个源文件 | src/skills/workshop/types.ts (4272B), config.ts (1939B), policy.ts (2358B), frontmatter.ts (4194B), store.ts (20111B), service.ts (33283B), service.test.ts (37742B), src/skills/security/scanner.ts, src/skills/lifecycle/workspace-skill-write.ts, src/skills/workshop/policy.ts | **高** |
| TencentDB | 子代理 raw.githubusercontent.com + GitHub Blobs API 完整读取 | offload/index.ts (2310行), types.ts (249行), l2-mermaid.ts (286行), l3.ts (1412行), mmd-injector.ts (374行), mmd-meta.ts, backend-client.ts, local-llm/, storage.ts (664行), state-manager.ts, 16 个文件总计 | **高** |

---

## 附录 B: OpenHarness autodream 补充分析（子代理源码级）

### B.1 配置开关（settings.py:72-74）

```python
auto_dream_enabled: bool = False       # 默认关
auto_dream_min_hours: float = 24.0     # 距上次 consolidate 至少 24h
auto_dream_min_sessions: int = 5       # 至少 5 个新 session
```

### B.2 门控链（execute_auto_dream, service.py:248-303）

顺序短路，任一不满足即 return None:
1. `_CHILD_ENV` 环境变量存在 → 跳过（防子进程递归, service.py:262-263）
2. `memory.enabled and memory.auto_dream_enabled` 为 False → 跳过
3. `hours_since < auto_dream_min_hours` (24h) → 跳过
4. **节流**: 距上次 session 扫描 < 10 分钟 → 跳过扫描本身 (service.py:26-277)
5. `len(session_ids) < auto_dream_min_sessions` (5) → 跳过
6. 委托 `start_dream_now(force=False)`

### B.3 锁机制设计观察

**关键发现**: 锁不是 OS flock，是 stat+write+recheck 乐观锁:
- 文件内容: `f"{os.getpid()}\n"` (lock.py:69)
- 判活: `os.kill(pid, 0)` (lock.py:40-49)
- stale 阈值: 1 小时 (lock.py:15)
- "上次成功时间" = 锁文件 mtime（隐式契约，无独立时间戳字段）
- rollback: 恢复锁文件 mtime 到 acquire 前的值 (lock.py:78-94)

**脆弱点**: rollback 必须恢复 mtime，否则 min_hours 门控失效。

### B.4 PREVIEW 模式的风险

**关键发现**: preview 模式无代码级写保护——完全靠提示词约束 LLM。

- preview 不创建备份 (service.py:144: `backup_dir = ... if not preview else None`)
- preview 完成后回滚锁 (service.py:82-83)
- 但若 LLM 不听话仍可能改文件，此时既无备份又无拦截
- APPLY 模式至少有 backup 兜底

### B.5 stale 候选筛选（memory/usage.py:107-136）

- `importance > 1` 跳过（重要记忆不判 stale）
- `use_count > 0` 跳过（用过的不算 stale）
- `updated_at` 距今 >= 60 天才入选
- 排序: `(importance, updated_at, path.name)`
- 前 20 个写进 prompt，明确告知 "treat as review candidates, not automatic deletion"

### B.6 taxonomy 是 prompt-only

5 类别只存在于提示词文本（prompt.py:49-54），代码层没有枚举或校验。schema-v1 frontmatter 的 13 个字段同理——靠 LLM 自觉填写。

### B.7 子进程隔离

`_CHILD_ENV=1` 环境变量防止 dream 子进程再触发 dream（递归），简洁有效的防重入机制 (service.py:27, 112-113, 262-263)。

LLM 在子进程里以 `--print` 模式跑 prompt (service.py:203)，`runner_module == "openharness"` 时追加 `--dangerously-skip-permissions`。

---

## 附录 C: TencentDB 符号化压缩补充分析（子代理源码级）

子代理完整读取了 16 个源码文件（含 offload/index.ts 2310行、l3.ts 1412行、storage.ts 664行等），以下是关键发现。

### C.1 五级管线架构

| 阶段 | 文件 | 职责 | LLM 依赖 |
|------|------|------|---------|
| L1 | `local-llm/prompts/l1-prompt.ts` | tool pair → JSON 摘要 | **是** |
| L1.5 | `local-llm/prompts/l15-prompt.ts` | 任务边界判定 (long/short) | **是** |
| L2 | `pipelines/l2-mermaid.ts` | node_id 分配 + Mermaid 图更新 | **是** |
| L3 | `hooks/llm-input-l3.ts` | mild → aggressive → emergency 三级压缩 | 否（规则） |
| L4 | `backend-client.ts` | Skill 生成 | **是** |

### C.2 三档阈值——基于 contextWindow 比例（不是节点数）

```typescript
// types.ts:185-197 — PLUGIN_DEFAULTS
mildOffloadRatio: 0.5,          // mild 触发
aggressiveCompressRatio: 0.85,  // aggressive 触发
emergencyCompressRatio: 0.95,   // emergency 触发
emergencyTargetRatio: 0.6,      // emergency 目标
mmdMaxTokenRatio: 0.2,         // MMD 注入 token 预算

// l3.ts:217-222 — 计算
const mildThreshold = Math.floor(contextWindow * 0.5);
const aggressiveThreshold = Math.floor(contextWindow * 0.85);
```

### C.3 与本项目 mermaid-canvas.mjs 的关键差异

| 维度 | TencentDB | 本项目 (mermaid-canvas.mjs) |
|------|-----------|---------------------------|
| 触发机制 | contextWindow 比例 (0.5/0.85/0.95) | 固定节点数 (20/50) |
| Mermaid 生成 | **LLM 提取** (L2 调 LLM) | **规则引擎** (canvasToMermaid) |
| 压缩级别 | 3 级 (mild/aggressive/emergency) | 2 级 (mild/aggressive) |
| node_id 格式 | `\d{3}-N\d+` (如 000-N001) | `n{seq:04d}-{sha1[:6]}` |
| 回查机制 | 两步 grep: node_id → result_ref → refs/*.md | 一步 grep: grepRefs 直接搜 refs |
| LLM 依赖 | L1/L1.5/L2/L4 都调 LLM | **零 LLM 依赖** |
| 评分机制 | L1 给 score 0-10，mild 按分替换 | 无评分 |
| MMD token 预算 | mmdMaxTokenRatio=0.2 限制 history MMD | CANVAS_RECALL_MAX_CHARS=12000 固定 |

**关键洞察**: TencentDB 的 Mermaid 生成依赖 LLM（L2 阶段调 LLM 生成 replaceBlocks），本项目的 `canvasToMermaid` 是纯规则引擎（直接从 canvas JSON 生成 graph LR）。这是根本性的架构差异——TencentDB 牺牲了 LLM token 换取更精准的状态图，本项目零 LLM 依赖但图的质量较低。

### C.4 node_id 回查机制

TencentDB 是**两步 grep**:
1. 在 `offload.<sessionId>.jsonl` 中 grep `node_id`，找到条目的 `result_ref` 字段
2. 读取 `refs/<timestamp>.md` 获取原始结果

本项目是**一步 grep**:
- `grepRefs()` 直接正则搜索 refs 目录下的 `.md` 或 `.json` 文件

本项目的回查更直接，但缺少 node_id → result_ref 的结构化映射。

### C.5 emergency 压缩（本项目缺失的第三级）

TencentDB 有 emergency 级别（0.95 触发，目标 0.6），当 aggressive 因用户消息保护卡住时强制触发，不再保留 pair 完整性。本项目只有 mild/aggressive 两级，无 emergency 兜底。

### C.6 L2 独立触发条件

TencentDB 的 L2（Mermaid 更新）独立于 L1（摘要）触发:
- 条件 A: `node_id=null` 的条目数 >= 4
- 条件 B: 距上次 L2 超过 300s
- 只处理 L1.5 判定为 long task 的段

本项目的 canvas 更新是每轮自动执行（loop.mjs:205 `compactCanvas`），无独立触发条件。

---

## 附录 D: OpenClaw Skill Workshop 补充分析（子代理源码级）

子代理完整读取了 `src/skills/workshop/` 全部 7 个文件 + `src/skills/security/scanner.ts`，以下是关键发现。

### D.1 与本项目 skill-workshop.mjs 的核心差距

| 维度 | OpenClaw | 本项目 (skill-workshop.mjs) |
|------|---------|---------------------------|
| rollback | **文件级**——完整内容内联到 rollback.json | **metadata only**——`file content not restored` (:315) |
| scanner | 三次扫描 (propose/revise/apply)，7+ 规则 | **无 scanner** |
| 审批闸门 | apply/reject/quarantine 需 allow-once/deny | **无审批闸门** |
| support files | 64 文件上限，2MB 总量，禁可执行/硬链接/符号链接 | **无 support files 机制** |
| stale 检测 | currentContentHash 校验，目标变更自动 stale | **无 stale 检测** |
| 文件锁 | 按目标 skill hash 加锁 + manifest 锁 | **无文件锁** |
| proposal ID | `<slug>-<YYYYMMDD>-<uuid10>` 格式校验 | `prop-<timestamp>-<hex4>` 无格式校验 |
| frontmatter | 强制注入 status:proposal，apply 时剥离 | 生成空壳模板 |

### D.2 OpenClaw rollback 的文件级实现（关键差距）

```typescript
// types.ts:86-99 — SkillProposalRollback
export type SkillProposalRollback = {
  schema: typeof SKILL_WORKSHOP_ROLLBACK_SCHEMA;
  proposalId: string;
  writtenAt: string;
  targetSkillFile: string;
  action: "create" | "update";
  previousContentHash?: string;
  previousContent?: string;          // ← 完整文件内容！
  supportFiles?: Array<{
    path: string;
    existed: boolean;
    previousContentHash?: string;
    previousContent?: string;        // ← 每个支持文件的完整内容！
  }>;
};
```

本项目 rollback 只恢复 metadata（skill-workshop.mjs:297-318 `history.pop()` + 恢复 version/hash/path），明确不恢复文件内容。OpenClaw 把 apply 前的完整文件内容内联到 rollback.json，支持完整恢复。

### D.3 OpenClaw scanner 规则

7 个 skill 内容规则 + 6 个代码源规则:
- prompt-injection-ignore-instructions (critical)
- prompt-injection-system (critical)
- prompt-injection-tool (critical)
- shell-pipe-to-shell (critical): `curl ... | sh/bash`
- secret-exfiltration (critical): `process.env` + `fetch/curl`
- destructive-delete (warn): `rm -rf / $HOME`
- dangerous-exec (critical): `child_process.exec/spawn`
- dynamic-code-execution (critical): `eval()` / `new Function()`
- env-harvesting (critical): `process.env` + 网络发送

apply 时重新扫描，不 clean 则自动 quarantine。

### D.4 落地建议

本项目 skill-workshop.mjs 需要:
1. **rollback 文件级恢复** — apply 前读取完整文件内容存入 rollback.json — S
2. **scanner** — 实现 7 条 critical 规则的 regex 检测 — M
3. **stale 检测** — apply 时校验 currentContentHash — S
4. **support files** — 增加 support files 准备+校验+写入 — M
