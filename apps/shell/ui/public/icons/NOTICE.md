# Icon attribution

Client brand icons are copied verbatim from magpie
(https://github.com/yetone/magpie, `internal/gui/assets/icons/`, MIT License),
except Hermes which comes from its own project (see the note below). magpie's license:

Copyright (c) 2026 yetone

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of the Software.

# 文件名 → magpie 官方源文件（本地统一用客户端 id 命名，源文件用 magpie 的命名）

| 本地文件 | magpie 官方源文件 |
|---|---|
| claude.svg | claudecode-color.svg |
| codex.svg | codex-color.svg |
| gemini.svg | geminicli-color.svg |
| grok.svg | grok.svg |
| workbuddy.svg | workbuddy-color.svg |
| hermes.svg | Hermes Agent 官方 `assets/icon-master-dark.svg`（见下） |
| opencode.svg | opencode.svg |
| pi.svg | pi.svg |
| qoder.svg | qoder.svg |
| zcode.png | zcode.png |
| cursor.svg | cursor.svg |

说明：带 `-color` 的源文件是彩色品牌图标；不带的（grok/opencode/pi/qoder/cursor）
是 `fill="currentColor"` 单色图标，magpie 自身即如此。全部为原文件拷贝，未手工绘制或修改。

**Hermes 例外**：magpie 自带的 `hermes.svg` 只是字母 "H" 的通用占位，不是 Hermes 官方品牌标识。
`hermes.svg` 改为从 Hermes Agent 官方仓库
（https://github.com/NousResearch/hermes-agent, `assets/icon-master-dark.svg`, MIT License,
Copyright 2025 Nous Research）原样拷贝的官方图标（浅色主题版）；未手工修改。
