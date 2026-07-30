# Context Lifecycle V1 Scale Validation 设计

> 口径：controlled synthetic validation，不冒充真实生产任务。

## 范围

- 20 个隔离任务；
- 每任务 10 个 mutation/preflight case；
- 共 200 个 receipt；
- task 名称覆盖 auth、payment、config、docs、CJK、custom root 等代表性路径。

## Case 分布（每任务）

- 4 个 declared + fresh + read：预期 ready；
- 2 个 required unread：预期 `required_context_unread`；
- 2 个 required stale：预期 `required_context_stale`；
- 2 个 undeclared mutation：预期 `undeclared_target`。

合计：80 negative / 120 positive。

## 指标

- TP/TN/FP/FN；
- precision/recall/false-positive rate；
- p50/p95/max preflight latency；
- packet/receipt sidecar bytes；
- decision digest 重复输入稳定性；
- 20/200 完整率。

## Gate

Controlled gate：

- tasks >= 20；receipts >= 200；
- FP = 0；FN = 0；
- required stale/unread/undeclared 漏检 = 0；
- decision digest determinism = 100%；
- p95 < 50ms（本地 synthetic）；
- S0/S1/S2 与 canonical tests 不回退。

## 决策边界

- 达标只证明 controlled synthetic engineering smoke 通过；
- 不得据此批准 opt-in enforcement pilot 或 default hard enforcement；
- pilot 仍需同 runner immutable differential、独立签名 oracle、真实项目样本和人工误报复核；
- 报告必须明确 controlled synthetic。

## 公共缝

`scripts/benchmarks/context-lifecycle-v1-scale.mjs` 只调用公开 Planning/ExecutionContext API，输出 JSON/Markdown，不修改产品判定逻辑。
