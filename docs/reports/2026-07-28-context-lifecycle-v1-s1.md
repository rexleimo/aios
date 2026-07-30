# Context Lifecycle V1 S1 迭代报告

> **纠错状态：本报告只证明 library/profile acceptance。Packet/Receipt 没有真实 CLI/MCP/lifecycle 生产调用方，因此 S1 产品能力未完成。详见 `2026-07-28-context-lifecycle-v1-corrective-audit.md`。**

日期：2026-07-28

## 结论

**S1 observe-only Packet / Receipt 已达到 profile 门。Context Lifecycle V1 整体尚未完成。**

同一个 runner 的 `s1` profile 从改造前 `5/7、退出码 1` 变为 `7/7、退出码 0`。CL-06 stale preflight 仍按 S1 边界保留为 known failure，没有通过放宽断言伪装成完成。

## 前后对比

| 指标 | S1 RED | S1 GREEN |
|---|---:|---:|
| S1 profile 匹配 | 5/7 | 7/7 |
| 命令退出码 | 1 | 0 |
| 产品目标达成 | 4/7 | 6/7 |
| 已知失败 | 3 | 1 |
| CL-05 Packet/Receipt | known_failure | pass |
| CL-08 budget representation | known_failure | pass |
| CL-06 stale detection | known_failure | known_failure（符合 S1） |
| CL-10 兼容门 | 72 + 40 + 39 | 72 + 42 + 39 |

## 实现差异

### Planning v3 additive contract

- `scripts/lib/planning/schema.mjs`
  - 新写 plan 使用 schema v3；
  - task 保存 `targets`、`allowedWrites`、`contextRequirements`、`interfaces`、`verification`、`contextRevision`；
  - 字符串 required context 确定性归一化为 object。
- `scripts/lib/planning/contract.mjs`
  - 所有显式写路径统一升级并归一化 v3；
  - v2 读取不改写，显式状态/task/evidence 写入时才升级；
  - Markdown 展示 target、required context 和 verification；
  - 新增统一 `replacePlanTasks()`，Dream 不再绕过 planning writer。
- `scripts/lib/lifecycle/preflight-contracts.mjs`
  - 同时识别 schema v2/v3 planning artifact。
- `scripts/lib/lifecycle/dream/export-to.mjs`
  - plan sync 复用 planning writer，不再手写 schema v2 active state。

### ExecutionContextPacket / ContextReceipt

- `scripts/lib/contextdb/execution-context.mjs`
  - 新增独立 `buildExecutionContextPacket()`，不重定义现有 MCP session `buildContextPacket()`；
  - packet 只保存 ref、reason、hash、size 和声明，不复制文件正文；
  - observe receipt 记录 required/read/unread/missing 和 included/degraded/excluded；
  - same input 的 decision digest 稳定；
  - `admissionChanged=false`，不输出 S2 `wouldBlock`；
  - mode=`off` 不创建 sidecar；
  - sidecar 使用 `resolveContextDbRoot()`，支持 custom state root。
- `scripts/lib/contextdb/index.mjs`
  - 从现有 ContextDB barrel 导出窄 API，不新增 backend。

### Budget representation receipt

`projectContextItems()` 只观察表示决策：

```text
full -> summary+ref -> ref-only -> excluded
```

- degraded item 必须带可解析 ref 和 source hash；
- 无 recoverable ref 明确 `no_recoverable_ref`；
- required/hard constraint 保持 full，超预算显式 `budgetOverflow=true`；
- receipt decision 不包含正文或 summary。

## 测试差异审查

- 新增 `scripts/tests/execution-context-packet.test.mjs`：6/6；
- planning/preflight focused：24/24；
- canonical workflow policy suite：65/65；
- Dream/Session Close/Packet 组合回归：58/58；
- Dream plan-sync：5/5；
- `scripts/lib/verify-all.mjs`：37/37；
- MCP TypeScript typecheck：通过；
- runner 兼容门：72 + 42 + 39，全部通过。

测试没有删除或跳过 S0 安全断言。CL-10 继续使用“不低于 baseline 数量且退出 0”的门槛，新增测试不会触发假回退，删除测试不能假通过。

## 验证证据

### RED

`receipt:40e1a7e6-ea94-47c7-b52f-0fe7d471767e`

### GREEN

`receipt:1000dfbe-ebcb-42f9-9fc2-594657a6554a`

复验命令：

```powershell
node scripts/benchmarks/context-lifecycle-v1.mjs `
  --profile s1 `
  --json-out temp/context-lifecycle-v1/s1-current.json `
  --markdown-out temp/context-lifecycle-v1/s1-current.md
```

机器结果：

`docs/reports/2026-07-28-context-lifecycle-v1-s1.json`

## S1 Go/No-Go

Go 条件：

- S1 profile 7/7；
- CL-05、CL-08 pass；
- S0 CL-01/02/03 不回退；
- CL-06 仍是预期 known failure；
- mode off 不写 sidecar；
- observe 不改变 admission；
- ContextDB 39-test compatibility 保持通过。

当前均满足，可进入下一切片。

## 标准与规格审查

### 仓库标准

- Planning 是 targets、required context、verification 的唯一声明 owner；ContextDB 不修改 plan progression；
- 新 API 命名为 `ExecutionContextPacket`，现有 MCP session `buildContextPacket()` 和 39-test contract 未改变；
- packet/receipt 写入现有 ContextDB state root 的 derived sidecar，不新增数据库或 raw content store；
- 所有 sidecar 只保存 ref/hash/reason/decision，不复制 required 文件正文；
- v2 read 保持原样，只有显式 write 升级 v3；所有 planning writer 复用同一 normalize/write boundary；
- mode off 不落盘，observe 设置 `admissionChanged=false`，没有 S2 `wouldBlock`；
- `node --check`、focused tests、canonical workflow suite、MCP typecheck 和 `git diff --check` 通过。

### S1 规格映射

- CL-05：Plan v3 声明 required refs；packet 记录 ref/reason/hash；receipt 记录 read/unread/missing，决策可重复；
- CL-08：每个 considered item 恰好一个 category；degraded 必须有真实 ref/hash；hard constraint 不静默降级；
- CL-10：S0 行为和兼容门保持通过，observe sidecar 是唯一新增持久化；
- CL-06：仍保持 known failure，证明 S1 没有越界宣称 stale enforcement。

### Review verdict

未发现阻塞 S1 的标准或规格偏差。**PASS。** 调用方提供的 read refs 仍是 observation evidence，不宣称为不可伪造 runtime citation；该限制已在未完成范围中保留。

## 未完成范围

- 原始完整 S0 的 CL-04 trusted runtime producer/provenance 尚需单独补齐；
- candidate promote/reject、shared publisher capability 尚未形成完整治理闭环；
- CL-06 stale hash、CL-07 reconciliation、S2 shadow preflight 尚未实施；
- receipt 目前接受调用方提供的 read refs，尚未宣称不可伪造 runtime citation；
- 没有运行仓库所有 RL/浏览器/站点测试，本报告只声明上述 S1 与兼容门结果。
