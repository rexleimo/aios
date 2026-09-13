# Context Lifecycle V1 Dream Governance 测试设计

> 工作项：`context-lifecycle-v1-dream-governance`

## 复用阶梯

1. 复用 Dream proposal 与 sourceManifest；
2. 复用 memo file/split canonical storage；
3. 复用 runtime identity/capability 与 ContextDB/Memo root resolver；
4. 复用 query projection 隐藏 logical archive；
5. 仅新增 append-only governance log、archive snapshot 和 CLI 薄适配。

## 状态机

```text
proposed -> approved -> archived -> restored
proposed -> rejected
archived --retention elapsed--> gc
GC snapshot -> restored
```

- DENY 不推进状态；
- proposal 文件不可变；
- archive 前验证 sourceManifest hash；
- archive 只逻辑隐藏；
- GC 只允许 approved + archived + retention elapsed；
- GC 前保存 exact source snapshot；
- restore 在 GC 前取消 logical archive，GC 后从 snapshot 恢复 canonical source。

## 权限

- inspect：human 或 `memo:review-tombstone`；
- approve/reject：human 或 `memo:approve-tombstone`；
- archive：human 或 `memo:archive-shared`；
- restore：human 或 `memo:restore-shared`；
- gc：human 或 `memo:gc-shared`；
- mutation 必须有 principal、policy revision、reason。

形式化治理契约（2026-09-12，借鉴 LoopX dreaming lane 措辞，机制对应物已在代码中）：
dream lane 的权限语义收敛为 DREAM_PLANNING_CONTRACT（dream/governance.mjs 导出，
内嵌进每份 proposal JSON 与 governance receipt，机器可查）：

- lane: dreaming_planning；authority: proposal_only_until_promoted；
- 五项权限封印全 false：may_execute_protected_actions / may_read_private_material /
  may_mutate_active_state / may_append_delivery_history / may_spend_delivery_quota；
- promotion_required=true，promotion_requirements 映射到本仓库词表：
  operator_approval_via_broker_seam（authorize seam）、should_run_decision
  （solo-runtime should-run 门）、write_scope_approval（allowedWrites 边界）、
  boundary_scan_unsafe_content_and_private_material（promote 门 unsafe_content
  扫描 + agent_private 排除）；
- dream run 写 proposal 时校验契约存在且五项封印全 false，否则拒绝写入。

## Receipt

ALLOW/DENY receipt 保存 proposal/action/principal/capability/policy/reason/source hashes/retention/snapshot ref，不保存 memo text。

## RED 验收

1. Dream apply 仍 proposal-only，source bytes 不变；
2. unauthorized、空 reason、缺 policy DENY；
3. approve 后才能 archive；
4. source hash 漂移 archive DENY；
5. archive 后默认 list/search 隐藏，`includeArchived` 可见；
6. restore 后重新可见；
7. retention 前 GC DENY；到期后 file/split active source 物理移除；
8. GC 后 restore 从 snapshot 恢复；
9. agent_private 永不出现在 proposal/action；
10. custom root 与 CLI 使用同一 API。

## 非目标

- 不自动审批；
- 不默认 hard-delete；
- 不删除 archive snapshot；
- 不实现远端签名身份系统。
