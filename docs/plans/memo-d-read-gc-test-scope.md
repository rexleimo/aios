# D1+D4 收尾 — 测试范围契约（rex-test-design / memo-D-read-gc）

- **目标**：
  D1——assembly 收口的 receipt 记录受控读取工具的实际读取事件
  （`reads[]`：ref + sourceHash + reader + readAt），caller 断言永不进入；
  D4——并发 append+GC fixture 证明同锁域下不丢事件。
- **非目标**：不动 packet 层既有"无视 readRefs + 诚实 evidenceBoundary"语义；
  不动 Dream 治理 fail-closed 总闸；不改 GC 删除语义（只锁证明）。
- **测试缝**：新 `memo-read-receipt.test.mjs`（D1，对 `assembleExecutionContext`
  公共入口）；新 `memo-gc-lock.test.mjs`（D4，对导出的 `createGcSnapshot`
  真实删写路径 + `appendMemoEvent` 并发）；邻近回归
  execution-context-packet（11）+ dream-governance + s2/orchestrate/evidence-gate（19）。
- **完成判据**：D1 RED→绿；D4 fixture 绿（加固型：锁已在位，测试锁死它）；
  AB 三臂零漂移；diff 限 `execution-context.mjs`（receipt 加 `reads` 并纳入
  decisionDigest）+ `governance.mjs`（加法导出）+ 2 测试文件。

## 验收映射

| # | 验收行为 | 断言 |
| --- | --- | --- |
| D1 | receipt 记录受控读取的实际读取事件 | assembly 后 `receipt.reads` 含且仅含 assembler 实测项（ref/hash/reader/时间）；伪造 readRefs 进不来 |
| D4 | 并发 append+GC 不丢事件 | 10 并发 append × 持锁 GC 重写后：幸存者 + 10 新增全在，目标 2 条入 snapshot |

## 最小纵向切片

D1 先行：`receipt.reads` 缺失是今天就能复现的诚实 RED；
D4 同批作为加固（`createGcSnapshot` 已在 `withMemoStorageLock` 内，
测试把它焊死）。
