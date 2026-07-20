# Rex-only Current Capability Notes GREEN Implementation

## Implemented Change

Updated only the unversioned current capability summaries in these public
changelogs:

- `docs-site/changelog.md`
- `docs-site/zh/changelog.md`
- `docs-site/ja/changelog.md`
- `docs-site/ko/changelog.md`

The Grok summaries now list `skills`, `agents`, `native`, `team`, and
`harness`; the Hermes summaries list `skills`, `native`, and `harness`. Neither
current-notes section presents Superpowers as a current capability. Historical
versioned release entries were not changed.

## GREEN Observations

- The exact typed public scenario passed with exit status `0`:
  `receipt:36d85ffb-33db-4831-8597-2af4a8e1ac1c`.
- The focused public release-documentation contract passed with exit status
  `0`: `receipt:7f396997-0aaa-4b54-9d12-1613c6a088d0`.
- `git diff --check` completed without output for the modified public
  changelogs, the focused regression test, and the RED observation artifact.
