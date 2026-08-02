from __future__ import annotations

import re
from pathlib import Path
from typing import Any


SEMVER_PATTERN = re.compile(
    r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)"
    r"(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
)

# Nested redirect URLs produced by the legacy blog/blog/ redirect page:
# /blog/blog/<slug>/ and /blog/{zh,ja,ko}/blog/<slug>/ must never be indexed.
NESTED_REDIRECT_URL = re.compile(
    r"<url>\s*<loc>[^<]*/blog/(?:blog|(?:zh|ja|ko)/blog)/[^<]*</loc>.*?</url>\s*",
    flags=re.S,
)


def on_config(config: Any) -> Any:
    config_path = getattr(config, "config_file_path", None)
    if not config_path:
        raise RuntimeError("MkDocs config path is required to resolve VERSION")

    version_path = Path(config_path).resolve().parent / "VERSION"
    try:
        version = version_path.read_text(encoding="utf-8").strip()
    except OSError as error:
        raise RuntimeError(f"Unable to read {version_path}") from error

    if not SEMVER_PATTERN.fullmatch(version):
        raise RuntimeError(f"Invalid VERSION value: {version!r}")

    config.extra["aios_version"] = version
    return config


def on_env(env: Any, config: Any, **kwargs: Any) -> Any:
    """Register a filter so hreflang tags only point at translations that exist."""
    docs_dir = Path(config["docs_dir"])

    def translation_exists(rel_slug: str) -> bool:
        # rel_slug forms: "" (en index) / "zh/" / "2026-08-x/" / "zh/2026-08-x/"
        stripped = rel_slug.rstrip("/")
        if stripped in ("", "zh", "ja", "ko", "en"):
            md_path = "index.md" if not stripped else stripped + "/index.md"
        else:
            md_path = stripped + ".md"
        return (docs_dir / md_path).exists()

    env.filters["translation_exists"] = translation_exists
    return env


def on_post_build(config: Any) -> None:
    """Remove nested redirect URLs from generated sitemaps."""
    site_dir = Path(config["site_dir"])
    for sitemap_rel in ("sitemap.xml", "blog/sitemap.xml"):
        sitemap = site_dir / sitemap_rel
        if not sitemap.exists():
            continue
        text = sitemap.read_text(encoding="utf-8")
        cleaned, count = NESTED_REDIRECT_URL.subn("", text)
        if count:
            sitemap.write_text(cleaned, encoding="utf-8")
            print(f"sitemap: removed {count} nested redirect URL(s) from {sitemap_rel}")
