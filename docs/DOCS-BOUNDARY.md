# Documentation Boundary

This file defines what can be committed as public developer docs vs internal collaboration artifacts.

## Public Developer Docs (external audience)

Allowed locations:
- `docs-site/**`
- `blog-site/**`
- `README.md`
- `README-zh.md`

Rules:
- Must be useful for developers using AIOS.
- No private planning notes, KPI pressure notes, or operator-only instructions.
- Keep messaging product-focused and reproducible.

## Internal Collaboration Docs (operator/team audience)

Allowed locations:
- `docs/plans/**`
- `tasks/**`
- `memory/**` (runtime artifacts, usually gitignored)

Rules:
- Can include growth targets, experiments, checklists, and daily execution notes.
- May include assistant-user workflow notes.
- Not published to docs site by default.

## Commit Safety Check

Before commit, run:

```bash
git status --short
```

If a file under `docs-site/**` contains internal-only content, move it to:
- `docs/plans/**` for planning
- `tasks/**` for daily operations
