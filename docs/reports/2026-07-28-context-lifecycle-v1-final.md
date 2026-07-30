# Context Lifecycle V1 状态报告（纠正版）

日期：2026-07-28（历史纠错报告）；更新：2026-07-29

> **历史结论：当时实现未完成。当前实现与验证状态请以 `2026-07-29-context-lifecycle-v1-implementation-verification.md` 为准：S0-S2 observe/shadow 接线已完成，S3 enforcement 仍为 NO-GO。**

权威历史纠错审计与当前验证：

```text
docs/reports/2026-07-28-context-lifecycle-v1-corrective-audit.md
docs/reports/2026-07-29-context-lifecycle-v1-implementation-verification.md
```

## 为什么撤回

此前验收把测试/benchmark 直接调用库 API 误当成真实产品接线。全仓调用图确认：

- `buildExecutionContextPacket()` 没有真实 CLI/MCP/lifecycle 调用方；
- `evaluateExecutionContextPreflight()` 没有真实 mutation gate 调用方；
- `evaluateContextReconciliation()` 没有真实执行后调用方；
- `projectContextItems()` 没有生产调用方。

因此 S1/S2 当前是 library prototype，不是已交付能力。

## 当前真实范围

### 可继续保留和评估

- private/shared temporal isolation 修复；
- Session Close candidate 默认不进入 active shared recall；
- Dream apply 默认 proposal-only；
- Candidate/Dream governance CLI 的 append-only decision model；
- Planning schema、packet/preflight/reconciliation 库 API 及其单元测试。

### 未完成或阻塞

- S1/S2 未接真实执行链；
- `readRefs` 是 caller assertion，不是 observed read evidence；
- budget degradation projector 与 packet/receipt 未连接；
- `AIOS_RUNTIME_*` 可由 shell-capable Agent 设置，不构成 hostile-agent security boundary；
- memo recall 每次全量读取/fold Dream governance，热路径无界；
- Dream GC 无共享锁/CAS，可能覆盖并发 append；
- absolute/relative path 语义不一致，已知 absolute path 会产生 `undeclared_target` 误报。

## 证据边界

### Baseline

```text
baseline: 6 scenarios
runner: ca07550dd02217f5560dc42c9c7845193251c61017c22a52f0ec335853217850

post-change: 12 scenarios
runner: d3dbbfbe1c8c5572a87c5b2611720400a05bbb26e976ad716fd538db12cd2670
```

两者不是完整同 runner / 同场景 before-after。12/12 只能称 post-change benchmark acceptance；baseline 缺失项必须标 N/A。

### 20/200 scale

20/200 仍可作为确定性、分支和局部延迟 smoke，但 expected reason 与 fixture 由同一脚本构造，因此：

- 不代表真实 precision/recall；
- 不代表真实项目 false-positive rate；
- 不能支撑 enforcement GO。

### Full suite

历史运行事实：

```text
947 tests
940 pass
0 fail
7 skip
```

该结果只说明当时测试集未回归，不证明 S1/S2 已接生产调用链，也不证明 authority/GC 安全。

## 当前 Go / No-Go

```text
Opt-in enforcement pilot: NO-GO
Default hard enforcement: NO-GO
Release Candidate: WITHDRAWN
```

## Git 纠错

四个未 push 本地提交已从 `main` 重写移除：

```text
main: bfb9ce23
backup/context-lifecycle-v1-before-correction: 90392e1b
```

全部变化保留为未暂存工作树内容。installer 和 `competitor-watchlist.json` 均未丢失、未回滚、未重新提交。

## 重新达到完成的硬门

1. 真实 planned execution 自动构建 packet/receipt；
2. 真实 mutation 前执行 preflight，执行后 reconciliation；
3. read evidence 来自受控读取工具；
4. authority 不能由被治理 Agent 通过 env 自授；
5. path normalization 覆盖 relative/absolute/Windows/CJK/symlink/case；
6. recall governance state 使用增量索引或有界缓存；
7. GC 与 append 使用同一锁域或 CAS；
8. degraded projector 与 packet/receipt/执行链统一；
9. 同 runner、同场景 baseline/post；
10. 独立 oracle 和真实任务验证后重新做 pilot 决策。
