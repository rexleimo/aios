# 阶段 0 测量：首屏取数的真实数字（2026-11-07）

> 工作项：`product-landing-real-data`。本文是 `2026-11-07-product-landing-roadmap.md` 第 6 节「阶段 0 测量」
> 的产出：一张可对比的 before 数字表。**只测量，未改任何生产代码。**
> 所有数字为本机实测（Windows / Node v24.16.0 / 仓库 `E:/coding/harness-cli`），命令附在每条之后。

## 0. 结论：路线图第 3 节的因果链被推翻了

路线图写的因果链是「取数慢（9.3s）→ 首屏填不满 → 示例数据顶上」。实测后这条不成立：

| 路线图的断言 | 实测 |
|---|---|
| 真实取数 9.3 秒 | `aios status --json` 现在 **2.73–2.83s**（3 次）；9.3s 是 `apps/shell/README.md` 2026-11-05 的旧数字，去重优化已经落地 |
| 首屏之所以是示例，因为真实取数太慢 | 首屏**根本没有取数**：`apps/shell/ui/src/components/console/**` 里 `fetch(`/api/...)` 命中 0 处，`page.tsx` 是纯客户端组件，直接 import `demo-data` |
| 要先压 9.3s 才能去掉示例 | 首屏需要的真实数据**已经在 300ms 内**：`/api/mcp` 282ms、`/api/config/host-capabilities` 14ms、`/api/sessions` 17ms |
| `aios status` 是首屏的取数路径 | 首屏不需要 `aios status`：它 64% 的时间花在 agent/workflow 证据审计（扫 29 MB telemetry JSONL），这些信息首屏不展示 |

**所以 P0-1「先提速」不是 P0-2「杀示例」的前置条件**，路线附录里「P0-1 与 P0-2 有依赖，不能并行」这一条需要改。
真正缺的那一段（README 自己在第 5 行承认的「尚未接到新界面」）不是速度，是**接线**：`grep` 证明没有任何组件调用这些路由。

## 1. `aios status --json` 的耗时构成（P0-1 的证据）

命令：`node scripts/aios.mjs status --json`，连跑 3 次。

| 指标 | 值 |
|---|---|
| wall | 2738 / 2833 / 2726 ms |
| exit code | **1**（`overallStatus: blocked`；README 已记：blocked 时退出码是 1，不是崩溃） |
| payload | 5056 bytes，`kind: aios.status.v1` |
| Node 进程自身启动 | 36 ms（可忽略，说明 2.7s 是真活） |

CPU profile（`inspector Profiler`，1631 样本 / 2491 ms，脚本见本文末「复现」）：

| self | 占比 | 函数 | 位置 |
|---|---|---|---|
| 1159 ms | **47%** | `readMetricsRecordsUncached` | `scripts/lib/foundation/agents/catalogue.mjs:115` |
| 415 ms | **17%** | `hasBidirectionalMetrics` | `scripts/lib/foundation/clients/reporting/capability-report/evidence.mjs:133` |
| 170 ms | 7% | GC | — |
| 150 ms | 6% | `string_decoder write` | 子进程 stdout 解码 |
| 52 ms | 2% | 正则 `\r?\n` | 同一个 split |
| 44 ms | 2% | `stat` | — |
| 12 ms | 0.5% | `findCommandInPath` | `capability-report/shim.mjs:66`（客户端是否安装——首屏真正需要的部分） |

**64% 的时间在做同一件事：把 `.aios/interception/metrics/` 整份读进内存再逐行 `JSON.parse`，
只为判断「某个 agent / 某个客户端有没有双向 metrics 证据」。**

目录实测（`du -sh` / `ls | wc -l`）：

| 事实 | 值 |
|---|---|
| `.aios/interception/metrics` 体积 | **29 MB** |
| 文件数 | **549** |
| 最大三个 | `phase.implement.jsonl` 6.1 MB、`default.jsonl` 4.7 MB、`groupchat.jsonl` 4.4 MB |

两个函数读的是同一批文件（`hasBidirectionalMetrics` 每个客户端再读一遍）。
首屏不展示 agent 证据审计，所以首屏**不需要**为这 64% 付钱。

## 2. 首屏可用的真实数据源（P0-2 的证据）

起真实生产服务（`node scripts/aios-ui.mjs start --port 3199`），走 token 换 cookie，实测：

| 路由 | 冷 | 热 | 状态 | 内容 |
|---|---|---|---|---|
| `GET /`（首屏 HTML） | 26 ms | 5 ms | 200，60 KB | **全是示例**：无 fetch |
| `GET /api/mcp` | **282 ms** | 262 ms | 200，45 KB | 真实：79 个 MCP 服务、18 个落点 |
| `GET /api/memory` | **289 ms** | — | 200，12 KB | 真实：pinned + search |
| `GET /api/config/host-capabilities` | **14 ms** | — | 200，3.2 KB | 真实：13 个客户端声明 |
| `GET /api/sessions` | 17 ms | — | 200，6.7 KB | 真实 |
| `GET /api/manage?resource=skills` | 38 ms | — | **404** | 见第 4 节 |

直接 CLI 对照（不含 HTTP/Next 开销）：

| 命令 | wall |
|---|---|
| `node scripts/aios.mjs mcp list --json` | 284 ms（48 KB） |
| `node scripts/aios.mjs integration list --json` | 235 ms |
| `node scripts/aios.mjs agents list --json` | **1966 ms**（同一个证据瓶颈） |
| `loadMcpList()`（in-process，走 `apps/shell/ui/src/lib/data/mcp.mjs`） | 264 ms |

**判定：路线图 P0-1 的验收线「首屏出现至少一条真实数据 ≤ 2s」用现成路由已经满足**（14ms / 282ms）。
不需要先做分级采集才能去示例；分级采集仍然值得做，但它的理由变了——
不是为了压 9.3s（那个数字已经不存在），而是为了让首屏**不依赖** `aios status` 这个 2.7s 的证据审计工具。

## 3. 覆盖度事实（P1-1 / P1-2 的证据）

| 事实 | 值 | 来源 |
|---|---|---|
| `config/host-capabilities.json` 声明客户端 | **13**：claude, codex, gemini, opencode, hermes, grok, workbuddy, pi, cursor, aios-harness, generic-mcp, zcode, qoder | 读文件 |
| `scripts/lib/foundation/clients/registry.mjs` 注册 | **10**：codex, claude, gemini, opencode, hermes, grok, workbuddy, pi, zcode, qoder | `ALL_CLIENTS` |
| 差集（声明了但注册表没有） | cursor, aios-harness, generic-mcp | 两者相减 |

⇒ 路线图第 2 节问题 6 的「13 声明 / 10 覆盖」实测成立，`not-covered` 来自这 3 个差集成员。

## 4. 测量顺带发现的两个缺陷（真实 bug，不是推断）

1. **生产产物是陈旧的**：`.next/BUILD_ID` 构建于 `2026-11-06T05:40Z`，而
   `ui/src/lib/data/management.mjs` 改于 `2026-11-06T07:35Z`。因此发布出去的包里
   `/api/manage?resource=skills` 返回 **404**（Next 的 404 页），技能管理整条能力在产物里不存在。
   这条与 P0-3 直接相关：**打包流程必须包含一次强制重建，否则「自带已构建界面」自带的是旧界面。**
2. **`GET /api/manage` 无参时不报 400 而是 404**：路由里 `resource` 默认 `'skills'`，
   但产物没这段代码——与第 1 点同因，不是独立的逻辑错误。修复产物后需复测这条是否变成预期的 400/200。

## 5. 没有测到的（如实记录，不拿空数据冒充干净）

| 项 | 状态 | 原因 |
|---|---|---|
| 干净 Windows 虚拟机（无 Node / 无 git / 无 AIOS 树）安装成功率 | **未测** | 本机不是干净环境；建 VM + 装包是系统级副作用，需所有者授权（路线图第 8 节决策 2） |
| 「冷启动到首条真实数据」在**干净机器**上的秒数 | **未测** | 同上；本机测出来的是第 2 节的表 |
| 签名后 SmartScreen 行为 | **未测** | 没有证书，安装包未签名 |
| 5-10 人用户验证（T1–T4） | **未开始** | 阶段 1 产物还不存在 |

## 6. 对实施顺序的影响（需要所有者确认的一处）

路线图附录写「P0-1 与 P0-2 有依赖，先提速才能去示例」。测量后建议：

- **合并 P0-1 与 P0-2 为一条**：首屏直接接线到已有的 14ms / 282ms 路由，并把 `aios status` 逐出首屏关键路径
  （首屏不显示 agent 证据审计，就不该为它付 1.6s）。提速由此自然达成，不需要单独先做一轮。
- **P0-1 剩余的真实工作**改为一件独立小事：把 29 MB telemetry 的证据审计做成增量/上限读取，
  让 `aios status` 与 `aios agents list` 本身变快。它影响 CLI，不影响首屏，优先级可以低于接线。
- **P0-3 增加一条硬要求**：打包前强制重建 UI 产物（第 4 节实测的 404 就是这个洞）。
- P0-4（写操作）与用户验证不变，仍需第 8 节决策 4 的授权才开工。

## 6b. 实施记录（同一天，按选项 A 合并 P0-1 + P0-2）

已落地（P0-2a：首屏 + 外壳 + 工具/活动/设置）：

| 件 | 作用 |
|---|---|
| `ui/src/lib/data/console-facts.mjs` | 首屏事实的唯一装配点：6 路并行采集，每项自报耗时与成败，`sources[]` 给每个数字标出处，**不调用 `aios status`** |
| `ui/src/lib/data/memo-store.mjs` | memo 的结构化只读（`memo search` 无 JSON 输出，所以直读 `events.jsonl`） |
| `ui/src/lib/console-facts.ts` | 无 IO 的类型 + clientId 显示名 + 落点 token 解释（P1-1 的地基） |
| `app/(console)/page.tsx`、`[section]/page.tsx` | 服务端组件：`await collectConsoleFacts()`，`dynamic='force-dynamic'` |
| `home-workspace.tsx` / `console-workspace.tsx` | 只接真实事实；全局示例横幅换成采集新鲜度 + 降级项；未接线面板逐个标注；面板懒挂载 |

验收实测（生产 `next start`，同一次会话）：

| 路由 | 延迟 | 真实标记 | 残留假标记 |
|---|---|---|---|
| `/` | 364 / 307 / 308 / 299 ms | ✅ 10 个客户端落点、79 个服务、真实 `.claude.json` 路径 | 无 |
| `/tools` `/activity` `/settings` | 303 / 297 / 296 ms | ✅ | 无 |
| `/mcp` | 301 ms | 页头明标「此面板尚未接入真实数据」 | 无 |

⇒ P0-1 验收线「首屏出现至少一条真实数据 ≤ 2s」**达成**（最慢一次 364ms，其中采集 273ms）。
「刷新后数据不变」成立：四次加载字节数 474827/474827/474825/474825，内容同源。

尚未完成（P0-2b）：`mcp-workspace.tsx`、`memory-workspace.tsx`、`flows/memory-detail.tsx`、
`flows/mcp-wizard.tsx` 仍在用 `demo-data.ts`，所以 `demo-data.ts` 没删。

**一条需要改写的验收标准**：路线图 P0-2 写「`grep -r "demo-data\|示例\|模拟测试" apps/shell/ui/src` 为零」。
首屏接上真实记忆后这条不可能成立：用户自己的 memo 正文里就带「示例」二字（实测首屏 HTML 里
剩下 4 处「示例」，1 处是界面文案「不写示例」，3 处是真实记忆内容）。建议改成可判定的形式：
`grep -r "from '.*demo-data'" apps/shell/ui/src` 为零，加一条「不得存在无 `sources[]` 出处的数字」的门。

## 复现

测量脚本是临时的，建在 `%TEMP%/aios-probe-*` 下，跑完即弃，未进仓库。三条核心命令：

```sh
# 1. status 总耗时
node -e "…execFileSync(process.execPath,['scripts/aios.mjs','status','--json'])…计时"

# 2. 函数级耗时（同进程，先 import 再分别调用）
#    见本文第 1 节的 CPU profile 表；用 node:inspector Profiler 聚合 self time

# 3. 端到端 HTTP 延迟
AIOS_UI_PORT=3199 node scripts/aios-ui.mjs start --port 3199
#    token 在 <tmp>/aios-ui-token-3199；GET /t/<token>（无尾斜杠）换 cookie 后逐路由计时
```
