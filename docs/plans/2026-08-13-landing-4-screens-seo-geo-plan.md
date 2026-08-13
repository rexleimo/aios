# 落地计划：四个已确认设计稿 + SEO/GEO 优化

日期：2026-08-13
状态：✅ 已完成（2026-08-14，8 批次全部落地并验证）

## 1. 目标与范围

把已确认的 4 个 Pencil 设计稿落地到真实站点（`docs-site` + `blog-site`，MkDocs Material），
浅色为主 + 暗黑模式双主题，SEO/GEO 优化贯穿始终。

| 设计稿 | 帧 ID | 落地点 | 说明 |
|---|---|---|---|
| 首页 v8 | `ZIK3q` | `docs-site/zh/index.md` + `home.css`（及 en/ja/ko 镜像） | 图片已确认 |
| 文档页 v9 | `csK3H` | `docs-page.html` + `pages.css`/`shell.css` | 顶栏+侧栏+正文+TOC |
| 博客列表 v10 | `fHfcB` | `blog-index.html` + `blog-*.css` | 顶部广告位+等高卡片+中部双广告位 |
| 博客详情 v11 | `juPx4` | `blog-post.html` + `blog-post.css` | 文章布局+正文内嵌广告+相关阅读 |

## 2. 确认资产

### 2.1 图片（首页已确认）
| 用途 | 路径 | 尺寸 |
|---|---|---|
| Hero 通栏展示 | `generated/rexai-aios-v7/hero2/rexai-1.png` | 1536×768 (2:1) |
| Hero 竖版人像 | `generated/rexai-aios-v7/hero-portrait/rexai-1.png` | 1254×1254 (1:1) |
| 特性带 Team | `generated/rexai-aios-v7/team2/rexai-1.png` | 1536×1024 (1.5:1) |
| 特性带 Doctor | `generated/rexai-aios-v7/doctor2/rexai-1.png` | 1536×1024 (1.5:1) |
| 广告 imklom | `blog-site/assets/ads/imklom.png`（已就位） | 1536×1024 |
| 广告 relay | `blog-site/assets/ads/relay.png`（已就位） | 1536×1024 |
| OG 封面 | `assets/og-cover.png`（需更新为新视觉） | 1200×630 |

首页图复制到 `docs-site/assets/` 下供引用（如 `assets/home/hero2.png` 等）。

### 2.2 色板（双主题）
- 浅色（v8）：bg `#FFFFFF`，text `#0A0A0A`，secondary `#5B6573`，weak `#98A2B3`，hairline `#EAECEF`，surface `#F6F8FA`，accent `#0066FF`。
- 暗黑（v7）：bg `#06070D`，text `#F8FAFC`，secondary `#A8B6C9`，weak `#6B7689`，border `#1B2437`，surface `#0D1220`，accent `#22D3EE`。
- 全部走 CSS 变量（`--rex-*`），一套结构两套取值，暗黑经 `prefers-color-scheme` + 手动切换器。

## 3. 实施批次（依赖排序）

### Batch 1：令牌 + 壳层
- `tokens.css` 补全浅/暗双主题变量；字体（Space Grotesk / Inter / JetBrains Mono）预加载不变。
- `topbar.html` / `shell.css` 对齐新导航：Capabilities、Demo、Docs、Blog、Changelog、Friends + 语言下拉（保留现有 `<details>` 下拉，样式对齐浅色）+ GitHub star + Get Started CTA。
- 复制首页 4 图到 `docs-site/assets/home/`。

### Batch 2：首页（ZIK3q）
- 重构 `docs-site/zh/index.md`（+ en 镜像）为 v8 结构：Hero（标题/副文案/CTA/安装片段 + 人像图右侧 + 通栏 hero2 展示图）、Logo 墙（客户端名）、Team 特性带（图左文右）、Verification 特性带（文左图右）、Run 层 2×2（ContextDB / Adaptive / Agent Team / Verification）、全宽安装块、博客列表 3 条、CTA、页脚。
- `home.css` 新增 v8 区块类（`rex-hero*`、`rex-band*`、`rex-run*`、`rex-install*`、`rex-bloglist*`、`rex-cta*`）。
- 保留 `main.html` 全部 JSON-LD 与 meta 逻辑（Organization/WebSite/SoftwareApplication/WebPage/BreadcrumbList），不删除任何 SEO 代码。

### Batch 3：文档页（csK3H）
- `docs-page.html` + `pages.css`/`shell.css` 对齐：顶栏（logo+搜索+导航+语言下拉+CTA）、左侧栏（入门/能力/指南/参考 分组）、正文（面包屑、H1、meta、代码块、callout、上/下一篇）、右侧 TOC、页脚。

### Batch 4：博客列表（fHfcB）
- `blog-index.html` + `blog-*.css` 对齐 v10：顶部通栏广告位（imklom）、Hero（badge/标题/副文案/标签 pills）、精选文章、等高文章卡（固定高）、中部双广告位（imklom + relay）、分页。
- 把此前越权做的临时改动（广告位结构、去 SVG 语言开关、博客翻浅色）并入本批统一收口。
- 图片路径用 `{{ config.site_url }}assets/ads/*.png`，四语言（en/zh/ja/ko）可用。

### Batch 5：博客详情（juPx4）
- `blog-post.html` + `blog-post.css` 对齐 v11：分类/大标题/元信息/Hero、正文段落、代码块（深色卡）、callout、正文内嵌广告位（relay）、相关阅读、页脚。
- `BlogPosting` JSON-LD 已有，保留。

### Batch 6：暗黑模式对齐
- 双主题变量切换验证；对比度（text vs bg）检查；图片在暗色下的表现（产品图本身偏深色，浅色下已成立；暗色下确认不糊）。

### Batch 7：SEO/GEO 强化
- 每页 meta description 唯一；OG/Twitter 图（og-cover 新视觉）；canonical + hreflang 校验（已实现，回归确认）。
- GEO：首页加"AIOS 是什么"定义段 + FAQ schema；每篇博客加 FAQ/HowTo/TechArticle schema（模板已支持）；内容用可被 AI 引用的一句话结论（definitional one-liners）；更新 `/llms.txt`；表格/列表语义化。
- 保持 h1 唯一、标题层级正确、语义 HTML5。

### Batch 8：验证
- 安装 `mkdocs-material` + `mkdocs-static-i18n`（构建验证前置）。
- `mkdocs build -f mkdocs.yml` 与 `mkdocs build -f mkdocs.blog.yml` 零错误；4 页全部渲染；无 404 资源；i18n 四语言抽查；链接检查；浏览器肉眼回归（首页/文档/博客列表/详情）。

## 4. 验证证据清单
- [x] 两个 mkdocs 构建成功（无 warning/error，仅 social 插件缺 cairosvg 警告）
- [x] 4 页面 HTML 输出存在且结构匹配设计稿（浏览器肉眼回归：首页/文档/博客列表/详情，浅色+暗黑）
- [x] JSON-LD 完整（Organization/WebSite/SoftwareApplication/WebPage/BreadcrumbList/BlogPosting/FAQPage）
- [x] 每页唯一 meta description + OG/Twitter（og-cover 1200×630 新视觉）
- [x] hreflang/canonical 无重复冲突
- [x] 浅色+暗黑双主题均可读（手动切换器 + prefers-color-scheme + localStorage 持久化）
- [x] 广告位 3 处（顶部通栏 imklom / 中部双广告 imklom+relay / 详情内嵌 relay）渲染且链接正确
- [x] llms.txt 更新且可达（v5.6.1 + One-Line Definition + 首页 FAQ schema）

## 5. 交付记录（2026-08-14）
- Batch 1 `dac60282` 双主题令牌 + 壳层 token 化 + 首页图复制
- Batch 2 `6ce2e8ef` 首页 v8（en+zh）
- Batch 3 `1796b76b` 文档页 v9（topbar + pager）
- Batch 4 `4985f266` 博客列表 v10（浅色 + 广告位收口）
- Batch 5 `22471a4a` 博客详情 v11（内嵌广告）
- Batch 6 `3ecd5c6f` 暗黑手动切换器
- Batch 7 `5a97294b` SEO/GEO（og-cover/FAQ schema/llms.txt）+ `fix` YAML 引号修复（en frontmatter 解析）
- 已知非阻塞项：home.css 旧 v7 死代码（index.md 已弃用，不影响渲染）；单篇博客缺 BlogPosting（非本计划范围）；social 插件 cairosvg 可选安装

## 5. 依赖与假设
- `mkdocs` 未安装 → Batch 8 前需安装（环境变更，已获用户同意继续）。
- 广告链接假设：imklom → `https://imklom.im`；relay → `https://tool.rexai.top`（待最终确认）。
- `og-cover.png` 需用新视觉重新生成/替换。
- 语言切换器保持 `<details>` 下拉（真实站点现状），仅样式对齐。

## 6. 回退与提交
- 每批次独立 Conventional Commit（`feat(docs-site): ...` / `feat(blog-site): ...`），可单批回退。
- 不手改 `mcp-server/dist/`；不提交凭据/隐私数据。
