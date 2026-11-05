# ADR 0008：控制台是本机 agent 栈的管理面；MCP 成为第一个一等对象；信息架构改为统一对象表

日期：2026-11-05
状态：已确认（用户 /grill 六轮拍板：定位、第一闭环、写入边界、覆盖度、页面结构、留痕类）
需求记录：`docs/plans/2026-11-05-console-agent-stack-control-plane.md`（含 readiness=ready 的 `rex.requirements-decision.v1`；不放 `docs/requirements/`，因为 `docs` 的目录预算实测 8/8 顶格，新增子目录即违规）
取代：`docs/adr/0007` **决策 2**（第一屏=只读接入矩阵）。0007 决策 1、3–9 与二期网关不动。

## 背景

用户实测后的三句抱怨，逐条在代码里都有对应事实，不是情绪：

| 抱怨 | 实测事实 |
|---|---|
| 「MCP 管理不了」 | 通用命令面不存在：`scripts/lib/tooling/cli/dispatch/dispatch.mjs` 无 `mcp` 分支（只有 :77 一个 `--yes-headroom-mcp` 选项）；写 MCP 的只有四个特性私有路径（headroom / browser / code-review-graph / pi）；UI 零页面、零 API、零 action id |
| 「skill 管理不了」 | `aios skill remove` 不存在，全仓只有 `removeSkillFromCatalog`（`scripts/lib/clients/integrations/skill.mjs:262`，删集成时顺带清目录）；`SkillsSection`（技能健康）写了但没挂载；`skill.health` 在动作白名单里没有按钮挂它 |
| 「会话、记录乱七八糟」 | 5 页按数据源切而非按对象切；`PAGES` 挂了 6 个组件但注册表只有 5 个 id → `/usage` 永远 404（`app/(console)/[section]/page.tsx:17-24,41-42` vs `lib/sections.ts:22-54`）；`overview.tsx:49` 链向 `/matrix` 同样 404；另有三个写了没挂的组件（技能健康/团队/集成） |

0007 决策 2 定的第一屏是**只读状态板**，其自身计划在 `docs/plans/2026-11-05-shell-s3-planned-actions.md` 里已被写成「它不是产品」。缺的不是界面美观，是产品没有约定过「替谁完成哪件事」。

## 决策

1. **控制台 = 这台机器 agent 栈的管理面**。对象是配置（客户端 / MCP / 技能 / 集成 / agent），不是成绩单。0007 的接入矩阵降级为「客户端」这一对象的证据屏，不再是第一屏定位。

2. **第一闭环 = MCP server 成为一等对象**。今天它的现实是一张无人负责的脏图（实测 home 侧 7 个 server × 7 个客户端：`aios-memory` 在 codex/grok/workbuddy 有而 `~/.claude.json` 无；`pencil` 在 claude/gemini/zcode 有而 codex/qoder/workbuddy 无；`mcp-browser-use` 除 grok 外都有）。选它的理由不是它最急，而是它同时满足三条：命令面与界面双零（缺口确定）、收益在别的客户端里立刻可见（回答「做出来等于没做」）、写入零件已在仓内成套（可行性有据）。

3. **写入边界 = 只动自己拥有的，别人的需显式接管**。同形状在仓内已有三处成立：`integrations/ledger.mjs:2-3`（注释原话「AIOS 只承认自己写过的条目（指纹一致），用户手改过的条目一律判为 conflict/external，绝不覆盖、绝不删除」，`status:'owned'` 判定在 :64）、`headroom-mcp/lifecycle.mjs:111` 的 `removeOwnedHeadroomMcp`（条目被改过即 `conflict`，reason 原文 `entry-changed-after-aios-registration` :119；探活失败即撤销并回报 `rolledBack` :98-106）、`integrations/pi/mcp-adapter.mjs:72-73`（别人名字永不碰，同名被改过则保留并报 `kept-differs`）。写回一律带指纹，指纹不符拒绝。

4. **覆盖度 = `CLIENT_MCP_TARGETS`（`definitions.mjs:266`）全部 10 个落点可装卸**，未通过真机验证的落点显示 `landing-unverified` + 失败原文，**不得标绿、不得编造原因**（继承 0007 的「未覆盖 ≠ 好」）。pi 不靠配置文件表达成：它的 MCP 由扩展载体提供（内置 `mcp` 扩展 ≥0.99.0，门槛常量 `PI_BUILTIN_MCP_SINCE` `mcp-adapter.mjs:33`；或钉版本 `pi-mcp-adapter@2.33.0`，:30；`resolvePiMcpMode()` :56 在版本解析失败时**留在 adapter**，注释原话「assuming 'builtin' from a parse failure would silently leave old pi without MCP」），界面必须显示判定结果。**补充（同一轮复测）**：pi 并非只有扩展载体——它另有真实文件落点 `~/.pi/agent/mcp.json`（形状 `mcpServers.<name> = {command,args,lifecycle}`，实测存在，三处写入者共用 `clientHomes.pi`），所以权威表必须把 pi 从 `format:'none'` 改判为有落点，并把「条目逐字节一致」列为写入门（否则 pi doctor 永久报 `kept-differs`）。

5. **「装」不是 server × 客户端的笛卡尔积**：每家有自己的允许集合，且继承代码里已成立的安全决定——pi 明确排除 shell 与 auth（`mcp-adapter.mjs:21-22`：原话「a shell MCP tool would bypass the AIOS Pi safety gate, and auth stays niche」），browser server 只在运行时已装时才加入（`:13-15`）。控制台若能让用户绕过这些集合，就是把安全门做成了装饰。

6. **落点必须收成一张权威表，并给每 `(client, scope)` 一份字段白名单**。今天同一个事实有三份表：`CLIENT_MCP_TARGETS`（`definitions.mjs:266`，10 家）、codemap 自己的 `CODEMAP_MCP_TARGETS`（`codemap/targets/mcp-targets/targets.mjs:9-116`，另立一套 clientKey + format + resolvePath）、以及 browser 的五个 `migrateOne*` 格式 writer。实测漂移与约束：

   - **pi 在权威表里被登记成「没有面」**（`CLIENT_MCP_TARGETS.pi` = `format:'none'`, `scopes:[]`），而真实文件 `~/.pi/agent/mcp.json` 存在且形状为 `mcpServers.<name> = {command, args, lifecycle}`，三处写入者都取同一个 `clientHomes.pi`（`browser/lifecycle/install.mjs:158`、`targets.mjs:88`、`pi/doctor.mjs:41`）。所以缺的是登记，不是能力。
   - **pi 的条目必须与它自己的写入器逐字节一致**：`entries.mjs:14-19` 定 `lifecycle:'lazy'`，注释写明 pi 的 doctor 用 `JSON.stringify` 精确比对，形状不一致就**永久报 `kept-differs`**（`targets.mjs:79-86` 原话）。这条直接约束 w2 的写入形状。
   - **zcode 同一 client 两种形状**：用户级条目用 `transport`，项目级用 `type` + `timeoutMs`（两份真实配置实测）。
   - **opencode 是第三种形状** `{type:'local', command:[...], enabled, environment}` 且要求 `experimental.mcp_timeout` 为数值（`browser/mcp/formats/mcp-opencode.mjs:2,21-23,64`）；实测两个 `opencode.json` 里连 `mcp` 键都不存在，即今天从未被写过。
   - **gemini 字段名不同**：用户级条目用 `timeout`，claude 家族用 `startupTimeoutSec`（实测）。失败模式最狠——未知字段让整个 `settings.json` 判废、客户端拒启（`definitions.mjs` gemini 段注释），所以白名单 + 归一化（`mcp-gemini.mjs`）是写入的前置而非事后修。
   - **更正（先前写错）**：hermes 不存在路径漂移。真实结构是 `mcp_servers.<name>`（实测 keys=`mcp-browser-use`/`aios-auth-tools`/`aios-shell`），与 codemap 写入器 `mcp-targets/yaml.mjs:31-34` 的形状一致。先前本节记成 `mcp_servers.mcp.<name>`，来源是一个缩进猜错的自写行扫描脚本——已作废。

7. **信息架构 = 统一对象表**。每行固定三件事：能不能动（可操作 / 只读 / 未接线 / 待人工）+ 为什么（原文，不编）+ 详情。留痕类（会话/记忆/用量）不是配置对象：保留现有动作（会话导出与扔回收站、记忆标有用与取代），一期不给新写动词——会话的 CLI 今天只有 `start/close/changed-files`（`parse-args/run/session.mjs:4`），同期再造一套会话生命周期引擎等于两条主线。

8. **`pending-interactive` 与 `kept-differs` 是合法终态**。headroom 对 hermes 非 TTY 场景的既有行为是返回 `pending-interactive` 并打印要人手动跑的命令（安装路径 `lifecycle.mjs:55-57`，卸载路径 `:113-115`）。管理面必须能显示「这一步归你」，而不是把没做成伪装成做完了。

## 后果

- **新增引擎工作量在 CLI 不在 UI**：要造 `aios mcp list/add/remove/enable/disable/adopt/doctor`（实测今天一个都没有），并把四个特性私有写入器（headroom / browser / code-review-graph / pi）收编到同一账本。UI 只是把动词接成对象表。
- **不许复制已知缺陷**：`aios skill add --dry-run` 实测是空转标志——`parse-args/govern/skill.mjs:10` 声明、`:98` 解析进 options，`dispatch.mjs:151-162` 的 add 分支只传 `source/client/skill/force/yes/json`，`components/skills/external/install.mjs` 里 `dryRun` 出现 **0 次**，所以它会真装。新 `mcp add/remove` 的 `--dry-run` 必须真实生效并进验收；这条既有缺陷另案修，不混进本切片。
- **一期一并清掉的既有问题**：`/usage` 幽灵页、`/matrix` 死链、三个未挂载组件——它们属于「假入口」，留着就等于承认界面与代码不一致可以长期存在。
- **一期明确不做**：技能/集成/agent 的管理动词（只显示状态与原因）、会话与记忆的新写操作（尤其 memo 硬删——清理归 dream/GC，要改需另开 ADR）、实时路由图与请求级网关（0007 二期）、marketplace 与签名/自更新。
- **CONTEXT.md 随之更新**：`感知面`、`接入矩阵` 两条的定义改写，新增 `统一对象表`、`MCP server 一等对象`、`落点可证性`、`接管（adopt）`、`每客户端允许集合`、`留痕 vs 配置对象` 六条术语。

## 风险与边界

- 写别人的配置文件是本产品最大的副作用面：gemini/codex 类严格 schema 写坏即客户端不可用。三层防线：字段白名单 + 写后读回校验 + 指纹回滚；备份沿用 `.aios/config-backups/`（`apps/shell/ui/src/app/api/config/host-capabilities/route.ts:156`，其 :6-7 写着规则原话「Backup before write… a rollback is a file copy and not a reconstruction from memory」）。
- 项目级落点（`.mcp.json`、`.qoder/settings.json`、`.zcode/config.json`、`.grok/config.toml`、`.codex/config.toml`）是 **git 追踪的仓库内容**，写它们和写主目录性质不同；对象表必须按 scope 分列显示，不得合并成一个「已装」。
- 覆盖度门按用户拍板保留 10 家。诚实预告：**opencode 今天从未被写过**（两个 `opencode.json` 里连 `mcp` 键都不存在），qoder / workbuddy / zcode 虽有真实条目（3/5/5 条），但形状只经 browser 迁移路径验证过；zcode 的双形状与 opencode 的第三种形状要靠 w1/w2 逐家实测才成立。验证不过的家停在 `landing-unverified`，这是设计行为，不是完成。
