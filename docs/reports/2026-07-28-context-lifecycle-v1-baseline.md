# Context Lifecycle V1 基准报告

> **解释边界：baseline 仅包含 6 场景，runner SHA 与后续 12 场景 runner 不同；只能比较共同场景，缺失项必须标 N/A。不可据此宣称完整 12 场景 before/after。**

- Profile: `baseline`
- Commit: `bfb9ce239339715bea330a6e2e2719ead5a16784`
- Worktree dirty: `true`
- Runner SHA-256: `ca07550dd02217f5560dc42c9c7845193251c61017c22a52f0ec335853217850`
- Profile 匹配: **PASS**
- 场景: 6/6 与 profile 预期一致
- 产品目标达成: 1/6
- 已知失败: 5

| 场景 | 当前观察 | 质量判定 | Profile 预期 | 匹配 |
|---|---|---|---:|---:|
| CL-01 private memo 不得失效其他 Agent 的 shared fact | Agent A 的 live memo 中没有 shared fact。 | known_failure | false | 是 |
| CL-02 session close 只生成 candidate，不自动晋升 shared memo | assistant-derived session summary 已进入 active shared recall。 | known_failure | false | 是 |
| CL-03 Dream retention 前不得物理删除 shared evidence | Dream apply 移除了 1 条事件。 | known_failure | false | 是 |
| CL-05 计划必须保留 required context 与 targets | Plan normalization 丢弃了 targets/contextRequirements，无法报告缺失上下文。 | known_failure | false | 是 |
| CL-06 required file 读取后被外部修改必须产生 stale verdict | Readiness 未检测 required file 的 hash 已变化。 | known_failure | false | 是 |
| CL-10 现有 148 个定向兼容测试必须保持通过 | 69 + 40 + 39 个定向测试全部通过。 | pass | true | 是 |

> baseline PASS 只表示当前已知行为被成功复现，不表示产品行为正确。

## 如何解读

当前产品只达到 `1/6` 个目标：CL-10 的 148 个兼容测试通过。其余 5 个场景均成功复现为 `known_failure`，因此这份报告是改造前基线，不是上线验收报告。

后续 S0/S1/S2 必须继续运行同一个 runner、同一组 fixture 和同一套目标断言：

- S0：CL-01、CL-02、CL-03 必须从 `known_failure` 变为 `pass`；
- S1：CL-05 必须变为 `pass`，且 CL-10 继续通过；
- S2：CL-06 必须变为 `pass`，且此前场景不得回退。

## 可复现命令

```powershell
node scripts/benchmarks/context-lifecycle-v1.mjs `
  --profile baseline `
  --json-out temp/context-lifecycle-v1/baseline.json `
  --markdown-out temp/context-lifecycle-v1/baseline.md
```

冻结的机器结果：

`docs/reports/2026-07-28-context-lifecycle-v1-baseline.json`

Rex GREEN 执行回执：

`receipt:76f705af-8273-437b-99eb-089327717f42`

## 测试差异审查

- 未修改 memo、ContextDB、planning、Dream、preflight 或 handoff 产品逻辑；
- 未删除、跳过或放宽现有测试断言；
- CL-01/02/03 使用真实 memo filesystem storage，不以 mock 代替权限、时态或删除行为；
- CL-02 调用真实 session-close hook；
- CL-03 调用真实 Dream preview/apply，但只作用于可清理临时工作区；
- CL-05 调用真实 plan normalization；
- CL-06 调用真实 readiness seam，并使用真实文件 hash 变化；
- CL-10 实际执行 69 + 40 + 39 个现有测试；
- 每个场景完成后删除临时 workspace；
- runner 把 profile 匹配和产品目标达成分开报告，不能把 `known_failure` 表述为产品通过。

## 标准与规格审查

### 已修复的标准问题

- 不再持久化本机绝对临时目录，只保存匿名 workspace basename 和 `cleanup=removed`；
- CL-10 不再只检查退出码，同时核对实际测试数必须为 69、40、39，防止删除测试后假通过；
- 报告记录 `worktreeDirty` 与 runner SHA-256，避免只写 commit 而掩盖未提交基准代码；
- Windows 不再通过 `spawnSync npm.cmd` 运行 ContextDB 测试，改为执行同一 npm script 背后的 Node 公共命令。

### 规格审查结论

- 六个场景与 `docs/plans/2026-07-28-context-lifecycle-v1-benchmark.md` 的 CL-01、CL-02、CL-03、CL-05、CL-06、CL-10 一一对应；
- baseline/S0/S1/S2 的 target matrix 固定在 runner 中，产品实现不能反向修改基线期望；
- baseline profile 允许已知失败但必须原样复现；S0/S1/S2 profile 要求对应场景变为 `targetMet=true`；
- runner 没有把内部调用次数或 mock 命中当作用户行为；
- 当前完成的是最小 6 场景合成基线，不包含 CL-04、CL-07～CL-09、CL-11～CL-13，也不包含 20 个真实任务/200 个 mutation receipt；这些仍是进入 S3 enforcement 前的未完成门槛。

### 未解决的高/中严重度审查发现

无。剩余缺口属于已声明的后续基准范围，不是本 runner 偷漏的验收条件。
