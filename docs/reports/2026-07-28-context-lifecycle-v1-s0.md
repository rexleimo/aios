# Context Lifecycle V1 S0 迭代报告

> **解释边界：本报告仅覆盖当时六场景 S0 安全切片，不证明后续 S1/S2 生产接线、治理 authority 或 GC 并发安全。详见 `2026-07-28-context-lifecycle-v1-corrective-audit.md`。**

日期：2026-07-28

## 结论

**S0 已完成。Context Lifecycle V1 整体尚未完成。**

同一个基准 runner 的 `s0` profile 已从改造前的 `3/6、退出码 1` 变为改造后的 `6/6、退出码 0`。CL-05 和 CL-06 仍是后续 S1/S2 的已知失败，本轮没有把它们伪装成通过。

## 前后对比

| 指标 | 改造前 | 改造后 |
|---|---:|---:|
| S0 profile 匹配 | 3/6 | 6/6 |
| S0 命令退出码 | 1 | 0 |
| 产品目标达成 | 1/6 | 4/6 |
| 已知失败 | 5 | 2 |
| CL-01 | known_failure | pass |
| CL-02 | known_failure | pass |
| CL-03 | known_failure | pass |
| CL-10 兼容测试 | 69 + 40 + 39 通过 | 72 + 40 + 39 通过 |

## 实现差异

### S0-1 private memo supersede 边界

- `scripts/lib/memo/storage/temporal.mjs`
  - 新增统一的 scope/principal supersede 授权规则；
  - 读取历史数据时忽略 private-to-shared 和跨 private owner 的非法链接；
  - 自动 proposal 不再跨 scope/principal 产生 supersede。
- `scripts/lib/memo/storage/events-write.mjs`
  - 写入前过滤非法 supersede；
  - 在 private event 上记录 `supersedeDenied` 审计信息，而不是隐藏 shared fact。
- `scripts/lib/memo/storage/normalizers.mjs`
  - additive 保留非空 denial 审计字段，不改变无 denial 的旧 event 形状。

### S0-2 Session Close candidate

- `scripts/lib/lifecycle/session-hooks/close.mjs`
  - Session Close 不再调用 `appendMemoEvent`；
  - 在 ContextDB session 目录原子写入 `session-close-memory-candidate.json`；
  - candidate 带 `status=candidate`、`claimStatus=candidate` 和 source 信息；
  - 未经过人工或 steward promotion 前不进入 shared recall。
- `scripts/lib/session/changed-files.mjs`
  - 复用并导出统一的安全 sessionId 校验，确保 Session Close 在首次路径访问前拒绝 traversal 输入。

### S0-3 Dream proposal-only apply

- `scripts/lib/lifecycle/dream/index.mjs`
  - Dream apply 不再重写 JSONL 或 unlink split event；
  - 写入不含 memo 正文的 tombstone proposal 工件；
  - 返回 `sourceMutated=false`、`removedCount=0`；
  - dedup 按 scope/agent owner 分组，跨 owner 不自动聚类。

## 测试差异

- `scripts/tests/memo-temporal.test.mjs`
  - 新增同 scope/principal、历史坏链接、file/split denial 测试。
- `scripts/tests/memo-cli-integration.test.mjs`
  - Session Close 改为验证 candidate 持久化和 shared recall 不可见。
- `scripts/tests/dream.test.mjs`
  - Dream 改为验证源文件字节不变、proposal 内容、split 文件保留、private 排除和 owner 隔离。
- `scripts/benchmarks/context-lifecycle-v1.mjs`
  - CL-10 使用不低于基线测试数的门槛，允许新增测试但阻止删除测试后假通过。

没有删除或跳过原有兼容测试。危险的旧期望（自动发布、物理删除）被替换为已经批准的 S0 安全目标。

## 验证证据

### 改造前 RED

`receipt:ccf3a781-aab2-4ecf-b34e-437b8c347674`

### 改造后 S0 GREEN

`receipt:665e01f9-f7ed-4bcd-9ea5-7c172391fedc`

执行命令：

```powershell
node scripts/benchmarks/context-lifecycle-v1.mjs `
  --profile s0 `
  --json-out temp/context-lifecycle-v1/s0-current.json `
  --markdown-out temp/context-lifecycle-v1/s0-current.md
```

专项测试：

- memo temporal：21/21；
- session close / memo CLI：14/14；
- Dream：38/38；
- runner 兼容门禁：72 + 40 + 39，全通过。

机器结果：

`docs/reports/2026-07-28-context-lifecycle-v1-s0.json`

## 评审入口

建议按以下顺序审阅：

1. 先读本报告的“前后对比”，确认本轮范围仅为 S0；
2. 打开机器 JSON，核对 `passed=true`、`matched=6`、`total=6`；
3. 核对 CL-01、CL-02、CL-03 和 CL-10 的 `targetMet=true`；
4. 确认 CL-05、CL-06 仍为 `known_failure`，没有被误报为完成；
5. 如需本机复验，执行上面的 PowerShell 命令，期望退出码为 0。

### S0 Go/No-Go

进入 S1 的 Go 条件：

- S0 profile 6/6 匹配；
- CL-01/02/03 全部 pass；
- 兼容测试数不低于 69 + 40 + 39，且全部退出 0；
- 所有临时 workspace 的 `cleanup=removed`；
- 没有 `unknown` 或基础设施失败。

当前机器结果满足以上条件，因此从产品和测试角度可以进入 S1。

## 流程状态

此前 Rex `evidence-invalid` 的原因已定位并解除：GREEN receipt 使用了 `s0-after.*`，而冻结场景要求 `s0-current.*`。按完全一致的命令重跑后，Rex 已接受 GREEN evidence；refactor、专项风险审查、标准与规格审查均已通过。工作流 `context-lifecycle-v1-s0-safety` 当前为 `status=completed`。这不是产品缺陷。

## 专项风险审查

审查范围：memo scope/principal 隔离、历史非法 supersede、Session Close 未验证内容发布、sessionId 路径边界、Dream file/split 物理删除及跨 owner dedup。

审查结果：

- Critical：0；
- High：0；
- Medium：0 个阻塞 S0 的问题；
- 已在审查中补强：重复 Session Close 幂等覆盖测试，以及 unsafe sessionId 在首次路径访问前拒绝；
- 残余范围：candidate promotion、shared publisher capability、tombstone 审批/GC 属于后续版本能力，不影响 S0 的“默认不发布、默认不删除”安全结论。

专项 verdict：**PASS，S0 可作为进入 S1 的稳定安全基线。**

## 标准与规格审查

### 仓库标准

- supersede 授权由 `memo/storage/temporal.mjs` 统一定义，写入和历史读取复用同一规则，没有在 CLI 或测试中复制业务判断；
- Session Close candidate 复用 ContextDB session owner 和既有 sessionId normalizer，未新增第二套 memory backend；
- Dream proposal 使用现有 memo state root 与原子写入工具，file/split canonical source 均不修改；
- 新字段均为 additive，空 denial 不改变旧 event 的常见输出形状；
- `node --check` 与 `git diff --check` 通过；仅存在仓库既有的 Windows CRLF 提示，不是 whitespace error。

### S0 规格映射

- CL-01：写入拒绝和历史读取双层保护，Agent A 的 shared fact 保持可见；
- CL-02：Session Close 仅落 candidate sidecar，shared recall 不可见；
- CL-03：Dream apply 仅写 proposal，`removedCount=0` 且原始事件可达；
- CL-10：兼容门槛从固定等于改为不低于 baseline，允许新增测试但不能靠删除测试假通过。

### Review verdict

未发现阻塞 S0 的标准或规格偏差。**PASS。** 未完成的 promotion、GC、S1/S2 能力在下节单独列出，没有被算作 S0 完成项。

## 未完成范围

- CL-05：Plan 仍未保留 required context / targets；
- CL-06：Readiness 仍未检测 required file stale hash；
- S1 Packet/Receipt 和 S2 Shadow Preflight 尚未实施。
