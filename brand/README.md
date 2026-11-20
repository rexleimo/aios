# AIOS brand assets

AIOS 的品牌图形与桌面图标源图。所有 PNG 由 GPT Image 2（经 RexAI `gpt-image-2`）生成，
2026-11-20 定稿；不是 SVG，也不是手绘。

## 现行 logo：扁平几何符号

`aios-mark-flat.png` —— 一枚青色六瓣花结 / 星芒符号，深底纯色、完全对称、无渐变无光泽无
3D 质感。走的是 Claude 星芒 / OpenAI 花结那种大厂扁平路线，缩到 16×16 仍可辨。

含义：六瓣从中心环交叠，像「一个核心 + 向外的连接」——对应 AIOS 作为本地控制平面，把
记忆、多 agent、验证收束在一处。配色只有两色：青 `#22D3EE` / 近黑 `#06070D`，克制、
工程师向。

## 桌面图标

由 `aios-mark-flat.png` 派生，落在 `apps/shell/src-tauri/icons/`：

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
  （「胶囊里的记忆核心生物」）。用户反馈过于复杂，改为上面的扁平几何符号。
- `ref-square-legacy.png` / `ref-circle-legacy.png`：更早仓库里并存的两套旧 logo 参考
  （主站方块标志 / 文档站薄荷绿圆形 A），仅作溯源。

## 重新生成

源图约 1024×1024。派生的图标在 `temp/logo-gen/` 的一次性构建里用 Pillow + `iconutil`
产出；如需改动，先改源图，再重新派生全套尺寸并覆盖 `apps/shell/src-tauri/icons/` 与 UI 资产。
