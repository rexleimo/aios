# Documentation Interface Design Contract

> 只管视觉语言（配色、字体、间距、组件形态）与 `docs-site` 这一个目标。
> 时间轴上的事实（时长、曲线、进出场、循环接缝、光标、减少动效）在 [`MOTION.md`](MOTION.md)，两个 owner 分离是刻意的。

## 先分清你在做哪一种界面

三条路的产物、依赖和门槛完全不同，选错会做出一个“看起来像”但用不了的东西：

| 任务 | 产物 | 用什么 |
|---|---|---|
| **本仓库的真实产品界面**（`docs-site/`、`debug-hub/`、`genealogy-gui/`） | 能跑、能维护的产品页 | 本文件的视觉语言 + `MOTION.md` + 本仓库自己的 CSS。**没有 React，不要写 kit 导入** |
| **给宿主项目的产品插图**（营销 hero、功能卡、docs 配图、带光标的假窗口/手机演示） | 一张静帧或一段 10–16 秒的循环 | 上游 `stageshow` 技能：`npx skills add benjitaylor/skills --skill stageshow`。它有 kit、69 个 gold 范例和 film 工具链，**流程是「复制最接近的范例」而不是从零写 stage** |
| **纯视觉规范**（配色/字体/间距的基线） | `DESIGN.md` 本身 | `awesome-design-md`，本文件就是它的产物 |

第二行是独立技能，不在本仓库：它带 118 个 tsx 文件和 react/react-dom/lucide-react，是**复制进宿主项目**的东西。本仓库只保留它的**判据**（`vendor/stageshow/references/`）和**验证内核**（拍帧），因为这两样与具体框架无关。

## Mode
- `Restyle`: Keep information architecture and markdown content unchanged; update visual language only.
- `Reference`: Google Docs official website/editor visual language (reviewed on 2026-04-18).

## Evidence Snapshot
- Official Google Docs about page typography stack includes `Google Sans`, `Google Sans Text`, and `Roboto`.
- Official visuals are predominantly light surfaces (`~#fefefe`) with restrained neutral grays and blue primary accents.
- Primary action and active states consistently center on Google blue (`#1a73e8` / `#185abc` range).

## Assumptions
- `Goal`: Make docs-site feel like a focused document workspace, not a brand-heavy marketing page.
- `Primary user`: Engineers reading setup and workflow documentation.
- `Platform`: Web desktop first, with strong mobile readability.
- `Scope`: `docs-site` style refresh only (`docs-site/assets/custom.css`).

## No-Design-Draft Decisions
- `Audience`: Prosumer + engineering teams
- `Tone`: Minimal productivity
- `Density`: Balanced (slightly compact)
- `Contrast`: Medium
- `Motion`: Subtle
- `Memorable element`: Paper-like reading canvas with quiet Google-blue interaction highlights

## Visual System
- Typography:
  - UI headings/navigation: `Google Sans` / `Google Sans Text`
  - Body: `Google Sans Text` / `Roboto`
  - Code: `Roboto Mono`
- Color roles:
  - Background: cool neutral gray (`#f8f9fa` family)
  - Surface: white (`#ffffff`)
  - Text: near-black neutral (`#202124`) with muted secondary (`#5f6368`)
  - Border: subtle gray (`#dadce0`)
  - Primary accent: Google blue (`#1a73e8`, hover/active `#185abc`)
- Components:
  - Header and tabs stay white with thin separators
  - Reading area is a paper-like card with minimal shadow
  - Sidebar nav uses low-emphasis hover/active fills in light blue
  - Buttons follow Google-style pill controls (soft + primary)
  - Tables/code/admonitions use quiet gray surfaces and thin borders
- Motion:
  - Transition only on color/background/border
  - No decorative glows/sweeps/large transforms

## Accessibility Baseline
- Keep visible keyboard focus rings.
- Maintain AA-friendly text/background contrast.
- Ensure touch targets remain comfortable on mobile.
- Preserve clear active-state distinction in navigation and links.
