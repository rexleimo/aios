# Documentation Interface Design Contract

> 只管视觉语言（配色、字体、间距、组件形态）与 `docs-site` 这一个目标。
> 时间轴上的事实（时长、曲线、进出场、循环接缝、光标、减少动效）在 [`MOTION.md`](MOTION.md)，两个 owner 分离是刻意的。

## Mode
- `Restyle`: Keep information architecture and markdown content unchanged; update visual language only.
- `Reference`: Google Docs official website/editor visual language (reviewed on 2026-04-18).

## Evidence Snapshot
- Official Google Docs about page typography stack includes `Google Sans`, `Google Sans Text`, and `Roboto`.
- Official visuals are predominantly light surfaces (`~#fefefe`) with restrained neutral grays and blue primary accents.
- Primary action and active states consistently center on Google blue (`#1a73e8` / `#185abc` range).

## Assumptions
- `Goal`: Make docs-site feel like a focused document workspace, not a brand-heavy marketing page.
- `Primary user`: Engineers reading setup and workflow documentation.
- `Platform`: Web desktop first, with strong mobile readability.
- `Scope`: `docs-site` style refresh only (`docs-site/assets/custom.css`).

## No-Design-Draft Decisions
- `Audience`: Prosumer + engineering teams
- `Tone`: Minimal productivity
- `Density`: Balanced (slightly compact)
- `Contrast`: Medium
- `Motion`: Subtle
- `Memorable element`: Paper-like reading canvas with quiet Google-blue interaction highlights

## Visual System
- Typography:
  - UI headings/navigation: `Google Sans` / `Google Sans Text`
  - Body: `Google Sans Text` / `Roboto`
  - Code: `Roboto Mono`
- Color roles:
  - Background: cool neutral gray (`#f8f9fa` family)
  - Surface: white (`#ffffff`)
  - Text: near-black neutral (`#202124`) with muted secondary (`#5f6368`)
  - Border: subtle gray (`#dadce0`)
  - Primary accent: Google blue (`#1a73e8`, hover/active `#185abc`)
- Components:
  - Header and tabs stay white with thin separators
  - Reading area is a paper-like card with minimal shadow
  - Sidebar nav uses low-emphasis hover/active fills in light blue
  - Buttons follow Google-style pill controls (soft + primary)
  - Tables/code/admonitions use quiet gray surfaces and thin borders
- Motion:
  - Transition only on color/background/border
  - No decorative glows/sweeps/large transforms

## Accessibility Baseline
- Keep visible keyboard focus rings.
- Maintain AA-friendly text/background contrast.
- Ensure touch targets remain comfortable on mobile.
- Preserve clear active-state distinction in navigation and links.
