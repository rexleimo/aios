# 0012 — magpie 式插件生态架构（网关腰部集中加载）

- 状态： Proposed（用户已定方向，架构细节待评审）
- 日期：2026-11-19
- 关联：ADR 0007（插件契约 manifest 三 kind / 双轨注册表 / 进程隔离后置 S4）、ADR 0010（客户端就地接入网关）、`docs/reports/2026-11-19-plugin-system-three-way-comparison.md`
- 工作项：`plugin-system-architecture-spec-2026-11-19`
- 性质：架构设计记录（ADD）。记录决策/权衡/被拒选项/未决项，**不**是实施计划；实施另立 tickets。

> 工具链说明：本 ADR 由模型基于已查证事实产出。rex-harness 的 `--intent` 矩阵无 design 直达入口，`rex-design` Provider 未被 harness 激活，故**不**伪造 activation/evidence 信封；本文按 `rex-engineering-standards` §7 的 ADD 契约与 `rex-design` 的 decision/tradeoffs/rejected 结构书写。

## Context（为什么要这个决定）

用户裁定（2026-11-19）：
1. 要的是 **magpie 式插件系统**，不是"只读数据源占位"的保守折中；
2. 网关层虽为零插件系统，但**要留插件生态入口**；
3. 插件系统是软件**推广与未来迭代**的关键，不是可选项；
4. 要覆盖"app 整个软件体系 + 用户使用的客户端 agent 辅助"两层。

已查证事实（详见对标报告）：
- magpie 插件分 4 类，按延迟/权限分层：provider(Bun 子进程)、async hooks(Bun)、gateway middleware(网关进程内 moejs)、strategies+onUsage(网关进程内)。它靠"网关是所有 agent 的汇聚点"实现插件一次加载、全 agent 生效。
- ADR 0007 的插件契约是壳层 manifest 三 kind（client/integration/panel），进程隔离后置 S4；自发布轨必须等进程隔离。
- 我们已把所有 10 个客户端就地接入网关（ADR 0010），**网关腰部已存在**，具备"集中加载→贯穿全生态"的架构前提。

## Decision（accepted）

**采用"声明式 contributions 融入 app"作为总体形态(VS Code 式扩展,用户 2026-11-19 裁定):插件是一份 manifest,声明它"贡献什么";app 在既定扩展点启动时注入各注册表——插件是 app 逻辑的一等贡献者,不是请求链上的外挂 hook。** 网关 middleware 只是众多 contribution 类型之一,不再是架构中心。

### D0 — 融入式扩展点(core decision,覆盖 D1)

用户裁定:插件**不应该只是 hooks**,而要**融入整个 app 逻辑**。我们已有现成的注入点(实测):

| 扩展点 | app 里的注册表/机制(实测) | 插件贡献什么(contribution) |
|---|---|---|
| **panel(加一屏)** | `apps/shell/ui/src/lib/console-navigation.ts` 的 `CONSOLE_VIEWS`,导航遍历它渲染 | 注册一个新 view:href/label/title + 一个渲染组件 |
| **integration(skill/MCP/tools/env)** | `config/integrations.json` + `scripts/lib/clients/integrations/`(registry/ledger/install/skill/mcp/cli/doctor 全套) | 新增一条 integration 声明(env + skill + MCP/tools/resources) |
| **provider / 路由策略** | model-router 的 provider registry / routing 表 | 新增模型供应商、路由策略 |
| **action / 工具** | `apps/shell/ui/src/app/api/mcp/action-service.mjs` + presets | 新增动作/工具 |
| **gateway middleware/hooks** | 网关请求链(见下方 D1) | 改请求/响应、路由顺序、用量行 |

manifest 形如 `{ schemaVersion, id, version, permissions, lifecycle, evidence, contributes: { panels?, integrations?, providers?, actions?, middleware? } }`——与 ADR 0007 的 manifest 家族(schemaVersion/id/version/permissions/lifecycle/evidence)同构,新增 `contributes` 段承载"融入点"。这把 ADR 0007 的 client/integration/panel 三 kind 统一成一份 manifest 的多个 contribution。

**裁决理由**:这才是"整个软件体系都有插件系统"——插件能贡献 UI 一屏、工具、provider、路由,覆盖 app 每一层;外挂 hooks 只能改请求链,太窄。我们已有的 integrations 系统和导航表是数据驱动的,注入成本低,不用从零造扩展框架。

### D1 — contribution 的运行时分层(降级为"执行形态",非架构中心)

同一个 contribution,按其是否需要 I/O / 是否在高频请求面,选用不同运行时——这不改变"声明式融入"的本质:

| 执行形态 | 运行位置 | 适用 contribution | 隔离手段 | 延迟预算 |
|---|---|---|---|---|
| **进程内受限** | 网关进程内 | gateway middleware、strategies、onUsage | Node 原生 `vm`/`worker_threads`:禁 fetch/timer/Node API,clone + 失败回滚,fail-open | hook 250ms / event 50ms / strategy 20ms |
| **宿主进程** | 独立 Node 子进程 | async hooks、provider plugin(需联网 I/O) | 进程隔离 + stdio JSON-RPC | startup+RPC 有总上限 |
| **壳内声明式** | Next.js/Tauri 壳 | panel/integration/action/provider(manifest 数据,不执行外部代码) | manifest + 双轨注册表 + 显式确认 | 不适用 |

**裁决理由**:magpie 自身就是多运行时(它网关是 Go 用 moejs,provider 用 Bun),分层是按延迟/权限的工程事实,不是"统一 API"的对立面。但分层**服务于** contributions,不是架构目的——这是与上一版最大的区别。

### D2 — 贯穿机制：app 集中注册 + 网关腰部生效

两层贯穿:
- **app 层**:插件 manifest 集中在 app 的扩展点注册表(integrations/导航/action/provider),一次安装即在**整个 app**(所有面板/视图)生效——这是"融入整个软件体系"。
- **网关层**:网络类 contribution(provider/middleware)经网关腰部加载一次即对全部 10 个客户端生效(ADR 0010)——这是"贯穿所有 agent"。
推广杠杆:第三方写一份 manifest 声明 contributions = 给 app 新增一屏 + 一个工具 + 一个模型供应商,均不改核心代码。

### D3 — 安全底座（按执行形态分级，不一刀切）

- 声明式 contribution(panel/integration/action/provider manifest):**本身不执行外部代码**,沿用 ADR 0007 双轨注册表(官方轨 PR 审核 + pinned commit + sha256 + handshake;本地轨 `untrusted` + 显式确认)与现有 integrations 的 pinned commit/sha256 硬门。
- 进程内受限(middleware/strategies):靠"能力受限 + 超时 + fail-open + 反射令牌(账号用不透明 `ref` 代替 email/id)",**不需要进程隔离**。
- 宿主进程(hooks/provider 联网插件):不可信代码(npm/git 来源)**必须进程隔离**,对应 ADR 0007 §9;自发布轨仅在进程隔离就位后开放。

### D4 — 与四块 UI / 额度数据的关系

- 额度倒计时/上下文窗口上限的真实数据来源是宿主进程插件的 `auth.usage` 与进程内 `onUsage` 行；UI 先以"未记录"占位，等对应 contribution 落地后接入，**不为每个卡片写死数据源**。
- 四块 UI 对齐（见 `docs/plans/2026-11-19-magpie-console-four-panels.md`）与本架构**解耦**，可并行推进，不互相阻塞。

### D5 — 唯一空白层（新设计，未决）

"客户端 agent 内部再加载第三方插件"（agent 里的 AIOS 助手加载插件）magpie 与 ADR 0007 都未覆盖。不在本次决策内，列为 open question（见 Open Questions），需单独设计。

### D6 — 已落地的三个细化决策（2026-11-19，用户拍板）

- **进程内受限运行时载体 = Node 原生 `vm`/`worker_threads`，不是新阻塞项**。Hono（网关 Web 路由层）、宿主/视图层与"插件代码用什么沙箱跑"（网关执行层）是三个正交层，互不影响。网关本在 Node 上，进程内受限形态的"能力受限 + 超时 + clone 回滚"用 Node 自带能力即可实现，零新依赖。magpie 用 moejs 是因其网关为 Go 且追求极致低延迟；照搬到 Node/Hono 网关属错误对齐，明确否决。
  - 宿主/视图层**现状澄清（实测 2026-11-19）**：`apps/shell/ui/` 是 Next.js 16.4.5 + React 19.3.1 控制台，**真实在跑**（截图界面即它）；`apps/shell/src-tauri/` 有 Tauri 2.12.5 Rust 源码（sidecar / 进程回收已实现），但 `tauri.conf.json` 的 `app.windows: []` 且 bundle 仅 `nsis`，即**壳代码在、未配窗口、未打成带窗口桌面 app**。ADR 0007 的 S1+S2 是目标非现状。无论如何，宿主层与网关插件执行层正交，不影响 D6 结论。
- **插件注册表 = magpie 式 `plugins.json`**，作为"装了哪些插件 / 启用 / 顺序 / 开关"的单一事实源。它与 ADR 0007 的 integrations 注册表**分工明确、不合并**:`plugins.json` 管插件生命周期;插件 manifest 里的 `contributes.integrations` 声明的集成,安装时**投影**进现有 `config/integrations.json`(复用其 pinned commit/sha256 硬门),而非另起一套集成实现。即"插件是安装单元,integrations 是运行时事实源"。
- **目录预算超限 = 重组抽象解决，不走豁免/baseline**。`scripts/lib/tooling/model-router/` 现 9 项 > 8，通过把 `tui.mjs` 归入 `tui/` 或按职责重划解决，再由 `aios standards check` 确认。

## Trade-offs（主要权衡）

1. **声明式融入 vs 外挂 hooks**：放弃"插件只是请求链 hook"的简单模型，换来插件作为一等公民能贡献 UI/工具/provider/路由,覆盖整个 app。代价是要维护多个扩展点的注入契约;收益是真正可扩展、可推广的软件体系。
2. **多执行形态 vs 统一运行时**：contribution 按其 I/O/延迟需求选运行时。代价是插件作者要分清声明式/进程内/宿主进程;收益是高频面快、联网面隔离。
3. **进程内受限的信任前提**：middleware 等高频 contribution 在网关进程内跑,非硬隔离。接受残余风险换低延迟;靠"能力受限 + 超时 + fail-open + 可信来源"缓解,不可信来源一律走宿主进程。
4. **复用现有注册表 vs 另起炉灶**：contributions 注入现有 integrations/导航/action 注册表,而非新建平行系统。代价是注入逻辑要适配既有结构;收益是不重复造轮子、行为与原系统一致。
5. **分阶段**:先做最省、最能形成生态入口的声明式 contribution(panel/integration),再做进程内 middleware,最后做需进程隔离的宿主进程插件——避免一开始背负签名公证(ADR 0007 S4 付费前置)。

## Rejected options（被拒选项）

- **R0 外挂 hooks 当架构中心（我最早的方案）**：用户明确否决——"插件不应该是 hooks,要融入 app 逻辑"。外挂 hooks 只能改请求链,覆盖不了 UI/工具/provider,不是"整个软件体系都有插件系统"。现降级为众多 contribution 类型之一。
- **R1 只读数据源接口**：用户否决——要真插件生态,不是为三个卡片服务的只读占位。
- **R2 完整平台先行（manifest + 进程隔离 + 注册表一次做完）**：范围过大,S4 需 Apple Developer Program / Windows 签名证书(付费预算决策),周期长,拖住"推广"目标。
- **R3 纯 magpie 复刻 4 类到网关**：会与 ADR 0007 的 manifest 体系形成两套并行插件概念,归属冲突。
- **R4 一刀切统一 API（所有插件同一运行时）**：要么高频 middleware 承受进程隔离延迟,要么 provider 插件获得进程内权限——两头都不满足。magpie 自己也没这么做。

## Open Questions（未决，需后续拍板）

1. **空白层设计**：「客户端 agent 内加载插件」的确切边界——是"AIOS 作为 agent 插件"（ADR 0010 已部分实现）还是"agent 里的 AIOS 助手再加载第三方插件"（全新）？后者需安全模型与生命周期设计。
2. **进程隔离前置门**：宿主进程插件的进程隔离是否作为"开放 npm/git 自发布轨"的硬前置（ADR 0007 §9 已倾向是）？

（原"运行时载体选型"与"注册表单一事实源"两项已由 D6 决定，从 Open Questions 移除。）

## 实施状态（2026-11-19，P0–P3 落地 + 架构返工完成）

用户审查指出实现不满足软件工程架构，遂按 `docs/plans/2026-11-19-plugin-architecture-refactor.md` 彻底返工。**返工后布局**（依赖方向正确、单一事实源、目录全 ≤8）：

```
scripts/lib/clients/plugins/
  core/     manifest.mjs / registry.mjs / contributions.mjs / dispatch.mjs / ports.mjs
  adapters/ panel.mjs / integration.mjs / provider.mjs / client.mjs / apply.mjs / assemble.mjs
  runtime/  runtime.mjs / middleware-chain.mjs / provider-host.mjs / provider-host-entry.mjs / usage.mjs
  loader.mjs / builtin-provider.mjs / cli.mjs
```

| 贡献类型 | 状态 | 证据 |
|---|---|---|
| manifest 校验 / plugins.json | 单一事实源 | `core/manifest.mjs` 唯一校验点；`core/registry.mjs` 读写；UI 只读服务端生成的 `.aios/gateway/plugin-views.json`，不重复解析 |
| `panels` | 端到端 | core `projectPanelContributions` → adapter 写 views 文件 → UI 消费；`/hello-plugin` 可点开 |
| `integrations` | **真写盘** | adapter 复用 `normalizeIntegrationEntry` 硬门，原子写 `config/integrations.json`；来源存独立 sidecar（无 `__origin` 污染）；卸载按来源精确清理、保留手工条目。实测 hello-docs 写入/清理 |
| `middleware` | 网关可选注入 | Node vm 受限运行时；`proxy.mjs` 注入点；CLI 边界动态装配（`entry/command.mjs` 通过 DI，网关 core 不 import clients）；fail-open |
| `providers` | **从插件加载** | 插件 `contributes.providers` 声明脚本 → core dispatch → adapter 子进程 RPC 读真实 registry；实测 hello-plugin 读到 36 模型（替换硬编码） |
| `clients` | 归一化分派 | `adapters/client.mjs`；复用 connect(ADR 0010) |
| `onUsage` | **真调用** | `proxy.mjs` requestDecision 结束时真调 `onPluginUsage`（fail-open）；`runtime/usage.mjs` 聚合，无数据显示 0 |

测试（返工后全量）：插件 **39/39**；integration 22/22、routing 11/11、gateway lifecycle 15/15、intent 11/11；UI typecheck + build 干净；网关带插件启动 health 200；standards check 无 violation；目录全 ≤8；无 `as ViewId` 断言、无领域对象污染。

已知诚实边界：`scripts/tests/tooling/shell/interface/gateway-control-api.test.mjs` 有 1 项 baseline 失败（断言期望 3 客户端闭合集，实际代码早已是 10 客户端，与本工作无关）。额度/登录状态无账本时诚实返回"未记录"，不编造。

## Evidence refs（真实来源）

- magpie 插件 4 类与分层、反射令牌、超时/fail-open、moejs/Bun 运行时：`http://usemagpie.ai/docs/plugins`、`docs/subsystems/gateway-middleware.md`、`docs/subsystems/gateway-request-hooks.md`（2026-11-19 抓取，全文见对标报告）
- ADR 0007 插件契约三 kind / 双轨注册表 / 进程隔离后置 S4：`docs/adr/0007-aios-perceived-surface-and-desktop-shell.md` §7 / §9 / 后果
- 我们网关零插件系统、路由仅 ordered：`scripts/lib/tooling/model-router/` 实测无 plugin/middleware/hook；`routing/groups.mjs:46-47`
- 网关腰部已存在（10 客户端就地接入）：`docs/adr/0010-magpie-inplace-client-connect.md`；`apps/shell/ui/src/components/console/model-routing/gateway-control.tsx`
- auto+意图可用（意图目标须具体模型）：`scripts/lib/tooling/model-router/gateway/router.mjs:104`、`scripts/tests/learning/model/gateway/protocol/runtime/routing.test.mjs`、`~/.aios/gateway/decisions.jsonl` 真实记录
- 质量基线：`rex-engineering-standards` §1 边界 / §4 文件粒度 / §7 ADD 契约

## 2026-11-24 增补：独立插件 UI 页

用户确认第一版只做独立插件页。`panel` 新增可选 `ui.entry`，由宿主读取单文件 HTML 并用 sandboxed iframe 渲染；具体安全边界与权衡见 ADR 0013。该增补不改变 D0 的声明式 contribution 方向，也不把现有页面注入或主题编辑器纳入范围。
