# rex-minimal-construction SkillOpt 训练报告

候选的留出 hard 从 `0.8` 提高到 `1.0`，但训练 hard 从 `1.0` 回退到 `0.9`。三组 Target/Scorer 工件均通过确定性校验；按严格 Gate，本轮拒绝候选并保留正式 [rex-minimal-construction](../../rex-harness/skill-sources/rex-minimal-construction/SKILL.md)。这避免了把“更会描述复用阶梯”换成已有场景行为回归。

```powershell
rtk node --test scripts/tests/training-evidence-validator.test.mjs scripts/tests/rex-minimal-construction-training-evidence.test.mjs
```
