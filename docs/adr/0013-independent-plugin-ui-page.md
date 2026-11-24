# 0013 — 独立插件 UI 页采用单文件 HTML + sandboxed iframe

- 状态：Accepted
- 日期：2026-11-24
- 关联：ADR 0012（声明式 contributions）、`docs/plans/2026-11-24-plugin-independent-ui-page.md`

## Context

现有 `panel` contribution 已能贡献导航与动态路由，但只渲染宿主通用说明卡。用户确认第一版做独立插件页：插件作者携带真实 UI，宿主负责隔离与生命周期；不扩到宿主现有页面注入、主题编辑器或宿主 API 桥接。

## Decision

1. `panels[].ui.entry` 是可选字段，指向插件目录内的单个相对 `.html` 文件。
2. 宿主 adapter 校验路径边界、扩展名与 256 KiB 上限，把 HTML 投影进现有 `plugin-views.json`；UI 不重复解析 manifest。
3. 前端使用 `<iframe sandbox="allow-scripts" srcDoc={...}>` 渲染；不授予 `allow-same-origin`，插件不能直接访问宿主 DOM、Cookie 或同源 API。
4. 读取失败投影为 `ui.error`，插件页显示错误；旧 panel 无 `ui` 时保持说明卡兼容。
5. 第一版不提供 postMessage 能力桥、多文件 UI 包、React 插件加载或资产 HTTP 路由。

## Consequences

- 插件作者可用普通 HTML/CSS/JavaScript 制作真实交互页，无需修改宿主核心代码。
- 宿主获得明确安全边界：插件 UI 与宿主同源能力隔离。
- 单文件入口限制多文件资源组织；真实需求出现时再另立资产服务与 UI 包契约工作项。
- `plugin-views.json` 会包含 HTML 内容，因此必须保留大小上限与安装/禁用投影生命周期。

## Rejected options

- **React 组件直接注入宿主**：动态打包、版本兼容与宿主 DOM 权限破坏面过大。
- **新增插件资产 HTTP 路由**：第一版无需多文件目录，避免路径、MIME、缓存与 CSP 的额外复杂度。
- **开放 postMessage 宿主 API**：授权与消息协议尚未定义，推迟到独立桥接工作项。
