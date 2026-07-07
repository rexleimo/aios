# Homepage Copy Productization Plan

**Goal:** Remove the remaining implementation-heavy homepage hero labels and replace them with more product-facing wording without changing layout, runtime behavior, or technical docs.

**Scope:**
- Modify `docs-site/index.md` literal homepage labels only.
- Update `scripts/tests/site-redesign-assets.test.mjs` assertions to match.
- Do not change CSS, JS runtime, blog content, or technical documentation pages.

**Files:**
- Modify: `docs-site/index.md`
- Modify: `scripts/tests/site-redesign-assets.test.mjs`

**Steps:**
1. Replace the two remaining homepage-facing labels with product wording.
2. Update snapshot/assertion coverage so the old wording cannot regress.
3. Run focused site redesign tests and strict MkDocs build.
4. Run post-edit CRG change detection and affected-flow checks.
