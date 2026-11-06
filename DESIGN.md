# DESIGN.md — 视觉契约

本文件是**本仓库**视觉语言的 owner：配色、字体、间距、组件形态。时间轴上的事实（时长、曲线、进出场、循环接缝、减动效）在 `MOTION.md`，两个 owner 分离是刻意的。

> 结构由 `config/design-contract/DESIGN-STRUCTURE.md` 统一下发（改了只影响结构，不影响配色）；证据由 `node scripts/design.mjs init` 实测填入；决策由本项目填写，`node scripts/design.mjs check` 拒绝未决项。别的项目用 `node scripts/design.mjs init --root .` 得到自己的实例，不要复制本文件——它写的是本仓库的路径和配色。

## 先分清你在做哪一种界面

三条路的产物、依赖和门槛完全不同，选错会做出一个“看起来像”但用不了的东西：

| 任务 | 产物 | 用什么 |
|---|---|---|
| **本仓库的真实产品界面**（`docs-site/`、`packages/debug-hub/`、`scripts/lib/memory/genealogy-gui/`） | 能跑、能维护的产品页 | 本文件的视觉语言 + `MOTION.md` + 本仓库自己的 CSS。**这些面没有 React，不要往里写 kit 导入**（`apps/shell/ui/` 是例外，见下） |
| **给宿主项目的产品插图**（营销 hero、功能卡、docs 配图、带光标的假窗口/手机演示） | 一张静帧或一段 10–16 秒的循环 | 上游 `stageshow` 技能：`npx skills add benjitaylor/skills --skill stageshow`。它有 kit、69 个 gold 范例和 film 工具链，**流程是「复制最接近的范例」而不是从零写 stage** |
| **纯视觉规范**（配色/字体/间距的基线） | `DESIGN.md` 本身 | `awesome-design-md`，本文件的前身就是它的产物 |

第二行是独立技能，不在本仓库：它带 118 个 tsx 文件和 react/react-dom/lucide-react，是**复制进宿主项目**的东西。本仓库只保留它的**判据**（`vendor/stageshow/references/`）和**验证内核**（拍帧），因为这两样与具体框架无关。

## 适用范围

本契约约束下列界面源文件（由 `git ls-files` 实测，非举例）。**框架按路径划分，不再有一行笼统的「框架：react」**——那行曾与第 13 行互相矛盾，读者按哪一句办都会错：

- `docs-site/`、`packages/debug-hub/`、`scripts/lib/memory/genealogy-gui/`：无框架，纯 CSS + 单文件 HTML
- `scripts/lib/execution/tui-ink/**`：React（Ink 终端渲染，16 个 tsx）
- `apps/shell/ui/**`：Next.js 16 + React 19 + **Tailwind 4**（CSS-first）+ 无头组件库（Radix UI、TanStack Table）。约定见 `apps/shell/README.md`；裁决见 `docs/adr/0007-aios-perceived-surface-and-desktop-shell.md`

三条共用本文件的视觉语言（token、字体、主题、对比度、焦点可见性），只有实现栈不同。

- `docs-site/assets/custom.css`、`docs-site/assets/home.css`、`docs-site/assets/pages.css`
- `docs-site/assets/redesign/{tokens,shell,home,pages,components,footer}.css`
- `packages/debug-hub/src/ui.html`
- `scripts/lib/memory/genealogy-gui/index.html`
- `scripts/lib/execution/tui-ink/**`（16 个 tsx）
- `apps/shell/ui/src/app/globals.css`、`apps/shell/ui/src/app/layout.tsx`、`apps/shell/ui/src/app/(console)/**`、`apps/shell/ui/src/components/console/**`、`apps/shell/ui/src/components/ui/**`（当前唯一 Console 界面；`apps/shell/ui/src/lib/console-navigation.ts` 拥有路径与可读标签，`proxy.ts` 只做请求判定，不含视觉）

**不在范围内**（实测排除，每项都有理由，配置在 `config/design-contract/exclusions.json`）：

- 生成站点（`site/`、`blog-site/`）：7 个文件——改它们没有意义
- 一次性报告产物（`docs/reports/`）：2 个文件——判它等于把历史快照算成技术债
- 生成的模板 partial（`*/overrides/`）：16 个文件
- `video/`：16 个文件——Remotion 按帧渲染，证据是真渲染，不是样式表扫描

## Mode

**Restyle** —— 保留 `docs-site/` 的信息架构与 markdown 内容，只更新视觉语言。

`Reference` 曾是本文件最初的模式，参照对象是 Google Docs 官网/编辑器（2026-04-18 审阅）。**该参照已经失效**，见「规则与证据的矛盾」：实际发布出去的 token 与那次参照不是同一套语言。

## Assumptions

- **Goal** —— 让 `docs-site/` 读起来像一个专注的文档工作区，而不是品牌营销页。
- **Primary user** —— 读安装说明与工作流文档的工程师。
- **Platform** —— 桌面优先，移动端可读性不能退化；最小宽度 390px 必须复核。
- **Scope** —— 只管上面「适用范围」列出的路径；`video/` 与生成物另立契约。

## Evidence Snapshot

实测事实，不是形容词。每条都能在仓库里指回具体文件。

| token source | tokens | 主题 |
|---|---|---|
| `docs-site/assets/redesign/tokens.css` | 98（`--rex-*`）| light / dark / 跟随系统 |
| `docs-site/assets/redesign/home.css` | 7 | 否 |
| mkdocs 自身 token（`--md-*`）| 89 | 否 |

**Token 按角色分布**：

| role | count | example |
|---|---|---|
| code | 18 | `--md-code-fg-color` |
| text | 13 | `--rex-text: #0A0A0A` |
| space | 8 | `--rex-space-1: 0.2rem` |
| typeset | 8 | `--md-typeset-color` |
| shadow | 5 | `--rex-shadow-soft` |
| radius | 4 | `--rex-radius-sm: 8px` |

**字体族**：`--rex-font-display` = `"Space Grotesk", "Inter", system-ui`；`--rex-font-body` = `"Inter", system-ui`；`--rex-font-mono` = `"JetBrains Mono", ui-monospace`。

**主题块**（5 个）：`:root[data-rex-theme="light"]`、`:root[data-rex-theme="dark"]`、`:root:not([data-rex-theme="light"])`，以及后两者各自的 `body` 覆写。

**未走 token 的颜色**：111 处。集中在 `packages/debug-hub/src/ui.html`(42)、`scripts/lib/memory/genealogy-gui/index.html`(26)、`docs-site/assets/redesign/home.css`(19)、`shell.css`(14)。

## Visual System

按角色分组，每行指回一个真实 token。标「无 token」的角色是样式散在组件里，不是没有样式。

| role | count | example |
|---|---|---|
| bg | 8 | `--rex-bg` |
| text | 13 | `--rex-text: #0A0A0A` |
| accent | 1 | `--rex-accent: var(--rex-cyan)` |
| elev | 4 | `--rex-elev-0: none` |
| shadow | 5 | `--rex-shadow-soft: var(--rex-elev-3)` |
| panel | 9 | — |
| space | 8 | `--rex-space-1: 0.2rem` |
| radius | 4 | `--rex-radius-sm: 8px` |
| font | 4 | `--rex-font-display` |
| border | — | `_无 token_` |

**两套 token 并存是刻意的，但不是免费的**：`--md-*`（89 个）来自 mkdocs 主题，`--rex-*`（98 个）是本仓库改造层。`--rex-*` 只能覆盖 `--md-*`，不能替代它——删掉 `--md-*` 等于放弃 mkdocs 自带的深浅色切换。

**border 没有 token**：边框值散在 `shell.css`/`components.css` 里，这是遗留而不是设计。新增组件应引用 `--rex-*` 的边框色，不要继续写新字面量。

## Accessibility Baseline

四项，写成 reviewer 能检验的承诺：

- **对比度** —— 正文与背景 ≥ 4.5:1，大字 ≥ 3:1，light/dark 两个主题都要验。
- **焦点可见性** —— 所有可交互元素有可见焦点环，`outline` 不得为 `none` 而无替代。
- **减少动效** —— `@media (prefers-reduced-motion: reduce)` 下不得残留位移与无限循环；现状见 `MOTION.md` 基线的 8 条存量。
- **文本缩放** —— 200% 缩放不出现横向滚动条与内容裁切。

## 规则与证据的矛盾（自动检出）

- **本文件的 `Reference` 已与证据脱节**。第 23/25 行原本写「Google Sans / Roboto」「`#1a73e8`」，而实际发布的 token 是 `Space Grotesk / Inter`、`--rex-accent: #0066FF`。文档描述的语言和代码里的语言不是同一个——这是本文件最严重的一处问题，因为读者会相信文档而看不出界面为何「不像」。
- token 已建立（105 个 `--rex-*`）但仍有 111 处颜色字面量绕过它们。
- 动效曲线只有 1 种（`cubic-bezier(0.45,0,0.1,1)`），而时长有 8 档。单一曲线铺满全站会把层级压平——`MOTION.md` 明令禁止这条。
- 6 个文件有动效但没有 `prefers-reduced-motion` 块。

## 决策记录

- **Mode = Restyle，放弃 Google Docs 参照**。理由：实际 token 已经是 Space Grotesk + `#0066FF`，与 Google Docs 的 Google Sans + `#1a73e8` 是两套语言；继续声称参照它，只会让后来者按错误的目标改。被拒的选项：改成 Google Docs 那套（会把 `docs-site` 拉回「品牌营销页」的观感，与 Assumptions 的 Goal 冲突）。
- **主色唯一**：`--rex-accent: var(--rex-cyan)`，light 主题 `#0066FF`、dark 主题 `#22D3EE`。canary 语义：accent = 可操作，violet/green/orange/danger = 分类，不改状态含义。被拒的选项：多主色并列（会让用户无法从颜色读出「哪个能点」）。
- **演示层与产品层分家**：`docs-site/` 的营销页允许占位条与裁切出血；`debug-hub`、`genealogy-gui` 是产品页，占位条当正文即缺陷。被拒的选项：两层共用一套简化规则。
- **111 处颜色字面量的处置**：`debug-hub`(42) 与 `genealogy-gui`(26) 是独立界面，不强制收编进 `--rex-*`（它们是不同产品的视觉语言，硬收会造出一个不属于任何一边的第三套）；`docs-site/assets/redesign/` 下的 33 处（home/shell/components）必须收编，属于本契约范围内。被拒的选项：全部收编（`debug-hub` 的深色终端配色与 docs 的浅色文档配色不是同一目的）。
- **被拒的视觉方向**：等宽字体全站（`--rex-font-mono` 做正文）。理由：`docs-site` 是长文阅读场景，等宽降低阅读速度；等宽只留给代码块。
