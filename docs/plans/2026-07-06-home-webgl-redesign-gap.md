# Home WebGL Redesign Gap Plan

**Goal:** Bring the docs home page much closer to `/Users/rex/Downloads/Harness CLI - Home (Redesign).png` by replacing Canvas 2D placeholders with real Three.js/WebGL visual layers and tightening the page layout.

**Root cause:** `docs-site/assets/home-animation.js` currently uses only `canvas.getContext('2d')`. The Pencil node `yZfz0` requires Three.js/WebGL animations (`THREE.WebGLRenderer`, particle field, hover-reactive grid, radar sweep, nebula glow). The current layout also diverges from the PNG in top navigation labels, hero scale, hero nebula density, capability card stagger, CTA composition, and footer structure.

## Files

- Modify `scripts/tests/site-redesign-assets.test.mjs`
  - Add red tests for Three.js/WebGL hooks, dynamic import strategy, shader/material primitives, and target navigation/content markers.
- Modify `docs-site/assets/home-animation.js`
  - Replace monolithic Canvas 2D drawing with a small animation runtime.
  - Add dynamic Three.js loading, graceful WebGL fallback, reduced-motion handling, IntersectionObserver pausing, and disposal.
  - Implement separate section effects: hero nebula particle field, capabilities node grid, HUD radar, CTA nebula.
- Modify `docs-site/assets/redesign/home.css`
  - Re-tune dimensions, typography, backgrounds, smoke overlays, grid brightness, card staggering, demo/CTA layout.
- Modify `docs-site/overrides/partials/rex/topbar.html`
  - Match the target home nav labels: Capabilities, Demo, Docs, Changelog, Star, Get Started.
- Modify `docs-site/assets/redesign/shell.css`
  - Style the target nav/action states and logo mark without affecting docs/blog structure.
- Modify `docs-site/overrides/partials/rex/home-footer.html`
  - Match the target footer visual hierarchy.

## Verification

1. Red test first: `npm run test:site-redesign` must fail on missing WebGL/Three markers.
2. Green test: `npm run test:site-redesign` passes after implementation.
3. Build: `python3 -m mkdocs build -f mkdocs.yml --strict`.
4. Visual: capture `http://localhost:8017/` at 1440px and compare against the target PNG.
5. Final safety: `git diff --check`, `npm run test:check-site-sync`, `python3 -m mkdocs build -f mkdocs.blog.yml --strict`.
