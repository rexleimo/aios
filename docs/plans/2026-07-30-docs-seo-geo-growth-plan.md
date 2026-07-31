# Harness CLI 站点 SEO / GEO / 运营优化方案

> 版本基线：`VERSION` = 5.3.0 · 站点：`cli.rexai.top`（docs）+ `cli.rexai.top/blog/`（blog）
> 制定日期：2026-07-30

---

## 0. 现状盘点（已核实，非推测）

**已经做对的部分（不要重做）**

| 项 | 证据 |
| --- | --- |
| JSON-LD 结构化数据 6 类 | `docs-site/overrides/main.html:19-168`（Organization / WebSite / SoftwareApplication / WebPage / BreadcrumbList / BlogPosting） |
| OG + Twitter Card 完整 | `main.html:75-89` |
| GA4 已接入 | `main.html:11-18`（G-XGSX6C18TT） |
| `llms.txt` + `llms-full.txt` 已存在 | `docs-site/llms.txt`、`docs-site/llms-full.txt` |
| robots.txt 存在 | `docs-site/robots.txt` |
| 四语言全量翻译 | docs 27×4 = 108 页；blog 36×4 = 144 页 |
| 博客运行时已有 tag / 阅读时长 / 相关文章 / 分页 | `scripts/mkdocs_blog_content.py`（322+ 行 hook） |

**结论：基建不差，问题在"暴露面 + 内容命中 + 转化"三层，不在标签层。**

---

## 1. 诊断：已核实的 10 个缺口

### A. 技术暴露面（收录直接损失）

**A1 — 博客 144 个页面不在已声明 sitemap 里。**
`mkdocs.yml` 和 `mkdocs.blog.yml` 是两次独立构建（`pages.yml:45-49`），产出 `site/sitemap.xml`（仅 docs）和 `site/blog/sitemap.xml`（仅 blog）。`docs-site/robots.txt` 只声明了根 sitemap。
影响：整个博客靠爬虫自然发现，收录慢、深页面可能永不收录。**这是当前最大的单点损失。**

**A2 — 10 篇博客是孤儿页（× 4 语言 = 40 页）。**
不在 `mkdocs.blog.yml` nav 里：
```
2026-03-rexcli-skills-install-experience.md
2026-03-rexcli-windows-cost-tracking.md
2026-04-contextdb-lazy-load.md
2026-04-rexcli-ink-tui-refactor.md
2026-05-aios-memo-gui.md
2026-05-codemap-crg.md
2026-05-debug-hub-mcp.md
2026-05-model-router.md
2026-05-native-token-compression.md
2026-06-hermes-agent-aios-client.md
```
`mkdocs_blog_content.py:299` 的 `on_nav` 只遍历 `nav.pages`，nav 外的页面不进博客索引 → **0 内链**，但会进 sitemap。典型"被构建、被收录、无权重"。其中 `codemap-crg`、`model-router`、`debug-hub-mcp` 是差异化最强的题材，白扔。

**A3 — 全站 252 页共用 1 张 OG 图。**
`main.html:68` 硬编码 `og-cover.png`。`docs-requirements.txt` 只有 mkdocs / material 9.5.42 / static-i18n，未装 `mkdocs-material[imaging]`，无 social 插件。
影响：社媒/IM 分享缩略图全都一样 → 分享 CTR 低，且失去"每篇标题即卡片"的免费曝光。

**A4 — docs 页面无时间信号。**
未装 `mkdocs-git-revision-date-localized-plugin`。博客的 `datePublished` 和 `dateModified` 用同一个值（`main.html:159-160`），等于告诉搜索引擎"从未更新"。
影响：freshness 排名因子拿不到；GEO 场景下 AI 更倾向引用有明确更新日期的源。

**A5 — 无 RSS / 无 tag 页。**
博客 tag 只在前端运行时过滤，没有 `/blog/tags/contextdb/` 这类可索引 URL。也没有 RSS，无法被聚合器 / Feedly / Hacker News bot / 微信订阅号抓取。

### B. 内容命中（有流量的词一个没占）

**B1 — 5.3.0 零发布内容。**
博客最新 release 文是 v4.0.0（`2026-07-v400-adaptive-workflow-policy.md`）。5.0.0 / 5.3.0 只在 `docs-site/changelog.md` 里，且 changelog 是单页 28.8K，5.3.0 埋在里面。
影响：`harness cli 5.3`、`aios 5.3.0 changelog` 这类品牌+版本词无独立落地页；每次发版本该有的一波自然流量完全没接。

**B2 — `llms.txt` 内容停在 v4.0 时代**，`llms-full.txt` 特性列表最新只到 v1.50.1。AI 抓到的是过期版本画像。

**B3 — 首页 H1 无关键词。**
`docs-site/index.md:24-26`：`Same commands.` / `Now with a brain,` / `a team & self-diagnostics.`
文案有格调，但 H1 里没有 "AI coding agent" / "workflow" / "Claude Code" / "memory" 任一实体。title 和 description 写得好，H1 浪费了。

**B4 — 对比类页面太薄。**
`cli-comparison.md` 仅 3.9K。而实际搜索需求最大的就是 `claude code vs codex`、`codex cli memory`、`claude code 记忆` 这类比较/痛点词。目前没有针对性落地页。

### C. 转化（进来了不知道干什么）

**C1 — 首页首屏没有可复制的安装命令。**
`grep "npm i|npx|curl|iwr|install" docs-site/index.md` → 首屏无安装片段，只有跳转按钮 "Install in 30 seconds"。多一跳 = 掉一半。

**C2 — 首页 15.9K 手写 HTML + canvas 粒子动画**（`index.md:14`、`home-animation.js`）。首屏渲染成本高，移动端 LCP 风险；SEO 上 CWV 是排名因子。

---

## 2. P0：技术修复（1–2 天，直接换收录）

按投入产出排序，前三项半天能做完。

### P0-1 声明博客 sitemap（10 分钟，收益最大）
`docs-site/robots.txt` 加一行：
```
Sitemap: https://cli.rexai.top/sitemap.xml
Sitemap: https://cli.rexai.top/blog/sitemap.xml
```
进阶：在 `pages.yml` 两次 build 之后加一步，生成 `site/sitemap_index.xml` 索引两者，robots 只指向索引。

### P0-2 回收 10 篇孤儿文（30 分钟）
`mkdocs.blog.yml` nav 补齐 10 篇 + 补对应 `nav_translations`。同时给每篇正文加 2–3 条指向 docs 对应功能页的内链（`codemap-crg` → `/codemap/`，`model-router` → `/model-router/`，`debug-hub-mcp` → `/debug-hub/`）。

### P0-3 提交 sitemap 到搜索引擎（20 分钟）
- Google Search Console：验证 `cli.rexai.top`，提交两个 sitemap
- Bing Webmaster + **IndexNow**（Bing/Yandex 秒级收录，一个 API key 一个 ping 端点）
- 国内：百度站长 / 神马；`main.html` 需补各家 verification meta

### P0-4 装 social 插件，自动生成每页 OG 图（半天）
```
# docs-requirements.txt
mkdocs-material[imaging]==9.5.42
```
```yaml
# mkdocs.yml + mkdocs.blog.yml
plugins:
  - social:
      cards_layout_options:
        background_color: "#0b1220"
        color: "#ffffff"
```
然后把 `main.html:68` 的硬编码改成 `page.meta.image` 优先、`og-cover.png` 兜底。注意 CI 需要 `libcairo2-dev libfreetype6-dev`（`pages.yml` 加一步 apt）。

### P0-5 补时间信号（1 小时）
```
mkdocs-git-revision-date-localized-plugin
```
`pages.yml` 的 checkout 加 `fetch-depth: 0`（否则拿不到 git 历史）。`main.html` 的 `dateModified` 改用 `page.meta.git_revision_date_localized`，docs 页面也补 `TechArticle` + `dateModified`。

### P0-6 RSS + tag 页（半天）
```
mkdocs-rss-plugin
```
在 `docs-site/overrides/partials/rex/blog-footer.html` 补 `<link rel="alternate" type="application/rss+xml">`。tag 页可以用 `mkdocs_blog_content.py` 现有的 `build_tag_options()` 数据，扩一个 hook 生成 `/blog/tags/<tag>/` 静态页 + `ItemList` JSON-LD。

---

## 3. GEO：让 AI 答案引擎引用你

GEO 和 SEO 的差别：SEO 争排名，GEO 争**被引用为答案的出处**。AI 引用的偏好是：直接答案在前、有可验证数字、有明确日期、结构化问答。

### G1 每篇文档顶部加 "Answer Block"（最高杠杆）
在 H1 下、正文前，插 40–60 词的直接答案段。AI 抓取时优先取这一段。
模板：
```markdown
> **What it is:** ContextDB is Harness CLI's local project-memory store.
> **What it does:** Keeps cross-session context for codex / claude / gemini
> without sending project data to a server.
> **Who it's for:** Developers running multi-day agent tasks in one repo.
> **Verified on:** v5.3.0 · 2026-07-30
```
优先级页面：`index.md`、`contextdb.md`、`workflow-policy.md`、`token-compression.md`、`getting-started.md`、`codemap.md`、`model-router.md`。

### G2 补 FAQPage schema（AI + Google 富摘要双吃）
现在 6 类 JSON-LD 里没有 `FAQPage` / `HowTo`。
- `getting-started.md`、`windows-guide.md` → `HowTo`
- `troubleshooting.md`、`cli-comparison.md`、新建 FAQ 页 → `FAQPage`
- 各功能文档 → `TechArticle`

在 `main.html` 里按 `page.meta.schema_type` 分发即可，不用改 27 个文件的结构。

### G3 重写 `llms.txt` / `llms-full.txt`（必须做，已过期）
- 版本画像刷到 5.3.0
- Search Intents 段扩到 25–30 条，覆盖真实提问句式（不是关键词）：
  `how do I give Claude Code persistent memory`、`why does my coding agent forget context between sessions`、`codex cli multi agent setup`、`reduce token cost claude code`
- Blog 段补 5.x 文章
- 每条 URL 后加一句 8–15 词的用途说明（AI 靠这句决定要不要抓）
- 新增 `blog-site/llms.txt`，博客站独立索引

### G4 结论前置、数字可验证
AI 不引用"更快更好"，引用"token 用量从 X 降到 Y，在 Z 版本实测"。所有性能类文档补：具体数字 + 测量方法 + 版本号 + 日期。

---

## 4. 内容与信息架构（PM 视角）

### 核心问题：站点按"功能模块"组织，用户按"痛点"搜索。

现在 nav 的 Core Features 是 14 个内部概念名（ContextDB / Token Intelligence / Rex Workflow Migration / Perception / Workflow Policy…）。外部用户不搜这些词——他们搜"claude code 忘记上下文怎么办"。

### 4.1 建"问题入口层"（Problem-First 落地页，6 篇）

每篇独立 URL，标题就是搜索词，内容 1200–1800 词，结尾导向对应功能文档：

| 新页面 | 目标搜索意图 | 导向 |
| --- | --- | --- |
| `/why-agents-forget-context/` | AI agent 跨会话失忆 | ContextDB |
| `/reduce-agent-token-cost/` | 降低 Claude Code / Codex token 花费 | Token Intelligence |
| `/claude-code-vs-codex-vs-gemini/` | 三家 CLI 对比选型 | CLI Comparison（顺带把 3.9K 那页扩写） |
| `/overnight-agent-runs/` | 让 agent 跑一整夜不崩 | Solo Harness |
| `/multi-agent-code-review/` | 多 agent 协作做 code review | Agent Team |
| `/windows-ai-coding-agent-setup/` | Windows 上装 AI coding agent（低竞争高转化） | Windows Guide |

这 6 篇是**流量入口**，现有 27 篇 docs 是**留存内容**。现在只有后者。

### 4.2 拆 changelog，每个版本独立 URL

28.8K 单页 → `/releases/5.3.0/`、`/releases/5.0.0/`… 保留 `/changelog/` 作为索引页（列表 + 摘要 + 链接）。
理由：品牌+版本词（`harness cli 5.3.0`）有稳定长尾；单页塞不下也无法为每个版本单独排名。
加 `SoftwareApplication` + `softwareVersion` + `releaseNotes` schema。

### 4.3 建 `/whats-new/` 页
面向老用户，"你上次用的是 4.x？这里是变了什么"。同时是发版时对外发的那一个链接。

---

## 5. 落地页与转化（UI 视角）

### 5.1 首屏改造（优先级最高的 UI 动作）

现在：标语 → 副标语 → 两个按钮 → client chips → 右侧粒子动画。
问题：15.9K HTML + canvas，首屏没有安装命令，H1 无关键词。

改成：

```
┌──────────────────────────────────────────────────────────┐
│  [badge] LOCAL-FIRST AGENT LAYER · v5.3.0                │
│                                                          │
│  H1: Give your AI coding agent memory, a team,           │
│      and verification                                    │
│  H2: Same codex / claude / gemini commands.              │
│      Now with a brain.                                   │
│                                                          │
│  ┌────────────────────────────────────────┐  [Copy]      │
│  │ $ npm i -g @rexai/harness-cli && aios init │          │
│  └────────────────────────────────────────┘              │
│                                                          │
│  [Quick Start →]  [GitHub ★]                             │
│                                                          │
│  ✓ 6 clients  ✓ 4 languages  ✓ 100% local  ✓ MIT        │
└──────────────────────────────────────────────────────────┘
```

要点：
- **H1 带实体词**（AI coding agent / memory），把原标语降为 H2 —— 格调不丢，关键词拿到
- **首屏可复制安装命令 + Copy 按钮** —— 去掉一跳
- **版本号进 badge** —— 展示活跃度
- 粒子动画改 `IntersectionObserver` 懒启动 + `prefers-reduced-motion` 尊重 + 移动端降级为静态 SVG（保 LCP）

### 5.2 每篇文档页尾加统一"下一步"模块
现在文档结尾是断头路。加：相关文档 3 条 + 对应博客 1 条 + GitHub star CTA。可在 `docs-site/overrides/partials/rex/docs-page.html` 统一注入，改一处生效 108 页。

### 5.3 加 GitHub star 的可见钩子
README 有 badge，站点没有。header 放实时 star 数（`shields.io` 或 GH API 缓存），是最便宜的社会证明。

### 5.4 移动端与可访问性自查
252 页 × 手写 HTML，需跑一遍 Lighthouse：LCP / CLS / 对比度 / canvas 在低端机的表现。CWV 既是排名因子也是转化因子。

---

## 6. 运营与分发（Ops 视角）

### 核心问题：内容有 36 篇，分发动作是 0。

站点建好不等于运营起来。当前所有内容只在自己域名上，没有任何外部触点。

### 6.1 发版即内容（把 release 变成运营节奏）

每个 minor 版本固定产出（模板化，1.5 小时/次）：
1. `/releases/X.Y.Z/` 页面
2. 博客一篇：不是 changelog 复述，而是"这个版本解决了什么真实问题"
3. GitHub Release notes 指向该博客
4. `llms.txt` 刷新
5. 外部分发（下条）

5.3.0 已经错过，**建议现在补发一篇 5.x 综合文**：`Harness CLI 5.x: What Changed Since 4.0`，覆盖 5.0 Rex 迁移 + 5.3 Context Lifecycle，一篇顶三篇。

### 6.2 外部分发清单（每篇内容至少走 3 条）

| 渠道 | 适配内容 | 备注 |
| --- | --- | --- |
| Hacker News (Show HN) | 首发 / 大版本 | 一次机会，要用最强的一篇 |
| Reddit r/LocalLLaMA, r/ChatGPTCoding, r/ClaudeAI | 痛点文 | 先参与讨论再发链接，否则被 ban |
| dev.to / Hashnode | 技术长文（canonical 指回本站） | 反链 + 二次曝光 |
| X / Twitter | 每篇拆 5–7 条 thread | 配 social 插件生成的 OG 图 |
| 掘金 / 少数派 / V2EX | 中文内容（已有全量中文翻译，白拿） | 中文市场几乎无竞品 |
| 小红书 | 视觉化教程（repo 已有 `xhs-ops-methods` skill） | 触达非传统开发者 |
| awesome-lists PR | `awesome-claude-code`、`awesome-ai-agents`、`awesome-mcp` | 高质量反链，一次投入长期收益 |
| Product Hunt | 一次性大发布 | 建议攒到 6.0 |

**中文是被低估的资产**：36 篇博客 + 27 篇文档已全量中译，中文 AI coding agent 生态内容供给远小于英文。这是当前 ROI 最高的分发方向。

### 6.3 博客内容质量升级（针对"博客做得不好"）

现有 36 篇的问题不是写得差，是**同质**——大部分是 release note 体（"v1.52.0 Shell Output Compression"）。这种文只有已经是用户的人会看。

补三类：

**教程类（拉新，占比应最高）**
- 「用 Harness CLI 在一晚上重构一个 5 万行项目」——真实过程、真实失败、真实数字
- 「让 Claude Code 记住你的项目：ContextDB 30 分钟上手」
- 「Windows 上跑 AI coding agent 的 7 个坑」

**对比类（截需求流量）**
- 「Claude Code vs Codex vs Gemini CLI：2026 实测」——带 benchmark，不带立场
- 「Harness CLI vs mem0 vs Letta：agent 记忆方案怎么选」（`temp/competitor-repos/` 里已有 mem0 源码，可做实证对比）

**观点类（建立权威，AI 爱引用）**
- 「为什么 agent 需要工作流策略，而不是更大的 context window」
- 「Local-first 是 AI 编码工具的下一个默认值」

**每篇统一要求**：Answer Block 开头 / 可复制命令 / 至少一个真实数字 / 3 条内链 / 结尾 CTA / `dateModified` 准确。

### 6.4 版本发布 checklist（固化成文件）
建议落到 `docs/plans/release-content-checklist.md`，每次发版跑一遍，避免再出现"5.3.0 发了但站上没内容"。

---

## 7. 指标与验收

**技术层（GSC，2 周内可见）**
- 已收录页数：目标 252 页 ≥ 90%（当前博客 144 页大概率未收录）
- 有展示的查询词数
- CWV：LCP < 2.5s（移动端）

**内容层（4–8 周）**
- 品牌词展示量 / 点击量
- 6 篇 Problem-First 页的进入量占比
- 平均排名 < 20 的关键词数

**GEO 层（手动抽测，每两周一次）**
在 ChatGPT / Claude / Perplexity / Google AI Overviews 问 10 个固定问题（如 "how do I give Claude Code persistent memory"），记录：
- 是否被提及
- 是否被链接
- 描述是否准确（版本别说错）
这是 GEO 唯一可行的测量方式，没有现成工具，必须人工基线 + 复测。

**运营层**
- GitHub star 增速
- 外链域名数（Ahrefs 免费版或 GSC 链接报告）
- 各渠道引荐流量

---

## 8. 排期（4 周）

| 周 | 主题 | 交付 | 工时 |
| --- | --- | --- | --- |
| **W1** | 止血：技术暴露面 | P0-1..P0-6 全部；GSC + Bing + IndexNow 接入；`llms.txt` 刷到 5.3.0 | 2–3 天 |
| **W2** | GEO + 版本内容 | 7 篇核心文档加 Answer Block；FAQPage/HowTo/TechArticle schema；拆 changelog 为 `/releases/*`；补发 5.x 综合博客 | 3–4 天 |
| **W3** | 入口层 + 首屏 | 6 篇 Problem-First 页（可分批）；首页首屏改造（H1 + 安装命令 + 动画懒加载）；文档页尾"下一步"模块 | 4–5 天 |
| **W4** | 分发 + 固化 | awesome-list PR ×3；dev.to / 掘金 / V2EX 同步；X thread；release checklist 落文件；跑第一轮 GEO 基线抽测 | 2–3 天 |

**如果只有一天：** P0-1（sitemap 声明）+ P0-2（孤儿文回收）+ 重写 `llms.txt`。这三件事投入最小、直接换收录。

---

## 9. 需要人工决策的点

1. **6.0 是否攒 Product Hunt / Show HN** —— 一次性大发布 vs 持续小发布，影响 W4 的资源分配
2. **中文渠道投入比例** —— 中文竞争小但天花板也低；建议 40% 精力，需确认
3. **首页动画是否保留** —— 视觉资产 vs LCP，建议保留但懒加载 + 移动端降级
4. **benchmark 对比文的立场** —— 与 mem0 / Letta 做实证对比有争议风险，需确认口径
