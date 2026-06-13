# MCP Server 使用问题与简化审查（2026-03-02）

## 已确认的问题

1. `Google Chrome for Testing` 启动崩溃（你截图中的问题）。
2. `config/browser-profiles.json` 未被真正加载（`profileManager` 未初始化）。
3. 文档仍描述 `stealth_*`，实际工具已是 `browser_*`，导致使用方误调用。
4. `browser_list_tabs` 返回 `title` Promise（未 await）。
5. `browser_navigate` 每次新开标签页，导致标签页膨胀。
6. 旧浏览器兼容代码仍在仓库，增加维护噪音和依赖体积。

## 本次已落地修复

- 修复配置加载：`BrowserLauncher` 启动前确保 `profileManager.init()`。
- 新增指纹浏览器接入能力：支持 profile `cdpUrl`/`cdpPort` 走 `connectOverCDP`。
- 启动策略增强：支持 `headless` 参数、`BROWSER_HEADLESS`、`BROWSER_EXECUTABLE_PATH`、系统浏览器自动探测。
- 工具行为修复：
  - `browser_navigate` 默认复用当前活动标签页，新增 `newTab` 控制。
  - `browser_list_tabs` 正确 await `title`。
  - 所有工具 handler 增加参数兜底和错误提示。
- 截图能力增强：`browser_screenshot` 支持 `filePath` 直接落盘。
- 文档修复：`mcp-server/README.md` 完整切到 `browser_*`。
- 简化代码：删除未使用的 `src/browser.ts` 与 `src/tools.ts`（旧浏览器路径）。
- 简化依赖：移除未使用的浏览器自动化、鼠标模拟和校验库等遗留依赖。
- 构建简化：`npm run build` 改为先清理 `dist` 再编译，避免旧产物残留。

## 当前仍建议的可选简化（未删除）

1. 统一技能体系：`memory/skills` 与 `.claude/.codex` 存在双轨，可考虑定义单一事实源并自动同步。
2. 清理历史浏览器 MCP 设计文档，避免旧别名继续出现在当前检索面。
3. 若长期使用 CDP 指纹浏览器：可以将 `default` profile 也改为 CDP，彻底关闭本地 launch 路径。
