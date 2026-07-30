# Context Lifecycle V1 Dream Governance 报告

> **纠错状态：logical archive/restore API 已实现，但 GC 与 append 不在同一锁域且可能丢并发写；修复前 GC 为发布阻塞项。本报告原 PASS/无阻塞结论撤回。详见 `2026-07-28-context-lifecycle-v1-corrective-audit.md`。**

日期：2026-07-28

## 结论

Dream 已从 proposal-only 扩展为受控状态机，同时保留默认不删除：approve/reject/archive/restore/gc 均需要 trusted runtime authority；logical archive 先隐藏；retention 到期后 GC 才从 active canonical 移出；GC snapshot 支持恢复。

## RED / GREEN

- RED：`receipt:a88103be-1194-46c5-8e01-5582d481447c`，0 pass / 1 fail / 5 skip；
- GREEN：`receipt:1b87e20e-a62c-4435-b450-097ec2ec9563`，6/6；
- Dream + temporal 回归：65/65。

## 实现

- `scripts/lib/lifecycle/dream/governance.mjs`
  - proposal list/inspect；
  - approve/reject/archive/restore/gc；
  - append-only ALLOW/DENY receipt；
  - sourceManifest archive/GC 双重 freshness check；
  - retention gate；
  - file exact-line 与 split exact-file GC snapshot；
  - GC 后 restore；
  - archived event ID projection。
- `scripts/lib/memo/storage/query.mjs`
  - 默认隐藏 logical archive；
  - `includeArchived=true` 用于审计/恢复视图。
- `scripts/lib/lifecycle/dream/index.mjs`
  - apply 仍 proposal-only；
  - agent_private 与未审批 candidate 不进入 consolidation actions；
  - proposal 支持 custom Memo root。
- CLI：
  - `dream --governance list|inspect|approve|reject|archive|restore|gc`；
  - `--proposal`、`--reason`、`--retention-days`。

## 测试差异审查

新增 `scripts/tests/dream-governance.test.mjs`，并加入 `test:scripts` 与 CL-10。没有删除或放宽原 Dream proposal-only 测试。

覆盖：

- file/split；
- missing reason/policy/capability DENY；
- invalid transition；
- source hash stale；
- logical archive/default hidden/includeArchived；
- restore before GC；
- retention before GC DENY；
- physical GC；
- snapshot restore after GC；
- private/candidate exclusion；
- custom root；
- CLI。

## 标准与规格审查

- Proposal 文件不可变，状态只来自 append-only receipt；
- logical archive 不触碰 canonical；
- GC 只允许 approved + archived + retention elapsed；
- archive 和 GC 都校验 manifest；
- snapshot 在 active source rewrite/delete 之前持久化；
- receipt 仅含 event id/hash，不含 memo text；
- restore 不覆盖已存在 event；
- file/split 使用既有 canonical path helpers；
- 无自动 approval、无默认 hard-delete。

Review verdict（纠正后）：**BLOCKED。** Snapshot-before-rewrite 不消除 append/rewrite race；GC 在与 memo append 共享锁或 CAS 前不得发布。

## 专项风险审查

### 审查范围

- archive 后源漂移是否可在 GC 前绕过；
- retention 是否按最后一次 archive 计算；
- GC 是否先 snapshot 后删除；
- restore 是否重复 event；
- private/candidate 是否进入 proposal；
- query 是否默认泄漏 archived event；
- receipt 是否复制正文。

### 专项结论

archive 与 GC 会检查 source hash，snapshot 在 rewrite 前落盘，restore 对 eventId 去重；但 file GC 的 read-all/rewrite-all 未与 append 共享锁，会丢并发写。**BLOCKED。**
