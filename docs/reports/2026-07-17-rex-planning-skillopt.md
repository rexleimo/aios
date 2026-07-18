# rex-planning SkillOpt 训练报告

## 结论

本轮没有可证明的提升，正式 [rex-planning](../../rex-harness/skill-sources/rex-planning/SKILL.md) 保持不变。

有效基线在 10 个训练题和 5 个独立留出题上的 hard 分数均为 `1.0`。候选和无指导对照的逐断言结果虽然都声称通过，但其汇总错误地将通过任务数写入 `trainHard`、`validationHard` 与 `overallHard`，而不是 0-1 均值。因此这两组证据不满足训练协议，不能用于替换正式 Skill。

## 证据与 Gate

- 三组原始 Target 输出：`control_raw.json`、`baseline_raw.json`、`candidate_raw.json`。
- 三组独立评分：`control_scored.json`、`baseline_scored.json`、`candidate_scored.json`。
- 确定性校验拒绝 control 和 candidate：`summary_metric_mismatch`。
- 基线通过校验，但留出集已饱和，候选既没有有效证据，也不可能证明严格优于基线。
- [Gate 工件](../../.skillopt/rex-planning-2026-07-17/steps/step_0001/gate_result.json) 与 [状态工件](../../.skillopt/rex-planning-2026-07-17/state.json) 记录了拒绝原因。

## 验收

运行以下测试会重新读取全部工件并使用机器校验器验证结论：

```powershell
rtk node --test scripts/tests/training-evidence-validator.test.mjs scripts/tests/rex-planning-training-evidence.test.mjs
```

下一次训练必须先重建有区分度的留出集，并对 control、baseline、candidate 全部使用 `training-evidence-validator`；不得因叙述更长或自报满分而覆盖正式版本。
