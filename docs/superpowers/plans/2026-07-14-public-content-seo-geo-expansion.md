# Public Content System and SEO/GEO Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public docs and blog content system around the current Harness CLI implementation so users can discover, understand, install, and share the product without encountering stale claims or broken localized links.

**Architecture:** `docs-site/` remains the authoritative product documentation source and `blog-site/` remains the public storytelling/tutorial source. Existing Markdown front matter, MkDocs i18n, the blog content hook, and the override templates stay in place; the work adds a Workflow Policy page, aligns P0/P1 pages to current runtime behavior, exposes answer-first content, and uses site-sync/build checks as the publishing gate.

**Tech Stack:** Markdown, MkDocs Material, `mkdocs-static-i18n`, Jinja overrides, Python MkDocs hooks, Node.js ESM, `node:test`, existing site-sync and site-redesign tests.

## Global Constraints

- The approved specification is `docs/superpowers/specs/2026-07-14-public-content-seo-geo-expansion-design.md`; when implementation and copy conflict, verify the current source/tests and update the specification before proceeding.
- English defines page structure and slugs; English and Chinese receive complete P0/P1 content; Japanese and Korean receive complete P0 structure, new Workflow Policy content, promoted blog posts, metadata, and no dead index links.
- Keep existing public routes and source URLs; use redirect stubs only when an already-published route requires compatibility.
- Treat `VERSION`, `CHANGELOG.md`, `scripts/lib/planning/workflow-policy.mjs`, `scripts/lib/planning/auto-gate.mjs`, `scripts/lib/planning/cli.mjs`, and `scripts/tests/workflow-policy.test.mjs` as the fact sources for the `4.0.0` workflow policy.
- Treat `docs-site/token-compression.md` and `blog-site/2026-07-headroom-token-intelligence.md` as the current fact sources for RTK, Caveman, Headroom MCP, ContextDB, and Ponytail-inspired gate boundaries.
- Do not edit generated `site/` output by hand.
- Do not change runtime implementation, CLI semantics, or client support as part of this content task.
- Do not publish unsupported speed multiples, success rates, privacy guarantees, or transparent-compression claims.
- Do not use destructive git commands and do not overwrite the existing untracked `docs/plans/2026-07-13-execute-subagent-runtime.md`.
- Stage and commit only the exact files owned by each task; never use `git add -A`.

## File Structure

### Content source files

- `README.md`, `README-zh.md`: repository-level discovery and install entry points.
- `docs-site/index.md` and locale indexes: first-screen answer, primary CTA, capability map, and high-value links.
- `docs-site/getting-started.md`, `contextdb.md`, `architecture.md`, `token-compression.md`: product truth for installation, memory, runtime architecture, and context efficiency.
- `docs-site/workflow-policy.md` and its locale copies: canonical `noop/direct/guarded/planned` policy explanation.
- `docs-site/team-ops.md`, `solo-harness.md`, `use-cases.md`, `troubleshooting.md`: operational decision and recovery paths.
- `blog-site/**/*.md`: release, tutorial, deep-dive, and reproducible-case content.

### Site and validation surfaces

- `mkdocs.yml`, `mkdocs.blog.yml`: site descriptions, navigation, locale translations, and blog post discovery.
- `docs-site/overrides/main.html`: page-aware structured metadata boundary.
- `docs-site/overrides/partials/rex/topbar.html`, `blog-header.html`, `blog-footer.html`: visible cross-site discovery links.
- `scripts/mkdocs_blog_content.py`: content-derived blog metadata and related-reading data.
- `scripts/check-site-sync.mjs`, `scripts/tests/check-site-sync.test.mjs`: link, nav, locale, anchor, and required-content checks.
- `scripts/tests/site-redesign-assets.test.mjs`, `scripts/tests/site-redesign-responsive.test.mjs`: template and shell regression contracts.
- `docs-site/llms.txt`, `docs-site/llms-full.txt`: answer-engine resource summaries.

---

### Task 1: Lock content and link-integrity contracts

**Files:**
- Modify: `scripts/check-site-sync.mjs`
- Modify: `scripts/tests/check-site-sync.test.mjs`
- Create: `scripts/tests/public-content-contract.test.mjs`

**Interfaces:**
- Consumes: `docs-site/**/*.md`, `blog-site/**/*.md`, `mkdocs.yml`, and `mkdocs.blog.yml`.
- Produces: deterministic checks for route-style home links, required Workflow Policy navigation, front matter completeness, localized promoted posts, and unsupported homepage claims.

- [ ] **Step 1: Add unit coverage for route-style links and the new content contract.**

  Extend the existing helper tests to cover these exact cases:

  - `/getting-started/`, `/use-cases/`, and `/contextdb/` are valid published-root links.
  - relative Markdown links still resolve within the same source tree.
  - a required `Workflow Policy: workflow-policy.md` nav entry is recognized.
  - a promoted blog slug must exist at the English, Chinese, Japanese, and Korean paths before the index may link to it.

  Add `public-content-contract.test.mjs` with assertions that every P0 Markdown page has `title:` and `description:`, all four locale Workflow Policy files exist, and `docs-site/index.md` does not contain `10x faster`.

- [ ] **Step 2: Run the focused tests to capture the current baseline.**

  Run:

  ```bash
  node --test scripts/tests/check-site-sync.test.mjs scripts/tests/public-content-contract.test.mjs
  ```

  Expected: the new contract test fails on the missing Workflow Policy files and stale homepage claim; existing helper tests continue to pass.

- [ ] **Step 3: Implement only the checker support required by the tests.**

  Keep the existing link parser and add route-target normalization in `localSiteTargetExists` so a published route ending in `/` maps to the corresponding Markdown page. Keep absolute and root links exempt from source-relative resolution, and preserve the existing locale-drift and anchor checks.

- [ ] **Step 4: Run the focused tests again.**

  Run:

  ```bash
  node --test scripts/tests/check-site-sync.test.mjs scripts/tests/public-content-contract.test.mjs
  ```

  Expected: helper tests PASS; the content-contract test remains red only for the intentionally missing content files and is resolved by Tasks 2-8.

- [ ] **Step 5: Commit the validation contract.**

  ```bash
  git add scripts/check-site-sync.mjs scripts/tests/check-site-sync.test.mjs scripts/tests/public-content-contract.test.mjs
  git commit -m "test(site): define public content integrity contracts"
  ```

### Task 2: Add the Workflow Policy documentation set

**Files:**
- Create: `docs-site/workflow-policy.md`
- Create: `docs-site/zh/workflow-policy.md`
- Create: `docs-site/ja/workflow-policy.md`
- Create: `docs-site/ko/workflow-policy.md`
- Modify: `mkdocs.yml`

**Interfaces:**
- Consumes: `scripts/lib/planning/workflow-policy.mjs`, `scripts/lib/planning/auto-gate.mjs`, `scripts/lib/planning/cli.mjs`, and `scripts/tests/workflow-policy.test.mjs`.
- Produces: one canonical page and three localized pages that explain the same dispositions, persistence rules, continuation rules, required skills, and verification scope.

- [ ] **Step 1: Write the English page with the required answer-first sections.**

  Use this exact section order:

  1. Quick Answer: adaptive policy is risk-based; it does not create a persistent plan for every message.
  2. Do It Now: show `node scripts/aios.mjs plan auto-gate --task "..." --json` and the `--dry-run` form.
  3. The Four Dispositions: `noop`, `direct`, `guarded`, and `planned`.
  4. Adaptive vs Strict: a small change stays guarded in adaptive mode but becomes planned in strict mode.
  5. Plan Persistence: `none`, `reuse`, and `create`; terminal plans cannot be continued.
  6. Continuation: same-session acknowledgement versus explicit resume across clients.
  7. Route Hints and Skills: design, debug, verify, ops, team, and harness mappings.
  8. Examples: read-only question, small implementation, multi-step change, team task, and explicit resume.
  9. FAQ and Next Steps.

  State that a policy decision is not the same as a completed implementation, and that `pre-edit-safety-gate` plus verification remain required before changing files.

- [ ] **Step 2: Translate the page into Chinese, Japanese, and Korean without changing identifiers.**

  Preserve the exact code blocks, route names, environment names, JSON keys, and CLI flags. Translate headings and explanations naturally and keep each locale's links inside its own docs/blog root.

- [ ] **Step 3: Add the page to the Core Features nav and all locale translation maps.**

  Add `Workflow Policy: workflow-policy.md` after `Architecture` in `mkdocs.yml` and add `Workflow Policy` translations for `zh`, `ja`, and `ko`.

- [ ] **Step 4: Build the docs site in strict mode.**

  ```bash
  python3 -m mkdocs build --strict --config-file mkdocs.yml
  ```

  Expected: build succeeds and the four Workflow Policy routes are generated.

- [ ] **Step 5: Commit the policy documentation.**

  ```bash
  git add docs-site/workflow-policy.md docs-site/zh/workflow-policy.md docs-site/ja/workflow-policy.md docs-site/ko/workflow-policy.md mkdocs.yml
  git commit -m "docs: add adaptive workflow policy guide"
  ```

### Task 3: Align README, home, and onboarding content

**Files:**
- Modify: `README.md`
- Modify: `README-zh.md`
- Modify: `docs-site/index.md`
- Modify: `docs-site/zh/index.md`
- Modify: `docs-site/ja/index.md`
- Modify: `docs-site/ko/index.md`
- Modify: `docs-site/getting-started.md`
- Modify: `docs-site/zh/getting-started.md`
- Modify: `docs-site/ja/getting-started.md`
- Modify: `docs-site/ko/getting-started.md`
- Modify: `docs-site/windows-guide.md`
- Modify: `docs-site/zh/windows-guide.md`
- Modify: `docs-site/ja/windows-guide.md`
- Modify: `docs-site/ko/windows-guide.md`

**Interfaces:**
- Consumes: `VERSION`, current installer help, `docs-site/token-compression.md`, and `docs-site/workflow-policy.md`.
- Produces: consistent first-screen value proposition, stable installation path, and language-preserving onboarding.

- [ ] **Step 1: Replace the stale product capability table in both READMEs.**

  Describe RTK, Caveman, Headroom MCP, ContextDB, and the smallest-correct-change gate as separate layers. Remove wording that says AIOS provides a self-contained replacement for RTK/Caveman. Add `Grok Build` to the supported client list where the current source already supports it, and link the Workflow Policy page from the core documentation list.

- [ ] **Step 2: Rewrite the English and Chinese home pages around one primary intent.**

  Keep the accepted visual structure, but make the visible copy answer “What is Harness CLI?”, link the first CTA to `/getting-started/`, link the second CTA to `/use-cases/`, add a visible Blog link, and remove both `10x faster` labels. Use evidence-based phrases such as “cross-session memory”, “parallel agent collaboration”, “resumable runs”, and “verification gates”.

- [ ] **Step 3: Synchronize the Japanese and Korean home pages and onboarding entry points.**

  Keep the same capability order and CTA destinations as English/Chinese. Do not add features that are not present in the English source or runtime.

- [ ] **Step 4: Rewrite Quick Start as the canonical install flow.**

  Make `aios init` and `aios doctor` the primary path; describe `.contextdb-enable` only in a labeled compatibility section. Include the current compression consent flags, the project marker, the first agent launch, verification commands, and a short “which page next?” table.

- [ ] **Step 5: Expand the Windows Guide beyond a redirect stub.**

  Keep the link to Quick Start but add PowerShell prerequisites, TLS-safe installer commands, profile reload, `aios doctor`, and the three most common recovery commands so the page can answer Windows setup searches directly.

- [ ] **Step 6: Run the content contract and docs build.**

  ```bash
  node --test scripts/tests/public-content-contract.test.mjs
  python3 -m mkdocs build --strict --config-file mkdocs.yml
  ```

  Expected: content contract passes for the home/onboarding files; strict docs build succeeds.

- [ ] **Step 7: Commit the discovery and onboarding rewrite.**

  ```bash
  git add README.md README-zh.md docs-site/index.md docs-site/zh/index.md docs-site/ja/index.md docs-site/ko/index.md docs-site/getting-started.md docs-site/zh/getting-started.md docs-site/ja/getting-started.md docs-site/ko/getting-started.md docs-site/windows-guide.md docs-site/zh/windows-guide.md docs-site/ja/windows-guide.md docs-site/ko/windows-guide.md
  git commit -m "docs: align public onboarding and product messaging"
  ```

### Task 4: Align memory, architecture, and token-intelligence documentation

**Files:**
- Modify: `docs-site/contextdb.md`
- Modify: `docs-site/zh/contextdb.md`
- Modify: `docs-site/ja/contextdb.md`
- Modify: `docs-site/ko/contextdb.md`
- Modify: `docs-site/architecture.md`
- Modify: `docs-site/zh/architecture.md`
- Modify: `docs-site/ja/architecture.md`
- Modify: `docs-site/ko/architecture.md`
- Modify: `docs-site/token-compression.md`
- Modify: `docs-site/zh/token-compression.md`
- Modify: `docs-site/ja/token-compression.md`
- Modify: `docs-site/ko/token-compression.md`

**Interfaces:**
- Consumes: current ContextDB source, `docs-site/workflow-policy.md`, and the existing v3.6 token-intelligence guide.
- Produces: consistent explanations of pull-based memory, unified search, runtime architecture, compression boundaries, privacy, and verification.

- [ ] **Step 1: Rewrite ContextDB around pull-based context and current storage paths.**

  Make `.aios/context-db/index.json`, `.aios/memo/`, `aios init`, unified project search, memo storage, lazy loading, and context packs the primary concepts. Mark legacy push-injection and `.contextdb-enable` language as compatibility history. Add FAQ answers for cloud storage, cross-client sharing, disabling memory, and what the local files contain.

- [ ] **Step 2: Rewrite Architecture around current runtime boundaries.**

  Separate shell/ctx-agent startup, ContextDB, planning policy, Team/Harness/Orchestrate, browser-use CDP, and RL research surfaces. In the architecture page's legacy-runtime section, label Playwright MCP as compatibility-only and keep browser-use CDP as the default documented browser path. Link each runtime layer to its public operational page.

- [ ] **Step 3: Preserve and strengthen the accurate Token Intelligence page.**

  Keep its five-layer responsibility table, but add a first-screen answer, explicit “what this does not promise” bullets, a Quick Start command, a FAQ, and links back to Quick Start, ContextDB, and Workflow Policy. Ensure no page calls MCP-only compression transparent interception.

- [ ] **Step 4: Apply the same structure to Chinese, Japanese, and Korean pages.**

  Keep commands, version ranges, environment variables, and client names byte-for-byte identical across locales. Translate only explanatory prose and headings.

- [ ] **Step 5: Run strict builds and link checks.**

  ```bash
  npm run check:site-sync
  python3 -m mkdocs build --strict --config-file mkdocs.yml
  ```

  Expected: no locale drift or broken anchors for the updated core pages; any remaining failures identify files in later tasks.

- [ ] **Step 6: Commit the core mechanics documentation.**

  ```bash
  git add docs-site/contextdb.md docs-site/zh/contextdb.md docs-site/ja/contextdb.md docs-site/ko/contextdb.md docs-site/architecture.md docs-site/zh/architecture.md docs-site/ja/architecture.md docs-site/ko/architecture.md docs-site/token-compression.md docs-site/zh/token-compression.md docs-site/ja/token-compression.md docs-site/ko/token-compression.md
  git commit -m "docs: align memory architecture and token guidance"
  ```

### Task 5: Align orchestration, cases, and recovery pages

**Files:**
- Modify: `docs-site/team-ops.md`
- Modify: `docs-site/zh/team-ops.md`
- Modify: `docs-site/ja/team-ops.md`
- Modify: `docs-site/ko/team-ops.md`
- Modify: `docs-site/solo-harness.md`
- Modify: `docs-site/zh/solo-harness.md`
- Modify: `docs-site/ja/solo-harness.md`
- Modify: `docs-site/ko/solo-harness.md`
- Modify: `docs-site/use-cases.md`
- Modify: `docs-site/zh/use-cases.md`
- Modify: `docs-site/ja/use-cases.md`
- Modify: `docs-site/ko/use-cases.md`
- Modify: `docs-site/troubleshooting.md`
- Modify: `docs-site/zh/troubleshooting.md`
- Modify: `docs-site/ja/troubleshooting.md`
- Modify: `docs-site/ko/troubleshooting.md`
- Modify: `docs-site/case-library.md`
- Modify: `docs-site/zh/case-library.md`
- Modify: `docs-site/ja/case-library.md`
- Modify: `docs-site/ko/case-library.md`

**Interfaces:**
- Consumes: current `aios team`, `aios harness`, `aios orchestrate`, HUD, browser, privacy, and quality-gate commands.
- Produces: decision-oriented operational pages that tell users when to use each route and what evidence proves success.

- [ ] **Step 1: Add an intent-first chooser to Team, Solo Harness, and Use Cases.**

  Include a compact table mapping one agent/long task to `aios harness`, independent parallel work to `aios team`, and staged quality-gated work to `aios orchestrate`. Put the copy-paste command immediately after the Quick Answer.

- [ ] **Step 2: Add governance and recovery evidence to Team and HUD guidance.**

  Explain preflight, ownership, status/history, quality categories, skill candidates, stop/resume, and the difference between dry-run and live execution without claiming that a dry-run proves a live provider works.

- [ ] **Step 3: Expand Troubleshooting around observable symptoms.**

  Organize entries by install/Node, ContextDB, client sync, planning policy, Team/Harness, browser MCP, token tools, and privacy. Each entry must provide one diagnosis command, the expected evidence, and a safe next action.

- [ ] **Step 4: Turn Case Library pages into answer-engine-friendly reproducible cases.**

  Keep exact commands and human-gate requirements. Add a short Quick Answer, prerequisites, expected output/evidence, and related docs to each featured case.

- [ ] **Step 5: Synchronize Chinese, Japanese, and Korean structures and links.**

  Ensure each localized page links only to its own locale for docs/blog navigation and that no promoted case disappears from one language.

- [ ] **Step 6: Run focused site checks and commit.**

  ```bash
  npm run check:site-sync
  python3 -m mkdocs build --strict --config-file mkdocs.yml
  git add docs-site/team-ops.md docs-site/zh/team-ops.md docs-site/ja/team-ops.md docs-site/ko/team-ops.md docs-site/solo-harness.md docs-site/zh/solo-harness.md docs-site/ja/solo-harness.md docs-site/ko/solo-harness.md docs-site/use-cases.md docs-site/zh/use-cases.md docs-site/ja/use-cases.md docs-site/ko/use-cases.md docs-site/troubleshooting.md docs-site/zh/troubleshooting.md docs-site/ja/troubleshooting.md docs-site/ko/troubleshooting.md docs-site/case-library.md docs-site/zh/case-library.md docs-site/ja/case-library.md docs-site/ko/case-library.md
  git commit -m "docs: improve orchestration cases and recovery paths"
  ```

### Task 6: Implement the SEO/GEO site shell and resource updates

**Files:**
- Modify: `mkdocs.yml`
- Modify: `mkdocs.blog.yml`
- Modify: `docs-site/overrides/main.html`
- Modify: `docs-site/overrides/partials/rex/topbar.html`
- Modify: `docs-site/overrides/partials/rex/blog-header.html`
- Modify: `docs-site/overrides/partials/rex/blog-footer.html`
- Modify: `scripts/tests/site-redesign-assets.test.mjs`
- Modify: `docs-site/llms.txt`
- Modify: `docs-site/llms-full.txt`

**Interfaces:**
- Consumes: MkDocs page metadata, `rex_blog` records from `scripts/mkdocs_blog_content.py`, existing language switcher behavior, and current public route rules.
- Produces: visible Docs/Blog/Changelog/GitHub/Friends discovery links, page-aware structured data, current site descriptions, and answer-engine resource indexes.

- [ ] **Step 1: Add regression assertions for the shell contract.**

  Extend `site-redesign-assets.test.mjs` to require the visible Blog and Friends/Project paths in the docs shell, the current `4.0.0`/adaptive-policy wording in site descriptions, and page-aware structured-data markers. Keep assertions about existing shell classes and responsive assets intact.

- [ ] **Step 2: Update site metadata and locale nav translations.**

  Set docs/blog descriptions to mention the primary intent, current client layer, memory, collaboration, verification, and workflow routing. Add the Workflow Policy nav label to all locale maps and add any new blog post labels required by the blog nav.

- [ ] **Step 3: Expose the required discovery links in the visible shell.**

  Add Blog and Friends/ecosystem links to the docs topbar while preserving the current GitHub CTA and language switcher. Keep the blog header/footer links locale-safe and ensure the primary CTA remains Quick Start.

- [ ] **Step 4: Add page-aware JSON-LD at the existing override boundary.**

  Keep the current Organization and WebSite records. Add a `WebPage` and `BreadcrumbList` record for docs pages using the page title, description, and canonical URL. Add a `BlogPosting` record for blog article pages from `rex_blog.current`, using its title, description, date, author, and URL. Do not emit FAQ structured data unless the visible page contains the corresponding FAQ headings and answers.

- [ ] **Step 5: Refresh `llms.txt` and `llms-full.txt`.**

  List the Workflow Policy page, current P0 docs, localized roots, `4.0.0` policy behavior, v3.6 token boundaries, and the promoted tutorial posts. Remove references that describe deprecated transparent interception or obsolete client coverage.

- [ ] **Step 6: Run shell tests and strict builds.**

  ```bash
  npm run test:site-redesign
  python3 -m mkdocs build --strict --config-file mkdocs.yml
  ```

  Expected: all existing responsive/site tests pass and the generated HTML contains one valid structured-data block per intended page type.

- [ ] **Step 7: Commit the site shell and SEO/GEO metadata.**

  ```bash
  git add mkdocs.yml mkdocs.blog.yml docs-site/overrides/main.html docs-site/overrides/partials/rex/topbar.html docs-site/overrides/partials/rex/blog-header.html docs-site/overrides/partials/rex/blog-footer.html scripts/tests/site-redesign-assets.test.mjs docs-site/llms.txt docs-site/llms-full.txt
  git commit -m "feat(site): improve content discovery and structured metadata"
  ```

### Task 7: Upgrade P1 docs and repair public metadata

**Files:**
- Modify: `docs-site/cli-comparison.md`
- Modify: `docs-site/zh/cli-comparison.md`
- Modify: `docs-site/ja/cli-comparison.md`
- Modify: `docs-site/ko/cli-comparison.md`
- Modify: `docs-site/model-router.md`
- Modify: `docs-site/zh/model-router.md`
- Modify: `docs-site/ja/model-router.md`
- Modify: `docs-site/ko/model-router.md`
- Modify: `docs-site/codemap.md`
- Modify: `docs-site/zh/codemap.md`
- Modify: `docs-site/ja/codemap.md`
- Modify: `docs-site/ko/codemap.md`
- Modify: `docs-site/superpowers.md`
- Modify: `docs-site/zh/superpowers.md`
- Modify: `docs-site/ja/superpowers.md`
- Modify: `docs-site/ko/superpowers.md`
- Modify: `docs-site/perception.md`
- Modify: `docs-site/zh/perception.md`
- Modify: `docs-site/ja/perception.md`
- Modify: `docs-site/ko/perception.md`
- Modify: `docs-site/friends.md`
- Modify: `docs-site/zh/friends.md`
- Modify: `docs-site/ja/friends.md`
- Modify: `docs-site/ko/friends.md`
- Modify: `blog-site/automation-playbook-post.md`
- Modify: `blog-site/contextdb-fts-bm25-search.md`
- Modify: `blog-site/orchestrate-live.md`
- Modify: `blog-site/windows-cli-startup-stability.md`

**Interfaces:**
- Consumes: P0 links and current command behavior.
- Produces: complete metadata and answer-first entry sections for high-intent discovery pages and the four English posts currently missing front matter.

- [ ] **Step 1: Add or repair front matter for all listed pages.**

  Each page must have a specific title and description. Each listed English blog post must also have `date` and `tags` so the existing blog hook can produce stable cards, read time, and related reading.

- [ ] **Step 2: Add Quick Answer, action, FAQ, and Next Steps sections to each P1 docs page.**

  Keep the existing technical material, but move the main answer and command above long explanations. Link every page to one P0 canonical page and one related case or blog post.

- [ ] **Step 3: Refresh the four thin/metadata-incomplete English blog posts.**

  Add a direct answer, current commands, trade-offs, FAQ, canonical docs link, and two related links. Do not rewrite historical release facts that are still correct.

- [ ] **Step 4: Run metadata and site checks.**

  ```bash
  node --test scripts/tests/public-content-contract.test.mjs
  npm run check:site-sync
  ```

- [ ] **Step 5: Commit the P1 and metadata pass.**

  ```bash
  git add docs-site/cli-comparison.md docs-site/zh/cli-comparison.md docs-site/ja/cli-comparison.md docs-site/ko/cli-comparison.md docs-site/model-router.md docs-site/zh/model-router.md docs-site/ja/model-router.md docs-site/ko/model-router.md docs-site/codemap.md docs-site/zh/codemap.md docs-site/ja/codemap.md docs-site/ko/codemap.md docs-site/superpowers.md docs-site/zh/superpowers.md docs-site/ja/superpowers.md docs-site/ko/superpowers.md docs-site/perception.md docs-site/zh/perception.md docs-site/ja/perception.md docs-site/ko/perception.md docs-site/friends.md docs-site/zh/friends.md docs-site/ja/friends.md docs-site/ko/friends.md blog-site/automation-playbook-post.md blog-site/contextdb-fts-bm25-search.md blog-site/orchestrate-live.md blog-site/windows-cli-startup-stability.md
  git commit -m "docs: improve discovery pages and metadata"
  ```

### Task 8: Add the growth blog cluster and missing localized posts

**Files:**
- Create: `blog-site/2026-07-v400-adaptive-workflow-policy.md`
- Create: `blog-site/zh/2026-07-v400-adaptive-workflow-policy.md`
- Create: `blog-site/ja/2026-07-v400-adaptive-workflow-policy.md`
- Create: `blog-site/ko/2026-07-v400-adaptive-workflow-policy.md`
- Create: `blog-site/2026-07-choose-agent-workflow.md`
- Create: `blog-site/zh/2026-07-choose-agent-workflow.md`
- Create: `blog-site/ja/2026-07-choose-agent-workflow.md`
- Create: `blog-site/ko/2026-07-choose-agent-workflow.md`
- Create: `blog-site/2026-07-raw-cli-to-reliable-workflow.md`
- Create: `blog-site/zh/2026-07-raw-cli-to-reliable-workflow.md`
- Create: `blog-site/ja/2026-07-raw-cli-to-reliable-workflow.md`
- Create: `blog-site/ko/2026-07-raw-cli-to-reliable-workflow.md`
- Create: `blog-site/zh/2026-07-v320-harness-reliability-upgrade.md`
- Create: `blog-site/ja/2026-07-v320-harness-reliability-upgrade.md`
- Create: `blog-site/ko/2026-07-v320-harness-reliability-upgrade.md`
- Create: `blog-site/ja/2026-05-v140-multi-client-expansion.md`
- Create: `blog-site/ko/2026-05-v140-multi-client-expansion.md`
- Modify: `blog-site/index.md`
- Modify: `blog-site/zh/index.md`
- Modify: `blog-site/ja/index.md`
- Modify: `blog-site/ko/index.md`
- Modify: `mkdocs.blog.yml`

**Interfaces:**
- Consumes: P0 docs, current blog hook metadata, existing blog route rules, and the approved four content clusters.
- Produces: answer-first blog entries with complete four-locale index/navigation coverage and no missing promoted files.

- [ ] **Step 1: Write the v4.0 Adaptive Workflow Policy post.**

  Explain the old always-on planning problem, the adaptive/strict distinction, the four dispositions, plan persistence, same-session acknowledgement, explicit resume, and why direct questions do not create plan artifacts. Link to `workflow-policy.md` and the planning tests only through the public docs, not repository-internal test paths.

- [ ] **Step 2: Write the workflow-choice decision post.**

  Give a decision table for direct explanation, small guarded change, planned multi-step work, Agent Team, Solo Harness, and Orchestrate. Include copy-paste commands and failure boundaries.

- [ ] **Step 3: Write the Raw CLI to Reliable Workflow tutorial.**

  Show a realistic progression from one-off CLI use to ContextDB memory, unified search, verification, and resumable execution. Avoid claiming that Harness CLI replaces the underlying coding client.

- [ ] **Step 4: Add the missing v3.2 and v1.40 localized posts.**

  Translate the existing English release facts into Chinese, Japanese, and Korean for the v3.2 post, and into Japanese and Korean for the v1.40 post. Keep release dates, versions, commands, and links identical to the English source.

- [ ] **Step 5: Update all four blog indexes and the blog nav.**

  Put the v4.0 post first, then the workflow-choice and reliable-workflow tutorials, then existing release/deep-dive content. Add localized links only to files that exist in that locale. Add the three new post labels and paths to `mkdocs.blog.yml`.

- [ ] **Step 6: Run the blog build and full link contract.**

  ```bash
  npm run check:site-sync
  python3 -m mkdocs build --strict --config-file mkdocs.blog.yml
  ```

  Expected: no missing localized blog file, locale drift, broken anchor, or missing required core post.

- [ ] **Step 7: Commit the blog cluster.**

  ```bash
  git add blog-site/index.md blog-site/zh/index.md blog-site/ja/index.md blog-site/ko/index.md mkdocs.blog.yml blog-site/2026-07-v400-adaptive-workflow-policy.md blog-site/zh/2026-07-v400-adaptive-workflow-policy.md blog-site/ja/2026-07-v400-adaptive-workflow-policy.md blog-site/ko/2026-07-v400-adaptive-workflow-policy.md blog-site/2026-07-choose-agent-workflow.md blog-site/zh/2026-07-choose-agent-workflow.md blog-site/ja/2026-07-choose-agent-workflow.md blog-site/ko/2026-07-choose-agent-workflow.md blog-site/2026-07-raw-cli-to-reliable-workflow.md blog-site/zh/2026-07-raw-cli-to-reliable-workflow.md blog-site/ja/2026-07-raw-cli-to-reliable-workflow.md blog-site/ko/2026-07-raw-cli-to-reliable-workflow.md blog-site/zh/2026-07-v320-harness-reliability-upgrade.md blog-site/ja/2026-07-v320-harness-reliability-upgrade.md blog-site/ko/2026-07-v320-harness-reliability-upgrade.md blog-site/ja/2026-05-v140-multi-client-expansion.md blog-site/ko/2026-05-v140-multi-client-expansion.md
  git commit -m "docs(blog): add workflow discovery content cluster"
  ```

### Task 9: Run the full verification and content claim audit

**Files:**
- Modify only the scoped files from Tasks 1-8 when a verification failure identifies a concrete content or link defect.

**Interfaces:**
- Consumes: all updated public docs, blog sources, templates, tests, and navigation.
- Produces: strict-build evidence and a clean, reviewable task diff.

- [ ] **Step 1: Run all site and script checks.**

  ```bash
  npm run check:site-sync
  npm run test:check-site-sync
  npm run test:site-redesign
  npm run test:scripts
  ```

  Expected: all commands exit `0`. If `npm run test:scripts` reports an unrelated baseline failure, record the exact test and continue only after confirming the failure is outside the changed files.

- [ ] **Step 2: Build both sites in strict mode.**

  ```bash
  python3 -m mkdocs build --strict --config-file mkdocs.yml
  python3 -m mkdocs build --strict --config-file mkdocs.blog.yml
  ```

  Expected: docs and blog output builds without warnings promoted to errors; no generated output is staged.

- [ ] **Step 3: Audit public copy for stale or unsupported claims.**

  ```bash
  rg -n -i "10x faster|native token compression|without installing competitor|transparent interception|always-on planning|\.contextdb-enable" README.md README-zh.md docs-site blog-site
  ```

  Review every match. Compatibility explanations may remain when labeled accurately; unsupported product claims must be removed or rewritten.

- [ ] **Step 4: Check the final diff and workspace ownership.**

  ```bash
  git diff --check
  git status --short
  git diff --stat HEAD~8..HEAD
  ```

  Confirm the existing untracked `docs/plans/2026-07-13-execute-subagent-runtime.md` is still untouched and no `site/` generated files are staged.

- [ ] **Step 5: Record final evidence and prepare handoff.**

  Add the passing commands and relevant artifact paths to the active AIOS work-item plan. Summarize changed content clusters, locale coverage, known compatibility wording, and any verification limitation before claiming completion.

## Self-Review Checklist

- [ ] Every requirement in `docs/superpowers/specs/2026-07-14-public-content-seo-geo-expansion-design.md` maps to at least one task above.
- [ ] No task uses `TODO`, `TBD`, `FIXME`, or unspecified “appropriate” behavior.
- [ ] Every new page slug appears in its locale file list and in the relevant navigation task.
- [ ] The new Workflow Policy page is the only canonical explanation of `noop/direct/guarded/planned` semantics.
- [ ] Tests/builds are run after each content batch, not only at the end.
- [ ] The plan never stages unrelated dirty-worktree files.
