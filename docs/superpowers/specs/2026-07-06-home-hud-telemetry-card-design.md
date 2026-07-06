# Home HUD Telemetry Card Design

> Date: 2026-07-06
> Source design: `/Users/rex/Downloads/cli.rexai.top.pen`
> Source frame: `CZd5Q` -> `berPn` -> `WebGL — Ambient HUD`

## Goal

Bring the Home page `SYSTEM TELEMETRY` HUD card back to a close 1:1 match with the Pencil source on the 1440px desktop baseline, while preserving the current MkDocs-based content flow and the existing decorative WebGL behavior.

## Scope

This design applies only to the Demo section HUD card on the Home page:

- `docs-site/index.md`
- `docs-site/assets/redesign/home.css`
- `docs-site/assets/redesign/home-webgl-runtime.js`
- `scripts/tests/site-redesign-assets.test.mjs`

It does not cover the rest of the Home page sections in this pass.

## Current mismatch

The current HUD card diverges from the Pencil source in five visible ways:

1. Title styling is oversized and missing the right-side activity icon.
2. Subtitle styling uses the wrong visual scale and type treatment.
3. Throughput bars stretch to fill the row and use oversized pill geometry.
4. The bottom WebGL label is rendered as a fit-content capsule instead of a full-width inline frame.
5. The HUD WebGL rings and rays are visually too dominant, causing the card content to look distorted and overpowered.

## Source-of-truth geometry and styling

These values come directly from the `.pen` source for `WebGL — Ambient HUD`:

### Card shell

- Frame size: `420 x 420`
- Corner radius: `14`
- Border: `$border`, `1px`, inner
- Shadow: `0 18px 40px -6px #00000066`
- Padding: `26px`
- Layout: vertical
- Main gap: `18px`
- Vertical distribution: `space-between`

### Title block

- Layout: vertical
- Gap: `6px`
- Title row: horizontal, `space-between`, centered
- Title text:
  - `JetBrains Mono`
  - `12px`
  - `700`
  - `letter-spacing: 1px`
  - content: `SYSTEM TELEMETRY`
- Right icon:
  - Lucide `activity`
  - `15 x 15`
  - success accent fill
- Subtitle text:
  - `JetBrains Mono`
  - `11px`
  - normal
  - color `#9AA7BC`
  - content: `live agent throughput`

### Throughput bars

- Container height: `150px`
- Layout: horizontal
- Gap: `10px`
- Alignment: bottom
- Horizontal distribution: centered
- Bar count: `8`
- Each bar width: `20px`
- Each bar radius: `5px`
- Bar heights, left to right:
  - `70`
  - `120`
  - `95`
  - `150`
  - `110`
  - `140`
  - `80`
  - `130`
- Bar fill: vertical gradient from `$violet` to `$accent`
- Bar glow: outer shadow `#22D3EE44`, blur `12`, spread `-2`

### Bottom label

- Width: full container width
- Background: `$card`
- Border: `$border`, `1px`, inner
- Radius: `6px`
- Padding: `8px 10px`
- Gap between icon and text: `8px`
- Icon:
  - Lucide `radar`
  - `13 x 13`
  - accent fill
- Text:
  - `JetBrains Mono`
  - `10.5px`
  - normal
  - color `#B4C0D3`
  - content: `WEBGL · radar sweep + throughput`

## Implementation approach

Use the existing card shell and Home section structure, but tighten the HUD card into the source layout instead of approximating it with flexible fills.

### Markup changes

Update the HUD card markup in `docs-site/index.md` so the title area matches the source hierarchy:

- Add a dedicated title row wrapper.
- Keep `SYSTEM TELEMETRY` on the left.
- Add a right-side activity icon on the same row.
- Keep the subtitle on its own line below the title row.

The bars remain HTML, not canvas-rendered, so their spacing and heights stay deterministic in CSS/markup.

### CSS changes

Update `docs-site/assets/redesign/home.css` to:

- Match the card shell spacing and exact internal layout.
- Convert the title and subtitle to the source mono scale.
- Remove the oversized bar track look.
- Set the bars to fixed `20px` widths with `10px` gaps.
- Change the bottom label from `fit-content` to full-width framed inline layout.
- Keep the card visually stable at the 1440px desktop baseline before any responsive downscaling.

### WebGL changes

Update the HUD-specific shader tuning in `docs-site/assets/redesign/home-webgl-runtime.js` so the canvas stays decorative:

- Reduce ring dominance.
- Reduce ray brightness.
- Reduce sweep alpha.
- Keep the radar motion visible, but subordinate to the title, bars, and bottom label.

No content should rely on the shader for readability.

## Non-goals

This pass will not:

- Redesign the rest of the Demo section.
- Rework other Home page sections.
- Replace the HUD bars with canvas-only rendering.
- Add new JavaScript framework code.

## Verification

Minimum verification for this card:

1. `npm run test:site-redesign`
2. `python3 -m mkdocs build -f mkdocs.yml --strict`
3. Browser screenshot at desktop width for `.hud-panel`
4. Visual comparison against the Pencil source for:
   - title row
   - subtitle scale
   - bar width/spacing rhythm
   - bottom label width and sizing
   - reduced HUD shader dominance

## Acceptance criteria

The card is complete when all of the following are true:

- The title row includes the right-side activity icon.
- Title and subtitle use the source mono scale and spacing.
- The eight bars render with fixed-width geometry and the correct height sequence.
- The bottom label spans the content width and matches the source frame treatment.
- The HUD shader no longer visually distorts or overpowers the content.
- The card reads as the same composition as the Pencil `WebGL — Ambient HUD` frame at the 1440px desktop baseline.
