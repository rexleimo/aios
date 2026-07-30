# Context Lifecycle V1 S2 测试设计

> 工作项：`context-lifecycle-v1-s2-shadow-preflight`
> 模式：shadow-only；不真正阻止、不自动回滚
> 累积门：S0 与 S1 profile 必须继续通过

## 公共缝

- `evaluateExecutionContextPreflight()`：required read/freshness/target shadow verdict；
- `updateExecutionContextExpectedHash()`：同 session 合法写后更新 derived expected hash；
- `evaluateContextReconciliation()`：changed-files 与 Git diff 保守并集；
- `normalizeHandoffPacket()` / `evaluateHandoffLineage()`：v2 兼容、v3 revision/ref lineage；
- `evaluateWorkflowPolicy()`：direct/read-only 不创建 mandatory packet；
- `resolveContextDbRoot()` / changed-files：custom state root 与 CJK。

## CL-06 stale preflight

1. packet 记录 required file `sourceHash`，receipt 记录该 ref 已读；
2. 外部修改文件后，shadow 返回 `wouldBlockReasons=['required_context_stale']`；
3. `admissionChanged=false`；
4. 同 session 合法写后用 `updateExecutionContextExpectedHash()` 更新 expected hash，再评估不误报；
5. required unread 返回 `required_context_unread`；
6. mutation target 不在 targets/allowed writes 返回 `undeclared_target`。

## CL-07 post-change reconciliation

1. packet 声明 targets/allowed writes；
2. changed-files 只记录允许文件，Git diff 还发现未声明文件；
3. evaluator 使用 ledger 与 Git 的保守并集；
4. undeclared path 写入 drift receipt；
5. 不删除、不回滚用户文件；
6. custom state root 的 ledger 可读。

## CL-09 handoff lineage

1. v2 fixture normalize/render 保持 schema v2；
2. 带 `baseRevision/contextRevision/packetRef/receiptRef/verificationRefs` 的 handoff 使用 schema v3；
3. current context revision 不一致时 `revalidationRequired=true`；
4. revision 一致时 ready；
5. private ref 不自动改变 shared memo visibility。

## CL-11 direct/read-only

- blank、read-only、direct：`persistence=none`，`requiresPreEditSafety=false`，不创建 packet；
- planned/high-risk 对照：`requiresPreEditSafety=true`；
- 不引入 hard block。

## CL-12 CJK/custom state root

- 中文 task、中文 required filename 和中文 content 可生成 packet/receipt；
- packet、receipt、changed-files 全部写入 `AIOS_PROJECT_STATE_DIR` 解析后的 state root；
- 不误写默认 `.aios`；
- source hash 和 stale detection 正常。

## Profile

S2 必须使 CL-06、CL-07、CL-09、CL-11、CL-12 全部 pass；CL-01～05、08、10 不回退。所有 shadow verdict 都保留 `admissionChanged=false`。

## RED 命令

```powershell
node scripts/benchmarks/context-lifecycle-v1.mjs `
  --profile s2 `
  --json-out temp/context-lifecycle-v1/s2-current.json `
  --markdown-out temp/context-lifecycle-v1/s2-current.md
```
