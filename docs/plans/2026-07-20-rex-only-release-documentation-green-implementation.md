# Rex-only Release Documentation GREEN Implementation

## Implemented public behavior

- `docs-site/superpowers.md` now preserves the public URL as the Rex Workflow
  Migration guide. It identifies `rex-harness` as the only default
  software-engineering workflow, explains the ownership-safe default, and shows
  explicit adoption commands for update, init, and setup.
- `CHANGELOG.md` and the English, Chinese, Japanese, and Korean public
  changelogs record the Rex-only migration without claiming that normal updates
  delete unproven historical paths.
- The site navigation, sidebar, README, and related links no longer present
  Superpowers as an active workflow feature.
- `scripts/tests/release-pipeline.test.mjs` now protects these public release
  statements and all listed client roots against regression.

## GREEN observations

1. `receipt:769798f3-a3ea-429c-9ca3-c4f7ce140825` recorded the exact public
   scenario declared in the testability decision with exit status `0`.
2. `receipt:7e16829f-6c3a-4b20-bedf-c3dcde5dcf13` recorded the focused release
   documentation contract with exit status `0`.

The implementation changes public documentation only; it does not alter the
reconciler's ownership rules. The explicit command examples therefore describe
the already-tested production lifecycle rather than inventing a new cleanup
path.
