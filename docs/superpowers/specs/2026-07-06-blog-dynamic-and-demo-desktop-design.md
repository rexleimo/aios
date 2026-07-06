# Blog Dynamic Shell + Demo Desktop Layout Design

**Date:** 2026-07-06
**Scope:** Home page demo layout and blog index/post shells
**Status:** Approved in-chat as option B

## Goal

Finish the remaining site restoration work by:

1. keeping the Home page `LIVE DEMO` section in a desktop left/right layout at normal desktop widths, and
2. replacing the blog's hardcoded shell content with real content-driven rendering and interactive filtering/sorting behavior.

## Problem

Two gaps remain in the current site redesign:

- The Home page demo row collapses to a stacked layout too early because the breakpoint is still tuned like a scaled artboard, so desktop-ish widths look wrong.
- The blog shell is visually styled, but the actual content model is fake: featured article, article count, tags, cards, metadata, and related reading are hardcoded instead of being derived from `blog-site/*.md`.

## Non-Goals

- No redesign of accepted Home hero/HUD work
- No migration away from MkDocs Material
- No manual edits to generated `site/` output
- No new frontend framework

## Constraints

- Keep the current MkDocs docs/blog build pipeline.
- Keep the existing markdown files under `docs-site/` and `blog-site/` as the source of truth.
- Do not revert unrelated dirty-worktree changes.
- Keep blog behavior compatible with the current i18n blog structure.

## Approved Approach

### A. Demo section desktop fix

Narrow the responsive breakpoint for `.demo-row` so the left terminal + right telemetry panel stays side-by-side through standard desktop widths. The section should only stack once the layout would otherwise become visibly cramped.

### B. Dynamic blog shell

Use the existing MkDocs content model and inject derived blog metadata at build time through a MkDocs hook. Then use:

- Jinja templates for content-driven shell structure
- one lightweight runtime script for blog index interactivity
- existing blog CSS layers with small extensions for buttons, counts, and empty states

This keeps the site static for deployment while making the blog behave like a real content-driven experience.

## Dynamic Blog Requirements

The blog shell must derive these values from markdown content instead of hardcoded fake copy:

- featured post
- article count
- tag/category pills
- post cards
- author/date/read-time metadata
- related reading on article pages

The blog index must support real client-side:

- tag filtering
- sort toggling
- load more pagination

## Data Model

For each blog post, derive:

- locale
- URL
- title
- description
- date or publish date
- tags
- author fallback
- initials
- estimated read time
- visual theme token for card rendering

Redirect placeholder pages and the index page itself must be excluded from the content feed.

## Success Criteria

1. Home demo remains left/right at widths like 1280px and 1100px.
2. Blog index no longer contains fixed fake numbers or hardcoded article cards.
3. Blog post metadata and related reading come from real page data.
4. `mkdocs.blog.yml` build continues to pass in strict mode.
5. Site redesign regression tests cover both the demo breakpoint and the dynamic blog contract.
