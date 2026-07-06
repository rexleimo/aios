# Demo Section No-Scale Responsive Design

**Date:** 2026-07-06
**Scope:** Home page `LIVE DEMO` section only
**Status:** Draft for user review

## Problem

The Home page demo area currently preserves the 1440px Pencil composition by scaling the entire section stage with `transform: scale(...)`. This keeps the desktop composition recognizable, but it also makes the terminal, HUD card, type, borders, and WebGL canvas look like a uniformly shrunken screenshot instead of a naturally responsive layout.

The user does not require a full responsive rebuild in this pass. The immediate goal is narrower: the demo block must stop looking visually stretched or compressed when the viewport is below the 1440px desktop baseline.

## Goal

Remove the "overall scaled-down poster" look from the `LIVE DEMO` section while preserving the 1440px desktop layout at full width.

## Non-Goals

- No full-site responsive rewrite
- No redesign of the hero, capabilities, or CTA sections
- No changes to demo copy, terminal script content, or HUD bar sequence
- No new framework, build step, or runtime dependency

## Recommended Approach

Use a **section-local responsive override** for the demo area instead of scaling that section with the shared `home-section__stage` transform behavior.

### Desktop behavior

At the 1440px baseline, keep the current two-column composition:

- 720px terminal card
- 420px HUD card
- 32px gap
- same typography and decoration positions already tuned for the Pencil match

### Narrower viewport behavior

For widths below the comfortable desktop threshold, the demo section should stop behaving like a scaled artboard and instead lay out natively:

1. The demo stage should render at actual width, not via visual scale shrink.
2. The terminal and HUD cards should keep their own proportions rather than being transform-scaled.
3. The row should be allowed to:
   - reduce available inline width naturally first
   - then switch to a stacked layout before the section looks compressed
4. The large decorative `02` can remain decorative, but must not force a compressed composition.

## Implementation Shape

### CSS

Add a demo-specific override layer in `docs-site/assets/redesign/home.css`:

- neutralize the inherited `scale(var(--rex-home-scale))` effect for `.demo-section .home-section__stage`
- replace fixed-width row assumptions with a responsive container width strategy
- keep the desktop grid at wide widths
- add a breakpoint that stacks the terminal and HUD vertically before compression becomes visually obvious

### JS

No new runtime logic is required if the demo section no longer depends on stage scaling for visual fit. The existing `syncHomeDesignScale()` can remain for the other home sections in this pass.

### Testing

Add a regression test proving the demo section no longer inherits the global scaled-stage behavior for its main layout container and that it defines a real responsive fallback layout.

## Success Criteria

1. At desktop width, the demo section still matches the current tuned composition.
2. At narrower widths, the terminal and HUD no longer look like a uniformly shrunk poster.
3. The demo content remains readable without visual compression artifacts.
4. Existing home redesign tests and strict MkDocs build continue to pass.

## Risks

- Because the home page uses a shared stage abstraction, demo-specific overrides must be carefully scoped.
- The terminal and HUD cards may need slightly different spacing once the row becomes responsive.
- WebGL canvas sizing must continue to match the HUD card bounds after layout changes.

## Decision

Proceed with the **minimal demo-only no-scale fix** first. If that still feels off after visual verification, follow up with a full demo-section responsive redesign as a second pass.
