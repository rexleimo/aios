# rex-tdd SkillOpt 稳定性训练报告

日期：2026-07-17
结果：**ACCEPTED**
已接受 Skill SHA-256：`52d8e79298f56c371e9adac9628e23339ef00795d6a83208beed817c3ed0506b`

## 训练目标与边界

本轮只训练 `rex-tdd`。目标是让 Coding Agent 在已经由 rex-harness 选择的 TDD Command 下：遵守测试范围契约、分辨行为失败和基础设施失败、保留可审计的命令/退出状态/关键输出、避免借 Mock 或实现细节伪造 GREEN，并在冻结观察包中只完成当前阶段。

`rex-code-review` 与 `rex-test-design` 尚未开始；它们不会复用本轮的 Target 输出、Scorer 结果或留出集。

## 隔离评测协议

- 35 个任务：30 条训练任务与 5 条全新 validation 任务。
- 三个 Target 均以 `fork_turns=none` 运行：无 Skill 控制、初始 Skill 基线、v7 候选。
- Target 只读取 prompt 投影；基线和候选仅额外读取各自的 Skill 快照。
- 三个 Scorer 同样 `fork_turns=none`，每个只读取自己的 raw 输出、canonical eval、train、validation 和 prompt 投影；不读取任何 Skill 或其他组产物。
- 评分共有 135 条 assertion。成功的 `evidenceQuote` 必须是对应 `targetResponse` 中连续、非空的原文片段；失败项 quote 必须为空。
- 每轮 Target/Scorer receipt 都绑定输入和输出 SHA-256；6 个 invocationId 均唯一。

## Step 1--6：拒绝原因成为训练约束

| Step | 结论 | 留下的约束 |
|---|---|---|
| 1 | validation 泄漏，拒绝 | 反思不得使用 validation 答案或断言。 |
| 2 | 候选低于无 Skill 控制，拒绝 | 不只与旧版比较，必须保留控制组非回归。 |
| 3 | validation 无提升且低于控制组，拒绝 | 严格 TDD 的授权、执行不可用状态和当前阶段 Evidence 必须可表达。 |
| 4 | 执行协议与隔离 Target 冲突，留出集无判别力 | 被禁止执行时，评测应判断冻结事实的处理，而不是要求伪造现场运行。 |
| 5 | 重新裁决已选 strict Command，拒绝 | 已下发的 strict Command 是激活决策的授权投影，不能因便携视图缺少宿主私有 Fact 而二次裁决。 |
| 6 | hard 分数饱和且训练回归，拒绝 | 留出集必须使用正交 assertion；冻结观察必须逐项保留命令、退出状态、关键输出与失败分类。 |

Step 6 的留出集已被消费，未被重用。v7 候选先冻结，再由零仓库输入的 designer 生成新的留出集，时间顺序为 candidate freeze < holdout design。

## Step 7：接受的泛化修正

v7 只新增“冻结观察包”协议，而非背诵某个题目的答案。它要求 Agent：

1. 把当前 mode/stage 视为 rex-harness 已选定的 Command，不重新激活、重路由、升级或降级。
2. 在不能执行命令时，如实保留契约相关的命令、退出状态与关键输出，区分公共行为、基础设施失败和内部辅助证据。
3. 给出当前阶段的 `complete`、`blocked` 或 `incomplete` 判断，并停在当前阶段，等待新的 rex Command。

## v7 机器复算结果

| 组别 | Train hard | Validation hard | Train soft | Validation soft | Assertion 通过 |
|---|---:|---:|---:|---:|---:|
| 无 Skill 控制 | 0.5000 | 0.0000 | 0.8083 | 0.6667 | 107 / 135 |
| 初始 Skill 基线 | 0.4000 | 0.0000 | 0.7750 | 0.6667 | 103 / 135 |
| v7 候选 | 0.7333 | 1.0000 | 0.9333 | 1.0000 | 127 / 135 |

四条接受规则全部成立：

- candidate validation > baseline validation：`1.0 > 0.0`
- candidate train >= baseline train：`0.7333 >= 0.4`
- candidate validation >= no-guidance validation：`1.0 >= 0.0`
- candidate train >= no-guidance train：`0.7333 >= 0.5`

因此 Gate 为 `accept_new_best`。`skill_v0007.md`、`best_skill.md` 和 canonical `rex-harness/skill-sources/rex-tdd/SKILL.md` 必须且已经同步到同一哈希。

## 证据索引

- [v7 基线汇总](../../.skillopt/rex-tdd-2026-07-17/baseline_results_v7.json)
- [v7 Gate](../../.skillopt/rex-tdd-2026-07-17/steps/step_0007/gate_result.json)
- [v7 rollout](../../.skillopt/rex-tdd-2026-07-17/steps/step_0007/rollout_results.json)
- [训练状态](../../.skillopt/rex-tdd-2026-07-17/state.json)
- [证据契约测试](../../scripts/tests/rex-tdd-training-evidence.test.mjs)

## 后续

先完成完整验证与 fresh-context 独立复审，并要求 `Critical: 0`、`Important: 0`。仅在这些条件满足后，才开始 `rex-code-review` 的独立训练。
