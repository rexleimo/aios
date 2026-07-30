# Context Lifecycle V1 S2 迭代报告

> **纠错状态：本报告只证明 benchmark/test evaluator acceptance。Preflight/Reconciliation 没有真实 mutation/lifecycle 调用方，因此 S2 产品能力未完成；12/12 不是生产接线证据。详见 `2026-07-28-context-lifecycle-v1-corrective-audit.md`。**

日期：2026-07-28

## 结论

**S2 shadow preflight / reconciliation 已达到累计 profile 门。治理闭环与规模验证仍在后续切片。**

同一 runner 的 `s2` profile 从 `8/12、退出码 1` 变为 `12/12、退出码 0`。S0、S1、S2 三个累计 profile 当前均为 12/12；S2 保持 shadow-only，没有自动阻断或回滚用户文件。

## 前后对比

| 指标 | S2 RED | S2 GREEN |
|---|---:|---:|
| S2 profile | 8/12 | 12/12 |
| 产品目标达成 | 8/12 | 12/12 |
| known failures | 4 | 0 |
| 退出码 | 1 | 0 |
| CL-06 stale/unread/undeclared | known_failure | pass |
| CL-07 ledger + Git reconciliation | known_failure | pass |
| CL-09 handoff lineage | known_failure | pass |
| CL-12 CJK/custom root | known_failure | pass |
| 定向兼容门 | 77 + 42 + 39 | 81 + 42 + 39 |

## 实现差异

### Shadow preflight

`scripts/lib/contextdb/execution-context.mjs`

- `evaluateExecutionContextPreflight()` 检测 required missing、unread、stale 与 undeclared mutation；
- verdict 只输出 `wouldBlockReasons`，始终 `admissionChanged=false`；
- `updateExecutionContextExpectedHash()` 只接受与当前磁盘 SHA-256 完全一致的 hash，避免任意声明绕过 stale；
- target 与 `allowedWrites` 使用同一个判定 helper，preflight 与 reconciliation 不重复协议。

### Reconciliation

`scripts/lib/lifecycle/context-reconciliation.mjs`

- 合并 changed-files ledger、Git unstaged、staged、untracked 路径；
- 保守并集捕获 ledger 遗漏；
- 排除解析后的 AIOS/ContextDB derived roots，避免 receipt 自己成为 undeclared source path；
- drift receipt 只观察，不删除或恢复用户文件；
- Git 不可用时显式记录 `reconciliation_git_unavailable`。

### Handoff lineage

`scripts/lib/contextdb/handoff.mjs`

- 无 lineage 的旧输入继续 normalize 为 schema v2；
- 带 `baseRevision/contextRevision/packetRef/receiptRef/verificationRefs` 的输入为 schema v3；
- revision mismatch 产生 `revalidationRequired=true`；
- v2 Markdown heading、角色、进度和后续动作保持兼容。

### Custom state root / CJK

`scripts/lib/session/changed-files.mjs`

- changed-files 复用 `resolveAiosStateRoot()`；
- 默认 `.aios/sessions` 不变；
- custom root 下不再误写默认 `.aios`；
- 中文 task、ref、内容与 mutation path 保持 hash、receipt 和 ledger 可用；
- sessionId 仍使用安全 ASCII 规则，不以 CJK 测试绕过路径边界。

### Installer full-suite 修复

`scripts/aios-install.sh`

- `file://` 离线资产直接 `cp`；
- Windows/MSYS drive path 经 `cygpath -u`；
- HTTP/HTTPS 仍走 curl/wget；
- 修复前全仓唯一失败的 Bash installer 测试现为 pass，完整 release-pipeline 18/18。

## 测试差异审查

新增：

- `scripts/tests/context-lifecycle-s2.test.mjs`：4/4；
- 该文件以及 S1/provenance 专项已加入 canonical `test:scripts`；
- runner 增加 CL-07、CL-09、CL-11、CL-12；
- profile 改为累计语义：后续能力对早期 profile 是 `not-required`，不会因提前完成而失败；baseline 仍保持精确复现语义。

没有删除、skip 或放宽 S0/S1 安全断言。CL-06 必须同时证明 stale、unread、undeclared 和合法 expected-hash 更新；CL-07 必须看到 Git 中 ledger 遗漏的 path；CL-09 必须保持 v2 且验证 v3 mismatch；CL-12 必须证明默认 `.aios` 未被误写。

已观察：

- S0/S1/S2：各 12/12；
- 定向兼容：81 + 42 + 39；
- S2 专项：4/4；
- workflow policy：65/65；
- release pipeline：18/18；
- MCP typecheck：通过；
- 修复前 full `test:scripts`：873 pass / 1 fail / 7 skip；唯一失败已定向修复，修复后的全量重跑正在进行。

## 标准与规格审查

### 仓库标准

- ContextDB 继续拥有 packet/receipt/handoff；Planning 继续拥有 task 声明；Lifecycle 只负责对账；
- 没有新增第二数据库、第二 packet 协议或自动 revert service；
- custom state root 全部经既有 resolver；
- Git reconciliation 使用无 shell 参数的 `spawnSync`，不执行用户文本；
- receipt 不复制 required 文件正文；
- shadow verdict 不修改 write admission。

### S2 规格映射

- CL-06：required source hash 漂移、未读和 undeclared target 均可观察；
- CL-07：planned vs actual 使用 ledger + Git 保守并集；
- CL-09：handoff revision/ref lineage 与 revalidation；
- CL-11：direct/read-only 不强制 packet；
- CL-12：CJK/custom root；
- CL-01～05、08、10：累计保持通过。

### Review verdict

未发现阻塞 S2 的标准或规格偏差。**PASS。** 当前只批准 shadow release candidate，不批准默认 hard enforcement。

## 专项风险审查

### 审查范围

- required ref 是否可越出 workspace；
- expected hash 是否可由调用方任意改写以绕过 stale；
- Git reconciliation 是否执行 shell/用户文本，是否把自身 sidecar 当成源码修改；
- custom state root 是否回落误写 `.aios`；
- sessionId 是否因 CJK 场景放宽路径安全；
- Windows/MSYS `file://` installer 是否改变网络下载安全语义；
- shadow verdict 是否会自动阻断或回滚用户文件。

### 专项结论

- ref 使用 workspace-relative containment；invalid/absolute/traversal ref 不读取；
- expected hash 更新必须等于当前磁盘 SHA-256，任意旧值或伪造值被拒绝；
- Git 使用参数数组调用 `spawnSync`，不启用 shell；AIOS/ContextDB derived roots 被精确排除；
- custom root 经 resolver，默认路径兼容；sessionId 继续使用 ASCII safe pattern；
- installer 仅对 `file://` 走本地 copy，HTTP/HTTPS 仍走原 curl/wget；
- reconciliation 和 preflight 都是 `admissionChanged=false`，没有自动 revert。

专项 verdict：**PASS，无阻塞项。** 残余风险是 shadow false-positive 尚未经过 20/200 规模验证，因此不得开启默认 hard enforcement。

## 证据

RED：

`receipt:638845a9-dbdf-4594-b390-f79f83aee15c`

GREEN：

`receipt:f919737d-f04a-42cf-8efd-c1ce405c02f0`

机器结果：

- `docs/reports/2026-07-28-context-lifecycle-v1-s0.json`
- `docs/reports/2026-07-28-context-lifecycle-v1-s1.json`
- `docs/reports/2026-07-28-context-lifecycle-v1-s2.json`

## 未完成范围

- candidate inspect/promote/reject/expire 与 promotion receipt；
- Dream tombstone approve/archive/restore/retention/GC；
- 20 个任务、200 个 mutation/receipt 的规模验证；
- hard enforcement Go/No-Go；
- 修复后的完整 `npm run test:scripts` 最终结果；
- 最终可回滚提交。
