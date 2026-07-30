# Context Lifecycle V1 Candidate Governance 测试设计

> 工作项：`context-lifecycle-v1-candidate-governance`
> 原则：candidate immutable；governance append-only；未审批内容不进入 active recall

## 复用阶梯

1. 复用 memo file/split canonical events 与 `includeCandidates` 查询；
2. 复用 runtime provenance/capability；
3. 复用 Session Close candidate sidecar；
4. 复用 `resolveContextDbRoot()` 写治理 receipt；
5. 仅新增一个 candidate governance 模块和 CLI 薄适配，不新增数据库。

## 公共 API

- `listMemoryCandidates()`：默认仅 metadata，不泄漏 text；
- `inspectMemoryCandidate()`：review/human authority 才返回正文；
- `promoteMemoryCandidate()`；
- `rejectMemoryCandidate()`；
- `expireMemoryCandidate()`；
- `readCandidateGovernanceReceipts()`。

来源统一支持：

- memo event candidate；
- `session-close:<sessionId>` sidecar candidate。

## 状态机

```text
pending -> promoted
pending -> rejected
pending -> expired
```

- DENY receipt 不改变状态；
- terminal candidate 的再次操作必须 DENY；
- promotion 追加 verified memo event，原 candidate bytes/claimStatus 不变；
- rejected/expired 不产生 active memo。

## 权限

- list metadata：允许；
- inspect/include-text：human 或 `memo:review-shared` / `memo:promote-shared`；
- promote：human 或 `memo:promote-shared`；
- reject：human 或 `memo:review-shared` / `memo:promote-shared`；
- expire：human 或 `memo:expire-shared` / review / promote；
- mutation 必须有 trusted principal、policy revision 和非空 reason。

## Receipt

每次 ALLOW/DENY mutation 都追加：

- receipt id、action、decision、reason、timestamp；
- principal/agent/session/run/activation；
- capability、policy revision；
- source ref/hash；
- promoted event id（如有）；
- 不复制 candidate text。

## RED 验收

1. Agent shared memo candidate 默认 active recall 不可见；
2. 无 principal、缺 capability、空 reason、缺 policy revision promotion 均 DENY 且 receipt 可读；
3. 授权 promotion 只产生一个 verified event，active recall 可见，candidate bytes 不变；
4. 二次 promotion DENY，不重复发布；
5. reject/expire terminal 且无 active event；
6. Session Close candidate 可 inspect/promote；
7. file/split 与 custom state root 行为一致；
8. CLI `memo candidate list|inspect|promote|reject|expire` 复用同一 API。

## 非目标

- 不实现远端签名身份系统；
- 不自动 promotion；
- 不把 candidate 状态回写进原 event/file；
- 不实现 Dream tombstone（下一切片）。
