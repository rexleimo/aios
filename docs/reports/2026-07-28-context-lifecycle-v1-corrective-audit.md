# Context Lifecycle V1 纠错审计

日期：2026-07-28（历史审计）；修复状态更新：2026-07-29
状态：**S0～S2 实现修复完成并进入验证证据收集；S3 enforcement 仍为 NO-GO。**

> 本文件保留 2026-07-28 的问题发现作为历史证据。下列“修复状态更新”取代其中关于当前实现未接线、预算未连接、archive index 缺失和 CLI 环境身份可直接授权的现状描述。

## 修复状态更新

| 原硬门 | 当前状态 | 可验证证据 |
|---|---|---|
| 真实 CLI/MCP/lifecycle packet/receipt | 已实现 | `context-lifecycle-orchestrate-integration.test.mjs`、`context-lifecycle-mcp-integration.test.mjs` |
| mutation 前 preflight、后 reconciliation | 已实现为 shadow 观察链 | `runOrchestrate()` 在 dispatch 前执行 preflight，dispatch 前后 runtime-owned snapshot 写入 ledger；异常后仍 finalize reconciliation |
| 读证据 | 已实现受控 assembler 观察 | direct `readRefs` fail-closed，只有 `assembleExecutionContext()` 产生 `orchestrator_assembler` 证据 |
| env 自授权 | CLI 路径已移除 | memo/candidate/Dream CLI 不再将 `AIOS_RUNTIME_*` 作为 authority；危险 governance mutation 仍 fail-closed |
| path 一致性 | 已实现 | relative/absolute、Windows case、CJK、symlink 和 custom state-root regression tests |
| recall governance 热路径 | 已实现 | Dream archive-ID durable index、source token 和 root lock |
| append/GC 并发 | append 已锁定；GC 保持禁用 | canonical memo lock regression tests；无 authority/并发协议前不启用 destructive GC |
| degraded projector | 已实现 | receipt 预算精确计入实际 delivery header、marker 和 separator；delivery digest/units 持久化 |
| 同 runner baseline/post | immutable differential runner 已实现；有效候选运行待提交后执行 | `context-lifecycle-v1-differential.mjs` 拒绝 dirty evaluator 与 mutable subject；本地 compare 只作开发诊断 |
| 独立 oracle 与真实任务 | 验证 gate 已实现，证据未提交 | detached Ed25519 evidence gate；缺少独立签名的真实任务样本，因此仍 NO-GO |

当前同-runner S2 基准为 12/12，20/200 controlled smoke 为 PASS；两者都不是默认 enforcement 批准。`context-lifecycle-v1-evidence-gate.mjs` 只会输出 `REVIEW_REQUIRED`，永远不会自动开启 enforcement。

## 纠错结论

此前将“库 API + 测试/benchmark 通过”表述为“产品能力完成”，该结论错误。本文件取代此前 final/RC 结论，直到生产接线、安全边界、并发与独立验收全部完成。

## 生产调用可达性

全仓调用图显示：

- `buildExecutionContextPacket()` 的调用方仅存在于 `scripts/benchmarks/`、`scripts/tests/` 和 API 定义/导出；
- `evaluateExecutionContextPreflight()` 的调用方仅存在于 `scripts/benchmarks/`、`scripts/tests/` 和 API 定义/导出；
- `evaluateContextReconciliation()` 的调用方仅存在于 `scripts/benchmarks/`、`scripts/tests/` 和 API 定义/导出；
- `projectContextItems()` 的调用方仅存在于 `scripts/benchmarks/`、`scripts/tests/` 和 API 定义/导出。

因此：

- S1 是 library prototype，不会由真实 CLI/MCP/lifecycle 自动产出 packet/receipt；
- S2 是 library evaluator，不会在真实 mutation 前执行，也不会在执行后自动 reconciliation；
- budget degradation projector 与 packet receipt 未连接，packet receipt 的 `degraded` 不代表实际执行预算降级；
- 没有 observe 数据自然积累，不能进入 enforcement pilot。

## Authority threat model

旧审计曾记录 `scripts/lib/memo/storage/provenance.mjs` 的 `runtimeIdentityFromEnv()` 读取 `AIOS_RUNTIME_*`；该环境入口现已移除。Candidate 和 Dream CLI 只接受显式传入的 runtime identity，普通 CLI 环境变量不构成 authority。

显式 runtime identity 仍只能作为 cooperative same-principal convention，不能防御可启动 shell 或控制子进程环境的 Agent。

真实安全边界至少需要 broker-owned identity、父进程受控 IPC、签名 token、OS credential 或等效不可由被治理 Agent 设置的凭证。

## Baseline 可比性

- baseline：6 个场景，runner SHA-256 `ca07550dd02217f5560dc42c9c7845193251c61017c22a52f0ec335853217850`；
- S0/S1/S2：12 个场景，runner SHA-256 `d3dbbfbe1c8c5572a87c5b2611720400a05bbb26e976ad716fd538db12cd2670`。

因此 12/12 只能解释为 post-change benchmark acceptance。未出现在 baseline 的场景必须标为 baseline N/A，不能宣称完整 before/after 改善。

## Scale 证据边界

20/200 runner 使用实现已知的四类 fixture，并由同一脚本同时定义 expected reason 与被测 API 输入。重复样本验证的是分支稳定性和局部延迟，不是真实 precision/recall。

已知反例：相同目标的 workspace-relative path 可匹配，而绝对路径会被判为 `undeclared_target`。因此：

- 原 `precision=1` / `recall=1` 解释撤回；
- 原 `opt-in enforcement pilot: GO` 撤回；
- scale 仅保留 engineering smoke 含义；
- 在独立 oracle、真实任务、路径对抗样本与生产接线完成前，enforcement 为 NO-GO。

## Memo recall 性能

`listMemoEvents()` / `searchMemoEvents()` 每次调用 `readDreamArchivedEventIds()`。当前实现会读取全部 proposal 和全部 governance receipts，再按 proposal fold receipts。该路径位于 recall 热路径，复杂度和 IO 随历史增长，尚无 materialized index、增量 fold 或版本缓存。

## Dream GC 并发安全

file storage GC 当前执行 read-all → filter → rewrite-all，未与 memo append 共享锁/CAS。并发 append 可能在 rewrite 时被覆盖。修复前 Dream GC 必须视为不安全并保持禁用，不得作为完成能力发布。

## Read evidence

`readRefs` 由调用方直接传入，只是 caller assertion，不是实际读取证据。此前“记录实际读了什么”与“不可伪造 citation”的表述撤回。真实证据必须由受控 read tool/broker 产生 digest/ref receipt。

## 当前真实状态

- S0 核心隔离、candidate 默认不可见、Dream proposal-only 等修复可继续评估；
- Candidate/Dream governance CLI 已实现，但 authority 仅适用于 cooperative local model；
- Dream GC 存在并发丢写风险，发布阻塞；
- S1/S2 为未接线原型；
- full suite green 仅证明现有测试未回归，不证明生产能力完成；
- Release Candidate：**撤回**；
- Opt-in enforcement pilot：**NO-GO**；
- Default hard enforcement：**NO-GO**。

## Git 纠错

四个未 push 本地提交已从 `main` 重写移除。当前 `main` 回到 `bfb9ce23`；恢复分支为：

```text
backup/context-lifecycle-v1-before-correction -> 90392e1b
```

所有代码、报告、installer 变化均保留为未暂存工作树内容；`competitor-watchlist.json` 也保持原有未提交状态。未丢失或回滚用户数据。

## 重新达到完成所需硬门

1. 真实 CLI/MCP/lifecycle planned execution 产出 packet/receipt；
2. mutation 前真实调用 preflight，执行后真实调用 reconciliation；
3. read evidence 由受控读工具产生；
4. authority 不可由被治理 Agent 通过 env 自授；
5. relative/absolute/Windows/CJK/symlink/case path 语义一致；
6. memo recall governance state 使用增量索引或有界缓存；
7. GC 与 append 位于同一锁域或使用 CAS，无丢写；
8. degraded projector 与 packet receipt/执行链统一；
9. 同 runner、同场景 baseline/post；缺失 baseline 标 N/A；
10. 独立 oracle + 真实任务验证后再决定 pilot。
