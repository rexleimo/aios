---
title: "Advanced Design Skills: From Vague Prompts to Production UI"
publish_date: 2026-04-18
description: "A practical playbook to turn fuzzy user requests into consistent, high-quality UI/UX using DESIGN.md and frontend-design."
---

# Advanced Design Skills for Page Building: From Vague Prompts to Production UI

Most product teams want better UI quality, but many user prompts are short and vague:

- "Polish this section."
- "Make it look like Stripe."
- "Build a full SaaS admin."

Without a style contract, these requests often produce generic template output.
Our fix is simple: lock style first, then implement.

## The Two-Skill Stack

Use these together:

1. `awesome-design-md` - establishes `DESIGN.md` as a style contract
2. `frontend-design` - turns that contract into production-ready UI

This gives coding agents a clear visual direction before code generation starts.

## Quick Setup

```bash
node <AIOS_ROOT>/scripts/aios.mjs setup --components skills --client codex --scope project --skills awesome-design-md,frontend-design
npx --yes getdesign@latest add linear --force
```

Fixed prompt:

```text
First lock style with DESIGN.md, then implement the page using frontend-design.
```

## Handling Vague Prompts Without Blocking

Classify each request into one mode:

- `Patch`: small element-level updates
- `Restyle`: keep structure, replace visual language
- `Flow`: complete SaaS workflow screens

Then move forward with a short assumption block (goal, user role, platform, scope).
Do not block on excessive clarification unless a hard dependency is missing.

## SaaS Delivery Standard

For full-flow requests, the output should include:

- Dashboard
- List page
- Detail page
- Create/Edit form
- Settings/Billing equivalent
- State coverage: `loading`, `empty`, `error`, `success`
- Interaction states: `hover`, `focus`, `active`, `disabled`

This is the minimum quality floor to avoid disconnected demo-only UIs.

## Style Pick Defaults

- SaaS/B2B: `linear`, `vercel`, `supabase`
- Marketing: `framer`, `stripe`, `notion`
- Docs: `mintlify`, `hashicorp`, `mongodb`

No domain signal? Start with `linear`.

## Rollout Tip for Product Teams

If you run an AI page-building product, embed this system instruction by default:

```text
When user intent is vague, classify into Patch/Restyle/Flow first. Lock style with DESIGN.md, then implement with complete interaction states (hover/focus/active/disabled) and core flow states (loading/empty/error/success).
```

That single guardrail usually improves consistency more than adding extra prompt examples.

## Read the Docs Version

- [Advanced Design Skills (Docs)](https://cli.rexai.top/advanced-design-skills/)
