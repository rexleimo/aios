# Localized Rex Migration GREEN Implementation

## Implemented public behavior

- Replaced `docs-site/zh/superpowers.md`, `docs-site/ja/superpowers.md`, and
  `docs-site/ko/superpowers.md` with localized Rex Workflow Migration guides.
- Preserved each `/superpowers/` URL while documenting the Rex-only default,
  conflict-safe normal upgrades, explicit adoption, all supported clients, and
  source-install verification.
- Changed `mkdocs.yml` localized navigation values to Rex Workflow Migration
  labels and removed the old `Superpowers` navigation key.
- Extended the existing public release-documentation regression test so these
  localized route and navigation requirements cannot silently regress.

## GREEN observations

- The exact typed public scenario passed with exit status `0`:
  `receipt:b8c1fdab-2156-4d89-87bd-495cba132401`.
- The focused public release-documentation contract passed with exit status
  `0`: `receipt:22f8ac2f-ff25-47f7-8714-5f54483fb7ab`.
- `git diff --check` completed without output for the localized guides,
  navigation, and regression test. A targeted scan found no replacement
  characters in the three added localized guides.
