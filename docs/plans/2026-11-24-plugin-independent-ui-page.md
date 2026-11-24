# 2026-11-24 — 独立插件 UI 页（需求与第一切片）

## 背景与现状

用户已选择第一版只做**独立插件页**：插件作者声明入口并携带真实 UI，宿主负责加载、隔离与生命周期。

当前实现已支持：

- `config/plugins.json` 管理安装、启用、禁用与移除。
- manifest 的 `contributes.panels` 投影导航项与动态路由。
- `scripts/lib/clients/plugins/core/contributions.mjs` 生成 `plugin:<id>` 视图。
- `apps/shell/ui/src/app/(console)/[section]/page.tsx` 按 `href` 匹配插件页。

当前缺口：panel 只有 `href/label/title`，`PluginPanelView` 渲染通用说明卡，插件不能携带或渲染真实 UI。

## 验收标准

1. 插件作者可在 manifest 中为 panel 声明 UI 入口；新增独立插件页不需要修改宿主核心代码。
2. 安装并启用插件后，宿主显示对应导航项；打开后渲染插件提供的真实交互 UI，而不是通用说明卡。
3. 插件 UI 与宿主 DOM、宿主脚本、宿主 API 隔离；第一版不授予插件直接访问宿主能力的权限。
4. UI 文件缺失、格式非法或加载失败时，插件页显示可诊断错误，宿主其他页面仍可使用。
5. 禁用或移除插件后，导航项与插件路由不再可用，插件 UI 不会继续由宿主提供。
6. 未声明 UI 的旧 panel manifest 保持兼容，继续渲染现有说明卡。
7. 示例插件、作者文档与自动化测试覆盖安装、渲染、失败与卸载闭环。

## 非目标

- 往宿主现有页面注入卡片、按钮、菜单或布局。
- WordPress 式主题商店、拖拽布局或可视化 UI 编辑器。
- npm 包 / git URL 自发布轨与插件市场。
- 在宿主 React 进程中直接执行插件组件。
- 第一版提供插件访问宿主文件、凭据、MCP 或内部 API 的桥接。

## 关键决策

### accepted-scope

第一版交付独立插件页，而不是改造宿主现有页面。该选择由用户明确确认。

### ownership

插件拥有 UI 内容与交互；宿主拥有导航、路由、资产边界、隔离、错误呈现与生命周期。插件不得修改宿主 DOM 或核心组件。

### compatibility

现有 manifest 与 CLI 行为保持兼容；UI 入口是 panel 的可选扩展。

## 正常路径

作者在 panel 中声明 UI 入口并提供 UI 资产；安装插件；宿主投影导航与路由；用户打开插件页；宿主在隔离边界内渲染真实 UI；禁用或移除后路由与导航撤回。

## 失败路径

UI 入口缺失、越界或资产不可读时，宿主拒绝加载并显示错误；不执行未知资产，不崩溃宿主。禁用或移除后，即使保留旧 URL 也不再提供插件 UI。

## 第一可验证切片

把 `examples/hello-plugin` 的一个 panel 升级为真实可交互 UI 页：manifest 声明 UI 入口，宿主渲染隔离页面，按钮可改变页面内状态；随后禁用插件，确认导航与路由撤回。

验证方式：插件核心测试、UI 组件/路由测试、UI typecheck 与 build，以及一次真实浏览器打开/交互/禁用 Smoke。

## 可行性依据

- panel 投影已有单一事实源：`scripts/lib/clients/plugins/core/contributions.mjs`。
- 动态 section 路由已按插件 `href` 匹配：`apps/shell/ui/src/app/(console)/[section]/page.tsx`。
- 导航与插件页渲染集中在 `ConsoleWorkspace`，可在不改变内置视图契约的前提下扩展。
- UI 资产服务与隔离边界需要新增窄适配器，不要求改写网关或插件领域内核。

## 最小构造评估

### reuse-ladder

1. **删除偶然复杂度**：不适用；真实插件 UI 是已确认验收标准，不能删掉。
2. **复用现有代码**：复用 `plugins.json` 生命周期、`projectPanelContributions` 导航投影、`plugin-views.json` 单一读源、动态 `[section]` 路由与 `PluginPanelView` 渲染位置。
3. **平台标准能力**：使用浏览器原生 sandboxed iframe 承载插件 HTML；`allow-scripts` 支持交互，不授予 `allow-same-origin`，插件不能直接访问宿主 DOM、Cookie 或同源 API。
4. **已安装依赖**：不需要新增依赖；现有 Node `fs/path` 负责有界读取，React 负责 iframe 渲染。
5. **局部表达式**：panel 可选 `ui.entry`，适配器读取单个 HTML 文件后写入投影视图；UI 只增加一个 iframe 分支。
6. **最小新构造**：只新增“HTML UI 入口 → 投影视图”的窄适配器；不新增资产服务器、插件桥接协议或 React 插件加载器。

### minimal-option

第一版采用单文件 HTML UI：manifest 声明 `panels[].ui.entry`，宿主读取并校验路径后把 HTML 放入 `plugin-views.json`，前端用 `<iframe sandbox="allow-scripts" srcDoc={...}>` 渲染。旧 panel 无 `ui` 时继续走说明卡；读取失败时投影错误信息，由插件页显示。

### rejected-options

- **新增插件资产 HTTP 路由**：能支持多文件目录，但引入路径遍历、缓存、MIME、CSP 与路由生命周期等额外边界，第一版不需要。
- **把 React 组件直接装进宿主进程**：破坏 UI 隔离，并要求动态打包与版本兼容，不符合当前安全边界。
- **第一版做 postMessage 能力桥**：宿主 API 授权面与消息协议尚未定义，先不开放。
- **第一版支持多文件 UI 包**：单 HTML 已满足独立页闭环；多文件解析留到有真实需求时另立工作项。

## 测试范围契约

### test-scope

- **用户目标**：插件作者能添加真实、可交互、与宿主隔离的独立插件页。
- **范围内行为**：manifest 可选 UI 入口；HTML 安全读取与投影；iframe 隔离渲染；错误呈现；禁用/移除撤回；旧 manifest 兼容。
- **范围外行为**：宿主页面注入、主题编辑、市场分发、多文件 UI 包、宿主 API 桥接。
- **允许测试缝**：插件 manifest/core/adapter 的公共函数；CLI 安装/禁用/移除；`ConsoleWorkspace` 的真实浏览器渲染；UI 源码契约检查。
- **完成判据**：聚焦测试全绿，UI typecheck/build 通过，真实 Chromium 中按钮可交互且宿主 DOM 不可被 iframe 直接访问。

### acceptance-test-mapping

1. manifest 接受 `panels[].ui.entry`，投影视图包含对应 HTML。
2. 真实浏览器打开 hello-plugin，iframe 内按钮可点击并改变状态。
3. iframe 只启用 `allow-scripts`，不启用 `allow-same-origin`；浏览器断言 iframe 不能直接读取宿主 DOM。
4. 缺失或非法 UI 文件产生 `ui.error`，页面显示错误且不渲染 iframe。
5. 禁用插件后 `computePluginViews` 不再返回该 panel；CLI 卸载后旧路由 404。
6. 无 `ui` 的旧 panel 投影不包含 UI 字段，仍渲染说明卡。
7. 示例插件包含真实 HTML UI；作者文档说明单文件入口、隔离边界与失败行为。

### test-seam

- **核心/adapter**：`normalizePluginManifest`、`computePluginViews`、`writePluginViewsFile` 是稳定公共入口；直接断言用户可观察的投影结果。
- **CLI**：在临时根目录安装/禁用/移除 hello-plugin，断言注册表与投影文件真实变化。
- **UI**：用现有 esbuild + Chromium 模式挂载真实 `ConsoleWorkspace`，不模拟 iframe 或 React 组件；源码契约只辅助锁定 sandbox 属性，不替代浏览器行为。
- **第一纵向切片**：hello-plugin 的计数按钮页。它同时经过 manifest、文件读取、投影、导航、iframe 渲染与交互，足以代表完整目标。
- **禁止项**：不删除断言、不跳过用例、不放宽期望、不以 mock 通过替代真实浏览器与文件系统行为。

## 可测试性结论

### testability-decision

结论为 `behavior-delta`。公共入口 `computePluginViews` 在真实临时插件目录中接收 `panels[].ui.entry`，当前投影忽略该字段，导致 `view.ui` 为 `undefined`；缺失文件与路径越界也无法进入错误契约。该失败直接对应用户可观察的“真实插件页无法渲染”。

- 命令：`node --test scripts/tests/tooling/plugins/panel-ui.test.mjs`
- 真实回执：`receipt:a78fb4a5-ddef-40c0-9a11-1ae00468ff9f`
- 退出码：`1`
- 观察：6 项中 2 项通过、4 项失败；失败均发生在 UI 投影/持久化/错误契约。
- 失败原因：现有 panel 投影只复制 `id/href/label/title/source`，尚未读取或投影 `ui.entry`。

## 实现差异

### implementation-diff

- `core/contributions.mjs`：只接收已经归一化的 HTML UI 契约，领域内核不接触文件系统。
- `adapters/panel.mjs`：校验相对路径、插件目录边界、`.html` 扩展名与 256 KiB 上限；读取失败投影为 `ui.error`。
- `console-facts.ts`：为插件视图增加可选 `PluginPanelUi` 类型。
- `console-workspace.tsx`：真实 UI 使用 `sandbox="allow-scripts"` 的 iframe；错误与旧 manifest 保留可诊断说明。
- `examples/hello-plugin`：新增真实 `panel.html` 与 manifest UI 入口。
- 新增核心/adapter 测试与真实 Chromium 行为测试。

正式 GREEN 回执：`receipt:7a7b533c-ccc9-486e-be60-7f655779c2b5`，命令与 RED 契约完全一致 `node --test scripts/tests/tooling/plugins/panel-ui.test.mjs`，退出码 `0`，6/6 通过。补充浏览器 GREEN 回执：`receipt:65e0e4cc-5df9-4613-8ab1-7a4dc4aef12d`，核心与真实 Chromium 合计 9/9 通过。UI RED 回执：`receipt:1138cffe-6154-48a6-9c2b-b3a8060a9b21`，真实浏览器中 iframe 缺失、错误文案未呈现。

## 重构与强度检查

### refactor-check

- 将插件页渲染提取为 `plugin-panel-view.tsx`，`console-workspace.tsx` 从 437 行降到 400 行以内，恢复文件粒度门。
- 将 MCP 工作区归入 `resources/`，console 目录项数保持 13，不新增目录预算违规。
- 修正移动后的相对 import；UI typecheck 通过。
- 增加 CLI install/disable/enable/remove 真实生命周期测试；核心 + 浏览器聚焦测试 10/10 通过。

### test-strength-check

安全强度探针临时禁用 `loadPanelUi` 的目录逃逸判断，同一公共测试命令真实失败：`receipt:5bba8205-fe31-4ee2-ac35-f45f623aba81`，退出码 `1`，路径越界用例不再得到 `ui.error`。随后立即恢复判断并重跑：`receipt:e0057452-8a31-4da8-813c-5deb92369792`，退出码 `0`，7/7 通过。临时破坏未保留在产品差异中。

### test-diff-review

测试覆盖用户可观察结果：真实 HTML 投影、CLI 生命周期、浏览器 iframe 交互、宿主 DOM 隔离、错误呈现与旧 manifest 兼容。没有删除断言、跳过用例、放宽期望或用 mock 替代真实文件系统/Chromium。新增测试各自可独立失败，且强度探针证明路径边界断言不是装饰。

### symlink-red

基础 TDD 的当前最小风险行为是真实路径边界。临时插件目录内创建指向目录外的 Windows junction，`ui.entry` 仍为 `linked/panel.html`；词法路径检查通过并读到外部 HTML，未产生 `ui.error`。真实回执 `receipt:fe5fb184-8fcb-4413-b2a4-1c1fea581ce6`，退出码 `1`，8 项中 7 通过、仅 symlink/junction 逃逸用例失败。失败原因：当前只做 `path.resolve/relative` 词法检查，没有校验 `realpath` 后的真实归属。

### symlink-green

在词法检查之外增加 `realpath` 后的真实目录边界检查，并从真实文件路径读取 HTML。正式 GREEN 回执 `receipt:25b81120-b879-47f6-9401-591750f85d73`，命令与 RED 完全一致，退出码 `0`，8/8 通过。该差异只收紧插件 UI 文件边界，不改变 manifest、导航或渲染契约。

### tdd-refactor-review

重构后保持真实路径边界、UI 投影、CLI 生命周期与旧 manifest 兼容断言不变；新增 symlink/junction 用例直接观察外部文件不会被读取。`git diff --check` 无空白错误。当前阶段重新执行同一公共命令，回执 `receipt:5862c40b-a252-4d4d-b014-b5b6afab3d4e`，退出码 `0`，8/8 通过。测试未删除、跳过或弱化。
