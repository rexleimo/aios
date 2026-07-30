# Context Lifecycle V1 Production Correction 测试设计

> 状态：纠错实施设计；不构成完成声明
> 权威问题清单：`docs/reports/2026-07-28-context-lifecycle-v1-corrective-audit.md`

## 产品接线默认架构

1. 真实入口为 `aios orchestrate` / `runOrchestrate()`；
2. 读取 `.aios/planning/active.json`，显式 `--context-task` 或唯一 pending task 选择任务；
3. trusted orchestrator assembler 自己读取 required refs，并把实际返回给 dispatch 的 representation 记录为 evidence；
4. assembler 使用统一 budget projector，生成 Packet + Receipt，并把 full/summary+ref/ref-only 输出注入 dispatch context；
5. dispatch 前运行 shadow preflight；
6. dispatch 后以 changed-files + Git 保守并集运行 reconciliation，并写入最终 report/evidence；
7. 无 active structured task 时明确记录 `not_applicable`，不得伪造 packet。

原 `readRefs` caller assertion 不再作为生产 evidence；仅保留兼容测试入口并标记 `evidenceSource=caller_assertion`。

## 安全默认

- Candidate/Dream mutation 不再从 `AIOS_RUNTIME_*` 获得 authority；
- 未注入 broker-verified opaque authority 时 fail closed；
- raw env identity 只能进入非权威审计 metadata；
- Dream physical GC 在共享 lock/CAS 完成前固定 DENY；
- 同 OS user 且可直接写 canonical 文件的 hostile-shell threat 不能靠应用层 env 修复，报告继续 NO-GO。

## RED 公共入口

### P0 路径与安全

1. `evaluateExecutionContextPreflight()` 对 workspace-relative 与等价 absolute path 给出相同 declared 结果；
2. Windows slash/case（按平台语义）、CJK 与 `./` 等价；
3. Candidate CLI 即使伪造 `producerType=human` 也 DENY mutation；
4. Dream CLI env 伪造 approve/archive/gc 全部 DENY；
5. GC 在无共享锁实现时返回 `gc_disabled_pending_concurrency_control`。

### P1 真实接线

1. 通过 `aios orchestrate --dispatch local --execute dry-run --preflight auto --context-task <id> --json`；
2. active plan 含 required ref/targets/budget；
3. 命令自动创建 Packet/Receipt sidecar；
4. report 包含 `contextLifecycle.assembly`、`preflight` 和 `reconciliation`；
5. required file 内容/representation 实际进入 dispatch context，而非仅写 sidecar；
6. receipt 的 included/degraded/excluded 与实际注入 representation 相同；
7. 删除 required file 或外部改 hash 会产生真实 shadow warning；
8. post-dispatch Git/ledger undeclared path 出现在 reconciliation。

### P2 热路径与并发

1. proposal state fold 单次遍历 receipts，复杂度 O(P+R)；
2. recall 从 versioned materialized archived index 读取；
3. index 丢失/损坏时重建且不泄漏 archived event；
4. Candidate concurrent promote/reject 只能一个 terminal decision；
5. append 与 GC 共用跨进程锁；
6. 确定性并发测试证明 GC 不覆盖锁等待期间的 append；
7. crash window 可恢复或操作幂等。

## 证据边界

- 单元测试只能证明局部不变量；
- benchmark 只能称 engineering smoke；
- 完成必须同时有真实 CLI E2E、真实 sidecar、真实 dispatch injection、真实 post-dispatch reconciliation；
- baseline/post 必须同 runner/同场景；新增场景 baseline=N/A；
- hostile-shell authority 未有独立 broker/ACL 前，governance security 与 enforcement 始终 NO-GO。

## 首个最小切片

先完成 P0：路径等价、env mutation fail-closed、GC disabled、线性 fold。P0 通过后再接 P1；P1 不依赖伪造 readRefs。
