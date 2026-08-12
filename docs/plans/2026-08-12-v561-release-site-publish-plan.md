# v5.6.1 发布收尾：站点发布批次（博客 ×4 + changelog ×4 + 索引/nav）

> **For agentic workers:** 内容批次分三步：博客发布 → 文档 changelog 同步 → 契约验证。步骤使用 checkbox（`- [ ]`）语法跟踪。

**Goal:** 完成 v5.6.1 站点发布收尾——为 `aios work` plan-driven decomposition + `aios-work-dispatch` skill 发布 SEO/GEO 博客（4 语言），同步 docs changelog（4 语言），更新博客索引与 nav。v5.6.1 代码/认证/版本（VERSION=5.6.1，CHANGELOG 条目，git tag v5.6.1）均已完成，只缺站点面。

**Diagnosis（现状）：**

- v5.6.1 tag 已存在（`git tag -l` 首位）；仓库 CHANGELOG 已有 [5.6.1] 条目；VERSION=5.6.1；两份 skill-training certification `accepted`。
- `blog-site/` 最新发布帖为 v5.6.0（`2026-08-v560-aios-work-concurrent-dispatch.md`），无 v5.6.1 帖。
- `docs-site/changelog.md` 顶部为 v5.6.0 条目，无 5.6.1 条目（含 zh/ja/ko 三个 locale 文件）。
- 博客索引 ×4、`mkdocs.blog.yml` Posts nav 均无 v5.6.1 条目。

**Tech Stack:** Markdown + static-i18n（mkdocs）、`node scripts/check-site-sync.mjs`、`node --test scripts/tests/public-content-contract.test.mjs`。

---

## 非目标

- 不改代码/技能/认证（已完成并提交）。
- 不做版本号变更（VERSION/CHANGELOG 已含 5.6.1）。
- 不重写既有帖子内容，只做新增/翻译/索引更新。

## PR Boundaries

| PR | Slice | 验证 |
|---|---|---|
| PR-1 | 新帖 `2026-08-v561-aios-work-plan-driven-dispatch.md` ×4 语言 + 4 个博客索引 + mkdocs.blog.yml nav | 链接可解析、索引含新帖 |
| PR-2 | docs changelog ×4 补 5.6.1 条目 | 契约测试 + 同步检查 |

## PR-1: v5.6.1 发布博客（SEO/GEO，4 语言）

**Goal:** 英文主帖骑乘关键词（plan-driven multi-agent dispatch / parallel agent dispatch from a plan / work item decomposition / agent skill routing），zh/ja/ko 同步翻译；全索引 + 导航可见。

**Files:**

- Create: `blog-site/2026-08-v561-aios-work-plan-driven-dispatch.md`
- Create: `blog-site/zh/2026-08-v561-aios-work-plan-driven-dispatch.md`
- Create: `blog-site/ja/2026-08-v561-aios-work-plan-driven-dispatch.md`
- Create: `blog-site/ko/2026-08-v561-aios-work-plan-driven-dispatch.md`
- Modify: `blog-site/index.md`、`blog-site/zh/index.md`、`blog-site/ja/index.md`、`blog-site/ko/index.md`（Latest 顶部加新帖）
- Modify: `mkdocs.blog.yml`（Posts nav 顶部加 v5.6.1 条目）

**Tasks:**

- [x] **Step 1: 主帖（EN）** 遵循 `seo-geo-page-optimization` 方法：frontmatter（title/description/date/tags）、H1-H2 关键词结构、GEO 友好定义句、真实命令示例（`aios work` 从结构化 plan 拆 work items、`--dry-run` 预览、`--serial`）、链接 `2026-08-v560-aios-work-concurrent-dispatch.md` / `orchestrate-live.md` / docs。内容要点（来自 CHANGELOG 5.6.1）：plan task → work item（依赖 + owned paths + acceptance criteria）；报告保留 plan-driven 分解；`aios-work-dispatch` skill 何时进并行（planned disposition、≥2 独立项、文件归属不重叠、无严格顺序）；preview/approval 边界；`aios-workflow-router` 路由。
- [x] **Step 2: zh/ja/ko 翻译** 保持 frontmatter 字段、代码块、链接目标不变；本地相对链接保持同语言文件存在（orchestrate-live.md 等若缺失则改用站点 URL）。
- [x] **Step 3: 索引更新** 4 个 `index.md` 的 Latest 列表顶部插入新帖条目（标题翻译 + 相对链接），格式与 v560 条目一致。
- [x] **Step 4: nav 更新** `mkdocs.blog.yml` Posts 顶部加 `v5.6.1 Plan-Driven Multi-Agent Dispatch: 2026-08-v561-aios-work-plan-driven-dispatch.md`。
- [x] **Step 5: 验证** `node scripts/check-site-sync.mjs` 全绿；本地链接均指向存在的 4 语言文件。

## PR-2: docs changelog ×4 补 5.6.1

**Goal:** 站点 changelog 与仓库 CHANGELOG.md 对齐。

**Files:**

- Modify: `docs-site/changelog.md` + `zh/ja/ko/changelog.md`

**Tasks:**

- [x] **Step 1:** 仓库 CHANGELOG [5.6.1] 条目（Added/Fixed/Changed）翻译同步到 docs changelog ×4，放 v5.6.0 条目之上。
- [x] **Step 2:** 契约验证：`node scripts/check-site-sync.mjs`、`node --test scripts/tests/public-content-contract.test.mjs`、`npm run test:check-site-sync`。

## Final Verification Gate

- [x] `node scripts/check-site-sync.mjs` → OK
- [x] `node --test scripts/tests/public-content-contract.test.mjs`
- [x] `npm run test:check-site-sync`
- [x] 全量帖数对比：root=zh=ja=ko（新帖 ×4 各语言齐）
- [x] `git status` 变更集检查 → 提交建议：`feat(site): publish v5.6.1 plan-driven aios work blog (4 locales), sync changelog`

## Self-Review Notes

- 英文主帖为 canonical，zh/ja/ko 为翻译；沿用仓库 static-i18n alternate 惯例。
- 不触碰 i18n 配置与站点构建脚本；验证只依赖仓库既有契约脚本。
- 若某 locale 缺失目标链接文件，用 `/blog/<locale>/...` 站点 URL 或对应 locale 相对链接，保持语言不漂移。
