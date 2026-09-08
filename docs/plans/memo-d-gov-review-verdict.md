# D 批 review verdict（rex.standards-spec-review.v1 投影）

- fixed-point: `f209460c`（HEAD；审查 `git diff HEAD` 工作树）
- diff: `temporal.mjs`（partition dangling 拒收）、`candidates.mjs`
  （promote 门扫描 + receipt 记 safety）、新测 3 文件
  （supersede-acl 4、promote-safety 2、authority-env 4）、范围契约 1
- Spec 来源：backlog D2/D5/D6 行 + `docs/plans/memo-d-gov-test-scope.md`

## Standards

- 仓库标准：符合（2 空格、分号、命名一致）。
- 12 smell：仅 1 judgement——`decideCandidate` 里 DENY/ALLOW 共 3 处
  `receiptRow` 调用各带 `safety`，属同一逻辑散射但三处分支语义不同
  （authority-DENY / unsafe-DENY / write-fail / ALLOW），合并不了，
  保持现状。其余 11 条未见。
- 兼容性：receipt 新增可选 `safety` 字段，旧字段断言全绿
  （candidate-governance 8/8、provenance 6/6、temporal 21/21）。

## Spec

- D2"治理权威与 env 解耦的测试"：满足。4 测试锁死推导/写入/治理/源码四层。
- D5"未授权 agent 不能 supersede 他人 space 的事件"：满足。
  跨 space 写时 denied；dangling 从放行改 `unknown_target`；
  同 space 共享协作规则不变（既有断言未动）。
- D6"promote 路径强制过 scan，注入样本被拒"：满足。
  注入样本 DENY + `unsafe_content` + receipt 记扫描结论；
  干净样本保持原权威拒绝且带 clean 结论。
- scope creep：无。

汇总：Standards 1 judgement；Spec 0 缺失。verdict：通过。
