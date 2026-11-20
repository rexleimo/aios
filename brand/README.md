# AIOS brand assets

AIOS 的品牌 IP 与桌面图标源图。所有 PNG 由 GPT Image 2（经 RexAI `gpt-image-2`）生成，
2026-11-20 定稿；不是 SVG，也不是手绘。

## 角色：胶囊里的「记忆核心」生物

`aios-mascot.png` —— 一只住在透明玻璃数据舱里的青色发光软胶生物，身边漂浮着记忆碎片
（蓝色多面体）与证据盾徽（对勾）。它把 AIOS 的三件事画成了一个角色：

- **透明舱 / 本地容器** —— 数据留在你的机器上，不出本机；
- **发光核心 / 跨会话记忆** —— 项目记忆在会话之间延续；
- **证据盾徽 / 可验证证据** —— 每次改动都有 evidence envelope，不是口头保证。

调性：青 `#22D3EE` + 近黑 `#06070D`，克制、工程师向，不萌系、不幼稚。

## 桌面图标

`aios-app-icon.png` —— 同一角色收进发光圆角方块轮廓，保证缩到 32×32 仍能辨认（大眼 +
舱体 + 证据角）。真正的多平台图标由它派生，落在 `apps/shell/src-tauri/icons/`：

| 文件 | 用途 |
| --- | --- |
| `16x16.png` / `32x32.png` | Windows 小图标 / Tauri 默认 |
| `128x128.png` / `128x128@2x.png` | Linux / 高分屏 |
| `256x256.png` / `512x512.png` | 商店 / 安装器 |
| `icon.ico` | Windows（内嵌 6 个尺寸） |
| `icon.icns` | macOS |

`ref-square-legacy.png` / `ref-circle-legacy.png` 是定稿前仓库里并存的两套旧 logo 参考
（主站方块标志 / 文档站薄荷绿圆形 A），仅作溯源保留，不再用于产品。

## 重新生成

源图尺寸 1024×1024。派生的图标在 `temp/logo-gen/` 的一次性构建里用 `sips` + `iconutil`
产出；如需改动，先改源图，再重新派生全套尺寸并覆盖 `apps/shell/src-tauri/icons/`。
