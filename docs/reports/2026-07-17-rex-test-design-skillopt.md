# rex-test-design SkillOpt 训练报告

## 结论

本轮候选没有可证明地优于正式基线，正式 [rex-test-design](../../rex-harness/skill-sources/rex-test-design/SKILL.md) 保持不变。

候选包含更明确的测试范围契约、公共入口映射、最小可重复纵向切片与反作弊要求。但 10 个训练题和 5 个候选冻结后设计的留出题中，control、baseline、candidate 都得到 `hard=1.0`。这说明该留出集无法区分候选与基线，不能作为升级依据。

## 协议检查

- 三组 Target 与三组 Scorer 工件均已通过 `training-evidence-validator`。
- 每个成功断言的引用均可在对应原始回答中连续找到；评分、soft 与汇总由断言重新推导。
- 两个 Scorer 曾将断言名称改写或在 JSON 末尾写入字面 `\\n`；在 Gate 前被机器检查发现并以原题断言、合法 JSON 修复。没有更改任何 Target 回答或候选内容。
- 最终拒绝原因是硬分饱和，不是格式错误。

运行验收：

```powershell
rtk node --test scripts/tests/training-evidence-validator.test.mjs scripts/tests/rex-test-design-training-evidence.test.mjs
```
