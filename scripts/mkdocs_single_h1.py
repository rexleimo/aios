"""Drop the redundant document-level H1 from every page's markdown.

The RexAI overrides render the page title once in a hero header
(`partials/rex/docs-page.html`, `partials/rex/blog-post.html`) and the page
markdown repeats it as `# Title`, so every rendered page carried two `<h1>`
elements. Search engines report that as a structure defect, while the visible
design only ever used the hero heading (the article heading is hidden by
`pages.css` for documentation pages and duplicated the title on blog posts).

Removing the first document-level heading keeps the source markdown
author-friendly and the rendered document single-H1. Headings after the first
one and level-2+ headings are left untouched, and fenced code blocks are
skipped so `#` comment lines inside examples are never treated as headings.
"""

from __future__ import annotations

import re
from typing import Any

ATX_H1_PATTERN = re.compile(r"^#(?!#)[ \t]+\S")
FENCE_PATTERN = re.compile(r"^ {0,3}(`{3,}|~{3,})")


def strip_first_h1(markdown: str) -> tuple[str, bool]:
    """Return the markdown without its first level-1 heading, plus a removed flag."""

    lines = markdown.splitlines(keepends=True)
    fence: str | None = None

    for index, line in enumerate(lines):
        content = line.rstrip("\r\n")

        fence_match = FENCE_PATTERN.match(content)
        if fence_match:
            marker = fence_match.group(1)[0] * 3
            if fence is None:
                fence = marker
            elif fence == marker:
                fence = None
            continue

        if fence is not None:
            continue

        if ATX_H1_PATTERN.match(content):
            return "".join(lines[:index] + lines[index + 1 :]), True

    return markdown, False


def on_page_markdown(markdown: str, page: Any = None, config: Any = None, **kwargs: Any) -> str:
    updated, removed = strip_first_h1(markdown)
    if removed:
        source = getattr(getattr(page, "file", None), "src_uri", None) or getattr(page, "title", page)
        print(f"single-h1: dropped duplicate page title heading from {source}")
    return updated
