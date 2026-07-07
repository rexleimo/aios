# Home Multi-Device Responsive Design

## Goal
Bring the home page back into alignment with the approved Pencil device states for desktop (`tqp2f`), tablet (`DekEX`), and mobile (`sWJq4`) without regressing the existing desktop redesign.

## Approved direction
Use an explicit three-state responsive contract instead of ad-hoc shrink rules:

- Desktop (`>= 1024px`): keep the hero as a true left/right composition.
- Tablet (`768px - 1023px`): collapse the shell navigation, stack the hero/demo sections, and keep capability cards in two columns.
- Mobile (`< 768px`): keep the shell compact, preserve single-column content, and ensure no section or shell element creates horizontal overflow.

## Problems to fix
1. The home shell header still keeps desktop navigation visible on narrow screens, causing horizontal overflow and a broken mobile preview with a large empty area to the right.
2. The home page is missing a hard responsive contract for tablet/mobile shell behavior, so the page does not match the approved device layouts closely enough.
3. The hero visual still uses desktop-era sizing in narrow layouts, which can push visual content wider than the intended mobile/tablet stage.

## Scope
- Update home/shell responsive CSS only where required for the approved device states.
- Add regression coverage for the header collapse and home device-state contract.
- Do not redesign desktop information architecture or change home copy.

## Verification
- Targeted responsive regression tests for home and shell CSS.
- Site redesign test suite.
- Strict MkDocs build.
- Fresh 1366 / 768 / 375 screenshots for self-review against Pencil.
