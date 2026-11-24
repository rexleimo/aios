#!/usr/bin/env python3
"""Build the complete local multi-language site with ONE shared visual shell.

Reads the finished home page for head/nav/footer/style, then converts every
docs-site/<locale>/*.md and blog-site/<locale>/*.md into a same-styled page.

Fixes over the flat first pass:
  1. Docs use a LEFT SIDEBAR nav (grouped), not a card grid.
  2. Footer/content spacing added.
  3. Multi-language: en/zh/ja/ko generated with a working language switcher.
  4. Article images constrained to content width (max-width:100%).
  5. Sponsor ad spots (imklom / relay) restored.
All links are local; nothing points at cli.rexai.top.
"""
import os, re, html
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LANDING = ROOT / "landing"
VERSION = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
HOME = (LANDING / "index.html").read_text(encoding="utf-8")

head = HOME[: HOME.index("<body>") + len("<body>")]
ns = HOME.index('<nav id="nav">'); ne = HOME.index("</nav>", ns) + len("</nav>")
nav = HOME[ns:ne]
fs_ = HOME.index("<footer>"); fe = HOME.index("</footer>", fs_) + len("</footer>")
footer = HOME[fs_:fe]
ss = HOME.index("<script>", fe)
scripts = HOME[ss:]

nav = nav.replace('href="https://cli.rexai.top/"', 'href="/"')
nav = nav.replace('href="https://cli.rexai.top/getting-started/"', 'href="/docs/"')
nav = nav.replace('href="https://cli.rexai.top/architecture"', 'href="/docs/architecture/"')
nav = nav.replace('href="https://cli.rexai.top/engineering-standards/"', 'href="/docs/engineering-standards/"')
nav = re.sub(r'href="#([a-z-]+)"', r'href="/#\1"', nav)
# strip any previously injected language switcher so re-runs are idempotent
nav = re.sub(r'<details class="rex-lang-switcher".*?</details>', '', nav, flags=re.S)

LANGS = ["en", "zh", "ja", "ko"]
LANG_NAMES = {"en": "English", "zh": "中文", "ja": "日本語", "ko": "한국어"}

def lang_prefix(lang):
    return "" if lang == "en" else f"/{lang}"

def shell(title, description, main, lang="en", slug=""):
    h = re.sub(r"<title>[^<]*</title>", f"<title>{html.escape(title)}</title>", head)
    h = h.replace("<html lang=", f'<html lang="{lang}" data-gen-lang=', 1)
    switcher = lang_switcher(lang, slug)
    # inject switcher into nav (before first theme button) for generated pages
    n = nav.replace("<button class=\"theme\"", switcher + "<button class=\"theme\"", 1)
    return f'{h}\n{n}\n\n<main class="wrap">\n{main}\n</main>\n\n{footer}\n{scripts}'

def lang_switcher(lang, slug):
    opts = []
    for L in LANGS:
        target = f"{lang_prefix(L)}/{slug}/" if slug else (lang_prefix(L) + "/" if L != "en" else "/")
        active = " is-active" if L == lang else ""
        cur = ' aria-current="true"' if L == lang else ""
        opts.append(f'<a class="rex-lang-opt{active}" href="{target}" hreflang="{L}" lang="{L}"{cur}>{LANG_NAMES[L]}</a>')
    menu = "".join(opts)
    return f'''<details class="rex-lang-switcher" aria-label="Select language">
      <summary class="rex-lang-switcher__summary">{LANG_NAMES[lang]}</summary>
      <div class="rex-lang-menu">{menu}</div>
    </details>'''

# ---- markdown ----
import markdown
MD_EXT = ["markdown.extensions.toc","markdown.extensions.fenced_code",
    "markdown.extensions.tables","markdown.extensions.admonition",
    "pymdownx.superfences","pymdownx.tabbed"]

def parse_frontmatter(text):
    m = re.match(r"^---\n([\s\S]*?)\n---\n?", text)
    if not m: return {}, text
    fm = {}
    for line in m.group(1).splitlines():
        mm = re.match(r'^([A-Za-z0-9_-]+):\s*"?([^"\n]*)"?', line)
        if mm: fm[mm.group(1)] = mm.group(2).strip()
    return fm, text[m.end():]

def md_to_html(text, doc_slugs, lang):
    body = markdown.markdown(text, extensions=MD_EXT)
    p = lang_prefix(lang)
    def link_repl(m):
        target = m.group(2)
        base = target.split("/")[-1]
        slug = base[:-3] if base.endswith(".md") else base
        anchor = ""
        if "#" in slug: slug, a = slug.split("#", 1); anchor = "#" + a
        if slug in doc_slugs:
            return f'{m.group(1)}{p}/docs/{slug}/{anchor}"'
        return m.group(0)
    body = re.sub(r'(<a href=")([^"]+\.md[^"]*)"', link_repl, body)
    body = re.sub(r'src="assets/(visual-[^"]+)"', r'src="/assets/docs/\1"', body)
    body = body.replace('src="assets/', f'src="{p}/assets/')
    body = re.sub(r'src="(?!https?:|/)([^"]+)"', r'src="/\1"', body)
    return body

def collect(directory):
    out = []
    for f in sorted(directory.glob("*.md")):
        fm, body = parse_frontmatter(f.read_text(encoding="utf-8"))
        out.append({"slug": f.stem, "fm": fm, "body": body})
    return out

# Collect all locales
docs_by_lang, blogs_by_lang = {}, {}
doc_slugs_by_lang = {}
for L in LANGS:
    ddir = ROOT / "docs-site" / ("" if L == "en" else L)
    bdir = ROOT / "blog-site" / ("" if L == "en" else L)
    docs_by_lang[L] = collect(ddir)
    blogs_by_lang[L] = collect(bdir)
    doc_slugs_by_lang[L] = {d["slug"] for d in docs_by_lang[L]}

# Docs grouping from the sidebar contract (slug order)
# Group names in the four locales. Key = English name.
GROUP_NAMES = {
    "Getting Started": {"en":"Getting Started","zh":"快速上手","ja":"はじめに","ko":"시작하기"},
    "Problem-First Guides": {"en":"Problem-First Guides","zh":"问题优先指南","ja":"問題別ガイド","ko":"문제별 가이드"},
    "Capabilities": {"en":"Capabilities","zh":"核心能力","ja":"機能","ko":"기능"},
    "Reference": {"en":"Reference","zh":"参考手册","ja":"リファレンス","ko":"레퍼런스"},
    "Case Studies": {"en":"Case Studies","zh":"实战案例","ja":"ケーススタディ","ko":"사례 연구"},
    "Project": {"en":"Project","zh":"项目","ja":"プロジェクト","ko":"프로젝트"},
    "More": {"en":"More","zh":"更多","ja":"その他","ko":"더 보기"},
}
def gname_i18n(name, lang):
    return GROUP_NAMES.get(name, {}).get(lang, name)

UI = {
    "all_docs": {"en":"All docs","zh":"全部文档","ja":"すべてのドキュメント","ko":"모든 문서"},
    "search":   {"en":"Search docs…","zh":"搜索文档…","ja":"ドキュメントを検索…","ko":"문서 검색…"},
    "no_match": {"en":"No matching docs","zh":"没有匹配的文档","ja":"一致するドキュメントなし","ko":"일치하는 문서 없음"},
    "local":    {"en":"local-first","zh":"本地优先","ja":"ローカルファースト","ko":"로컬 우선"},
}
def ui(key, lang):
    return UI[key].get(lang, UI[key]["en"])

DOC_GROUPS = [
    ("Getting Started", ["getting-started","windows-guide","troubleshooting","windows-ai-coding-agent-setup"]),
    ("Problem-First Guides", ["why-agents-forget-context","reduce-agent-token-cost","claude-code-vs-codex-vs-gemini","overnight-agent-runs","multi-agent-code-review","use-cases"]),
    ("Capabilities", ["contextdb","token-compression","workflow-policy","model-router","plugins","codemap","team-ops","solo-harness","superpowers","integrations","perception"]),
    ("Reference", ["architecture","route-concurrency-profiles","advanced-design-skills","hud-guide","debug-hub","cli-comparison","engineering-standards"]),
    ("Case Studies", ["case-library","case-auth-wall-browser","case-cross-cli-handoff","case-privacy-guard"]),
    ("Project", ["changelog","friends","skill-candidates"]),
]
def doc_nav(lang, active_slug):
    p = lang_prefix(lang)
    by_slug = {d["slug"]: d for d in docs_by_lang[lang]}
    grouped = set()
    parts = []
    for gi, (gname, slugs) in enumerate(DOC_GROUPS):
        items = []
        for s in slugs:
            d = by_slug.get(s)
            if not d: continue
            grouped.add(s)
            title = d["fm"].get("title") or s.replace("-", " ").title()
            active = s == active_slug
            cur = ' aria-current="page" class="rex-doc-nav-link is-active"' if active else ' class="rex-doc-nav-link"'
            items.append(f'<a href="{p}/docs/{s}/"{cur} data-title="{html.escape(title.lower(), quote=True)}">{html.escape(title)}</a>')
        if items:
            open_attr = " open" if any(x == active_slug for x in slugs) else ("" if gi == 0 else "")
            parts.append(f'<details class="rex-doc-nav-group"{open_attr}><summary>{html.escape(gname_i18n(gname, lang))}</summary><div class="rex-doc-nav-items">{"".join(items)}</div></details>')
    # catch-all for anything not in a group (e.g. index, other locales' extras)
    rest = [d for d in docs_by_lang[lang] if d["slug"] not in grouped and d["slug"] != "index"]
    if rest:
        items = "".join(f'<a href="{p}/docs/{d["slug"]}/" class="rex-doc-nav-link" data-title="{html.escape((d["fm"].get("title") or d["slug"]).lower(), quote=True)}">{html.escape(d["fm"].get("title") or d["slug"])}</a>' for d in rest)
        parts.append(f'<details class="rex-doc-nav-group"><summary>More</summary><div class="rex-doc-nav-items">{items}</div></details>')
    return "".join(parts)

AD_LEADER = '''<a class="rex-ad rex-ad--leader" href="https://imklom.im" target="_blank" rel="noopener">
  <img src="/assets/ads/imklom.png" alt="imklom.im — AI 图像生成" loading="lazy">
  <span><strong>imklom.im</strong><span>AI 做图 · 一句话生成高质量图片 / AI image generation.</span></span>
  <em>赞助 · Sponsor</em>
</a>'''
AD_SIDE = '''<a class="rex-ad rex-ad--side" href="https://tool.rexai.top" target="_blank" rel="noopener">
  <img src="/assets/ads/relay.png" alt="RexAI 工具站" loading="lazy">
  <span><strong>RexAI 工具站</strong><span>免费无广告的在线 AI 工具集 / Free no-ad online tools.</span></span>
  <em>赞助 · Sponsor</em>
</a>'''

def doc_page(d, lang):
    p = lang_prefix(lang)
    title = d["fm"].get("title") or d["slug"].replace("-", " ").title()
    desc = d["fm"].get("description", "")
    art = md_to_html(d["body"], doc_slugs_by_lang[lang], lang)
    art = re.sub(r"\s*<h1[^>]*>[^<]*</h1>", "", art, count=1)
    # prev/next
    slugs = [x["slug"] for x in docs_by_lang[lang]]
    idx = slugs.index(d["slug"])
    prevp = f'<a href="{p}/docs/{slugs[idx-1]}/">← 上一篇</a>' if idx > 0 else ""
    nextp = f'<a href="{p}/docs/{slugs[idx+1]}/">下一篇 →</a>' if idx < len(slugs)-1 else ""
    main = f'''
<div class="rex-doc-layout">
  <aside class="rex-doc-sidebar">
    <a class="rex-doc-sidebar__home" href="{p}/docs/">{ui('all_docs', lang)}</a>
    <div class="rex-doc-search"><input type="search" id="rex-doc-search-input" placeholder="{ui('search', lang)}" aria-label="{ui('search', lang)}" autocomplete="off"></div>
    <div id="rex-doc-nav">{doc_nav(lang, d["slug"])}</div>
    <p class="rex-doc-search-empty" id="rex-doc-search-empty" hidden>{ui('no_match', lang)}</p>
    <div class="rex-doc-sidebar__status">AIOS · v{VERSION} · {ui('local', lang)}</div>
  </aside>
  <article class="rex-doc-article">
    <p class="eyebrow">文档 · {LANG_NAMES[lang]}</p>
    <h1>{html.escape(title)}</h1>
    <p class="lede" style="font-size:17px">{html.escape(desc[:260])}</p>
    <div class="rex-doc-content md-body">{art}</div>
    {AD_LEADER}
    <nav class="rex-doc-pager">{prevp}{nextp}</nav>
    {AD_SIDE}
  </article>
</div>'''
    return shell(title, desc, main, lang, f"docs/{d['slug']}")

def doc_index(lang):
    p = lang_prefix(lang)
    items = "".join(
        f'<a class="rex-doc-index-card" href="{p}/docs/{d["slug"]}/"><b>{html.escape(d["fm"].get("title") or d["slug"])}</b><span>{html.escape(d["fm"].get("description","")[:100])}</span></a>'
        for d in docs_by_lang[lang])
    main = f'''
  <header class="hero" style="grid-template-columns:1fr; padding-top:56px; gap:0">
    <div><p class="eyebrow">文档 · {LANG_NAMES[lang]}</p><h1>AIOS <span>完整文档。</span></h1>
    <p class="lede">安装、工作流、记忆、客户端、验证——按主题分篇，左侧导航随时跳转。</p></div>
  </header>
  <section style="padding-top:16px"><div class="rex-doc-index">{items}</div></section>'''
    return shell(f"文档 — AIOS ({LANG_NAMES[lang]})", "AIOS 完整文档", main, lang, "docs")

def blog_page(b, lang):
    p = lang_prefix(lang)
    title = b["fm"].get("title") or b["slug"].replace("-", " ").title()
    desc = b["fm"].get("description", "")
    date = b["fm"].get("date", "")
    art = md_to_html(b["body"], doc_slugs_by_lang[lang], lang)
    art = re.sub(r"\s*<h1[^>]*>[^<]*</h1>", "", art, count=1)
    main = f'''
  <header class="hero" style="grid-template-columns:1fr; padding-top:56px; gap:0">
    <div><p class="eyebrow">博客 · {html.escape(date)}</p><h1>{html.escape(title)}</h1>
    <p class="lede" style="font-size:17px">{html.escape(desc[:260])}</p>
    <div class="meta"><a href="{p}/blog/">← 全部文章</a> · <a href="{p or '/'}">首页</a></div></div>
  </header>
  <section style="padding-top:16px"><div class="md-body rex-article">{art}</div>{AD_SIDE}</section>'''
    return shell(title, desc, main, lang, f"blog/{b['slug']}")

def blog_index(lang):
    p = lang_prefix(lang)
    cards = "".join(
        f'<a class="rex-blog-card" href="{p}/blog/{b["slug"]}/"><b>{html.escape(b["fm"].get("title") or b["slug"])}</b><span>{html.escape(b["fm"].get("description","")[:150])}</span><em>{html.escape(b["fm"].get("date",""))}</em></a>'
        for b in blogs_by_lang[lang])
    main = f'''
  <header class="hero" style="grid-template-columns:1fr; padding-top:56px; gap:0">
    <div><p class="eyebrow">博客 · {LANG_NAMES[lang]}</p><h1>Agent 工程的<span>真实复盘。</span></h1>
    <p class="lede">发布记录、架构决策与可复核的工程实验——来自正在构建 AIOS 的团队。</p></div>
  </header>
  {AD_LEADER}
  <section style="padding-top:16px"><div class="rex-blog-grid">{cards}</div></section>'''
    return shell(f"博客 — AIOS ({LANG_NAMES[lang]})", "AIOS 博客", main, lang, "blog")

def write_page(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

for L in LANGS:
    p = lang_prefix(L)
    base = LANDING / ("" if L == "en" else L)
    write_page(base / "docs" / "index.html", doc_index(L))
    for d in docs_by_lang[L]:
        write_page(base / "docs" / d["slug"] / "index.html", doc_page(d, L))
    write_page(base / "blog" / "index.html", blog_index(L))
    for b in blogs_by_lang[L]:
        write_page(base / "blog" / b["slug"] / "index.html", blog_page(b, L))

# ---- global localize links on every generated file + home ----
def localize(text):
    text = re.sub(r'https://cli\.rexai\.top/getting-started/?', '/docs/getting-started/', text)
    text = re.sub(r'https://cli\.rexai\.top/blog/([a-z0-9-]+)/?', r'/blog/\1/', text)
    text = re.sub(r'https://cli\.rexai\.top/blog/?', '/blog/', text)
    text = re.sub(r'https://cli\.rexai\.top/([a-z0-9-]+)/?', r'/docs/\1/', text)
    text = re.sub(r'https://cli\.rexai\.top/', '/', text)
    text = text.replace('https://cli.rexai.top', '/')
    text = re.sub(r'[?&]utm_source=cli_rexai_top[^"&<]*', '', text)
    return text

for f in [LANDING / "index.html"] + list(LANDING.rglob("*.html")):
    if "reference-clone" in f.name: continue
    f.write_text(localize(f.read_text(encoding="utf-8")), encoding="utf-8")

print(f"built multi-language site: {len(LANGS)} langs | docs {[len(docs_by_lang[L]) for L in LANGS]} | blogs {[len(blogs_by_lang[L]) for L in LANGS]}")
