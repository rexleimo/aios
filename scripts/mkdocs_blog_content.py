from __future__ import annotations

import json
import math
import re
from collections import Counter
from datetime import date, datetime
from hashlib import md5
from pathlib import Path
from typing import Any

import yaml

PAGE_SIZE = 6
DEFAULT_AUTHOR = "RexAI Team"
THEME_CLASSES = (
    "is-orange",
    "is-blue",
    "is-green",
    "is-violet",
    "is-red",
    "is-teal",
)
LOCALES = ("en", "zh", "ja", "ko")
LOCALIZED_COPY = {
    "en": {
        "hero_badge": "THE HARNESS CLI BLOG",
        "hero_title": "Notes from the local agent layer",
        "hero_body": "Deep dives, release notes, and field reports on memory, orchestration, and verification from the team building Harness CLI.",
        "all_posts": "All posts",
        "all_tag": "All",
        "featured_badge": "FEATURED",
        "featured_aria": "Featured article",
        "pill_aria": "Blog categories",
        "sort_newest": "Newest first",
        "sort_oldest": "Oldest first",
        "load_more": "+ Load more articles",
        "articles_suffix": "articles",
        "empty_state": "No posts match this filter yet.",
        "pagination_aria": "Pagination",
        "related_label": "RELATED READING",
        "related_title": "More from the blog",
        "read_more": "Read more ->",
        "blog_label": "Blog",
        "updates": "Updates",
    },
    "zh": {
        "hero_badge": "HARNESS CLI BLOG",
        "hero_title": "来自本地 agent layer 的笔记",
        "hero_body": "围绕记忆系统、编排与验证的深度文章、发布说明与实战记录，全部来自 Harness CLI 一线构建过程。",
        "all_posts": "全部文章",
        "all_tag": "全部",
        "featured_badge": "精选",
        "featured_aria": "精选文章",
        "pill_aria": "博客分类",
        "sort_newest": "最新优先",
        "sort_oldest": "最早优先",
        "load_more": "+ 加载更多文章",
        "articles_suffix": "篇文章",
        "empty_state": "当前筛选条件下还没有文章。",
        "pagination_aria": "分页",
        "related_label": "相关推荐",
        "related_title": "继续阅读",
        "read_more": "继续阅读 ->",
        "blog_label": "博客",
        "updates": "更新",
    },
    "ja": {
        "hero_badge": "HARNESS CLI BLOG",
        "hero_title": "local agent layer からのノート",
        "hero_body": "メモリ、オーケストレーション、検証に関する深掘り記事とリリースノート、現場レポートを Harness CLI チームから届けます。",
        "all_posts": "すべての記事",
        "all_tag": "すべて",
        "featured_badge": "FEATURED",
        "featured_aria": "注目記事",
        "pill_aria": "ブログカテゴリ",
        "sort_newest": "新しい順",
        "sort_oldest": "古い順",
        "load_more": "+ さらに記事を読む",
        "articles_suffix": "記事",
        "empty_state": "この条件に一致する記事はまだありません。",
        "pagination_aria": "ページネーション",
        "related_label": "RELATED",
        "related_title": "関連記事",
        "read_more": "続きを読む ->",
        "blog_label": "Blog",
        "updates": "Updates",
    },
    "ko": {
        "hero_badge": "HARNESS CLI BLOG",
        "hero_title": "local agent layer notes",
        "hero_body": "Harness CLI 팀이 만드는 메모리, 오케스트레이션, 검증에 관한 심층 글과 릴리스 노트, 현장 기록입니다.",
        "all_posts": "모든 글",
        "all_tag": "전체",
        "featured_badge": "FEATURED",
        "featured_aria": "추천 글",
        "pill_aria": "블로그 카테고리",
        "sort_newest": "최신순",
        "sort_oldest": "오래된순",
        "load_more": "+ 더 보기",
        "articles_suffix": "개 글",
        "empty_state": "이 필터에 맞는 글이 아직 없습니다.",
        "pagination_aria": "페이지네이션",
        "related_label": "RELATED",
        "related_title": "더 읽기",
        "read_more": "더 읽기 ->",
        "blog_label": "Blog",
        "updates": "Updates",
    },
}

BLOG_STATE: dict[str, Any] = {
    "posts_by_locale": {},
    "posts_by_src": {},
    "index_urls": {},
}


def detect_locale(src_uri: str) -> str:
    first_segment = src_uri.split("/", 1)[0]
    return first_segment if first_segment in LOCALES else "en"


def normalize_tags(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def normalize_date(value: Any) -> tuple[str, int]:
    current: date | None = None
    if isinstance(value, datetime):
        current = value.date()
    elif isinstance(value, date):
        current = value
    elif isinstance(value, str) and value.strip():
        candidate = value.strip()[:10]
        try:
            current = date.fromisoformat(candidate)
        except ValueError:
            current = None
    if current is None:
        return "", 0
    sort_value = int(datetime(current.year, current.month, current.day).timestamp())
    return current.isoformat(), sort_value


def estimate_read_minutes(markdown_text: str) -> int:
    tokens = re.findall(r"[A-Za-z0-9_]+|[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]", markdown_text)
    return max(1, math.ceil(len(tokens) / 220))


def build_related_posts(current_post: dict[str, Any] | None, posts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not posts:
        return []
    if current_post is None:
        return posts[1:4]

    current_tags = {tag.casefold() for tag in current_post.get("tags", [])}
    scored: list[tuple[int, int, dict[str, Any]]] = []
    for post in posts:
        if post.get("src_uri") == current_post.get("src_uri"):
            continue
        shared = len(current_tags.intersection(tag.casefold() for tag in post.get("tags", [])))
        scored.append((shared, post.get("date_sort", 0), post))
    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [post for _, _, post in scored[:3]]


def load_source(abs_src_path: str | None) -> tuple[dict[str, Any], str]:
    if not abs_src_path:
        return {}, ""
    raw = Path(abs_src_path).read_text(encoding="utf-8")
    match = re.match(r"^---\s*\r?\n(.*?)\r?\n---\s*(?:\r?\n|$)", raw, re.S)
    if not match:
        return {}, raw
    meta = yaml.safe_load(match.group(1)) or {}
    if not isinstance(meta, dict):
        meta = {}
    return meta, raw[match.end() :]


def summarize(markdown_text: str) -> str:
    compact = re.sub(r"\s+", " ", markdown_text)
    compact = re.sub(r"[`*_#>\-]", "", compact).strip()
    return compact[:180].strip()


def format_read_time(locale: str, minutes: int) -> str:
    if locale == "zh":
        return f"{minutes} min"
    if locale == "ja":
        return f"{minutes} min"
    if locale == "ko":
        return f"{minutes} min"
    return f"{minutes} min read"


def pick_theme_class(seed: str) -> str:
    digest = md5(seed.encode("utf-8")).digest()[0]
    return THEME_CLASSES[digest % len(THEME_CLASSES)]


def pick_icon(tags: list[str]) -> str:
    lookup = " ".join(tag.casefold() for tag in tags)
    if "memory" in lookup or "context" in lookup:
        return "database"
    if "govern" in lookup or "security" in lookup:
        return "shield"
    if "team" in lookup or "agent" in lookup:
        return "team"
    if "platform" in lookup or "windows" in lookup:
        return "monitor"
    if "design" in lookup or "ux" in lookup:
        return "spark"
    if "research" in lookup or "training" in lookup:
        return "flask"
    return "bolt"


def extract_author(meta: dict[str, Any]) -> str:
    author = meta.get("author") or meta.get("authors")
    if isinstance(author, list) and author:
        author = author[0]
    if isinstance(author, str) and author.strip():
        return author.strip()
    return DEFAULT_AUTHOR


def extract_initials(name: str) -> str:
    parts = [part[0] for part in re.split(r"\s+", name.strip()) if part]
    if len(parts) >= 2:
        return "".join(parts[:2]).upper()
    letters = re.sub(r"[^A-Za-z0-9]", "", name)
    return (letters[:2] or "RX").upper()


def should_skip(src_uri: str, meta: dict[str, Any], markdown_text: str) -> bool:
    if Path(src_uri).name == "index.md":
        return True
    title = str(meta.get("title") or "").strip()
    description = str(meta.get("description") or "").strip()
    if title == "Redirecting...":
        return True
    if description == "This page has moved.":
        return True
    if markdown_text.lstrip().startswith("# Redirecting"):
        return True
    return False


def absolute_url(page: Any) -> str:
    return getattr(page, "abs_url", None) or "/"


def build_tag_options(posts: list[dict[str, Any]], locale: str) -> list[dict[str, str]]:
    counts = Counter(tag for post in posts for tag in post.get("tags", []))
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0].casefold()))[:6]
    options = [{"value": "all", "label": LOCALIZED_COPY[locale]["all_tag"]}]
    options.extend({"value": tag, "label": tag} for tag, _ in ordered)
    return options


def safe_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False).replace("</", "<\\/")


def build_post_record(page: Any, locale: str, meta: dict[str, Any], markdown_text: str) -> dict[str, Any]:
    title = str(meta.get("title") or getattr(page, "title", "") or "Untitled").strip()
    description = str(meta.get("description") or summarize(markdown_text)).strip()
    tags = normalize_tags(meta.get("tags"))
    date_label, date_sort = normalize_date(meta.get("date") or meta.get("publish_date"))
    author = extract_author(meta)
    minutes = estimate_read_minutes(markdown_text)
    category = tags[0] if tags else LOCALIZED_COPY[locale]["updates"]
    url = absolute_url(page)

    return {
        "src_uri": getattr(page.file, "src_uri", ""),
        "locale": locale,
        "url": url,
        "title": title,
        "description": description,
        "tags": tags,
        "category": category,
        "date_label": date_label,
        "date_sort": date_sort,
        "author": author,
        "initials": extract_initials(author),
        "read_minutes": minutes,
        "read_time_label": format_read_time(locale, minutes),
        "theme_class": pick_theme_class(f"{locale}:{title}"),
        "icon": pick_icon(tags),
    }


def on_nav(nav, *, config, files):
    posts_by_locale: dict[str, list[dict[str, Any]]] = {locale: [] for locale in LOCALES}
    posts_by_src: dict[str, dict[str, Any]] = {}
    index_urls: dict[str, str] = {}

    for page in getattr(nav, "pages", []):
        src_uri = getattr(page.file, "src_uri", "")
        if not src_uri.endswith(".md"):
            continue

        locale = detect_locale(src_uri)
        if Path(src_uri).name == "index.md":
            index_urls[locale] = absolute_url(page)
            continue

        meta, markdown_text = load_source(getattr(page.file, "abs_src_path", None))
        if should_skip(src_uri, meta, markdown_text):
            continue

        record = build_post_record(page, locale, meta, markdown_text)
        posts_by_locale[locale].append(record)
        posts_by_src[src_uri] = record

    for locale, posts in posts_by_locale.items():
        posts.sort(key=lambda post: (post.get("date_sort", 0), post.get("title", "").casefold()), reverse=True)

    BLOG_STATE["posts_by_locale"] = posts_by_locale
    BLOG_STATE["posts_by_src"] = posts_by_src
    BLOG_STATE["index_urls"] = index_urls
    return nav


def on_page_context(context, *, page, config, nav):
    src_uri = getattr(page.file, "src_uri", "")
    locale = detect_locale(src_uri)
    posts = BLOG_STATE.get("posts_by_locale", {}).get(locale, [])
    current = BLOG_STATE.get("posts_by_src", {}).get(src_uri)
    featured = posts[0] if posts else None
    initial_posts = posts[1 : 1 + PAGE_SIZE] if featured else posts[:PAGE_SIZE]
    card_total = max(len(posts) - 1, 0) if featured else len(posts)
    page_total = max(1, math.ceil(card_total / PAGE_SIZE)) if posts else 1
    copy = dict(LOCALIZED_COPY[locale])

    rex_blog = {
        "locale": locale,
        "count": len(posts),
        "page_size": PAGE_SIZE,
        "featured": featured,
        "initial_posts": initial_posts,
        "has_more": card_total > PAGE_SIZE,
        "page_total": page_total,
        "tag_options": build_tag_options(posts, locale),
        "strings": copy,
        "current": current,
        "related": build_related_posts(current, posts),
        "blog_home_url": BLOG_STATE.get("index_urls", {}).get(locale, "/blog/"),
        "docs_home_url": (((config.extra or {}).get("links") or {}).get("docs") or "https://cli.rexai.top/"),
    }

    context["rex_blog"] = rex_blog
    context["rex_blog_posts_json"] = safe_json(posts)
    context["rex_blog_strings_json"] = safe_json(copy)
    return context
