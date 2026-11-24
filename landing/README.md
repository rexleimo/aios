# AIOS landing page (GitHub Pages)

A static landing page that keeps the **visual language** of the
`usemagpie.ai/zh` reference page (layout, spacing, type scale, light/dark tokens,
card/grid components, responsive breakpoints) but carries **AIOS's own content**:
copy, product screenshots, brand mark, links and CLI examples.

| File | What it is |
|---|---|
| `index.html` | Live page — AIOS content, magpie-style shell. This is what Pages serves. |
| `reference-clone.html` | The pristine pixel-level clone kept for comparison (0/12.6M pixel diff at 1440px). |
| `assets/css/style.css` | Reference stylesheet, byte-for-byte (tokens + all breakpoints). |
| `assets/media/aios/*` | AIOS brand mark + product screenshots copied from `brand/` and `docs-site/assets/home/`. |
| `assets/media/icons/*` | Third-party client logos used in the client list. |
| `scripts/*.mjs` | Recon / download / build / verification tooling (re-runnable). |
| `docs/research/components/*.spec.md` | 13 section specs (from the reference capture). |

## Generated localized pages

`docs-site/**/*.md` and `blog-site/**/*.md` are the tracked content sources.
`landing/scripts/build-site.py` renders them into:

- `landing/docs/` — English documentation
- `landing/blog/` — English blog
- `landing/zh/`, `landing/ja/`, `landing/ko/` — localized docs and blog

Those five generated directories are ignored and must not be committed. Build
them locally with:

```bash
python -m pip install Markdown==3.10.3 pymdown-extensions==10.21.3
python landing/scripts/build-site.py
```

`landing/index.html`, `landing/assets/`, `landing/scripts/`,
`landing/getting-started/`, and the reference files remain handwritten and
tracked.

## What changed from the pixel clone

- Brand, nav, meta/JSON-LD, canonical URL → AIOS / `cli.rexai.top` / `github.com/rexleimo/aios`.
- Hero, capability strip, client list, all six sections, CLI transcript, CTA and
  footer rewritten with AIOS's real product facts (ContextDB memory, adaptive
  workflow routing, multi-agent teams, verification).
- Product images swapped to AIOS's own UI: `portrait.png` (hero),
  `team.png` (multi-agent), `doctor.png` (verification), `dashboard.png`
  (context engineering), `mark.png` (brand).
- The reference's model-routing animation (deeply tied to magpie's accounts) was
  replaced with a lightweight AIOS workflow switcher — Direct / Guarded /
  Planned — using the same `.rt` visual components and a small local script.
- Sponsor cards replaced by an AIOS capability strip with distinct line icons.
- Analytics removed; `/api/latest` version feed dropped (version is hard-coded
  to the repo's `VERSION`, currently 7.2.0).

### Real screenshots from the running software (latest pass)

The earlier "AIOS" images came from `docs-site/assets/home/*` (concept art) and
`docs/reports/evidence/shell-console-2026-11/*` (stale test evidence) — neither
matches the current product. They were replaced with **live captures of the
running AIOS Console** (`apps/shell/ui`, started via `scripts/aios-ui.mjs`),
taken with `scripts/capture-console-live.mjs` at 1440×900:

- `live-home.png` — 首页（客户端与模型、最近请求、配置默认）
- `live-gateway-flow.png` — **模型网关**：真实的客户端 → AIOS 网关 → 模型路由图（37 请求 / 13 模型 / 21 错误）
- `live-tools.png` — Agent 客户端接入
- `live-resources.png` — 资源库（MCP / Skills / Subagents）
- `live-memory.png` — 项目记忆
- `live-activity.png` — 活动记录

`#how` was rebuilt as a real **模型网关** section using the actual gateway flow
screenshot (the feature the user said was not done properly), with copy that
matches what the screen shows. `scripts/use-live-console.mjs` is the asserted,
re-runnable transform.

### Review-fix pass (`scripts/fix-content.mjs`, idempotent + asserted)

1. **Image/copy alignment** — the repo has no real product screenshots, so the
   existing AIOS UI images were kept as the source of truth and the copy was
   rewritten to match what each image actually shows: hero (`portrait.png`, a
   task-execution UI) now reads "把任务真正做完"; the section using
   `dashboard.png` (Guarded Mode workbench) was retitled 守护模式 / "Agent 动手
   之前，先过一道策略" instead of the mismatched 上下文压缩 copy.
2. **Capability grid** — switched from a single column to a 3-per-row CSS grid
   (6 capabilities, 3+3; 2 cols ≤860px, 1 col ≤560px).
3. **Client marks** — no correct official icons exist in-repo for Hermes,
   WorkBuddy or Qoder, so the wrong ones were replaced with unambiguous letter
   marks `HE` / `WB` / `QO` (same convention as `docs-site/index.md`).

## Preview

```bash
cd landing && python3 -m http.server 8899
# http://127.0.0.1:8899/
```

Or open `index.html` directly (the only console noise is the harmless
`/api/latest` fetch removed in the live copy).

## GitHub Pages

`.github/workflows/pages.yml` installs the pinned Markdown builder dependencies,
runs `python landing/scripts/build-site.py`, then copies `landing/index.html`,
`assets/`, the generated `docs/` and `blog/` trees, localized roots, and
`getting-started/` into the `site/` artifact. Served at the site root so
`/docs/`, `/blog/`, `/zh/`, `/ja/`, and `/ko/` remain valid.

Generated localized HTML is intentionally absent from Git. A change to
Markdown, the builder, or the workflow is enough to reproduce it in CI.

> `.gitignore` has a scoped un-ignore for `landing/assets/media/**/*.png` —
> without it the repo-wide `*.png` rule would silently drop every product image
> from the Pages artifact. Keep that rule.

## Verification

Playwright, 1440×900 and 390×844: HTTP 200, 0 broken images, no console errors.
Theme cycles system → light → dark; workflow tabs switch label and active row;
copy button and mobile menu work. Evidence screenshots in
`docs/design-references/` and `docs/research/QA.md`.
