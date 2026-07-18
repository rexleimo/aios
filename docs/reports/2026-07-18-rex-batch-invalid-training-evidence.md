# rex-implement / rex-debug / rex-code-review / rex-wayfinder 训练报告

## 结论

本批四项均完成了训练题、候选、独立留出题、control/baseline/candidate Target 与 Scorer 的产出，但没有形成可接受的升级证据。正式 Skills 全部保持不变。

## 拒绝原因

确定性校验发现四组 Scorer/Target 工件使用了旧格式：原始回答以 `output` 而不是 `targetResponse` 保存，部分评分将多条原题断言压缩成 `all-required-assertions`，并且 `hard`、`soft` 或汇总不能由原题断言重算。此类工件无法证明引用、评分和候选收益，按协议统一标记为 `reject_invalid_scorer_evidence`。

这不是候选内容质量的判断，也没有对 raw 回答进行事后补写或把无效断言改造成通过。每项状态文件明确要求下轮从隔离 Target/Scorer 重新运行，并使用 `training-evidence-validator` 的严格 schema。

## 验收

```powershell
rtk node --test scripts/tests/training-evidence-validator.test.mjs scripts/tests/rex-batch-invalid-training-evidence.test.mjs
rtk npm run test:rex-integration
rtk git diff --check
```
