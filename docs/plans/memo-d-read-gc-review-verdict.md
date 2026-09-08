# D1+D4 review verdict（rex.standards-spec-review.v1 投影）

- fixed-point: `3ad63f29`（HEAD；审查 `git diff HEAD` 工作树）
- diff: `execution-context.mjs`（assembly receipt 加 `reads[]` 并纳入
  decisionDigest）、`governance.mjs`（`createGcSnapshot` 加法导出 2 行注释+export）、
  新测 2 文件（read-receipt 2、gc-lock 1）
- Spec 来源：backlog D1/D4 行 + `docs/plans/memo-d-read-gc-test-scope.md`

## Standards

- 仓库标准：符合。12 smell 均未见：
  reads 由已有的 `sources` 派生（无重复逻辑、无新类型、无分支级联），
  导出为加法（无中间人/拒绝遗赠问题）。
- 兼容性：receipt 新增 `reads` 数组；decisionDigest 随之变化
  （receiptId 前 24 位会变，新旧 receipt 不混用——digest 本就是内容寻址）。
  邻近全绿：execution-context-packet 11/11 内含 19 用例文件、
  dream-governance 8/8。

## Spec

- D1"receipt 记录受控读取工具的实际读取事件"：满足。
  `reads[]` 每项 ref+sourceHash+reader+readAt，且来源只能是 assembler
  自己的 `readAssemblySource` 调用（入口根本不收 readRefs）；
  caller 注入测试锁死。
- D4"并发 append+GC 不丢事件"：满足。
  真实 `createGcSnapshot` 持锁重写 × 10 并发 append：幸存者+新增全在，
  目标入 snapshot；删写与 append 同 `withMemoStorageLock` 域焊死。
- scope creep：无。

汇总：Standards 0 发现；Spec 0 缺失。verdict：通过。
