# ADR 0007：AIOS 自有的感知面 = 接入矩阵面板 + Tauri 桌面壳（抄 Cline 的壳，不抄前端栈）

日期：2026-11-04
状态：已确认且闭合（用户拍板，/grill 澄清 9 轮收敛）。无未决项。

## 背景

用户反馈：AIOS 上线已久，但**使用者感知不到自己受益了什么**；同时**外部开发者只能用，不能参与**——没有生态入口。参照项目 magpie（yetone/magpie）做得更"专业"，但用户判断其优势不只是界面。

调查结论（实测，非假设）：

- magpie 的可视化之所以有内容，是因为它站在**请求路径**上：一个 Go 进程（`go.mod`）持有全部能力，桌面端是系统 WebView（`github.com/wailsapp/wails/v3`），并有 `magpie tui` / `magpie web` / `magpie serve` / `magpie daemon install` 四个视图。**能力在进程里，视图只是客户端。**
- AIOS 的扩展平面并非不存在：`config/integrations.json` 是声明式第三方集成注册表（钉 commit + sha256），配套 `aios integration list/add/doctor/remove`（四道门：pinned commit / verified sha256 / per-client plan / live handshake）；`aios skill add`（ADR 0001）是外部技能安装通路；MCP 平面可直接吃现成生态。
- 真正的缺口是三处：注册表只有 1 条（`typesafe`）、没有作者入口与统一 ABI、没有任何可见面。
- AIOS 的 chokepoint 不是请求，而是**记忆与工作流状态**（ContextDB / memo / session / plan / dispatch）。
- `apps/desktop/` 只有 `dist/` 与 `node_modules/`、无源码（`git ls-files` 命中 0），不能作为任何落点；仓库内真实可维护的 UI 只有 TUI + `genealogy-gui` + `debug-hub`。

## 决策

1. **感知面 AIOS 自己拥有**。不做"把界面让给 Cline/VS Code"的中间层路线；Cline 之类是他者生态，未来最多是接入矩阵里的一行。
2. **第一屏 = 接入矩阵**，不是 magpie 式的实时路由图。理由是数据现成且每格可指回文件：`aios status --json`（`aios.status.v1`，实测输出 13 客户端 + blocker 原文 + 每客户端证据状态）、`config/host-capabilities.json`（13 × 7 轴 × L0–L3）、生成式记分板 `docs/reports/2026-10-19-client-capability-scorecard.md`。AIOS 没有持久化的路由决策记录，**一期**实时路由视图无数据源，故不做；**二期与网关联动实现**（网关即其数据源）。

   **先修正一处早先的过度承诺（落地 `apps/shell/data/matrix.mjs` 时实测）**：逐轴的原因为不存在——配置只为客户端提供行级 `limits[]` 与可选的 `subagents.evidenceRef`。因此单元格只表达「是否在配置里声明」，点击后的证据是行级 `limits` 原文 + `evidenceRef` + 证据状态（`pending-smoke` / `compatibility-only` / `evidence-blocked` / `not-covered`）。界面不得编造逐轴理由。
   另一个生效前的实测差异：配置声明 13 个客户端，而 `aios status` 的 `clientCapabilities` 只覆盖 10 个（`totalClients: 10`），所以**未覆盖 ≠ 好**，必须用 `not-covered` 显式画出。
3. **能力进程与视图分离**：常驻能力进程持有 ContextDB / 记忆 / CLI / 文件 / 子进程；浏览器面板、TUI、桌面壳都是它的视图。动作由服务端执行，浏览器只做 `fetch`，因此"Web 版无法调用底层"不成立（`genealogy-gui` 的 file API + `debug-hub` 的 `POST /api/logs` 是两次实证）。
4. **桌面壳走 Tauri 2，抄 Cline 的壳**（`apps/examples/desktop-app/`，Apache-2.0）：窗口、托盘、系统文件对话框、通知、单实例、自更新、sidecar 打包都直接照其结构。前端栈同代照抄（Next.js 16 + React 19），**样式走 Tailwind 4（CSS-first，无 tailwind.config.js），交互走无头组件库**（实测上周下载量选库：`@radix-ui/react-dialog` 90.3M / `react-popover` 68.2M / `@tanstack/react-table` 34.5M，而 `@headlessui/react` 9.8M 低一个量级，不选）。表格钉 `@tanstack/react-table@8.21.3`：v9（9.3.1）换了 API 形状（`createTableHook` + feature 注册），对一个 13 行矩阵而言机器更重。用户裁定：不写原生 CSS，不自己造组件层。
5. **壳深度 = S1 + S2**（窗口 + sidecar 打包，**不签名**）。S3（托盘/通知/自启/深链）与 S4（签名/公证/自更新）后置。S4 需要 Apple Developer Program 与 Windows 代码签名证书（付费），属于产品预算决策，不在本次范围。
6. **构建由 GitHub Actions 出产物**：仓库为 public（匿名访问 200），托管标准 runner 不计费；CI 已有三 OS matrix（`ci-main.yml` 的 `mcp-server-quality` = `ubuntu-24.04 / macos-latest / windows-latest`），Tauri 不支持交叉编译，正好用三平台 matrix + `swatinem/rust-cache`。因此"没有多台机器"不是否决理由。
7. **插件契约 = 一个 manifest 家族，三个 kind**：`client`（把 AIOS 装进某客户端/生态）、`integration`（第三方 skill + MCP，即现有 `integrations.json` 的开放版）、`panel`（给宿主加一屏）。共同字段：`schemaVersion` / `id` / `version` / `permissions` / `lifecycle`（install·upgrade·disable·remove）/ `evidence`。先只抽 `claude` + `codex` 两个客户端降成 manifest，其余继续走代码路径，要求行为逐字节一致（diff 证据）。

## 二期（范围已确认，实施顺序在 M1–M3 之后）

8. **本地 LLM 网关 + 请求级智能路由 + 实时路由图**（用户明确：智能路由是关键功能，二期做）。

   这不是从零复刻 magpie。仓库已有零件（实测）：
   - `scripts/lib/tooling/model-router/routing/protocols.mjs`：四种 API 方言词表 `openai-chat` / `openai-response` / `claude` / `gemini`——与 magpie 翻译的那四种是同一集合，并已带 relay 端点拼装（`https://coding.rexai.top` + `/openai/v1/chat/completions` 等）
   - `routing/availability.mjs`：通道可用性状态机（`ok`/`degraded`/`down`，TTL 10 分钟、cooldown 5 分钟、连续 2 次失败判 down、20s 判 degraded，状态落 `memory/specs/model-availability.json`）+ 通道级故障模式（`model_not_found` 等）
   - `routing/selection.mjs`：按 task/role 选模型 + fallback 链
   - `client-sources/` 与各客户端安装器：改 base URL 的落地能力已有

   缺的是**请求面**：HTTP 入口、流式转发、工具调用与 reasoning 透传、按请求路由与配额耗尽切换。**注意区分**：现有智能路由是**任务级**（哪个 capability/哪个模型角色处理这个任务），二期要的是**请求级**（这次请求走哪个 provider/账号/通道），两者不是同一件事，不能互相顶替。

   实时路由图依赖网关产生决策留痕；没有网关就没有这条数据，所以两者同期。

## 注册表开放边界（已定：双轨）

9. **注册表走双轨**（用户拍板，C 案）：
   - **官方轨**：审核上架，上架 = 向注册表提 PR，沿用现有硬门（pinned commit + verified sha256 + per-client plan + live handshake）。
   - **本地轨**：本地路径 / 私有源可直接装，条目必须标记 `untrusted`，安装时一次**显式确认**，界面与 CLI 输出都要显示该标记。
   - **首期只实现这两轨**。第三条（npm 包 / git URL 自发布）推迟到具备插件进程隔离之后再评估——理由是插件能执行命令，破坏面不同于 magpie 的单请求中间件。

## 后果

- 新增 `apps/shell/`：实测形状为 `README.md` + `.gitignore` + `data/` + `ui/`（当前 4 项）；`ui/` 内顶格 8 项（`app/` `components/` `lib/` + 5 个配置文件）。`next-env.d.ts`、`.next/`、`tsconfig.tsbuildinfo`、`node_modules/`、`src-tauri/target/` 全部进 `apps/shell/.gitignore`，不计入预算。**再往 `ui/` 顶层加一个目录就会顶爆 8**，新而必顶时先往 `app/` 或 `lib/` 里放。`src-tauri/` 落地后 `apps/shell/` = 5 项，仍合规。
- **`DESIGN.md` 已修正两处矛盾**（第 13 行曾写「没有 React」而第 21 行写「框架：react」）：现在按路径声明框架——docs-site / debug-hub / genealogy-gui 无框架，tui-ink 为 React(Ink)，`apps/shell/ui/**` 为 Next.js 16 + React 19 + Tailwind 4 + 无头组件库。三者共用同一套视觉 token。`scripts/tests/tooling/shell/shell-tokens.test.mjs` 钉住「壳的 `@theme` 值 == 所有者 `docs-site/assets/redesign/tokens.css` 的 `--rex-*` 值」，以及「globals.css 里只允许 `:root[data-rex-theme="dark"]` 与 `body` 两个选择器」。
- **目录预算已与 Next 结构共存**：`apps/shell`=4 项（README / .gitignore / data / ui），`ui`=8 项顶格（app / components / lib / package.json / package-lock.json / next.config.mjs / postcss.config.mjs / tsconfig.json）。再往 `ui/` 顶层加任何一项都会顶爆预算，必须往子目录里放。`next-env.d.ts` / `.next/` / `node_modules/` / `tsconfig.tsbuildinfo` 已进 `apps/shell/.gitignore`。
- **M1 工期与验收随之变更**：不再是「单文件 HTML + node http server」，改为 Next 应用 + Tailwind token + 三源数据校验；估算从 ~2 天上调到 ~4–5 天。原「界面零手写常量」这条硬约束与框架无关，继续有效，且已机器化（`matrix-sources.test.mjs` 判定 page.tsx 无数字字面量；取数只走 `lib/matrix-loader.ts` 跑 `data/load.mjs` 的子进程通道，因为 import 会把 `scripts/lib/**` 拖进打包图并触发 Turbopack 整仓 trace 告警）。
- **构建链**：Tauri dev 需要 `devUrl` 指向 `next dev` 端口；生产需 `next build` 产物由 sidecar 或 Tauri 作为静态资源提供（Cline 同款做法）。
- **事实不经过打包器**：视图取数走子进程跑 `apps/shell/data/load.mjs`。直接 import 会把 `scripts/lib/**`（含 `project-root.mjs` 的路径扫描）拖进打包图，Turbopack 会因此要求整仓 trace——那是一个真告警，不是风格问题。
- **服务端组件不能从 `'use client'` 模块取常量**：实测会拿到客户端引用代理，静默退化成英文标识与空串。展示词表住 `ui/lib/labels.ts`，并由 `shell-labels.test.mjs` 钉住。
- 引用 Cline 的 Apache-2.0 代码必须保留其 LICENSE/NOTICE 并逐文件标注来源与修改；本仓为 MIT，需在 README 与 PR 中写明。
- Tauri sidecar 会拉起能力进程：**其 CWD 不得落在安装树内**，否则会锁住 `aios update` 的目录替换（`resolveCwdOutsideRootDir` 的实测结论）。
- 壳加载 localhost 页面仍需信任边界：随机 token + 只绑 `127.0.0.1` + 敏感路由拒绝带 `Origin`/`Sec-Fetch-*` 的请求。
- public 仓库的 Actions artifact 公开可见；未签名构建外发时只走 release 附件并显式标注未签名。
- 双轨注册表的 `untrusted` 标记必须同时出现在 CLI 输出与面板里；只在文档里写标记等于没有标记。- **入口在仓库根，不在 `apps/shell/ui`**（用户裁定）。根 `package.json` 提供 `ui:setup` / `ui` / `ui:build` / `ui:start` / `ui:typecheck` / `test:shell`；实现落在 `scripts/aios-ui.mjs`，它同时是决策 3 里「能力进程入口」的雏形——以后 `aios ui` 接在同一入口，不另起一套。
  两个实测原因：嵌套 `npm run ui -- --port 3131` 会把 `3131` 当位置参数塞给 `next dev`（被解释成项目目录，直接报错）；Windows 上 `spawnSync('npm', …)` 直接 ENOENT（npm 是 `npm.cmd`）。所以启动器用 `node node_modules/next/dist/bin/next <mode> -p <port>`，三个平台形状一致。
- **端口只有一个所有者**：`scripts/aios-ui.mjs`（`--port` 或 `AIOS_UI_PORT`，非法值回落默认并留下说明）。`apps/shell/ui/package.json` 的 `dev`/`start` 不再写 `-p`，避免两处端口事实。
- 启动器不做任何数字判定：矩阵事实仍只从 `apps/shell/data/` 出。`ui-launcher.test.mjs` 钉住「不会把裸 `npm` 当命令 spawn」「非法端口不透传」「缺依赖时不启动」。
