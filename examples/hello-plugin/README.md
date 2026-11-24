# hello-plugin（示例插件）

演示 AIOS 声明式插件系统的示例：一份 `manifest.json`，通过 `contributes` 给 app 贡献能力。插件主体是声明，**不执行外部安装脚本**；middleware 的 JS 在网关进程内的受限沙箱里跑。

## 完整体验（装 → 看到 → 卸载）

```bash
# 1. 安装（写 config/plugins.json）
node scripts/aios.mjs plugin install --id hello-plugin --dir examples/hello-plugin --json

# 2. 查看已装插件
node scripts/aios.mjs plugin list --json

# 3. 一键启动（推荐）：自动确保插件已装 + 生成 token + 打开带 token 的 URL
#    这一步必须是 `npm run ui` / `npm run ui:plugin-demo`，不能 `cd apps/shell/ui && npm run dev`：
#    后者没有 token，会被 proxy.ts 全站 403 no-token-configured，页面根本打不开。
npm run ui:plugin-demo
# 或：npm run ui   （仅启动 console，插件需先按第 1 步安装）
# 复制命令行打印的 http://127.0.0.1:<port>/t/<token>/ 到浏览器，
# 会自动换 cookie 跳到首页；点左侧「示例插件」即可看到 /hello-plugin 页面来源。

# 4. 查看插件接到的真实数据（来自本机 model-registry.json）
node scripts/aios.mjs plugin providers --json   # 真实 provider 列表
node scripts/aios.mjs plugin models --json      # 真实模型列表

# 5. 禁用 / 启用 / 卸载
node scripts/aios.mjs plugin disable --id hello-plugin
node scripts/aios.mjs plugin enable  --id hello-plugin
node scripts/aios.mjs plugin remove  --id hello-plugin
```

## manifest 契约

字段：`schemaVersion` / `id` / `version` / `permissions` / `lifecycle` / `evidence` / `contributes`。

`contributes` 五类（本示例演示 panels + middleware）：
- `panels`：贡献一个导航页（服务端读 manifest → 注入 `CONSOLE_VIEWS`，前端合并渲染）；可选 `ui.entry` 指向插件目录内的单个 HTML 文件，宿主用 sandboxed iframe 渲染真实 UI。
- `integrations`：投影进 `config/integrations.json`，复用现有 pinned-commit/sha256 硬门；卸载按 `__origin` 精确移除。
- `middleware`：网关请求链的 `onRequest`，Node `vm` 受限沙箱（禁 fetch/timer/Node API，250ms，改 model/stream 回滚，失败 fail-open）。
- `providers`：联网插件（`auth.usage` / 额度 / 模型发现），在独立子进程跑，stdio JSON-RPC。
- `clients`：声明支持把 AIOS 接入哪些客户端（复用现有 connect 系统，ADR 0010）。

## 独立插件 UI 页

```json
{
  "panels": [
    {
      "id": "hello",
      "href": "/hello-plugin",
      "label": "示例插件",
      "title": "示例插件 · Hello",
      "ui": { "entry": "panel.html" }
    }
  ]
}
```

- `ui.entry` 必须是插件目录内的相对 `.html` 路径，大小写扩展名均可；第一版只支持单文件 HTML，上限 256 KiB。
- HTML 可包含内联 CSS 与 JavaScript，在 `sandbox="allow-scripts"` iframe 中运行；不授予 `allow-same-origin`，不能直接访问宿主 DOM、Cookie 或同源 API。
- 文件缺失、越界、扩展名非法或超限时，插件页显示错误，不影响宿主其他页面。
- 不声明 `ui` 的旧 panel 保持兼容，继续显示声明式说明卡。
- 禁用或移除插件后，导航与路由随投影撤回。

单次安装的 `contributes.onUsage` 用量行通过 `on-usage.mjs` 聚合，支持缓存命中率统计（无数据显示 0，不美化）。
