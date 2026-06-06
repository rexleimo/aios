# v1.50.0 Docs Blog Site Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update docs, blog, and site release surfaces for v1.50.0, covering unified AIOS search, all-client native guidance, usage tutorials, resource integrity, commit/push, and GitHub release publication.

**Architecture:** Treat `docs-site/` as the main product documentation, `blog-site/` as release storytelling/tutorial content, and root release metadata (`VERSION`, `CHANGELOG.md`) as the source of release version truth. Keep links/resource references local and verified with existing site sync checks before publishing.

**Tech Stack:** Markdown, MkDocs Material/i18n, Node.js verification scripts, AIOS harness checkpointing, git/GitHub CLI release flow.

---

### Task 1: Release Planning and Harness Checkpoint

**Files:**
- Create: `docs/superpowers/plans/2026-06-04-v150-docs-blog-site-release.md`
- Update via command: ContextDB memo/harness session artifacts

- [x] **Step 1: Create harness dry-run session**

Run: `node scripts/aios.mjs harness run --objective "Update docs, blog, and docs-site for v1.50.0..." --dry-run --json`
Expected: session JSON exists; warnings are recorded if MCP/worktree detection is imperfect.

- [x] **Step 2: Record ContextDB memo checkpoint**

Run: `node scripts/aios.mjs memo add "Harness preflight for v1.50.0 docs/blog/site release started..."`
Expected: memo id printed.

### Task 2: Product Documentation Update

**Files:**
- Modify: `docs-site/contextdb.md`
- Modify: `docs-site/zh/contextdb.md`
- Modify: `docs-site/ja/contextdb.md`
- Modify: `docs-site/ko/contextdb.md`
- Modify: `docs-site/getting-started.md`
- Modify: `docs-site/zh/getting-started.md`
- Modify: `docs-site/ja/getting-started.md`
- Modify: `docs-site/ko/getting-started.md`
- Modify: `docs-site/changelog.md`
- Modify: `docs-site/zh/changelog.md`
- Modify: `docs-site/ja/changelog.md`
- Modify: `docs-site/ko/changelog.md`

- [x] **Step 1: Add unified search usage docs**

Document `node scripts/aios.mjs search "<query>" --agent <runtime-client-id> --json`, source filters, workspace filters, memo visibility rules, and all-client instruction inheritance.

- [x] **Step 2: Add quick-start tutorial callout**

Add a short “before grep, use AIOS search” tutorial to getting-started pages.

- [x] **Step 3: Add v1.50.0 docs-site changelog entry**

Summarize unified search, six-client native guidance inheritance, harness release checkpointing, and resource integrity checks.

### Task 3: Blog Release Tutorial

**Files:**
- Create: `blog-site/2026-06-v150-unified-aios-search.md`
- Create: `blog-site/zh/2026-06-v150-unified-aios-search.md`
- Create: `blog-site/ja/2026-06-v150-unified-aios-search.md`
- Create: `blog-site/ko/2026-06-v150-unified-aios-search.md`
- Modify: `blog-site/index.md`
- Modify: `blog-site/zh/index.md`
- Modify: `blog-site/ja/index.md`
- Modify: `blog-site/ko/index.md`
- Modify: `mkdocs.blog.yml`

- [x] **Step 1: Write release tutorial posts**

Cover the problem, command examples, memory visibility, multi-client instruction propagation, and verification checklist.

- [x] **Step 2: Add post to blog indexes and nav**

Ensure all locales link to their localized post and the English nav includes the new post.

### Task 4: Release Metadata and Site Resources

**Files:**
- Modify: `VERSION`
- Modify: `CHANGELOG.md`
- Modify: `docs-site/llms.txt`
- Modify: `docs-site/llms-full.txt`

- [x] **Step 1: Bump version to 1.50.0**

Set `VERSION` to `1.50.0` and add `CHANGELOG.md` release notes.

- [x] **Step 2: Refresh LLM resource manifests**

Ensure AI answer-engine resource files mention v1.50.0 search docs and blog tutorial.

### Task 5: Verification, Cap, and GitHub Release

**Files:**
- All changed files

- [x] **Step 1: Run focused verification**

Run: `npm run check:site-sync`, focused search/native tests, markdown link/resource checks, and `git diff --check`.

- [x] **Step 2: Commit and push**

Run cap flow: `git add -A`, conventional commit, `git push` / upstream push if needed.

- [x] **Step 3: Publish GitHub version v1.50.0**

Create tag/release `v1.50.0` with verified release notes and resource integrity evidence. If release already exists, report and do not overwrite without explicit user instruction.
