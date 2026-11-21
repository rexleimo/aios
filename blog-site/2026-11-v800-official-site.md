---
title: "v8.0.0: One Visual Language for Site, Docs and Blog"
description: "AIOS ships a single magpie-style surface across the official site, docs and blog — en/zh/ja/ko, real Console screenshots, a working model gateway workspace, and localized navigation."
date: 2026-11-21
tags: ["AIOS", "v8.0.0", "site", "docs", "blog", "i18n", "release"]
---

# v8.0.0: One Visual Language for Site, Docs and Blog

This release is about the surface you actually see. The official site, the
documentation and the blog now share one visual language: a light editorial
layout, monospace eyebrows, near-black headings, hairline card grids and the
same top navigation everywhere. The old split between a marketing home and a
 Material-style docs tree is gone.

## Localized end to end

Docs and blog are published in English, Chinese, Japanese and Korean from the
same source of truth. The language switcher in the navigation sends each reader
to their own locale, and in-page links stay within that locale. Sidebar groups,
search placeholders and status labels are translated too — not just the article
body.

## Real product screenshots

The images are live captures of the running AIOS Console, not concept art or
stale test evidence. The model gateway section shows the actual
client → AIOS gateway → provider routing diagram with real request, model and
error counts, matching the tool you can open locally.

## Docs that navigate

Documentation pages use a grouped left sidebar with live search and collapsible
sections instead of a flat card grid. Each page keeps a previous/next pager and
the sponsor ad spots that the published site has always carried.

## Under the hood

- The published site is a zero-build static tree (`landing/`) assembled from
  the MkDocs content sources by `landing/scripts/build-site.py`.
- GitHub Pages deploys it at the site root so `/docs/`, `/blog/` and the
  `/zh|ja|ko/` prefixes are all valid absolute paths.
- The `rex-harness` submodule is pinned to v1.0.0, matching the readiness and
  standards contracts the release gate expects.

See the [changelog](https://cli.rexai.top/changelog/) for the full list.
