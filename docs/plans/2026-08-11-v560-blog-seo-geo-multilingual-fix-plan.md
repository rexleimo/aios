# v5.6.0 aios work 发布博客 + 多语言修复 + 关联更新计划

> **For agentic workers:** 内容批次分三步：博客发布 → 文档关联更新 → 契约验证。步骤使用 checkbox（`- [ ]`）语法跟踪。

**Goal:** 为 v5.6.0 `aios work`（并发多 Agent 调度入口）发布 SEO/GEO 流量博客（4 语言），修复博客多语言滞后（ja/ko 缺 3 篇 08 系列），并同步关联站点内容（changelog / team-ops / route-concurrency-profiles）。

**Diagnosis（多语言"看起来没有"的根因）：**

- i18n 已正确配置：`mkdocs.blog.yml` / `mkdocs.yml` 均启用 `static-i18n`（`docs_structure: folder`，en/zh/ja/ko 四语言 + alternate 链接）。
- `blog-site/zh/` 与英文根**全量对齐**（46/46）；`blog-site/ja|ko/` 各缺 3 篇最新 08 系列：`2026-08-ai-agent-security`、`2026-08-ai-coding-cost-crisis`、`2026-08-parallel-coding-agents`。
- `check-site-sync.mjs` 只强制 4 篇核心帖全语种存在 + 索引核心链接 + 语言不漂移；**不强制全量帖子翻译**，所以滞后可长期存在——这是"新内容只有英文"的制度性原因。
- `docs-site/ja|ko/` 另缺 6 篇非 P0 页面（`claude-code-vs-codex-vs-gemini`、`multi-agent-code-review`、`overnight-agent-runs`、`reduce-agent-token-cost`、`why-agents-forget-context`、`windows-ai-coding-agent-setup`）——不在本批范围，立 follow-up。

**Tech Stack:** Markdown + static-i18n（mkdocs）、`node scripts/check-site-sync.mjs`、`node --test scripts/tests/public-content-contract.test.mjs`、`.venv-docs` 构建。

---

## 非目标

- 不修改 i18n 插件配置（配置正确）。
- 不做 docs ja/ko 6 篇非 P0 补译（单独批次）。
- 不重写既有帖子内容，只做翻译/新增/索引更新。

## PR Boundaries

| PR | Slice | 验证 |
|---|---|---|
| PR-1 | 新帖 `2026-08-v560-aios-work-concurrent-dispatch.md` ×4 语言 + 4 个博客索引 + mkdocs.blog.yml nav | 链接可解析、索引含新帖 |
| PR-2 | ja/ko 补译 3 篇 08 帖子（6 文件）+ ja/ko 索引补链 | 全量博客语种对齐 |
| PR-3 | docs 关联更新：changelog / team-ops / route-concurrency-profiles ×4 语言 | 契约测试 + 构建 |

## PR-1: v5.6.0 aios work 发布博客（SEO/GEO）

**Goal:** 英文主帖骑乘热门关键词（parallel coding agents / multi-agent orchestration / concurrent agent dispatch / AI agent team / speed up AI coding），zh/ja/ko 同步翻译；全索引 + 导航可见。

**Files:**

- Create: `blog-site/2026-08-v560-aios-work-concurrent-dispatch.md`
- Create: `blog-site/zh/2026-08-v560-aios-work-concurrent-dispatch.md`
- Create: `blog-site/ja/2026-08-v560-aios-work-concurrent-dispatch.md`
- Create: `blog-site/ko/2026-08-v560-aios-work-concurrent-dispatch.md`
- Modify: `blog-site/index.md`、`blog-site/zh/index.md`、`blog-site/ja/index.md`、`blog-site/ko/index.md`（Latest 顶部加新帖）
- Modify: `mkdocs.blog.yml`（Posts nav 顶部加 v5.6.0 条目）

**Tasks:**

- [ ] **Step 1: 主帖（EN）** 遵循 `seo-geo-page-optimization` 方法：frontmatter（title/description/date/tags）、H1-H2 关键词结构、GEO 友好（AI 可摘录的定义句）、真实命令示例（`aios work --task "..."` / `--serial` / `--dry-run` / `--concurrency`）、链接 `orchestrate-live.md` / `2026-08-parallel-coding-agents.md` / docs。
- [ ] **Step 2: zh/ja/ko 翻译** 保持 frontmatter 字段、代码块、链接目标不变；本地相对链接保持同语言文件（帖子内链接用相对路径，跨语言用 `/blog/<locale>/...` 或站点 URL）。
- [ ] **Step 3: 索引更新** 4 个 `index.md` 的 Latest 列表顶部插入新帖条目（标题翻译 + 相对链接）。
- [ ] **Step 4: nav 更新** `mkdocs.blog.yml` Posts 顶部加 `v5.6.0 Concurrent Agent Dispatch: 2026-08-v560-aios-work-concurrent-dispatch.md`（博客 nav 标签无需 nav_translations——checker 只校验 mkdocs.yml 的 docs nav）。
- [ ] **Step 5: 验证** `node scripts/check-site-sync.mjs` 全绿；本地链接均指向存在的 4 语言文件。

## PR-2: ja/ko 补译 3 篇 08 帖子

**Goal:** 博客全量语种对齐（46/46 × 4），消除"最新内容只有英文"。

**Files:**

- Create: `blog-site/ja/2026-08-ai-agent-security.md`、`blog-site/ja/2026-08-ai-coding-cost-crisis.md`、`blog-site/ja/2026-08-parallel-coding-agents.md`
- Create: `blog-site/ko/2026-08-ai-agent-security.md`、`blog-site/ko/2026-08-ai-coding-cost-crisis.md`、`blog-site/ko/2026-08-parallel-coding-agents.md`
- Modify: `blog-site/ja/index.md`、`blog-site/ko/index.md`（Latest 列表补 3 帖，位置与 en/zh 索引一致）

**Tasks:**

- [ ] **Step 1:** 以英文根帖为源（zh 版为交叉参考），翻译 6 文件；frontmatter 字段/链接/代码块保持不动。
- [ ] **Step 2:** ja/ko 索引 Latest 列表补 3 帖链接（与根/zh 索引顺序一致）。
- [ ] **Step 3:** `node scripts/check-site-sync.mjs` 全绿。

## PR-3: docs 关联更新（aios work 提及 + changelog）

**Goal:** 站点文档与 v5.6.0 同步：changelog 补条目，team-ops / route-concurrency-profiles 提及 `aios work` 默认并发入口。

**Files:**

- Modify: `docs-site/changelog.md` + `zh/ja/ko/changelog.md`（顶部补 5.6.0 条目，与仓库 CHANGELOG.md 对齐）
- Modify: `docs-site/team-ops.md` + 3 语言（团队/并发执行段落加 `aios work` 快捷入口）
- Modify: `docs-site/route-concurrency-profiles.md` + 3 语言（并发档位说明加 `aios work` 默认并发 3 / `--serial`）

**Tasks:**

- [ ] **Step 1:** changelog ×4 补 5.6.0（feat: aios work concurrent multi-agent dispatch entry）。
- [ ] **Step 2:** team-ops ×4 与 route-concurrency-profiles ×4 加 `aios work` 引用（保持各语言本地链接不漂移）。
- [ ] **Step 3:** 契约验证：`node scripts/check-site-sync.mjs`、`node --test scripts/tests/public-content-contract.test.mjs`、`npm run test:check-site-sync`。

## Final Verification Gate

- [ ] `node scripts/check-site-sync.mjs` → OK
- [ ] `node --test scripts/tests/public-content-contract.test.mjs`
- [ ] `npm run test:check-site-sync`
- [ ] 全量帖数对比：root=zh=ja=ko（blog 46/46×4）
- [ ] `.venv-docs` 构建验证（mkdocs build blog + docs，若可用）
- [ ] `git status` 变更集检查 → 提交建议：`feat(site): publish v5.6.0 aios work blog (4 locales), backfill ja/ko, sync docs`

## Follow-up（本批不做）

- docs-site ja/ko 6 篇非 P0 页面补译（`claude-code-vs-codex-vs-gemini` 等 6 篇 ×2 语言 = 12 文件），另立批次。

## 执行偏差记录（已批准）

- **PR-2 扩围——存量 locale 漂移修复**：`check-site-sync` 首次运行即红（48 处 `locale link drops language`，含未触碰的存量 zh v541/v543 帖子）。根因：locale 帖内 `https://cli.rexai.top/<path>` 未加 locale 前缀。已对 18 个文件做机械 URL 替换（blog 路径 → `/blog/<locale>/`，站点路径 → `/<locale>/`，BOM 已剥离），check-site-sync 转绿。
- **测试基建修复（存量 Windows bug）**：`public-content-contract.test.mjs` 在本机不可运行——`new URL().pathname` 在 Windows 产生 `E:\E:\` 双盘符路径；且 frontmatter 正则不兼容 autocrlf 的 CRLF 工作树。已修（`fileURLToPath` + `\r\n` 归一化），7/7 转绿。
- **PR-3 扩围——use-cases ×4**：命令选择页 Quick Answer 补 `aios work`（与 team-ops/route-concurrency 同步），确保"按场景找命令"入口一致。
- **验证结果**：check-site-sync OK；contract+sync 测试 15/15；博客 47/47×4 全语种对齐；mkdocs 构建未跑（环境限制，以 check-site-sync 链接解析作为内容门禁）。

## Self-Review Notes

- 翻译只新增文件，不改既有内容，最小风险。
- 新帖英文为主帖（canonical），zh/ja/ko 为翻译；避免 en 之外的帖子被当成 canonical 引入重复内容问题——沿用仓库既有惯例（各语言独立文件 + static-i18n alternate）。
- 不触碰 i18n 配置与站点构建脚本；验证只依赖仓库既有契约脚本。
- 漂移修复采用一次性脚本（temp 目录），已完成使命，不进入仓库。
