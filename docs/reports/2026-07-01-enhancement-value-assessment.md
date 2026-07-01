# 竞品功能对 agent 配合的真实提升评估

> 生成日期: 2026-07-01
> 前置文档: `docs/reports/2026-07-01-source-level-gap-analysis.md`（差距分析，含源码级证据）
> 本报告: 逐项评估每个差距对 "agent 配合" 的真实提升，重新排序并给出行动建议

---

## 1. 评估标准

从 "agent 配合更有效" 的角度，4 个维度:

| 维度 | 含义 |
|------|------|
| **可靠性** | agent 出故障时能否自动恢复，减少人工干预 |
| **可验证性** | 能否判断 agent 的输出/行为是否符合要求 |
| **上下文质量** | agent 能否拿到正确、充足、不过载的信息 |
| **安全可控** | agent 能否安全地执行需要权限的操作（如写 skill） |

---

## 2. 逐项评估

### 2.1 #1 4 段 mentor verdict schema → verification-evidence.mjs

| 项目 | 内容 |
|------|------|
| **竞品实现** | the-pair: `quality_gate.rs:8-47` — 3 字段 `files_reviewed` + `checks_performed` + `code_reference` + 3 个 `is_empty()` 检查 |
| **本项目现状** | 无 mentor verdict schema；`scripts/lib/skills/` 下无 verification-evidence.mjs 文件 |
| **真实提升** | **中** — 让 mentor review 的结果结构化可追溯，但 schema 本身极简（3 个空检查），**不改变 agent 行为**，只改变记录方式 |
| **瓶颈** | mentor 不是 agent pipeline 的一部分——verdict 由人工产生，schema 只是让它更好看。agent 配合的核心是 agent 之间的交互，不是人机交互 |
| **结论** | **建议做，但优先级降低** — 这是记录层改进，不是 agent 配合层改进。做的时候可以借这个机会引入 `persistQualityGateEvidence`，把 verdict 结果接入 ContextDB event:add，以后 agent 可以查询过去 review 的历史 |

### 2.2 #2 consecutiveFailures abort → backoff.mjs

| 项目 | 内容 |
|------|------|
| **竞品实现** | gnhf `orchestrator.ts:361-368` + `orchestrator.ts:57` — `consecutiveFailures` 计数器 + `maxConsecutiveFailures` 阈值 abort |
| **本项目现状** | `scripts/lib/harness/solo-runtime/backoff.mjs:24` — 只有 30s×2^n 退避 + 300s cap，没有 consecutive 计数器 |
| **真实提升** | **高** — 当前 bug 场景：agent 反复失败 → 无限退避 → 永远不会 abort → 浪费 token + 时间。加 counter + maxConsecutive 后，连续失败 N 次直接 abort，避免无效重试 |
| **影响范围** | solo-runtime loop 的所有 agent 执行 |
| **结论** | **建议做，保持高优先级** — 这是 reliability 维度的直接提升。简单（S），且解决的是一个明确的存在性 bug |

### 2.3 #3 buildCommitRepairPrompt → solo-runtime/state.mjs

| 项目 | 内容 |
|------|------|
| **竞品实现** | gnhf `orchestrator.ts:626-639` — git commit 失败后，把错误信息注入下一轮 prompt，让 agent 修复 |
| **本项目现状** | 无 commit repair 机制 |
| **真实提升** | **中** — 让 agent 不白干活：commit 失败时 agent 知道自己哪里错了（commit error output），可以主动修复。但目前本项目 solo-runtime 是否自动 commit？需要先确认 git commit 是否是 pipeline 的一部分 |
| **瓶颈** | 如果 solo-runtime 的每轮结果不进 git（只是写 journal/checkpoint），那 commit repair 没有意义。要先确认 git 在 pipeline 中的位置 |
| **结论** | **先调研再决定** — 调查 solo-runtime 是否有自动 commit 步骤。如果有 → 中优先级；如果没有 → 不需要（这是 git-based orchestrator 的机制，不适用于 file-journal-based harness） |

### 2.4 #4 tokensEstimated sticky flag → solo-runtime/state.mjs

| 项目 | 内容 |
|------|------|
| **竞品实现** | gnhf `orchestrator.ts:49-52` — sticky boolean，当至少一个 iteration 的 usage 为 estimated 时设置，全程保持，让 token 统计诚实展示 |
| **本项目现状** | 无此机制 |
| **真实提升** | **低** — 这是一个显示/透明度改进。token 统计不准只是展示层面的问题，不影响 agent 行为或 pipeline 决策 |
| **瓶颈** | 我们的 token 统计（如果有的话）可能来自 provider API 的 usage_update 事件，而不是自己估算。如果 provider 一直返回准确值，sticky flag 根本不会触发 |
| **结论** | **不建议做** — 这是展示层优化，不是 agent 配合层优化。等 token 统计模块存在后再考虑 |

### 2.5 #5 Dry-run readiness → 新文件

| 项目 | 内容 |
|------|------|
| **竞品实现** | OpenHarness `cli.py:333-393` — 4 维度预检：unknown slash command / API client error / MCP errors / missing auth |
| **本项目现状** | 无 — `search_files` 确认 0 结果 |
| **真实提升** | **高** — 问题是：当前 harness 启动前不做任何预检，agent 执行到一半才发现 auth 缺失 / MCP 配置错误 / model 不可达，导致整轮失败。提前发现可以避免 "agent 跑了一半才死" |
| **检查维度** | 可以比 OpenHarness 更多：ContextDB 索引是否存在 / Git 状态是否干净 / provider 是否能连 / MCP 服务器是否可达 |
| **结论** | **建议做，高优先级** — 这是 "agent 启动成功率" 的直接提升。M 工作量（需要预检几个环境检测点），但价值明确 |

### 2.6 #6 Auto-dream / Sleep-Time

| 项目 | 内容 |
|------|------|
| **竞品实现** | OpenHarness `autodream/` — 5 类 taxonomy (Stable Preference / Durable Project Context / Recent Snapshot / Sensitive/Private / Operational Reminder) + PREVIEW/APPLY 双模式 + 锁机制 + stale 筛选 |
| **本项目现状** | 无 dream/睡眠机制 |
| **真实提升** | **高（长期） / 中（短期）** — 长期看，auto-dream 让 agent 的记忆系统从 "每次 session 从零开始" 变成 "有跨 session 的 durable knowledge"，agent 配合质量从根本上升级。但短期做好有门槛：需要 LLM 做 consolidation、需要锁防并发、taxonomy 上下文的 schema 化 |
| **瓶颈** | 1) 需要消耗 LLM token 做 dream（每次 ~几万 token）；2) PREVIEW 模式无代码级写保护，LLM 可能乱写；3) 消费端（memo 系统）是 `aios memo`，dream 产出需要能被 memo 消费 |
| **结论** | **建议做，但分两阶段** — Phase A: 先做 manual dream（`aios dream --preview` 命令），不自动触发。Phase B: 再做 auto-dream（定时 + 门控链） |

### 2.7 #7 default_mode (原创设计)

| 项目 | 内容 |
|------|------|
| **竞品机制** | oh-my-openagent 没有 default_mode config 字段，是运行时 ULTRAWORK 关键词检测 hook |
| **本项目现状** | 完全没有 runtime directive 注入机制 |
| **真实提升** | **中（原始创新的先决条件）** — `default_mode` 的核心价值不是"用户说 default 就 ultra"，而是**让 agent pipeline 在启动时就能读到一致的 directive 配置**，避免每轮 prompt 上下文不一致。这是所有高级 agent 配合的基础设施 |
| **瓶颈** | 1) default_mode 是什么 —  concretely 什么时候需要 → `require('web')` deep search / 对所有 skill 启用 strict 模式 / 只用特定 provider；2) 注入到什么位置 — pre_send hook / system prompt / client instruction |
| **结论** | **建议做，但先做核心** — 不直接抄 ULTRAWORK 关键词检测（那只是 oh-my-openagent 的 hack），而是做 `aios runtime directive` 体系：一个 `.aios/runtime-directive.json` 文件 + bootstrap 时注入到 agent 上下文的 hook。这是基础设施，让后续所有功能有统一的配置入口 |

### 2.8 #8 Skill workshop rollback 文件级恢复

| 项目 | 内容 |
|------|------|
| **竞品实现** | OpenClaw `workshop/types.ts:86-99` — `previousContent` 内联到 rollback.json，apply 前存完整内容 |
| **本项目现状** | `skill-workshop.mjs:297-318` — rollback 只恢复 metadata，文件内容不能被恢复 |
| **真实提升** | **中** — 直接解决 "apply 后坏了无法回退" 的问题。file content not restored 是一个真实缺陷，一旦 skill 被 apply 后内容损坏，无法通过 rollback 恢复 |
| **瓶颈** | 1) rollback.json 会膨胀（大 skill 文件完整内容内联）；2) 需要先解决 stale 检测（不然 apply 完了才发现 skill 已被手动修改，rollback 会覆盖用户的修改） |
| **结论** | **建议做，中优先级** — S 工作量改动（apply 前存一份 content），但需要先做 #10 stale 检测一起上。不早做也不是不行，因为当前 skill-workshop 没在生产被大规模使用 |

### 2.9 #9 Skill compliance 实跑

| 项目 | 内容 |
|------|------|
| **竞品实现** | ECC skill-comply — 实际运行 agent 测试 skill |
| **本项目现状** | `scripts/lib/skills/compliance.mjs` — 只支持 `--dry-run`，3 场景 (supportive/neutral/competing) 是静态模板 |
| **真实提升** | **低 → 中** — dry-run 检查的是 "skill 的 frontmatter 里有没有声称能做什么"，实跑检查的是 "skill 实际运行后 agent 能不能真的完成指定任务"。实跑的价值在于发现声明与实际能力不一致的 skill |
| **瓶颈** | 1) 需要有 test agent（谁来跑 compliance test？）；2) 需要一个 pre-approved base skill 集作为 baseline；3) 这本质上是 continuous evaluation，成本高 |
| **结论** | **暂缓，等 skill workshop 成熟后再做** — compliance 实跑的前提是有足够的 skill 需要评估。当前 skill-workshop 还处于早期阶段，先让 skill 产出流程跑通，再上 compliance CI |

### 2.10 新增评估：the-pair 的 emergency 压缩第三级

| 项目 | 内容 |
|------|------|
| **竞品实现** | TencentDB `l3.ts` — emergency 级别（0.95 触发，目标 0.6），能够强制压缩不再保留 pair 完整性 |
| **本项目现状** | `scripts/lib/offload/tool-offload.mjs` — 只有 mild/aggressive 两级 |
| **真实提升** | **中** — 当 aggressive 压缩因 "用户消息保护" 卡住（不能压缩最近几条用户交互），context 会持续膨胀。emergency 兜底确保总有最后一个手段，不导致 overflow |
| **瓶颈** | emergency 会丢失信息，需要用户在事后能找回 |
| **结论** | **建议做，中优先级** — 作为 offload 的 safety net。S 工作量（加一个阈值判断 + fallback 逻辑） |

---

## 3. 重新排序建议

按对 agent 配合的实际提升排序：

### A 优先级（直接提升 agent 配合质量，S/M 工作量，本周~本月）

| 序 | 功能 | 为什么排在前 | 工作量 |
|----|------|------------|--------|
| A1 | **consecutiveFailures abort** | 解决 agent 无限重试 bug，100% 有效预防 token 浪费 | **S** |
| A2 | **Dry-run readiness** | agent 跑一半才发现环境不行，这种失败完全可避免 | **M** |
| A3 | **emergency 压缩第三级** | offload 的安全兜底，防止 context overflow 导致 agent 崩溃 | **S** |

### B 优先级（中长期提升，分阶段）

| 序 | 功能 | 为什么 | 工作量 |
|----|------|--------|--------|
| B1 | **default_mode (原创)** | agent pipeline 的配置基础设施，后续所有功能的前提 | **M** |
| B2 | **Auto-dream Phase A (manual)** | 跨 session 记忆质的提升，先手动后自动 | **M** |
| B3 | **Skill workshop rollback + stale** | skill 生命周期的安全兜底 | **M** |

### C 不建议或暂缓

| 功能 | 理由 |
|------|------|
| buildCommitRepairPrompt | 先确认 git commit 是 pipeline 的一环。如果不是 → 不需要。如果是 → 等确认后做 |
| tokensEstimated sticky flag | 展示层优化，不影响 agent 行为 |
| 4 段 mentor verdict schema | 记录层改进，不改变 agent 配合。做的时候顺便接入 ContextDB 就行 |
| Skill compliance 实跑 | 等 skill workshop 成熟后做 |
| default_mode 抄 oh-my-openagent 关键词检测 | 原文不存在 config 字段，关键词检测是 hack。做原创的 directive 体系 |

---

## 4. 与之前的差距分析报告的对比

| 报告 | 核心假设 | 问题 |
|------|---------|------|
| 之前 | "竞品有什么我们就做什么" | 没有评估功能对 agent 配合的真实价值 |
| 之前 | 12 个 P0 | 6 个已有实现（从未核实） |
| 之前 | the-pair 4 段 verdict | 实际是 3 段（验证后纠正） |
| 之前 | gnhf 双阶段分类器 | pre/post abort 逻辑完全相同（验证后纠正） |
| **本报告** | "这个功能让 agent 配合更好吗？" | 从 agent 配合维度评估，给出重新排序 |

---

## 5. 具体行动建议

### 本周（S 工作量）

1. **`scripts/lib/harness/solo-runtime/backoff.mjs`** — 加 `consecutiveFailures` 计数器 + `MAX_CONSECUTIVE_FAILURES=5` abort 阈值。当前 backoff.mjs 已存在，直接扩展
2. **`tool-offload.mjs`** — 加 emergency 第三级（0.95 触发，目标 0.6），作为 safety net

### 本月（M 工作量）

3. **`scripts/lib/harness/dry-run-readiness.mjs`** — 新文件，4 维度预检（provider/MCP/ContextDB/git），在 `runSoloHarnessLoop` 启动前调用
4. **`.aios/runtime-directive.json` + bootstrap injection** — 原创 default_mode 基础设施

### 本季度（M 工作量）

5. **`scripts/lib/memo/autodream.mjs`** — 先 manual mode（`aios dream --preview`），再 auto mode
6. **`skill-workshop.mjs` rollback + stale** — 文件级恢复 + apply 时 contentHash 校验

---

## 6. 不在计划中的发现

### 6.1 the-pair 的 verdict schema 极简，不值得大做

之前报告把它列为 "4 段 verdict schema" 重点，实际源码只有 3 段 + 3 个 is_empty() 检查。作为 LLM 输出的结构化提取有参考意义，但不需要作为 agent 配合的基础设施。

### 6.2 gnhf 的退避无 cap 是缺陷，不是值得学习的点

gnhf `orchestrator.ts:372` 的 `60_000 * Math.pow(2, consecutiveErrors - 1)` 没有上限，意味着连续错误 10 次后退避 55 分钟。这是 bug，不是 design choice。我们的 300s cap 是正确做法。

### 6.3 OpenHarness autodream 的锁机制脆弱

`try_acquire_consolidation_lock` 用统计锁文件 mtime 作为 "上次成功时间"，但 rollback 必须恢复 mtime。如果 rollback 失败或进程异常退出，mtime 可能被错误重置，导致 min_hours 门控永久失效。这是 autodream 的隐性 bug。
