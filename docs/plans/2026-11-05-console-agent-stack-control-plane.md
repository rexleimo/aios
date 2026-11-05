# 需求决定：控制台 = 本机 agent 栈的管理面

日期：2026-11-05　来源：`/grill`（用户显式声明 requirements）
状态：**ready**（见文末 `readiness`）
取代：`docs/adr/0007-aios-perceived-surface-and-desktop-shell.md` 决策 2（第一屏=只读接入矩阵）。0007 其余决策不动。
落为决定：`docs/adr/0008-console-is-the-local-agent-stack-control-plane.md`

## 触发原话（对齐依据）

用户实测使用后的反馈，逐条都是范围输入而不是情绪：

1. 「要管理它自己的技巧管理不了」「要管理它的 skill 也管理不了」「管理 MCP 也管理不了」
2. 「还有什么会话、什么记录等乱七八糟的东西」
3. 「完全不知道它能做什么」「做出一个意义不明的工具」
4. 「在另一个 agent 里面交付时完全让人搞不懂，做出来等于没做」

## 决策依赖图

| id | 决定 | dependsOn | 状态 | 影响 | 依据 |
|---|---|---|---|---|---|
| product-job | 控制台 = 本机 agent 栈管理面（不是收益证明面） | — | resolved | critical | 用户 2026-11-05 /grill 答复；抱怨 1/3 全是「管不了 / 不知道能做什么」 |
| first-object | 第一闭环 = MCP server 成为一等对象 | product-job | resolved | critical | 实测 `scripts/lib/tooling/cli/dispatch/dispatch.mjs` 无 `mcp` 分支（仅 :77 一个 `--yes-headroom-mcp` 选项）；写 MCP 的只有 4 个特性私有路径 |
| write-boundary | 只动 AIOS 拥有的条目；别人的条目需显式接管；写回带指纹 | first-object | resolved | critical | 用户答复；同形状已在仓内三处成立（见下「已有同形形状」） |
| client-coverage | 覆盖 `CLIENT_MCP_TARGETS` 全部 10 个声明落点；pi 走扩展载体 | first-object,write-boundary | resolved | critical | 用户答复；`scripts/lib/tooling/components/integrations/pi/mcp-adapter.mjs:2-8,30,33,56,167`；`definitions.mjs:266` |
| per-client-allowlist | 「装」不是 server × 客户端笛卡尔积，每家有允许集合 | client-coverage | resolved | critical | `mcp-adapter.mjs:21-22`（pi 排除 shell/auth，原话「a shell MCP tool would bypass the AIOS Pi safety gate, and auth stays niche」）、`:13-15`（browser 需运行时已装） |
| landing-schema | 落点必须收成一张权威表 + 每 `(client,scope)` 字段白名单，否则不许标绿 | client-coverage | resolved | critical | 实测：`CLIENT_MCP_TARGETS.pi` = `format:'none', scopes:[]`，而真实文件 `~/.pi/agent/mcp.json` 存在（`mcpServers.<name>={command,args,lifecycle}`，三处写入者共用 `clientHomes.pi`）；zcode home 用 `transport`、project 用 `type`+`timeoutMs`；opencode 是 `{type:'local',command[],enabled,environment}` + `experimental.mcp_timeout`（`browser/mcp/formats/mcp-opencode.mjs:2,21-23,64`）；gemini home 用 `timeout`、claude 家族用 `startupTimeoutSec`。**先前所记 hermes `mcp_servers.mcp.<name>` 漂移已作废**：解析器复测真实即 `mcp_servers.<name>`，与 `codemap/targets/mcp-targets/yaml.mjs:31-34` 一致 |
| info-architecture | 一期页面集 = 统一对象表；每行三件事：能不能动 / 为什么 / 详情 | product-job | resolved | critical | 用户答复；现状 5 页按数据源切（`apps/shell/ui/src/lib/sections.ts:22,30,38,46,54`） |
| record-objects | 留痕类（会话/记忆/用量）不算配置对象，保留现有动作，一期不给新动词 | info-architecture | resolved | critical | 用户答复；实测会话 CLI 只有 `start/close/changed-files`（`scripts/lib/tooling/cli/parse-args/run/session.mjs:4`） |
| done-gate | 完工门 = 覆盖度门：10 落点全部可装卸，未验证者标 `landing-unverified` + 失败原文 | client-coverage,landing-schema | resolved | critical | 用户答复；0007 已有硬规则「未覆盖 ≠ 好，必须显式画出」 |
| confirm-ux | 危险动作沿用 preview→apply + confirm + 备份/回滚，不新造授权模型 | write-boundary | assumed | low | 现状即此形状：动作白名单 + `app/api/config/host-capabilities/route.ts:6-7`（「Backup before write… rollback is a file copy and not a reconstruction from memory」）与 `:156`（备份落 `.aios/config-backups/`） |
| later-entities | 技能/集成/agent 的管理不在一期，但对象表必须显示它们的状态与「为什么不能动」 | first-object,info-architecture | resolved | critical | 由 first-object 排序推出；非目标见下 |

### 已有同形形状（写入边界的依据，实测）

- `scripts/lib/clients/integrations/ledger.mjs:2-3`：注释原话「AIOS 只承认自己写过的条目（指纹一致），用户手改过的条目一律判为 conflict/external，绝不覆盖、绝不删除」，`:64` 出 `status:'owned'`。
- `scripts/lib/environment/aios-init/headroom-mcp/lifecycle.mjs:111` `removeOwnedHeadroomMcp`：条目被改过即 `conflict`，reason 原文 `entry-changed-after-aios-registration`（`:119`）；`:98-106` 探活不过就撤销并回报 `rolledBack`。
- `mcp-adapter.mjs:72-73`：pi 的策略原话——别人名字的条目永不碰，同名但用户改过的保留并报 `kept-differs`。

## 第一个可验证切片

**「一台机器上有哪些 MCP server、各自给了哪些客户端」变成可读+可动的对象表，并在 1 个落点上真装卸一次。**

切片自带验证方式（全部机器可判，不依赖客户端 CLI 是否存在）：

1. `aios mcp list --json` 新命令出账本视图：server × 落点 × 归属（aios|foreign|kept-differs）× 状态（verified|unverified|failed）。实测数据形状已存在——这台机器真实漂移图：`pencil` 在 claude/gemini/zcode 有、qoder/workbuddy/codex 无；`aios-memory` 在 codex/grok/workbuddy 有、`~/.claude.json` 无；`mcp-browser-use` 除 grok 外都有。
2. 装：dry-run diff → 用户确认 → 备份 → 写入（按该 scope 的字段白名单与格式归一化）→ 读回校验 → 行状态 `verified`。
3. 卸：条目消失 **且文件其余字节不变**（diff 证据），否则失败。
4. 界面：对象表新增 MCP 段，`/usage` 幽灵页与 `/matrix` 死链同时清掉（接线或删链，不留假入口）。

## 推演

### 正常路径（`walkthroughs.happyPath`）

打开控制台 → 统一对象表列出 7 个真实 server 与 10 个落点的格子 → 选 `aios-memory`「装到 claude 用户级」→ UI 只发 action id（白名单在 `app/api/actions/[id]/route.ts:52`，argv 固定、`shell:false`）→ 服务端 spawn `aios mcp add aios-memory --client claude --scope home --dry-run` → 界面显示 diff 与备份路径 → 确认后去掉 `--dry-run` 再跑 → 写入 `~/.claude.json` 的 `mcpServers` → 读回 + 字段白名单校验 → 行变绿；用户下次启动 claude 即读到。

逐步检查过下一步可用性：动作层（SSE 回显 + 退出码事件）、备份/回滚、格式 writer（json/toml/yaml/gemini-json/opencode-json/zcode 均有现存实现文件）都已在仓内，缺的是 CLI 动词与账本本身。

### 关键失败路径（`walkthroughs.failurePath`）

给 gemini 写条目时带上 `startupTimeoutSec`：gemini 的 `McpServerConfigSchema` 是严格的，未知字段让整个 `settings.json` 失效、客户端拒启（`definitions.mjs` gemini 段注释原话）。防线三层：① 该 scope 的字段白名单 + `gemini-json` 归一化（`browser/mcp/formats/mcp-gemini.mjs` 已存在，`startupTimeoutSec`→`timeout`）；② 写后读回校验失败即按指纹比对回滚到备份；③ 用户手写条目永不覆盖（`kept-differs`）。

第二条边界：hermes 在非 TTY 下 CLI 通路走不了——`lifecycle.mjs:55-57` 实测返回 `pending-interactive` 并打印要人手动跑的命令（卸载路径同形，`:113-115`）。所以「点了没成功但给出你能做的事」是合法终态，界面必须能显示它，不许假装绿。

## 可行性

`feasibility.status = supported`。证据（本轮实测，非引用旧文档）：

- 落点表在代码里且可枚举：`CLIENT_MCP_TARGETS` 10 家（node 实跑输出），格式 5 种。
- 配置真实存在且形状已知：8 个 home 落点文件 EXISTS（含 workbuddy `mcp.json`、qoder `settings.json`），键名/值类型已探（只读探测，未打印任何值）。
- 写入器零件已有两套独立实现：`browser/mcp/formats/`（gemini/hermes-yaml/opencode/toml/zcode）、`codemap/targets/mcp-targets/`（json/toml/yaml + `formats.mjs`），`yaml` 是正式依赖（`package.json:18`）。
- 生命周期形状有现成参照：headroom `ensure*/removeOwned*`（consent、dryRun、ledger、probe、pending-interactive 五件套）。

诚实标注一个未证事项（不阻塞，因为验收不依赖它）：各家客户端自己的 `mcp list` 是否可用作更强探活证据，未实测；一期验收用「读回 + 字段白名单 + 其余字节不变」判定，不引入未验证依赖。

## 验收标准

1. `aios mcp list/add/remove/enable/disable/adopt/doctor --json` 存在；`add/remove` 支持 `--dry-run` 并真实生效。反例已在仓内实测：`aios skill add --dry-run` 是空转标志——`parse-args/govern/skill.mjs:10` 声明、`:98` 解析进 options，而 `dispatch.mjs:151-162` 的 add 分支只传 `source/client/skill/force/yes/json`，`components/skills/external/install.mjs` 里 `dryRun` 出现 0 次，即它会真装。新命令不许复制这个缺陷。
2. 10 个声明落点逐一给出「装得上、卸得掉、卸后其余字节不变」的真机证据；拿不出的家显示 `landing-unverified` + 失败原文，界面不得标绿、不得编造原因。
3. pi 通过扩展载体（内置 `mcp` 扩展 / 钉版本 `pi-mcp-adapter@2.33.0`）达成同一对象动词，且在界面上标明它的载体与 `builtin/adapter` 判定结果；版本解析失败必须留在 `adapter`。
4. 每家的允许集合生效：pi 装 `aios-shell` / `aios-auth-tools` 必须被拒绝并给出理由原文。
5. 别人的条目默认只读并带归属标签；`adopt` 需要一次显式确认；写回带指纹，指纹不符拒绝。
6. 统一对象表每行必须有「能不能动 / 为什么 / 详情」三列；`pending-interactive` 与 `kept-differs` 是合法状态且有出口（给出手动命令）。
7. 留痕类（会话/记忆/用量）不新增写动词；`/usage` 幽灵页与 `/matrix` 死链在本切片内消除。

## 非目标

1. 一期不做技能/集成/agent&workflow 的管理动词（只显示状态与原因）。
2. 一期不做会话/记忆的新写操作，尤其不做 memo 硬删（清理归 dream/GC，属既有决定，要改需另开 ADR）。
3. 一期不做实时路由图 / 请求级网关（0007 二期）。
4. 一期不做插件 marketplace、签名/公证/自更新（0007 决策 5/9 的后段）。
5. 不新造第二套授权模型：沿用 preview→apply + confirm + 备份/回滚。
6. 不把「感知/收益证明面」当第一屏定位；接入矩阵降为「客户端」对象的一屏证据。

## readiness

```json
{
  "schemaVersion": 1,
  "kind": "rex.requirements-decision.v1",
  "decisionRef": "artifact:docs/plans/2026-11-05-console-agent-stack-control-plane.md",
  "acceptanceCriteria": [
    "aios mcp list/add/remove/enable/disable/adopt/doctor 存在，add/remove 的 --dry-run 真实生效",
    "10 个声明落点逐家有装/卸/卸后其余字节不变的真机证据，缺失者标 landing-unverified + 失败原文且不得标绿",
    "pi 经扩展载体达成同一动词，界面标明 builtin/adapter 判定，版本解析失败留在 adapter",
    "pi 装 aios-shell / aios-auth-tools 被拒绝并给出理由原文",
    "别人的条目默认只读带归属标签，adopt 需显式确认，写回带指纹且指纹不符拒绝",
    "统一对象表每行含能不能动/为什么/详情三列，pending-interactive 与 kept-differs 为合法状态且给手动出口",
    "留痕类不新增写动词；/usage 幽灵页与 /matrix 死链在本切片消除"
  ],
  "nonGoals": [
    "一期不给技能/集成/agent 管理动词，只显示状态与原因",
    "一期不给会话/记忆新写操作，尤其不做 memo 硬删",
    "一期不做实时路由图与请求级网关",
    "一期不做插件 marketplace 与签名/自更新",
    "不新造第二套授权模型",
    "不把收益证明面当第一屏定位"
  ],
  "firstSlice": {
    "outcome": "一台机器的 MCP 现实成为可读可动的对象表，并在真实落点上装与卸各一次",
    "verification": "aios mcp list --json 的账本与 8 个 home 配置实测一致；装后读回通过字段白名单校验，卸后文件其余字节 diff 为空"
  },
  "observations": [
    { "kind": "product.position-contested", "evidenceRefs": ["artifact:docs/adr/0007-aios-perceived-surface-and-desktop-shell.md#决策2", "artifact:docs/plans/2026-11-05-shell-s3-planned-actions.md"] },
    { "kind": "capability.gap-confirmed", "evidenceRefs": ["file:scripts/lib/tooling/cli/dispatch/dispatch.mjs#L77", "file:scripts/lib/clients/integrations/skill.mjs#L262"] },
    { "kind": "surface.drift-found", "evidenceRefs": ["file:apps/shell/ui/src/app/(console)/[section]/page.tsx#L17-L24", "file:apps/shell/ui/src/lib/sections.ts#L22-L54", "file:apps/shell/ui/src/components/sections/overview.tsx#L49"] },
    { "kind": "scope.declared-by-user", "evidenceRefs": ["intent:grill-2026-11-05-product-job", "intent:grill-2026-11-05-first-object", "intent:grill-2026-11-05-write-boundary", "intent:grill-2026-11-05-coverage-gate", "intent:grill-2026-11-05-object-table", "intent:grill-2026-11-05-record-objects"] }
  ],
  "readiness": {
    "status": "ready",
    "decisions": [
      { "id": "product-job", "dependsOn": [], "status": "resolved", "impact": "critical", "rationale": "用户拍板：控制台是这台机器 agent 栈的管理面；矩阵降为客户端对象的一屏证据", "evidenceRefs": ["intent:grill-2026-11-05-product-job"] },
      { "id": "first-object", "dependsOn": ["product-job"], "status": "resolved", "impact": "critical", "rationale": "MCP 是唯一命令面与界面双零的对象，且其收益在别的客户端里立刻可见", "evidenceRefs": ["file:scripts/lib/tooling/cli/dispatch/dispatch.mjs#L77"] },
      { "id": "write-boundary", "dependsOn": ["first-object"], "status": "resolved", "impact": "critical", "rationale": "只动自己拥有的，别人的需显式接管，写回带指纹拒绝冲突", "evidenceRefs": ["file:scripts/lib/environment/aios-init/headroom-mcp/lifecycle.mjs#L111-L119", "file:scripts/lib/tooling/components/integrations/pi/mcp-adapter.mjs#L72-L73"] },
      { "id": "client-coverage", "dependsOn": ["first-object", "write-boundary"], "status": "resolved", "impact": "critical", "rationale": "10 个声明落点全量可装卸；pi 走扩展载体而非配置文件表", "evidenceRefs": ["file:scripts/lib/tooling/components/integrations/pi/mcp-adapter.mjs#L2-L8", "file:scripts/lib/foundation/clients/selection/core/definitions.mjs#L266-L345"] },
      { "id": "per-client-allowlist", "dependsOn": ["client-coverage"], "status": "resolved", "impact": "critical", "rationale": "每家有允许集合，pi 排除 shell/auth 是既有安全决定，界面不得绕过", "evidenceRefs": ["file:scripts/lib/tooling/components/integrations/pi/mcp-adapter.mjs#L21-L22"] },
      { "id": "landing-schema", "dependsOn": ["client-coverage"], "status": "resolved", "impact": "critical", "rationale": "落点表不可盲信：pi 被登记成无落点而真实文件存在，zcode 两形状，opencode 第三形状，gemini/claude 字段名不同（hermes 的先前漂移结论已作废）", "evidenceRefs": ["file:scripts/lib/tooling/components/browser/mcp/formats/mcp-opencode.mjs#L21-L23", "probe:mcp-shape-probe-2026-11-05"] },
      { "id": "info-architecture", "dependsOn": ["product-job"], "status": "resolved", "impact": "critical", "rationale": "统一对象表取代按数据源切页；每行三件事：能不能动/为什么/详情", "evidenceRefs": ["file:apps/shell/ui/src/lib/sections.ts#L22-L54"] },
      { "id": "record-objects", "dependsOn": ["info-architecture"], "status": "resolved", "impact": "critical", "rationale": "留痕类保持显示加现有动作，一期不新造会话生命周期引擎", "evidenceRefs": ["file:scripts/lib/tooling/cli/parse-args/run/session.mjs#L4"] },
      { "id": "done-gate", "dependsOn": ["client-coverage", "landing-schema"], "status": "resolved", "impact": "critical", "rationale": "覆盖度门为完工判据，未验证落点标 landing-unverified 且不得标绿", "evidenceRefs": ["artifact:docs/adr/0007-aios-perceived-surface-and-desktop-shell.md#决策2"] },
      { "id": "later-entities", "dependsOn": ["first-object", "info-architecture"], "status": "assumed", "impact": "low", "rationale": "技能/集成管理排序到一期之外，默认由第一闭环只选 MCP 推出；界面必须显式标注它们为何不能动", "evidenceRefs": ["artifact:docs/plans/2026-11-05-console-agent-stack-control-plane.md#非目标"] },
      { "id": "confirm-ux", "dependsOn": ["write-boundary"], "status": "assumed", "impact": "low", "rationale": "沿用 preview→apply + confirm + 备份/回滚，不新造授权模型", "evidenceRefs": ["file:apps/shell/ui/src/app/api/config/host-capabilities/route.ts#L6-L7", "file:apps/shell/ui/src/app/api/config/host-capabilities/route.ts#L156"] }
    ],
    "walkthroughs": {
      "happyPath": ["artifact:docs/plans/2026-11-05-console-agent-stack-control-plane.md#正常路径"],
      "failurePath": ["artifact:docs/plans/2026-11-05-console-agent-stack-control-plane.md#关键失败路径"]
    },
    "feasibility": {
      "status": "supported",
      "evidenceRefs": ["file:scripts/lib/foundation/clients/selection/core/definitions.mjs#L266-L345", "file:scripts/lib/tooling/components/browser/mcp/formats/mcp-gemini.mjs", "file:scripts/lib/environment/aios-init/headroom-mcp/lifecycle.mjs#L98-L106", "probe:mcp-shape-probe-2026-11-05"]
    },
    "alignment": {
      "status": "confirmed",
      "evidenceRefs": ["intent:grill-2026-11-05-product-job", "intent:grill-2026-11-05-coverage-gate", "intent:grill-2026-11-05-object-table"]
    }
  }
}
```
