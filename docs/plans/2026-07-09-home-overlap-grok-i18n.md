# Home Overlap + Grok Chip + Language Switcher

**Goal:** Fix EN homepage LIVE OVERVIEW / client-chip overlap, add `grok` chip, and restore language switching in the custom shell.

**Scope:**
1. `docs-site/assets/redesign/home.css` — separate zone-label from hero chips
2. `docs-site/index.md` — add `grok` client chip
3. `docs-site/overrides/partials/rex/language-switcher.html` — i18n selector via `config.extra.alternate`
4. Include switcher in topbar + docs sidebar; style in `shell.css`
5. Regression tests in `scripts/tests/site-redesign-*.test.mjs`

**Out of scope:** Full redesign port to zh/ja/ko home pages; blog header switcher.

**Verify:** `node --test scripts/tests/site-redesign-*.test.mjs`, `mkdocs build --strict`, built HTML grep for grok + lang switcher.
