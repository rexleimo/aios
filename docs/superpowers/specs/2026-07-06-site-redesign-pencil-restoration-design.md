# AIOS Site Pencil Restoration - Design

> Date: 2026-07-06
> Source design: `/Users/rex/Downloads/cli.rexai.top.pen`
> Primary node: `CZd5Q` (`AIOS Pages`)
> Supporting nodes: `o2Bi8` (`Specs & Demos`), `yZfz0` (`Technical Documentation`)

## Goal

Restore the current AIOS website to match the Pencil design in `CZd5Q` as closely as practical while preserving the existing written content.

The redesign covers both generated MkDocs sites:

- Main docs/product site from `docs-site/` through `mkdocs.yml`.
- Blog site from `blog-site/` through `mkdocs.blog.yml`.

## Non-negotiable requirements

1. Preserve existing copy from `docs-site/*.md` and `blog-site/*.md`.
2. Use the `CZd5Q` visual design as the source of truth for page layout, theme, spacing, cards, navigation, and section hierarchy.
3. Use the Blog Index and Blog Post designs from `CZd5Q` for the blog site.
4. Implement the Home page dynamic effects from `yZfz0`, not just a static approximation.
5. Keep the existing MkDocs build pipeline and content model.
6. Do not manually edit generated output under `site/` except through a build command.

## Current state and diagnosis

There are existing uncommitted site changes in:

- `docs-site/index.md`
- `docs-site/assets/custom.css`
- `docs-site/assets/home.css`
- `docs-site/assets/pages.css`
- `docs-site/assets/home-animation.js`
- `docs-site/overrides/main.html`
- `mkdocs.yml`

These changes appear to be an earlier partial attempt at the same Pencil restoration. They are useful as design scaffolding because they already introduce the Home page section structure, canvas hooks, and design-oriented CSS assets. They are not complete enough to ship because the design is not yet applied consistently to all docs pages and the blog site is not yet aligned with the Blog page designs.

The implementation should keep reusable parts from the partial work, but it may revert or replace individual sections when they conflict with the approved design.

## Recommended approach

Keep MkDocs Material as the content and generation layer, then rebuild the visual layer through overrides, CSS, and small JavaScript animation modules.

This avoids a content migration, keeps i18n and existing markdown routing intact, and lets the site preserve current copy while matching the new layout.

## Alternatives considered

### Option A - Keep MkDocs and reskin through overrides (recommended)

Pros:

- Preserves docs/blog markdown sources and current publishing flow.
- Lowest risk for existing URLs, i18n, search, SEO metadata, and navigation.
- Allows Home/WebGL effects through targeted JS without a framework migration.

Cons:

- Some MkDocs Material markup must be overridden or carefully styled.
- Exact 1:1 layout for deeply generated docs pages requires CSS discipline.

### Option B - Handwrite static HTML pages

Pros:

- Easier to make individual pages visually exact.

Cons:

- Breaks the source-of-truth markdown workflow.
- High drift risk for docs/blog content.
- Harder to preserve i18n, search, and future maintenance.

### Option C - Replace site with a React/Vite app

Pros:

- Most flexible animation and component model.

Cons:

- Too large a migration for this task.
- Replaces a working docs/blog build system.
- Adds framework and routing maintenance unrelated to the requested visual restoration.

## Design system

### Main docs/product site

Use the dark cyan/blue design from `CZd5Q`:

- Background: near-black `#06070D`.
- Header: `#0A0E1A`, 70px height, subtle bottom border `#1B2437`.
- Accent colors: cyan `#22D3EE`, blue `#3B82F6`, violet `#8B5CF6`, green `#34D399`.
- Typography:
  - Display: Space Grotesk where available.
  - Body: Inter or existing MkDocs body font.
  - Code/technical labels: JetBrains Mono.
- Cards: dark panels around `#0D1220`, 12-16px radius, `#1B2437` border, soft glow/shadow only for emphasis.
- Page shell: 1440px design baseline with responsive scaling for smaller screens.

### Blog site

Use the black/orange design from the Blog Index and Blog Post frames:

- Background: `#111111`.
- Border: `#2E2E2E`.
- Accent: orange `#FF8400`.
- Body text: off-white and gray scale from the design.
- Header: 72px height, Docs / Blog / Changelog navigation.
- Blog index: large centered hero, featured content, post grid/list, pagination section, compact footer.
- Blog post: 800px article column, large hero image/card treatment, code blocks, callouts, related reading section, compact footer.

## Page mapping

| Current route/source | Pencil source | Notes |
| --- | --- | --- |
| `docs-site/index.md` | `AIOS - Home (Redesign)` (`berPn`) | Keep current Home copy, match Hero/Capabilities/Demo/CTA/Footer layout and animations. |
| `docs-site/getting-started.md` and general docs shell | `AIOS - Docs Page (Redesign)` (`pchPW`) | Apply sidebar/content shell and card treatment to generated docs content. |
| `docs-site/contextdb.md` | `AIOS - ContextDB Page` (`Is28X`) | Preserve current content, match page shell and active nav style. |
| `docs-site/team-ops.md` | `AIOS - Agent Team Page` (`knaJ0`) | Preserve content, match Agent Team page layout language. |
| `docs-site/superpowers.md` | `AIOS - Superpowers Page` (`n1BoR`) | Preserve content, apply dark content system. |
| `docs-site/cli-comparison.md` | `AIOS - Comparison Page` (`pMduD`) | Preserve comparison copy and tables, match comparison page style. |
| `docs-site/windows-guide.md` | `AIOS - Windows Guide` (`RJ42T`) | Preserve Windows copy, match guide shell. |
| `docs-site/architecture.md` | `AIOS - Architecture` (`Ht5Jj`) | Preserve architecture copy, match long-form docs layout. |
| `docs-site/changelog.md` | `AIOS - Changelog` (`gVrq4`) | Preserve changelog entries, match changelog shell. |
| `blog-site/index.md` | `AIOS - Blog Index` (`C6Bnp`) | Keep current blog index copy/posts, use Blog Index visual structure. |
| `blog-site/*.md` posts | `AIOS - Blog Post` (`fj4lo`) | Keep article body and metadata, use Blog Post layout. |

Other docs pages inherit the closest matching generated docs shell unless a dedicated `CZd5Q` page exists.

## Home animations

Use `yZfz0` as the technical reference and `CZd5Q` as the visual reference.

### Animation zones

1. Hero flow field
   - Full-section canvas behind content.
   - Particle drift, flow lines, cursor parallax.
   - Static gradient fallback when canvas is unavailable.

2. Capabilities interactive node grid
   - Subtle grid background with glowing nodes.
   - Pointer-proximity response.
   - Reduced-motion fallback to static grid.

3. Demo HUD radar
   - Radar sweep and throughput bars.
   - Ambient glow and lightweight frame updates.

4. Closing CTA nebula
   - Soft particle nebula/glow background.
   - Floating cards and code snippet with parallax.

### Runtime constraints

- Use vanilla JS and Canvas/WebGL where possible; avoid adding a new frontend framework.
- Respect `prefers-reduced-motion`.
- Pause or reduce animation when the tab is hidden.
- Avoid blocking initial content render.
- Keep effects decorative and accessible; all meaningful text remains in HTML.

## Navigation and interaction behavior

Use `o2Bi8` as the interaction spec source:

- Sidebar item states: default, hover, active, focus.
- Section grouping from existing MkDocs nav.
- Active route highlight should match the Pencil sidebar active item treatment.
- Header buttons should use pill styling and consistent hover/focus states.
- Mobile behavior should degrade to the existing MkDocs drawer model, restyled to the new design.

## Implementation components

### Overrides

- Extend `docs-site/overrides/main.html` to add stable body classes for:
  - Home pages.
  - Blog pages.
  - Blog post pages.
  - Docs content pages.
- Keep analytics and structured data intact.
- Avoid putting large page content in Jinja templates; content stays in markdown.

### Styles

- `docs-site/assets/custom.css`: global tokens, header/sidebar/docs shell, shared components.
- `docs-site/assets/home.css`: Home-only layout and decorative layers.
- `docs-site/assets/pages.css`: non-home docs page patterns.
- `blog-site/assets/custom.css`: blog-specific black/orange theme and article layout.

If shared tokens are duplicated between docs and blog assets, keep values consistent and document them in comments.

### Scripts

- `docs-site/assets/home-animation.js`: Home canvas animation controller.
- Optional blog/docs helper script only if required for safe body classification or progressive enhancement.

No animation script should be required for reading content.

## Testing and verification

Minimum verification after implementation:

1. `python -m mkdocs build -f mkdocs.yml --strict` or repository-equivalent docs build command.
2. `python -m mkdocs build -f mkdocs.blog.yml --strict` or repository-equivalent blog build command.
3. `npm run test:scripts` from the repository root if site sync or scripts changed.
4. Visual smoke review of:
   - `/`
   - `/getting-started/`
   - `/contextdb/`
   - `/team-ops/`
   - `/superpowers/`
   - `/cli-comparison/`
   - `/windows-guide/`
   - `/architecture/`
   - `/changelog/`
   - `/blog/`
   - one blog post page.
5. Reduced-motion smoke by forcing `prefers-reduced-motion` or using a browser setting.
6. Responsive smoke at desktop, tablet, and mobile widths.

## Risks

- MkDocs Material generated markup may resist exact 1:1 layout in some nested content areas.
- Blog and docs use separate source directories and asset roots; styles must not assume one build context.
- Large animation effects can hurt performance if not throttled.
- Current partial uncommitted changes may hide conflicts with the intended final structure.

## Open decisions resolved

- Existing copy stays as source of truth.
- Blog site is in scope.
- Blog uses the Blog Index and Blog Post designs from `CZd5Q`.
- Home dynamic effects are required, not optional.
- The existing partial site redesign should be reused only where useful; otherwise replace it.

## Completion criteria

The task is complete when:

- Main docs and blog build successfully.
- Existing copy remains present and readable.
- Home page visually matches the Pencil Home frame and includes the specified dynamic effects.
- Docs pages use the Pencil dark sidebar/content system.
- Blog index and post pages use the Pencil blog visual system.
- No generated `site/` edits are hand-authored.
- Verification evidence is recorded in the final handoff.
