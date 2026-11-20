# AIOS brand assets

AIOS 的品牌图形与桌面图标源图。所有 PNG 由 GPT Image 2（经 RexAI `gpt-image-2`）生成，
2026-11-20 定稿；不是 SVG，也不是手绘。

## 现行 logo：扁平化的「记忆核心」生物

`aios-mark-flat.png` —— 把最初的 3D 吉祥物**扁平化**后的版本：一只微笑的青色软胶生物在
玻璃罩里，周围是记忆晶体（碎片）与证据盾牌（对勾）。用纯色填充 + 简洁几何重画，匹配 UI
里那套 24×24 扁平图标的风格（Claude / OpenAI 那种），无渐变无光泽无 3D，缩到小尺寸仍
保留角色辨识度。

含义（沿用吉祥物设定）：
- **玻璃罩 / 本地容器** —— 数据留在你的机器上；
- **发光核心生物 / 跨会话记忆** —— 记忆在会话之间延续；
- **证据盾牌 / 可验证证据** —— 每次改动都有 evidence envelope。

配色只有两色：青 `#22D3EE` / 近黑 `#06070D`，白色用于眼睛和对勾，克制、工程师向。

## 两张源图的分工

- `aios-mark-flat.png` —— **带深底圆角方块**的 app icon 源图。给安装包 / 窗口 / favicon
  之外的“应用级图标”用；macOS 会对 `.app` bundle 自动套 squircle 圆角矩形。
- `aios-mark-transparent.png` —— **透明底**的同款吉祥物（chroma key 抠掉品红背景）。
  给 UI 顶栏这类“叠加在面板上”的场景用，不会出现黑方块。

## 桌面图标

由 `aios-mark-flat.png`（带底版）派生，落在 `apps/shell/src-tauri/icons/`：

| 文件 | 用途 |
| --- | --- |
| `16x16.png` / `32x32.png` | Windows 小图标 / Tauri 默认 |
| `128x128.png` / `128x128@2x.png` | Linux / 高分屏 |
| `256x256.png` / `512x512.png` | 商店 / 安装器 |
| `icon.ico` | Windows（内嵌 6 个尺寸） |
| `icon.icns` | macOS |

UI 顶栏（`apps/shell/ui/public/aios-mark.png`）与 favicon（`apps/shell/ui/src/app/icon.png`）
用同源图。所有派生 PNG 均为 RGBA——Tauri 的 `generate_context!()` 拒绝非 RGBA 图标。

所有图标都是**不签名**的（S2-3 已知边界）。

## 历史（legacy，不再用于产品）

- `legacy/aios-mascot.png` / `legacy/aios-app-icon.png`：第一版的 3D 发光软胶吉祥物
  （「胶囊里的记忆核心生物」）。用户反馈过于复杂，扁平化后成为上面的现行 logo；
  这两张原图保留作风格参考。
- `ref-square-legacy.png` / `ref-circle-legacy.png`：更早仓库里并存的两套旧 logo 参考
  （主站方块标志 / 文档站薄荷绿圆形 A），仅作溯源。

## 重新生成

源图约 1024×1024。派生的图标在 `temp/logo-gen/` 的一次性构建里用 Pillow + `iconutil`
产出；如需改动，先改源图，再重新派生全套尺寸并覆盖 `apps/shell/src-tauri/icons/` 与 UI 资产。
