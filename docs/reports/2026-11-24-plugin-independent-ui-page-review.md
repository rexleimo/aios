# 2026-11-24 — 独立插件 UI 页代码审查

## 审查范围

- Fixed point：`origin/main` = `819a36ee99672399a92ee62d7728b96162898d97`（用户确认以远端为主）。
- 有效差异：`git diff origin/main` 的本工作树改动 + 未跟踪新增文件；`git diff origin/main --check` 通过，差异非空。
- Spec：`docs/plans/2026-11-24-plugin-independent-ui-page.md`、`docs/adr/0013-independent-plugin-ui-page.md`。
- Standards：根 `AGENTS.md`、`apps/shell/ui/AGENTS.md`、`rex-engineering-standards`。

## Standards

检查 12 项 smell 基线：Mysterious Name、Duplicated Code、Feature Envy、Data Clumps、Primitive Obsession、Repeated Switches、Shotgun Surgery、Divergent Change、Speculative Generality、Message Chains、Middle Man、Refused Bequest，均未见可执行 finding。

硬门：

- `console-workspace.tsx` 已拆出插件页组件，文件降至 400 行以内；MCP 工作区归入 `resources/`，目录项数不增长。
- `directoryEntries`：0 violation。
- TypeScript：`npm run ui:typecheck` 通过。
- 安全边界：词法路径 + `realpath` 双重目录归属检查；读取前 `stat` 拦截非文件与超限 UI。
- 测试未删除、跳过或弱化；真实 Chromium 覆盖交互、隔离、错误与兼容回退。

CRG `detect_changes` 风险 0.55，列出 5 个图测试缺口；新增测试文件尚未进入图索引，实际公共入口测试直接覆盖 `computePluginViews`、`loadPanelUi`、`htmlUiError`、`escapesPluginRoot`，浏览器覆盖 `buildNav`。MCP 文件移动产生的 removed symbols 是搬迁假象，import 已更新。

Standards findings：0 hard / 0 judgement。

## Spec

验收逐项核对：

1. manifest 可选 `ui.entry`，示例插件无需改宿主核心即可贡献真实页。
2. 安装/启用后导航与 iframe 真实 UI 生效，浏览器按钮可交互。
3. iframe 仅 `allow-scripts`，浏览器确认宿主 DOM 不可直接访问。
4. 缺失、非法扩展名、超限、越界与 symlink/junction 逃逸均投影可见错误。
5. CLI disable/remove 后投影撤回；动态 section 路由沿用 `notFound()` 契约。
6. 无 `ui` 旧 panel 保留说明卡。
7. 示例 HTML、作者文档、核心/CLI/浏览器测试齐全。

未发现超范围行为；多文件 UI、主题编辑、宿主页面注入、市场分发与 API 桥接均未实现。

Spec findings：0 hard / 0 judgement。

## 审查中修正

- 将 256 KiB 限制从读取后校验前移到 `stat` 阶段，避免大文件整读峰值。
- 补非 HTML 扩展名与超限文件测试。

## Verdict

**pass**。两轴均无遗留 finding。

证据：

- 核心/CLI：`receipt:21c7313c-d3a7-472f-8613-2ca8125c6a59`，退出码 0，10/10。
- 浏览器：`receipt:f94da972-537d-44a2-bd37-8d50fef215a4`，退出码 0，3/3。
- 强度探针：临时禁用目录边界后 `receipt:5bba8205-fe31-4ee2-ac35-f45f623aba81` 非零；恢复后 `receipt:e0057452-8a31-4da8-813c-5deb92369792` 零退出。
