# Context Lifecycle V1 S1 测试设计

> 工作项：`context-lifecycle-v1-s1-packet-receipt`
> 发布片：S1 observe-only Packet / Receipt
> 继承门：S0 profile 必须继续 6/6
> 非目标：S2 stale hash、write admission、实际 block、reconciliation

## 用户目标

计划型任务能够声明“准备改什么、必须读什么、如何验证”，ContextDB 生成不复制原文的 `ExecutionContextPacket` 和只观察的 `ContextReceipt`。预算不足时，每个 considered item 都留下确定的表示决策和可恢复引用；关闭功能时旧路径不变。

## 公共契约

### Planning v3 task

新写 plan 使用 schema v3，task additive 保留：

```json
{
  "targets": ["src/auth/login.mjs"],
  "allowedWrites": ["src/auth/**", "tests/auth/**"],
  "contextRequirements": [
    {
      "ref": "src/auth/policy.mjs",
      "reason": "authorization policy governs login",
      "required": true,
      "verification": ["tests/auth/login.test.mjs"]
    }
  ],
  "verification": ["node --test tests/auth/login.test.mjs"]
}
```

字符串形式的旧/简写 `contextRequirements` 仍可读，并确定性归一化为 object。Plan v1/v2 保持可读，不批量重写。

### ContextDB 窄扩展

新增独立文件和 API，不能重定义现有 MCP `buildContextPacket()`：

```text
scripts/lib/contextdb/execution-context.mjs
buildExecutionContextPacket(options)
projectContextItems(options)
resolveExecutionContextPaths(options)
```

Sidecar kind：

```text
contextdb.execution-context-packet
contextdb.context-receipt
```

存储位置必须使用 `resolveContextDbRoot()`；packet/receipt 是 derived sidecar，不是源文件唯一副本。

## CL-05 验收映射

Fixture：

```text
src/auth/login.mjs
src/auth/policy.mjs
tests/auth/login.test.mjs
AGENTS.md
```

Task target 是 login；required context 是 policy、test、AGENTS。read evidence 只声明 login，因此三个 required ref 均为 unread。

S1 目标：

1. `normalizeTask()` 保留 targets、allowedWrites、contextRequirements、verification；
2. packet 每个 required item 有 ref、reason、required、exists、sourceHash；不复制正文；
3. receipt 明确列出 required/read/unread/missing 与稳定 reason code；
4. 同 input/policy 的 decision digest 和 item decisions 可重复；
5. observe 模式 `admissionChanged=false`，不实际阻断 legacy 写入，也不输出 S2 `wouldBlock`；
6. mode=off 不写 sidecar、不改变旧 plan/memo/handoff canonical state；
7. sidecar custom state root 可解析；临时 workspace 可清理。

## CL-08 验收映射

构造多个带真实本地 file ref、source hash、summary 和估算大小的 considered item，并设置低预算。

S1 目标：

1. 每个 considered item 恰好进入 included/degraded/excluded 一个集合；
2. 表示顺序固定为 `full -> summary+ref -> ref-only`；
3. degraded item 必须有可解析 ref 和 sourceHash；
4. required/hardConstraint item 不得静默降级，必要时允许显式 `budgetOverflow=true`；
5. 无可恢复 ref 的 item 明确 excluded，reason=`no_recoverable_ref`，不伪造 ref；
6. denied/excluded receipt 不包含正文；
7. 同 input/budget 的 decisions 和 digest 可重复；
8. observe projection 不改变当前 `applyRecallBudget()`、canvas、prompt 或排序输出。

## Profile 门

| Profile | CL-05 | CL-08 | CL-10 | CL-06 |
|---|---:|---:|---:|---:|
| baseline | known failure | known failure | pass | known failure |
| s0 | known failure | known failure | pass | known failure |
| s1 | pass | pass | pass | known failure |
| s2 | pass | pass | pass | pass |

## RED 命令

```powershell
node scripts/benchmarks/context-lifecycle-v1.mjs `
  --profile s1 `
  --json-out temp/context-lifecycle-v1/s1-current.json `
  --markdown-out temp/context-lifecycle-v1/s1-current.md
```

实现前必须退出非零，且不匹配项为 CL-05、CL-08；CL-01/02/03/10 必须继续通过。

## 专项测试

```text
node --test scripts/tests/execution-context-packet.test.mjs
node --test scripts/tests/planning-contract.test.mjs
```

MCP ContextDB 39-test compatibility suite、S0 专项和 runner CL-10 最低数量门继续保留。

## 非目标与 S2 边界

S1 只记录 observation receipt：

- 不检测读取后外部修改；
- 不执行 `required_context_stale`；
- 不改变 write admission；
- 不对 direct/read-only 强制创建 packet；
- 不实现 changed-files/Git reconciliation；
- 不新增第二套 session ContextPacket、handoff 或 raw content store。
