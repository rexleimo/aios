# rex-strict-tdd SkillOpt 训练报告

## 结论

本轮候选没有可证明地优于正式基线，正式 [rex-strict-tdd](../../rex-harness/skill-sources/rex-strict-tdd/SKILL.md) 保持不变。

候选补充了当前 rex Command 的阶段边界、紧邻前序证据、公共可观察契约与基础设施故障区分、可逆强度探针及 Evidence 停止条件。候选本身表现完整，但 control、baseline 与 candidate 在 10 个训练题和 5 个候选冻结后设计的留出题上均得到 `hard=1.0`。这套留出集无法证明候选带来增益，不能作为升级依据。

## 协议检查

- 候选作者只读取基线和训练集；候选冻结后，独立设计者才创建留出题。
- 三组 Target 只产出原始回答；三组 Scorer 不读取 Skill。所有工件均通过 `training-evidence-validator`。
- 校验过程发现 BOM 编码、缺失 Scorer schema 字段及一个非连续引用；这些问题均在不改变原始 Target 回答与评分结论的前提下机械修复后重新验证。
- 最终拒绝原因是硬分饱和与候选未严格超过基线，不是格式问题。

## 验收

```powershell
rtk node --test scripts/tests/training-evidence-validator.test.mjs scripts/tests/rex-strict-tdd-training-evidence.test.mjs
rtk npm run test:rex-integration
rtk git diff --check
```
