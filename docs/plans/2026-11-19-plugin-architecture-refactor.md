# 2026-11-19 — 插件系统架构返工 spec

- 状态：**完成**（用户裁定"按架构原则彻底返工"；全量验证通过）
- 追加规范重构（2026-11-20）：用户指出项目禁用 try-catch、if-else 多要用 pattern matching。引入 `ts-pattern`（根包 + UI 包），建 `core/result.mjs`（Result 类型 + 唯一集中异常捕获点 `attempt`/`readJson`），全量重写业务代码为零 try-catch / 零 if-else 链：dispatch 用 `match(kind)`、cli 用 `match(action)`、各 adapter 用 `match(result)` + `attempt`。实测业务代码 try-catch=0、if-else/switch=0，37/37 测试 + 既有测试 + UI build + 网关启动全绿。
- 关联：ADR 0012、rex-engineering-standards §1/§2/§4/§5
- 触发：用户审查指出实现不满足软件工程架构；自查确认包括虚报接线 + 6 类架构问题

## 0. 要修的事实清单（自查证据）

| # | 问题 | 证据 |
|---|---|---|
| F1 | `onPluginUsage` 声明未调用，`usagePlugins` 死代码 | `proxy.mjs:59` 仅声明；`assemble.mjs:18,31` 收集未用 |
| F2 | integration 投影是纯函数，无运行时写盘 | `projectIntegrationContributions` 仅测试调用 |
| F3 | providers 硬编码内置，非插件加载 | `builtin-provider.mjs` 无 `contributes.providers` 读取 |
| F4 | 依赖方向违规：网关 core import 客户端域 | `entry/command.mjs:26` import `../../../clients/plugins/assemble.mjs` |
| F5 | DRY 失守：UI 手搓 manifest 校验绕过 `manifest.mjs` | `plugin-contributions.mjs:23,37,42` 直接 JSON.parse + 内联判断 |
| F6 | 目录 21 项 > 8，源码测试混放 | `ls scripts/lib/clients/plugins` = 21 |
| F7 | `__origin` 污染 integration 领域对象 | `contributions.mjs:48` |
| F8 | `as ViewId` 类型断言绕过编译器 | `console-workspace.tsx` navigateView |
| F9 | 七类 contributes 只有 panels/middleware 端到端 | 逐类 grep：integrations/providers/actions/clients/onUsage 无运行时注入 |

## 1. 目标架构（Clean Architecture + 深层模块）

### 1.1 分层与依赖方向（修 F4）
```
内层（领域，纯）                        外层（适配，依赖内层）
─────────────────────────────────────────────────────────────
plugin-core/                           gateway/ (Hono, 内层不知道它)
  manifest.mjs   (契约+校验)    ←──      entry/command.mjs 通过 DI 注入 hook
  contributions.mjs (纯投影)            ui/ 通过数据边界读取
  dispatch.mjs   (统一分派)     ←──      cli/ 调用
  ports.mjs      (注入缝接口定义)
```
- 网关 core **不 import** 插件实现；它只接受 `pluginHooks` 参数(依赖倒置)。装配发生在 CLI 边界(`aios model-router gateway` 的**调用方**,而非 core 内部)。
- 所有跨层依赖指向内层；内层不 import fs/Hono/React。

### 1.2 单一事实源（修 F5）
- manifest 校验只有 `manifest.mjs::normalizePluginManifest` 一处。UI 侧通过**服务端序列化后的干净数据**读取 `pluginViews`,不在 UI 重复解析 manifest。
- 做法：collectConsoleFacts 调 core 的 dispatch,产出已归一化的 views,UI 只消费 `facts.pluginViews`。删除 `plugin-contributions.mjs` 的 JSON.parse 镜像。

### 1.3 统一 contribution 分派（修 F9/F3/F1/F2）
- `dispatch.mjs`: `dispatchContributions({manifests, rootDir, adapters}) → {panelViews, integrationWrites, providerSources, actions, clientKinds, middlewareHooks, usageCollector}`
- 每类贡献有一个**适配器(adapter)**,由外层注入。core 只产出"意图"(例如 integration 要写什么、middleware 的 source 字符串),不碰 fs/网络。
- 适配器层(外层):
  - panel → console-facts 采集(服务端)
  - integration → 复用 `integrations/install.mjs` 的写盘(真的写 `config/integrations.json`,带备份/指纹),来源用独立 sidecar 文件而非污染领域对象(修 F7)
  - provider → 从插件 `contributes.providers` 加载路径,经 `provider-host` RPC(替换硬编码 builtin)
  - actions → mcp action-service 注册
  - clients → connect 系统
  - middleware → assemble 注入网关(已做,纳入统一分派)
  - onUsage → **proxy.mjs 请求结束时真的调用 `onPluginUsage`**(修 F1)

### 1.4 文件粒度（修 F6）
拆为职责单一的小目录，每目录 ≤8 项：
```
scripts/lib/clients/plugins/
  core/            manifest.mjs, contributions.mjs, dispatch.mjs, ports.mjs (+tests co-located 或下挂)
  adapters/        panel.mjs, integration.mjs, provider.mjs, actions.mjs, client.mjs, middleware.mjs, usage.mjs
  runtime/         vm.mjs, chain.mjs, provider-host.mjs, entry.mjs
  cli.mjs
  根目录 ≤8 项
```
测试统一放 `scripts/tests/tooling/plugins/`(新建域目录),不再 co-locate。

### 1.5 类型（修 F8）
- 视图 id 用可辨识联合 or 保持 string 但去掉 `as ViewId`;给子组件的 navigate 传真正的 `(v: string)=>void`,将 `ViewId` 提升为 `string` 契约(向后兼容:内置视图仍是 string 子集),消除断言。

## 2. 实施顺序（每步可验证）
1. 立 `core/{manifest,contributions,dispatch,ports}.mjs` 纯内核 + 测试
2. 拆目录到 ≤8 项，迁移测试到 `scripts/tests/tooling/plugins/`
3. adapters 逐个落地并接真实写盘/RPC
4. 修依赖方向：网关通过 DI 接受 hooks，移除 core 对 clients 的 import
5. 修 UI 单一事实源：删镜像，消费 facts.pluginViews
6. 修 `__origin`（独立 sidecar）与 `as ViewId`
7. proxy 调 `onPluginUsage`
8. 全量测试 + 端到端（装→看到→卸载→真实写盘→用量记录）

## 3. 验收门
- ✅ 七类 contributes 都有运行时落地：panels(views 文件)、integrations(真写 config/integrations.json)、providers(插件脚本子进程 RPC)、actions/clients(归一化分派)、middleware(网关可选注入)、onUsage(proxy 请求结束真调用)
- ✅ 网关 core 不 import `clients/*`（CLI 边界动态装配注入，依赖倒置）
- ✅ manifest 校验单一事实源：core/manifest.mjs 一处；UI 只读服务端生成的 `.aios/gateway/plugin-views.json`
- ✅ 目录全 ≤8：plugins 根 6 / core 5 / adapters 7 / runtime 8；单文件 <400 行
- ✅ 无 `as ViewId` 断言（改用 NavId=string）；领域对象无 `__origin`（来源存独立 sidecar）
- ✅ 插件 39/39；integration 22/22、routing 11/11、gateway lifecycle 15/15、intent 11/11；UI typecheck+build 干净；网关带插件启动 health 200
- ✅ 端到端实测：install→面板出现+integration 真写盘(hello-docs)+providers 真读 36 模型→remove→投影清理、手工 typesafe 保留→装回
