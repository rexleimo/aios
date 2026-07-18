# 四项 Skill v2 案例训练与版本选择

本轮使用每项 10 个训练案例和候选冻结后独立创建的 5 个留出案例。Target 只输出 `targetResponse`，Scorer 逐条复用题集断言并提供连续原文引用；`training-evidence-validator` 通过后才进入 Gate。

选择结果：

- `rex-implement`：保留基线。candidate `train=0.6 / validation=0.2`，低于 control 留出 `1.0`。
- `rex-debug`：选择候选。candidate `train=1 / validation=1`，严格高于 baseline `0 / 0`，且不低于 control。
- `rex-code-review`：保留基线。三组均为 `0 / 0`，候选没有严格提升。
- `rex-wayfinder`：保留基线。candidate 与 baseline 均为 `0 / 0`，没有严格提升。

这次版本选择由案例工件和 Gate 计算得出，不由人工描述决定。
