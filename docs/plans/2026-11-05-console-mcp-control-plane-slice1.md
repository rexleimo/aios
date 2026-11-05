# Console MCP control-plane slice 1

> AIOS Planning Contract (schema v3)
> created: 2026-11-05T10:09:51.522Z
> client: cli
> source: aios plan start
> route: unknown（账本现值。`plan auto-gate` 曾返回 route=implement + skills=[rex-planning]，随后 `plan start --work-item` 重注册把 route 记成 unknown；不为 cosmetics 再跑 auto-gate，因为它会按账本重渲染本文件）
> work-item: console-mcp-control-plane-slice1

## Objective

把「MCP server 成为一等对象」这一期切片拆成有真实依赖的工作项图：`aios mcp` 动词 + server 账本 + 统一对象表。

- 需求决定（readiness=ready）：`docs/plans/2026-11-05-console-agent-stack-control-plane.md`
- 边界与裁决：`docs/adr/0008-console-is-the-local-agent-stack-control-plane.md`
- 术语：`CONTEXT.md`（统一对象表 / MCP server 一等对象与账本 / 落点表与落点可证性 / 接管与每客户端允许集合 / 留痕 vs 配置对象 / pending-interactive）

本文只出计划，不启动实施、不启动 Team/Harness、不调下一个 Provider。

## 约束（本轮实测，不是引用旧文档）

落点与预算都是执行期会撞的硬事实，逐条量过：

| 约束 | 实测值 | 对计划的影响 |
|---|---|---|
| `scripts/lib/clients/` 目录预算 | 5/8 pass | 新模块落 `scripts/lib/clients/mcp/`（→6/8），**不落** `tooling/components/`（7/8，只剩 1 格，用完即零余量） |
| `scripts/lib/tooling/cli/dispatch/` | 6/8 pass | 新分支落 `dispatch/mcp.mjs`，不改 `dispatch.mjs` 的逻辑体 |
| `scripts/lib/tooling/cli/parse-args/run/` | 6/8 pass | 参数解析落 `run/mcp.mjs`；`parse-args/` 顶层 8/8 顶格，禁止再加文件 |
| `scripts/tests/clients/` | **8/8 顶格** | 不许新建测试目录；新测试只能进已有 `scripts/tests/clients/mcp-formats/`（5/8，放得下 3 个） |
| `scripts/tests/fixtures/` | **8/8 顶格** | fixture 不进顶层目录 → 用测试文件内联 fixture + `os.tmpdir()` 真实落盘 |
| `apps/shell/ui/src/components/` | **8/8 顶格** | 对象表组件只能落 `components/sections/`（6/8）；数据层落 `src/lib/data/`（6/8）；API 路由可新建 `app/api/mcp/`（api/ 4/8） |
| `docs` 目录预算 | 8/8（`docs/plans`/`docs/reports` 已豁免） | 需求记录与计划都留在 `docs/plans/`，不新开 `docs/requirements/` |
| `dispatch.mjs`、`parse-args/top-level.mjs` | **已是 fileLines 违规** | 新逻辑一律不进这两个文件；CLI 侧只允许一条委派分支 |
| 落点表可信度 | hermes 真实路径 `mcp_servers.mcp.<name>`，表只写到 `mcp_servers` | w1 必须先修表再写字母，否则 w2 静默写进没人读的路径 |
| pi 载体 | `mcp-adapter.mjs:2-8,30,33,56,167`；配置链是 structural no-op | pi 的「装卸」走扩展载体判定，且必须继承 `:21-22` 的 shell/auth 拒绝 |
| 既有缺陷反例 | `skill add --dry-run` 空转（`dispatch.mjs:151-162` 不传，`external/install.mjs` 里 `dryRun` 出现 0 次） | w2/w4 的 `--dry-run` 必须带「不写盘」断言，作为验收的一部分 |

## 工作项图

| id | type | 产出（observable outcome） | dependsOn | 入口条件 | 完成判据（verification 命令） | failureClass | 回退点 |
|---|---|---|---|---|---|---|---|
| w1-landing-schema | read-model | 每 `(client, scope)` 的真实落点路径 + 字段白名单，表驱动断言与真实配置一致 | — | 无 | `node --test scripts/tests/clients/mcp-formats/mcp-landing-schema.test.mjs` | `runtime-error` | 纯新增数据与测试，回退=删表新增字段 |
| w2-generic-writer | write-engine | `writeServer/removeServer`（json/toml/yaml/opencode/gemini/zcode）合一，`--dry-run` 真不写盘 | w1 | w1 白名单落地 | `node --test scripts/tests/clients/mcp-formats/mcp-generic-writer.test.mjs`（每家：装→读回→卸→**其余字节 diff 为空**） | `safety-gate` | 只写临时目录 fixture，未碰真配置；失败即整模块停用 |
| w3-ledger-ownership | ledger | `~/.aios/mcp/ledger/` 归属账本 + `adopt` + conflict/external 判定 + 每客户端允许集合 | w2 | w2 写形状稳定 | `node --test scripts/tests/clients/mcp-formats/mcp-ledger-ownership.test.mjs`（含「pi 装 aios-shell 被拒 + 理由原文」用例） | `safety-gate` | 账本不存在=只读，写入路径拒绝启动 |
| w4-cli-verbs | contract | `aios mcp list/add/remove/enable/disable/adopt/doctor --json`，schema `mcp.list.v1` | w2, w3 | w2/w3 通过 | `node scripts/aios.mjs mcp list --json` 结构断言 + `--dry-run` 后目标文件 mtime/内容不变 | `runtime-error` | CLI 分支委派可单点撤回（新命令，无历史调用方） |
| w5-converge-writers | refactor | headroom / browser / code-review-graph / pi 四个私有写入器改经 w2–w4，策略逐条保留 | w4 | w4 契约冻结 | 各家 `aios doctor` 前后配置 **逐字节 diff 为空** + `node scripts/run-test-suite.mjs regression` | `runtime-error` | 逐特性收编，任一不过即回退该特性到原私有路径 |
| w6-object-table-ui | ui-surface | 统一对象表（MCP 段可操作）+ 消除 `/usage` 幽灵与 `/matrix` 死链 | w4 | w4 只读面可用（可与 w5 并行） | `npm run test:shell` + 真机：装 probe server→读回→卸→diff 空，界面状态列显示 `landing-unverified` 原文 | `runtime-error` | 新段挂新路由；`tools.tsx` 原页保留一版，回退=切回旧 section |
| w7-coverage-evidence | evidence | 10 落点逐家证据卡（装/卸/diff/失败原文），未过者 `landing-unverified` | w5, w6 | w5/w6 合流 | 证据目录 `docs/evidence/2026-11-05-mcp-landing/` 每家一份，且 `node rex-harness/bin/rex-harness.mjs standards check --rule directoryEntries` 仍 pass | `host-unsupported` | 证据是产物不是状态，失败不改代码状态；`host-unsupported` 的家保留原文标灰 |

### 最短关键路径

`w1 → w2 → w3 → w4 → { w5 ‖ w6 } → w7`

- 关键长度 5（w1,w2,w3,w4,w5/w6 之一,w7 中的串行段）。
- `w5` 与 `w6` 是**真实可并行边界**：w6 只依赖 w4 的 `list` 面即可开工，写动作的按钮在 w4 的 add/remove 契约上，与 w5 的收编互不改同一文件（w5 写 `scripts/lib/**`，w6 写 `apps/shell/ui/src/**`）。
- 独立性存疑的一项如实标 blocked：**w1 未完时 w2 不许开始**——不是因为排期，而是照错的落点表写盘是静默失效（hermes 那条），先写等于把 w1 的失败伪装成成功。

## frontier / parallelGroups

本轮执行结果（2026-11-05，串行推进，frontier 并发度=1，因此未走 `aios work` 派发）：

- **w1-landing-schema：done**
  - 产物：`scripts/lib/clients/mcp/landing-schema.mjs`（192 行）+ `scripts/tests/clients/mcp-formats/mcp-landing-schema.test.mjs`（137 行，11 例）。
  - 证据：`node --test scripts/tests/clients/mcp-formats/mcp-landing-schema.test.mjs` → pass 11 / fail 0；同目录全套 → pass 33 / fail 0；`standards check --rule directoryEntries` → `scripts/lib/clients` 仍 pass。
  - 落点选择被预算逼出：`definitions.mjs` 385/400 只剩 15 行，所以**没有扩表**，改为新增覆盖表（只补 entryPath / 字段白名单 / 可写性 / 载体，路径事实仍归 `CLIENT_MCP_TARGETS` 一个所有者）。
- **frontier（ready）**：`w2-generic-writer`（唯一解锁项）。
- **frontier（blocked）**：`w3…w7`，原因=上游未闭合。
- **parallelGroups**：`[w1 ✓] → [w2] → [w3] → [w4] → [w5, w6] → [w7]`。

### w1 实施中新增的实测事实（已回写 ADR 0008 / CONTEXT / 需求记录）

- **作废**：「hermes 真实路径是 `mcp_servers.mcp.<name>`」——YAML 解析器复测真实结构就是 `mcp_servers.<name>`。错误来源是我自写的按空格猜缩进的行扫描脚本。
- **作废**：「`~/.pi/mcp.json` 不存在所以 pi 无落点」——真实落点 `~/.pi/agent/mcp.json` EXISTS，形状 `mcpServers.<name>={command,args,lifecycle}`。
- **新发现（真漂移）**：`CLIENT_MCP_TARGETS.hermes` 的 client 级 `namespace:'mcpServers'` 与 home scope 的 `'mcp_servers'` 并存（`definitions.mjs:309-314`），**读 client 级就会把对的表读成错的**——w1 自己先踩过，已钉成回归用例。
- **新发现（待证）**：gemini 项目级条目实测带 `cwd`，而 gemini 段注释称其 schema 严格；两者冲突。表按实测放行但标记 `unverifiedFields:['cwd']`，交由 w7 用真启动判定，不许因「今天写着没崩」当已验。

## convergenceGate

全部满足才算汇合：

1. ADR 0008 的 7 条验收逐条有证据（尤其第 2 条「未验证者标 `landing-unverified` 且不得标绿」与第 4 条「pi 装 shell/auth 被拒」）。
2. `node rex-harness/bin/rex-harness.mjs standards check` 不新增违规；目录预算变化仅限 `scripts/lib/clients/mcp/` 与 `apps/shell/ui/src/app/api/mcp/` 两处新增。
3. `node scripts/run-test-suite.mjs regression` 通过；`npm run test:shell` 通过。
4. 假入口清零且**不许以「先灰着留着」代替删除**：`/usage` 幽灵页、`/matrix` 死链、三个未挂载 section 组件（技能健康/团队/集成）要么接线要么删码。
5. `--dry-run` 在 `mcp add/remove` 上有「不写盘」断言，反例缺陷不得复制。

required evidence refs：`docs/evidence/2026-11-05-mcp-landing/*`、`artifact:docs/adr/0008-console-is-the-local-agent-stack-control-plane.md#验收`、测试命令输出。

## completionClaim

`hard`。

- consumer：控制台的统一对象表（w6）与其后的 harness 工作流；
- artifact：`aios mcp list --json` 的 `mcp.list.v1` 输出 + `~/.aios/mcp/ledger/` 账本；
- verification：w2/w3 的表驱动装卸测试（卸后其余字节 diff 为空）+ w7 的逐家证据卡；
- evidence refs：`docs/evidence/2026-11-05-mcp-landing/`、`scripts/tests/clients/mcp-formats/mcp-*.test.mjs`。

## rex.delivery-ticket.v1

```json
{
  "schemaVersion": 1,
  "kind": "rex.delivery-ticket.v1",
  "workItemId": "console-mcp-control-plane-slice1",
  "decisionTicketRef": "artifact:docs/adr/0008-console-is-the-local-agent-stack-control-plane.md",
  "requirementsRef": "artifact:docs/plans/2026-11-05-console-agent-stack-control-plane.md",
  "workItems": [
    { "id": "w1-landing-schema", "type": "read-model", "dependsOn": [], "outcome": "每 (client,scope) 的真实落点路径与字段白名单", "completionCriteria": "表驱动断言覆盖 10 落点且与真实配置一致", "verification": "node --test scripts/tests/clients/mcp-formats/mcp-landing-schema.test.mjs", "failureClass": "runtime-error", "allowedWrites": ["scripts/lib/foundation/clients/selection/core/definitions.mjs", "scripts/tests/clients/mcp-formats/**"], "evidenceRefs": ["probe:mcp-shape-probe-2026-11-05", "file:scripts/lib/foundation/clients/selection/core/definitions.mjs#L266"] },
    { "id": "w2-generic-writer", "type": "write-engine", "dependsOn": ["w1-landing-schema"], "outcome": "通用 writeServer/removeServer 合一，--dry-run 真不写盘", "completionCriteria": "六格式每家装→读回→卸→其余字节 diff 为空", "verification": "node --test scripts/tests/clients/mcp-formats/mcp-generic-writer.test.mjs", "failureClass": "safety-gate", "allowedWrites": ["scripts/lib/clients/mcp/**", "scripts/tests/clients/mcp-formats/**"], "evidenceRefs": ["file:scripts/lib/tooling/components/codemap/targets/mcp-targets/targets.mjs#L117-L121", "file:scripts/lib/tooling/components/browser/mcp/formats/mcp-opencode.mjs#L21-L23"] },
    { "id": "w3-ledger-ownership", "type": "ledger", "dependsOn": ["w2-generic-writer"], "outcome": "归属账本 + adopt + conflict/external + 每客户端允许集合", "completionCriteria": "pi 装 aios-shell 被拒并给出理由原文；同名被改条目判 conflict", "verification": "node --test scripts/tests/clients/mcp-formats/mcp-ledger-ownership.test.mjs", "failureClass": "safety-gate", "allowedWrites": ["scripts/lib/clients/mcp/**", "scripts/tests/clients/mcp-formats/**"], "evidenceRefs": ["file:scripts/lib/clients/integrations/ledger.mjs#L2-L3", "file:scripts/lib/tooling/components/integrations/pi/mcp-adapter.mjs#L21-L22"] },
    { "id": "w4-cli-verbs", "type": "contract", "dependsOn": ["w2-generic-writer", "w3-ledger-ownership"], "outcome": "aios mcp list/add/remove/enable/disable/adopt/doctor --json", "completionCriteria": "schema mcp.list.v1 断言 + dry-run 后目标文件不变", "verification": "node scripts/aios.mjs mcp list --json", "failureClass": "runtime-error", "allowedWrites": ["scripts/lib/tooling/cli/parse-args/run/mcp.mjs", "scripts/lib/tooling/cli/dispatch/mcp.mjs", "scripts/lib/tooling/cli/commander/specs/**", "scripts/lib/tooling/cli/help/commands/**", "scripts/tests/**"], "evidenceRefs": ["file:scripts/lib/tooling/cli/dispatch/dispatch.mjs#L77"] },
    { "id": "w5-converge-writers", "type": "refactor", "dependsOn": ["w4-cli-verbs"], "outcome": "headroom/browser/code-review-graph/pi 改经通用路径且策略保留", "completionCriteria": "收编前后配置逐字节 diff 为空；pi 仍走扩展载体且版本解析失败留 adapter", "verification": "node scripts/run-test-suite.mjs regression", "failureClass": "runtime-error", "allowedWrites": ["scripts/lib/environment/aios-init/headroom-mcp/**", "scripts/lib/tooling/components/browser/mcp/**", "scripts/lib/tooling/components/codemap/targets/mcp-targets/**", "scripts/lib/tooling/components/integrations/pi/**"], "evidenceRefs": ["file:scripts/lib/environment/aios-init/headroom-mcp/lifecycle.mjs#L55-L57", "file:scripts/lib/tooling/components/integrations/pi/mcp-adapter.mjs#L56"] },
    { "id": "w6-object-table-ui", "type": "ui-surface", "dependsOn": ["w4-cli-verbs"], "outcome": "统一对象表（MCP 段可操作）+ 假入口清零", "completionCriteria": "真机一次装卸闭环，未验证家显示 landing-unverified 原文；/usage 与 /matrix 不再是 404 或被删", "verification": "npm run test:shell", "failureClass": "runtime-error", "allowedWrites": ["apps/shell/ui/src/app/api/mcp/**", "apps/shell/ui/src/lib/data/**", "apps/shell/ui/src/components/sections/**", "apps/shell/ui/src/lib/sections.ts"], "evidenceRefs": ["file:apps/shell/ui/src/app/(console)/[section]/page.tsx#L17-L24", "file:apps/shell/ui/src/lib/sections.ts#L22-L54", "file:apps/shell/ui/src/components/sections/overview.tsx#L49"] },
    { "id": "w7-coverage-evidence", "type": "evidence", "dependsOn": ["w5-converge-writers", "w6-object-table-ui"], "outcome": "10 落点逐家证据卡", "completionCriteria": "每家含装/卸/字节 diff 或失败原文；无绿格来自未验证", "verification": "node rex-harness/bin/rex-harness.mjs standards check --rule directoryEntries", "failureClass": "host-unsupported", "allowedWrites": ["docs/evidence/2026-11-05-mcp-landing/**"], "evidenceRefs": ["artifact:docs/adr/0008-console-is-the-local-agent-stack-control-plane.md#决策4"] }
  ],
  "frontier": { "ready": ["w1-landing-schema"], "blocked": [{ "id": "w2-generic-writer", "reason": "上游 w1 未闭合前写盘会静默落到没人读的路径（hermes 实测漂移）", "evidenceRef": "probe:mcp-shape-probe-2026-11-05" }] },
  "parallelGroups": [["w1-landing-schema"], ["w2-generic-writer"], ["w3-ledger-ownership"], ["w4-cli-verbs"], ["w5-converge-writers", "w6-object-table-ui"], ["w7-coverage-evidence"]],
  "convergenceGate": {
    "condition": "ADR 0008 七条验收全过 + standards 不新增违规 + regression 与 test:shell 通过 + 假入口清零 + dry-run 有不写盘断言",
    "verification": ["node scripts/run-test-suite.mjs regression", "npm run test:shell", "node rex-harness/bin/rex-harness.mjs standards check"],
    "requiredEvidenceRefs": ["docs/evidence/2026-11-05-mcp-landing/", "artifact:docs/adr/0008-console-is-the-local-agent-stack-control-plane.md"]
  },
  "completionClaim": {
    "level": "hard",
    "runtimeArtifactContract": {
      "schemaVersion": 1,
      "kind": "rex.runtime-artifact-contract.v1",
      "consumer": "apps/shell/ui 统一对象表 + 后续 rex 工作流",
      "artifact": "mcp.list.v1（aios mcp list --json）+ ~/.aios/mcp/ledger/ 归属账本",
      "verification": "w2/w3 表驱动装卸测试（卸后其余字节 diff 为空）与 w7 逐家证据卡一致",
      "evidenceRefs": ["scripts/tests/clients/mcp-formats/", "docs/evidence/2026-11-05-mcp-landing/"]
    }
  }
}
```

## Progress

- status: executing（账本在 t1/t2 标 done 后自动进入；本轮只做了规划，代码一行没动）
- tasks: t1-understand ✓ / t2-plan ✓ / t3-implement **部分**（w1/7 完成）/ t4-verify 待开
- evidence: 4 条（需求记录路径 + 计划路径 + standards 命令 + w1 测试命令输出）
- gate: not-ok，原因「2 task(s) not done: t3-implement, t4-verify」——正确，实施未发生

## Decision Log

- 2026-11-05：MCP 一等对象为第一闭环，落点在 `scripts/lib/clients/mcp/`（不是 `tooling/components/mcp/`）——依据实测目录预算。
- 2026-11-05：`w5` 与 `w6` 判为真并行（不同写入面），`w1→w2` 判为硬串行（静默失效风险）。
- 2026-11-05：假入口必须消除，不接受「先灰着留着」——与 ADR 0007「未覆盖必须显式画出」不冲突，因为这里是**入口不存在**却显示存在。

## Acceptance

见 convergenceGate 五条 + `docs/plans/2026-11-05-console-agent-stack-control-plane.md` 的 7 条验收标准。

## Next Actions

1. ~~人批准本图~~ 已由用户 `/implement-spec` 批准（`plan set-status --status approved`，note 记了来源）。
2. ~~实施首轮只做 w1~~ 完成，11 例绿。
3. **下一步 = w2-generic-writer**：以 `resolveLanding()` 为唯一落点源，合一 codemap 的 `injectCrgIntoClientTarget/removeCrgFromClientTarget`（`targets.mjs:117-121`，现为 CRG 专用命名）与 browser 的五个 `migrateOne*`，产出 `writeServer/removeServer`，落盘前必过 `assertEntryAllowed()`。硬门：每格式「装→读回→卸→其余字节 diff 为空」，且 `--dry-run` 有不写盘断言。
4. w2 之后再 `w3`（账本/adopt/允许集合）→ `w4`（CLI 动词）→ `{w5 ‖ w6}` → `w7`。
5. 停止点如实说明：本轮**只推进了 w1**。`w2` 起会真的写用户主目录的客户端配置，属于外部副作用面，按串行 frontier 一格一验地推，不做一次性大包；spec 的其余 6 个工作项**未完成**，不得勾掉。

## Verification evidence

- `docs/adr/0008-console-is-the-local-agent-stack-control-plane.md`（边界来源）
- 目录预算与落点实测：`node rex-harness/bin/rex-harness.mjs standards check --rule directoryEntries`、`E:/tmp/mcp-shape-probe-2.mjs`（只读探测，未打印任何配置值）

## Status

- status: executing（规划完成，等待人批准进入 t3-implement；批准命令 `aios plan set-status --status approved`）
