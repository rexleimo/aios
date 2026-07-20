---
title: Advanced Design Skills
description: Build beautiful, production-ready pages from vague prompts using DESIGN.md and frontend-design.
---

# Advanced Design Skills for Page Building

When users only say "polish this section" or "make it look like Stripe", most agents fall back to generic templates.
This guide gives you a stable workflow that turns fuzzy requests into high-quality UI/UX delivery.

## Quick Answer

Use two skills together:

- `awesome-design-md`: lock a visual contract in `DESIGN.md`
- `frontend-design`: implement pages under that contract

This sequence reduces random style drift and improves consistency for both single-page updates and full SaaS flows.

## Standard Workflow

1. Install skills in the target project:

```bash
node <AIOS_ROOT>/scripts/aios.mjs setup --components skills --client codex --scope project --skills awesome-design-md,frontend-design
```

2. Generate a style baseline:

```bash
npx --yes getdesign@latest list
npx --yes getdesign@latest add linear --force
```

3. Use this fixed prompt:

```text
First lock style with DESIGN.md, then implement the page using frontend-design.
```

4. Ask for implementation with your business context.

## Fuzzy Prompt Autopilot

When user input is vague, classify into one of these modes first:

| Mode | Typical user prompt | Delivery expectation |
|---|---|---|
| `Patch` | "Change this element and make it better." | Update local scope + full interaction states |
| `Restyle` | "Make this page look like Stripe." | Keep structure, replace visual system consistently |
| `Flow` | "Build a complete SaaS admin UI." | Deliver connected screens and task flows |

Do not block on excessive clarification. State assumptions briefly and continue.

## Default Style Picks

- SaaS / B2B: `linear`, `vercel`, `supabase`
- Marketing: `framer`, `stripe`, `notion`
- Documentation: `mintlify`, `hashicorp`, `mongodb`

If no domain signal is provided, start with `linear`.

## SaaS Quality Floor

For full-flow requests, require at least:

- Dashboard
- List view
- Detail view
- Create/Edit form
- Settings or Billing equivalent
- Core states: `loading`, `empty`, `error`, `success`
- Interaction states: `hover`, `focus`, `active`, `disabled`

## Recommended System Prompt

```text
When user intent is vague, classify into Patch/Restyle/Flow first. Lock style with DESIGN.md, then implement with complete interaction states (hover/focus/active/disabled) and core flow states (loading/empty/error/success).
```

## Related

- [Rex Workflow Migration](superpowers.md)
- [Skill Candidates Guide](skill-candidates.md)
- [Advanced Design Skills Playbook (Blog)](/blog/advanced-design-skills-page-building/)
