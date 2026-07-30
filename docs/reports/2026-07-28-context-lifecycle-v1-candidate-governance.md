# Context Lifecycle V1 Candidate Governance 报告

> **纠错状态：CLI/状态机实现存在，但 `AIOS_RUNTIME_*` 仅是 cooperative env convention，不是对 shell-capable Agent 的安全边界。本报告不再支持 Release Candidate。详见 `2026-07-28-context-lifecycle-v1-corrective-audit.md`。**

日期：2026-07-28

## 结论

候选治理闭环已实现：memo event candidate 与 Session Close candidate 均可 list/inspect/promote/reject/expire；原 candidate 不可变；promotion 追加 verified event；所有 mutation 追加 ALLOW/DENY receipt。

## RED / GREEN

- RED：`receipt:f657a647-3e35-4cd7-afc5-00a3127bcbfa`，0 pass / 1 fail / 5 skip，公共模块缺失；
- GREEN：`receipt:62e83f2e-7764-43ed-a4b7-e6b78faeb468`，初始 6/6；
- refactor 后 focused：7/7；与 memo CLI/Session Close 组合：21/21。

## 实现

- `scripts/lib/memo/storage/candidates.mjs`
  - append-only ContextDB governance log；
  - metadata-only list；authorized inspect；
  - pending -> promoted/rejected/expired；
  - DENY 不改变状态；terminal 二次操作 DENY；
  - promotion 追加 verified memo event，并保存 `promotionOf`；
  - receipt 保存 principal/capability/policy/source hash/reason，不保存 candidate text。
- `scripts/lib/memo/cli/commands/candidates.mjs`
  - `memo candidate list|inspect|promote|reject|expire`；
  - runtime authority 仅来自 `AIOS_RUNTIME_*` envelope。
- `scripts/lib/memo/storage/provenance.mjs`
  - `memo:promote-shared` 可发布经治理批准的 shared event。
- Session Close 和 changed-files 都支持显式 custom-state env 注入。

## 测试差异审查

新增 `scripts/tests/memo-candidate-governance.test.mjs`，并加入 `test:scripts` 与 CL-10。测试没有把 candidate 直接改成 verified，也没有用测试 helper 绕过 public API。

覆盖：

- file/split；
- missing principal/policy/reason/capability DENY；
- 单次 promotion、二次 promotion DENY；
- reject/expire 不发布；
- Session Close sidecar bytes 不变；
- custom ContextDB root；
- receipt 无正文；
- CLI 与 API 同一 authority boundary。

## 标准与规格审查

- Candidate canonical source 不被修改；
- governance receipt 为 append-only derived audit；
- 默认 active query 仍过滤 candidate；
- promotion 只通过现有 memo writer，保持 file/split 和 provenance contract；
- 未创建第二 memo backend；
- 无 runtime principal、policy revision、reason 或 capability 时均 DENY 并落 receipt；
- receipt reason 是数据，不作为命令执行；
- custom root 经现有 resolver。

Review verdict（纠正后）：**PARTIAL / BLOCKED。** Focused tests 只覆盖 cooperative env model；shell-capable Agent 可自设 identity/capability，因此 hostile-agent authority 边界未完成。

## 专项风险审查

### 审查范围

- metadata list 是否泄漏 candidate text；
- inspect/promotion 是否可由普通 `--agent` 或正文伪造；
- DENY 是否错误改变 effective state；
- 二次 promotion 是否重复发布；
- receipt 是否复制正文；
- Session Close 原 sidecar 和 memo candidate provenance 是否被改写；
- custom root 是否出现治理日志分叉。

### 专项结论

现有 public API 测试覆盖 cooperative env model 下的状态机不变量：默认 list 无正文；DENY 不推进状态；terminal 二次操作 DENY；receipt 无 `text`；原 candidate 保持 candidate；同一 resolver 决定治理日志位置。但 hostile-agent authority 未覆盖。**PARTIAL / BLOCKED。**
