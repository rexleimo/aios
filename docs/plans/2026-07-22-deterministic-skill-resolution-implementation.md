# Deterministic Skill Resolution Implementation

## Bounded Change

- Added `analyzeCatalogEntries()` at the existing catalog boundary. It sorts
  resolved records by skill name and canonical source path, deduplicates exact
  repeated source records, and returns structured same-name conflicts with
  client, scope, and provenance.
- Changed `resolveCatalogEntries()` to reject an ambiguous target before install
  or uninstall code can select a first-match winner.
- Updated the existing Skills Doctor to render every conflict as an actionable
  error with all canonical source paths. It retains existing drift, unmanaged
  install, non-discoverable-root, and project-over-global diagnostics.
- Added a focused resolver test suite for permutation stability across all six
  registered clients and for fail-closed duplicate diagnostics.

The change does not add a registry, dependency, client prompt instruction,
client-specific precedence claim, or new command. It reuses the canonical
manifest and materialization paths already shared by install, uninstall, and
doctor.

## Verification

- The public duplicate-resolution scenario passed:
  `receipt:c8481925-a2bd-411c-9bb4-87a058ac27f1`.
- `node --test scripts/tests/skills-resolution.test.mjs`: 2 passing tests.
- `node --test scripts/tests/aios-components.test.mjs`: 39 passing tests.
