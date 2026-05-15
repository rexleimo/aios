---
name: awesome-design-md
description: Use when users need a project-level DESIGN.md baseline, especially when they want to borrow a proven style quickly or have no design draft but still need consistent UI direction.
---

# Awesome DESIGN.md

Use this skill when you want to apply a proven visual style to a project by adding a `DESIGN.md` file from the VoltAgent `awesome-design-md` collection.

## Trigger

- User wants UI to look like a known product/site style.
- User asks to add or refresh `DESIGN.md` for coding-agent UI output.
- User wants consistent typography, colors, spacing, and component styling before UI implementation.
- User has no design稿 and needs a fast, high-quality visual starting point.

## Preconditions

- Run from the target project root.
- `npx` is available.
- If `DESIGN.md` already exists, decide whether to overwrite (`--force`) or write to another path (`--out`).

## Workflow

1. List available design slugs:

```bash
npx --yes getdesign@latest list
```

2. Install a selected style:

```bash
npx --yes getdesign@latest add <slug>
```

Behavior:
- First install writes `./DESIGN.md`.
- If `DESIGN.md` already exists, CLI writes `./<slug>/DESIGN.md`.

3. Overwrite the active `DESIGN.md` when required:

```bash
npx --yes getdesign@latest add <slug> --force
```

4. Write to a custom output path (optional):

```bash
npx --yes getdesign@latest add <slug> --out ./docs/DESIGN.md
```

5. Verify output exists and is readable:

```bash
ls -la DESIGN.md <slug>/DESIGN.md 2>/dev/null
```

6. Tell the coding agent to follow the file before UI tasks.

## No-Design-Draft Fast Path

When user has no design draft, pick one baseline slug by product intent:

- `B2B/SaaS dashboard`: `linear`, `vercel`, `supabase`
- `Marketing landing page`: `framer`, `stripe`, `notion`
- `Documentation`: `mintlify`, `hashicorp`, `mongodb`
- `E-commerce/consumer`: `airbnb`, `shopify`, `nike`
- `Media/editorial`: `theverge`, `wired`, `spotify`

Then run:

```bash
npx --yes getdesign@latest add <slug> --force
```

This gives the agent an explicit style anchor immediately, avoiding generic defaults.

## Fuzzy Style Request Mapping

When user only gives a vague style intent, map it to a usable slug quickly:

- `极简专业 / SaaS 感`: `linear`, `vercel`
- `增长营销 / 品牌展示`: `framer`, `stripe`
- `文档知识库 / 开发者文档`: `mintlify`, `hashicorp`, `mongodb`
- `电商消费 / 商品导向`: `shopify`, `airbnb`, `nike`
- `媒体杂志 / 视觉冲击`: `theverge`, `wired`, `spotify`

Execution rule:

1. Pick one primary slug from user intent.
2. Install with overwrite for deterministic output:

```bash
npx --yes getdesign@latest add <slug> --force
```

3. If user gives no domain cue, default to `linear` for generic SaaS web apps.

## Prompt Pattern

- `Use DESIGN.md as the source of truth for UI decisions in this task.`
- `Follow color roles, typography hierarchy, spacing scale, and component states from DESIGN.md.`
- `If a UI decision is unclear, prefer consistency with DESIGN.md over introducing new styles.`

## Guardrails

- Treat templates as inspiration and implementation guidance, not official brand endorsement.
- Keep accessibility checks (contrast, keyboard focus, touch targets) even when following a template.

## Upstream

- Repository: `https://github.com/VoltAgent/awesome-design-md`
- License: MIT
- CLI usage shown by `npx --yes getdesign@latest --help`
