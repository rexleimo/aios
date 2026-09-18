"""Merge the blog sitemap into the documentation sitemap after the blog build.

`mkdocs build -f mkdocs.yml` writes `site/sitemap.xml` (documentation URLs) and
`mkdocs build -f mkdocs.blog.yml` writes `site/blog/sitemap.xml`. Crawlers and
SEO auditors that read the canonical `/sitemap.xml` therefore never saw any blog
URL, which is reported as important pages missing from the sitemap.

This hook runs at the end of the blog build (after
`scripts/mkdocs_version.py` removed nested redirect URLs) and appends the
remaining blog URLs to the parent sitemap. It is a no-op when the parent sitemap
is absent, for example during a standalone `mkdocs serve` of the blog.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

URL_ENTRY_PATTERN = re.compile(r"<url>.*?</url>", flags=re.S)
LOC_PATTERN = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>")


def merge_sitemaps(site_dir: Path) -> int:
    """Append blog URLs that are missing from the parent sitemap; return the count."""

    if site_dir.name != "blog":
        return 0

    blog_sitemap = site_dir / "sitemap.xml"
    parent_sitemap = site_dir.parent / "sitemap.xml"
    if not blog_sitemap.exists() or not parent_sitemap.exists():
        return 0

    blog_text = blog_sitemap.read_text(encoding="utf-8")
    parent_text = parent_sitemap.read_text(encoding="utf-8")
    if "</urlset>" not in parent_text:
        return 0

    known = set(LOC_PATTERN.findall(parent_text))
    additions: list[str] = []
    for entry in URL_ENTRY_PATTERN.findall(blog_text):
        loc = LOC_PATTERN.search(entry)
        if not loc or loc.group(1) in known:
            continue
        known.add(loc.group(1))
        additions.append(entry)

    if not additions:
        return 0

    parent_sitemap.write_text(
        parent_text.replace("</urlset>", "".join(additions) + "</urlset>", 1),
        encoding="utf-8",
    )
    return len(additions)


def on_post_build(config: Any) -> None:
    merged = merge_sitemaps(Path(config.site_dir).resolve())
    if merged:
        print(f"sitemap: merged {merged} blog URL(s) into the documentation sitemap")
