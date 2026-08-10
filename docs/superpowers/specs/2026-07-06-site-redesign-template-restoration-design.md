# AIOS Site Template Restoration Design

## Goal

Restore the AIOS docs and blog site to the Pencil page system in `/Users/rex/Downloads/cli.rexai.top.pen` by rebuilding the page shells and content structures, not by applying cosmetic CSS over MkDocs Material defaults.

Source nodes:

- Main page system: `CZd5Q`
- Specs and component behavior: `o2Bi8`
- Home animation implementation notes: `yZfz0`

## Root Cause

The previous implementation preserved too much of the default MkDocs Material layout. It changed colors and component styling, but the generated pages still used Material's top header, tab bar, left navigation, right TOC, and default content container. The Pencil docs pages are not a three-column Material documentation site. They are an application-style two-column shell with a fixed product sidebar and a custom content canvas.

## Required Layouts

### Home

Home must remain a full-bleed landing page. It should not inherit docs-page content width, docs sidebar, right TOC, or Material tab navigation.

Required structure:

- Custom top header matching the Pencil home frame.
- Hero section with full-bleed WebGL/canvas layer and abstract geometry.
- Capabilities section with grid canvas and four cards.
- Demo section with terminal and telemetry panel.
- Closing CTA with nebula canvas.
- Footer matching the Home design.

### Docs Pages

Docs pages must match the application shell in node `pchPW` and sibling docs frames.

Required structure:

- Fixed 280px left sidebar from top to bottom.
- Sidebar contains product logo, grouped navigation, icon slots, and bottom status/version block.
- No default Material top header.
- No Material tab bar.
- No right-side TOC column.
- Main content area starts with breadcrumb, title, and description.
- Page-local outline is rendered as an in-content card named `On This Page`.
- Markdown body is rendered in a wide dark canvas with design tokens from `o2Bi8`.

### Blog Index

Blog index must match node `C6Bnp`.

Required structure:

- Independent black/orange editorial header.
- Centered hero with badge, large title, subtitle, and category pills.
- Featured article as a horizontal card with large thumbnail block and article details.
- All posts section with three-column cards.
- Pagination/load-more visual treatment.
- Blog footer.

### Blog Post

Blog post must match node `fj4lo`.

Required structure:

- Independent black/orange editorial header.
- Article container with breadcrumb, tags, title, author/date/read time row, hero visual, and content.
- Readable article width around 760-820px.
- Related reading band with three related cards.
- Blog footer.

## Architecture

Keep MkDocs as the content generator, but override Material template blocks for page shells. The template should classify each page into one of three shells:

- `rex-home-shell`
- `rex-doc-shell`
- `rex-blog-shell` plus `rex-blog-index` or `rex-blog-post`

Presentation is split by responsibility:

- `docs-site/overrides/main.html` routes page types and defines shell blocks.
- `docs-site/overrides/partials/rex/*.html` contains focused shell partials.
- `docs-site/assets/redesign/*.css` owns docs and home design layers.
- `blog-site/assets/redesign/*.css` owns blog design layers.
- Markdown copy stays the source of content. The template may add wrappers and generated cards, but must not replace article/body copy.

## Testing Requirements

Add structural tests before implementation. Tests must fail against the current default-Material shell and pass only when the template exposes the custom shell contract.

Required assertions:

- `main.html` overrides `header`, `tabs`, `site_nav`, `container`, and `footer` blocks.
- `docs-site/overrides/partials/rex/docs-sidebar.html` exists and includes sidebar markers such as `rex-doc-sidebar`, `AIOS`, grouped nav labels, and bottom version/status markers.
- `docs-site/overrides/partials/rex/docs-page.html` exists and includes `rex-doc-layout`, `rex-doc-outline`, and uses MkDocs content rendering.
- Blog partials exist for index and post shells and include featured, card grid, article header, and related-reading markers.
- CSS manifests import the new shell-specific files.

## Constraints

- Preserve existing markdown copy except structural wrappers/classes.
- Do not edit generated `site/` output manually.
- Keep routes, i18n folders, analytics, structured data, and existing Markdown pages intact.
- Keep JavaScript progressive: pages must still show useful content if animations do not run.
- Respect reduced motion for canvas animations.
- Prefer small focused files over monolithic CSS or template files.
