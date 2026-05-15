---
name: frontend-design
description: Use when users need to build or polish web UI without a complete design handoff, including cases where no mockup/design稿 is available and the agent must produce a strong visual direction plus production-ready code.
---

# Frontend Design

Build distinctive, production-grade frontend UI with clear visual direction and avoid generic AI-looking interfaces.

## Trigger

- User asks to build or beautify pages/components/frontends.
- User has rough requirements but no design稿.
- Existing UI works functionally but looks generic.

## Fuzzy Prompt Autopilot

If user prompt is vague, do not stall. Convert it into one explicit mode, then build:

- `Patch`: small element-level change (example: "改一下这个页面某个元素")
- `Restyle`: keep structure, change visual direction (example: "参考某种风格做一下")
- `Flow`: complete SaaS workflow UI (example: "做一个完整后台")

Before coding, write a short assumption block:

- `Goal`: what should improve now
- `Primary user`: role/persona
- `Platform`: web desktop first or mobile first
- `Scope`: this task edits one view / one module / full flow

Only ask one clarifying question if a blocker is truly critical. Otherwise continue with reasonable defaults.

## Operating Mode

1. If `DESIGN.md` exists: treat it as style source of truth.
2. If `DESIGN.md` is missing:
   - If network + `npx` are available, first use `awesome-design-md` workflow to install one baseline style.
   - If not available, create a compact local `DESIGN.md` with:
     - visual theme
     - color roles
     - typography pair
     - spacing scale
     - component states
     - motion principles

For `Restyle` and `Flow`, always establish `DESIGN.md` (remote baseline or local compact version) before implementation.

## No-Design-Draft Protocol

Before coding, lock these 6 choices in one short block:

- `Audience`: consumer / prosumer / enterprise
- `Tone`: minimal / editorial / playful / cinematic / technical
- `Density`: airy / balanced / dense
- `Contrast`: soft / medium / high
- `Motion`: none / subtle / expressive
- `Memorable element`: one signature motif (shape, accent, type treatment, motion pattern)

Do not proceed with implementation until these choices are explicit.

## Delivery Contract by Mode

For vague prompts, the implementation output must still be concrete:

- `Patch`:
  - Preserve layout intent, update only required scope.
  - Include complete interaction states (default/hover/focus/active/disabled).
  - Verify desktop + mobile behavior for touched area.
- `Restyle`:
  - Keep information architecture stable unless explicitly changed.
  - Apply a consistent style system (type/color/spacing/radius/shadow/motion).
  - Avoid one-off visual overrides that bypass design tokens.
- `Flow`:
  - Define SaaS flow map first: `entry -> navigation -> key tasks -> feedback -> empty/error`.
  - Deliver connected screens, not isolated mock sections.
  - Cover at least: dashboard, list, detail, create/edit form, settings/billing (or equivalent).
  - Include loading/empty/error/success states for core actions.

## Implementation Rules

- Avoid generic defaults: Inter/Roboto + purple gradient + template layouts.
- Use CSS variables (or design tokens) for colors, spacing, radius, shadow, type.
- Keep hierarchy clear: first screen must communicate value + primary CTA.
- Match complexity to direction:
  - maximal style -> richer motion/background systems
  - minimal style -> stricter spacing/typography precision
- Maintain accessibility:
  - keyboard focus visible
  - text contrast adequate
  - interaction states complete (hover/focus/active/disabled)

## Quality Checklist

- Visual style is recognizable in one glance.
- Typography scale is coherent across sections.
- Color accents are intentional, not scattered.
- Layout rhythm is consistent on desktop and mobile.
- UI is production-functional, not just a static mockup.

## Prompt Pattern

- `Implement this UI using DESIGN.md as the style contract.`
- `If DESIGN.md is missing, establish a 6-choice design direction block first, then build.`
- `Prioritize visual distinctiveness and usability; avoid generic template aesthetics.`
- `When prompt is vague, classify into Patch/Restyle/Flow, state assumptions briefly, then implement end-to-end.`
