# D 批治理收尾 — 测试范围契约（rex-test-design / memo-D-gov）

- **目标**：D2 权威与 env 解耦的证明测试；D5 supersede 写时 ACL 补全
  （dangling 一律拒，跨 space 写时 denied 可见）；D6 内容安全扫描接入
  promote 门（注入样本被拒且 receipt 记安全结论）。
- **非目标**：不改变候选治理 fail-closed 总闸（`authorize` 仍默认 DENY，
  broker 权威缺失时不发 verified）；不改共享空间协作规则
  （同 space 共享→共享 supersede 仍允许，见 `memo-temporal` 既有断言）。
- **测试缝**：`node --test scripts/tests/memo-authority-env.test.mjs`（D2）、
  `memo-temporal.test.mjs` 追加断言（D5）、`memo-candidate-governance.test.mjs`
  追加用例（D6）；邻近回归 memo-provenance + candidate-governance 全文件。
- **完成判据**：三文件聚焦测试绿；AB 三臂零漂移（本批不动排序）；
  diff 限 `temporal.mjs`（D5）、`candidates.mjs`（D6）+ 测试文件，无越界。

## 验收映射

| # | 验收行为 | 断言 |
| --- | --- | --- |
| D2 | 治理权威与 env 解耦 | 毒化 `AIOS_RUNTIME_*` 下 build/append/decide 权威不变 + 四源码文件无 `AIOS_RUNTIME` 引用 |
| D5 | 未授权 supersede 写时可见 denied | dangling → `unknown_target`；跨 space → `scope_or_principal_mismatch`；私跨 agent 不变 |
| D6 | 注入样本 promote 被拒 | 含注入文本候选 promote → DENY + `reasonCode=unsafe_content` + receipt 记 `safety` 结论 |

## 最小纵向切片

D5 先行：`partitionSupersedes` 一处改动（dangling 从放行改拒收），
RED 可用纯函数单测一句话复现，是本批最薄的诚实 RED。
