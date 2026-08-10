# Public Content System and SEO/GEO Expansion Design

**Date:** 2026-07-14
**Status:** Approved in chat for the content-system and growth-blog approach
**Scope:** Public developer docs, README entry points, blog content, site metadata, and link integrity

## Goal

Make AIOS easier to understand, install, evaluate, and share by turning the public documentation and blog into one fact-checked content system.

The system must:

1. explain the current product and `4.0.0` workflow policy without contradicting the implementation;
2. give each high-intent user question one canonical answer page;
3. use the blog to reach problem-oriented search intents and send readers to the canonical docs;
4. preserve existing public URLs and localization routes;
5. improve search and answer-engine extraction without inventing unsupported claims.

## Current Problems

The repository currently has several public-content risks:

- `VERSION` is `4.0.0`, but the docs do not explain the new adaptive workflow policy;
- README and Quick Start still contain older token-compression and ContextDB setup descriptions;
- the redesigned home page has weak content links and an unsupported `10x faster` claim;
- the site-sync check currently reports broken relative links and missing localized blog posts;
- some older blog posts have no front matter metadata or are too thin to answer their search intent;
- architecture, ContextDB, and onboarding pages describe behavior that has since moved to pull-based or policy-aware flows.

## Non-Goals

- Do not change the runtime implementation, CLI semantics, or client support matrix as part of the content work.
- Do not edit generated `site/` output by hand.
- Do not change existing public slugs unless a redirect is required for an already-published path.
- Do not translate every historical blog post to equal depth in the first pass.
- Do not use unverified performance multiples, conversion claims, or guarantees.
- Do not add a new documentation framework or replace MkDocs.

## Content Architecture

English remains the canonical source for page structure and slugs. Chinese receives a complete parallel version for all new and substantially rewritten pages. Japanese and Korean receive the same structure for the P0 pages, all new high-intent pages, and all blog posts linked from their localized index pages.

| User intent | Canonical docs | Blog cluster | Primary action |
| --- | --- | --- | --- |
| Understand AIOS | Home, README, CLI Comparison | Launch story, raw CLI comparison | Quick Start |
| Install and start | Quick Start, Windows Guide | Three-minute setup and troubleshooting | `aios init` and `aios doctor` |
| Persist and search memory | ContextDB | ContextDB memory and search tutorials | Initialize project memory |
| Choose a workflow route | Workflow Policy | v4.0 adaptive policy article | `aios plan auto-gate` |
| Run multiple agents | Agent Team, HUD Guide | Team governance and collaboration cases | `aios team` |
| Run one long task | Solo Harness | Overnight workflow guide | `aios harness run` |
| Run staged orchestration | Architecture, Use Cases | Orchestrate Live deep dive | `aios orchestrate` |
| Reduce context noise | Token Intelligence | Headroom, RTK, Caveman explainer | `aios init --all` |
| Protect sensitive data | Privacy cases, Troubleshooting | Safe automation cases | `aios privacy read` |
| Compare clients | CLI Comparison, Architecture | Hermes, Grok, and multi-client posts | Choose a supported route |

### P0: Product truth and conversion

P0 pages are the first implementation target and must be complete in English and Chinese:

- home and README entry points;
- Quick Start and Windows setup;
- ContextDB;
- Architecture;
- new Workflow Policy page;
- Token Intelligence and Compression;
- Agent Team and HUD entry points;
- Solo Harness;
- CLI Workflows / Use Cases;
- Troubleshooting.

Japanese and Korean P0 pages keep the same headings, commands, links, and FAQ intent. Their prose is translated naturally while product names and code identifiers remain stable.

### P1: Discovery, proof, and trust

P1 pages retain their stable URLs but receive metadata, first-screen answers, stronger CTAs, FAQ sections, and links to P0 pages:

- CLI Comparison;
- Case Library and the three featured cases;
- Model Router;
- Codemap;
- Superpowers;
- Perception;
- Friends;
- Changelog.

### P2: Blog growth clusters

The blog will add and refresh four content types:

1. **Release and product:** the `4.0.0` adaptive workflow policy and the `3.6.0` token-intelligence boundaries.
2. **Problem-solving tutorials:** cross-session memory, setup recovery, and choosing Team versus Solo Harness versus Orchestrate.
3. **Technical deep dives:** pull-based ContextDB, unified search, and the difference between wrapper compression and explicit MCP compression.
4. **Reproducible cases:** cross-CLI handoff, browser auth-wall handoff, privacy-safe config reads, and governed Agent Team execution.

New high-intent posts will be complete in English and Chinese and will be localized into Japanese and Korean when linked from those language indexes. Existing historical posts stay at their current URLs; thin or metadata-incomplete posts are upgraded in place when they belong to one of these clusters.

## Page Writing Contract

### Documentation pages

Each P0/P1 page should follow this order unless the subject requires a small variation:

1. `Quick Answer`: three to five sentences that name the product capability, audience, and limitation.
2. `Do it now`: one copy-paste command or clear next action.
3. `Problem`: the user situation the page solves.
4. `How it works`: implementation facts and boundaries.
5. `Examples`: at least one real command sequence or decision table.
6. `Failure modes`: common wrong assumptions, expected warnings, and recovery steps.
7. `FAQ`: direct question-and-answer headings suitable for search extraction.
8. `Next steps`: one primary documentation link and one optional blog or case link.

Commands must match the current CLI help and source behavior. Compatibility paths such as `.contextdb-enable` remain documented only when they are still supported, and are labeled as compatibility or legacy paths rather than primary onboarding.

### Blog posts

Each new or substantially rewritten post should include:

- complete front matter: `title`, `description`, `date`, and `tags`;
- an answer-first opening paragraph;
- a concrete user problem and the implementation decision;
- copy-paste commands or a reproducible example;
- explicit trade-offs and unsupported assumptions;
- a FAQ section;
- a link to the canonical docs page;
- two related posts or cases.

Release posts may be chronological, but they must still explain who needs the change and what action the reader should take.

## SEO and GEO Contract

### Metadata

- Every public Markdown page has a specific `title` and `description` in front matter.
- Titles express one primary intent instead of combining unrelated keywords.
- Descriptions state the value and the next action in plain language.
- H1, title, description, navigation label, and canonical route use the same product vocabulary.
- Blog posts expose date, author fallback, tags, and read-time data through the existing MkDocs blog hook.

### Navigation and internal links

- Docs top navigation exposes Docs, Blog, Changelog, GitHub, and Friends/ecosystem discovery paths.
- Every P0 page links to its next action and at least one related page.
- Localized pages keep users in the same language when crossing between docs and blog.
- Relative links point to source pages that exist in the same build; published cross-site links use the established `/blog/<locale>/...` and `/<locale>/...` route patterns.
- The site-sync checker becomes the publishing gate for nav targets, local links, locale drift, anchors, and the required localized core set.

### Structured data and answer extraction

The existing MkDocs override remains the single template boundary for site metadata. The implementation may extend it with page-aware `WebPage`, `BreadcrumbList`, and blog `Article` JSON-LD while keeping the current Organization and WebSite records. FAQ structured data is added only where the rendered page has a real FAQ section; the visible headings and answers remain the source of truth.

The content itself must remain useful without structured data. JSON-LD is an additional signal, not a hidden keyword container.

### LLM resources

`docs-site/llms.txt` and `docs-site/llms-full.txt` are updated after the P0 content is stable. They list the canonical docs, high-intent pages, current version boundaries, localized roots, and the most useful blog tutorials. They must not advertise deprecated behavior or claims absent from the public pages.

## Localization Contract

- English is the structure and slug source of truth.
- English and Chinese get full P0/P1 and new blog content.
- Japanese and Korean get full P0 structure, new Workflow Policy content, localized index links, metadata, and all posts promoted from their localized home pages.
- No localized index may link to a missing local file or silently fall back to an English relative page.
- Technical identifiers, commands, environment variables, client names, version numbers, and URLs remain identical across languages.
- Translation quality is judged by natural readability and semantic accuracy, not literal word-by-word parity.

## Staged Delivery

### Stage A: Technical foundation

1. Correct the public fact baseline for `4.0.0`, `aios init`, ContextDB, and token intelligence.
2. Rewrite P0 docs and create the Workflow Policy page.
3. Repair home CTAs, remove unsupported claims, and expose Blog/Friends/Project paths.
4. Repair local links, missing translations, front matter, and navigation entries.
5. Update LLM resource files and the site-sync assertions needed for the new canonical content set.

### Stage B: Growth blog

1. Add the v4.0 adaptive workflow policy post in English and Chinese, then localize promoted versions.
2. Add decision/tutorial posts for workflow selection and Team/Harness/Orchestrate choice.
3. Refresh the selected historical posts that are thin, metadata-incomplete, or disconnected from current docs.
4. Add related-reading links and update all four blog indexes and the blog navigation.

## Verification and Acceptance

Required checks after implementation:

```bash
npm run check:site-sync
npm run test:check-site-sync
python3 -m mkdocs build --strict --config-file mkdocs.yml
python3 -m mkdocs build --strict --config-file mkdocs.blog.yml
npm run test:scripts
git diff --check
```

Acceptance criteria:

1. A new user can identify what AIOS is and reach a working installation path from the first screen.
2. The current `4.0.0` adaptive policy is documented with accurate route, persistence, continuation, and verification behavior.
3. README, Quick Start, ContextDB, Architecture, and Token Intelligence no longer contradict the implementation or one another.
4. The docs and blog builds pass in strict mode without generated-output edits.
5. Site-sync passes with no broken local links, missing nav targets, locale drift, missing core posts, or broken anchors.
6. Every promoted page has a clear search intent, metadata, CTA, FAQ, and related reading.
7. English and Chinese are complete for the new content; Japanese and Korean have no dead promoted links and contain the required localized P0/core content.
8. No unsupported speed, success-rate, privacy, or automation guarantees remain in public copy.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Public copy drifts from fast-moving runtime behavior | Verify commands and claims against current source/tests before writing each page. |
| Large multi-locale edits create broken links | Add files and index links in locale-complete batches, then run site-sync before the next cluster. |
| SEO changes break existing search routes | Keep current slugs and route forms; use redirect stubs only when needed. |
| Structured data duplicates or contradicts page content | Generate it from page metadata and visible sections in one template boundary. |
| Growth copy overstates performance or privacy | Require local evidence for measurements and state provider/network boundaries explicitly. |
| Existing user work is overwritten | Stage only the files owned by this task; preserve unrelated dirty files and never use destructive git commands. |
