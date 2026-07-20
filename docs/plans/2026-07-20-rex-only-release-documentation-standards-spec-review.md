# Rex-only Release Documentation Standards and Spec Review

## Scope reviewed

- Public migration guide and navigation.
- Root and localized changelog additions.
- README migration note and public-artifact regression test.
- Test Scope Contract:
  `docs/plans/2026-07-20-rex-only-release-documentation-test-scope.md`.

## Standards review

No standards finding in the reviewed change.

- The former public URL is retained and has one clear ownership boundary:
  migration guidance rather than a second workflow implementation.
- The regression test reads public Markdown and navigation artifacts, with no
  mock, internal-call-count, or generated-output assertion.
- `git diff --check` passed for the changed documentation and test paths.
- The change reuses the existing `docs-site/` language structure and the
  existing release-pipeline test file; it introduces no new framework or
  catch-all directory.

## Specification review

### S1: Current capability notes still advertise retired Superpowers

- Severity: high
- Locations: `docs-site/changelog.md:23-24`,
  `docs-site/zh/changelog.md:31-32`,
  `docs-site/ja/changelog.md:31-32`, and
  `docs-site/ko/changelog.md:31-32`.
- Evidence: these unversioned "Docs And Workflow Notes" entries say Grok and
  Hermes currently have `superpowers` capabilities, which conflicts with the
  new Rex-only release statement and the user requirement to remove
  Superpowers as an AIOS workflow component.
- Actual impact: a user who reads the current notes can still expect an active
  Superpowers workflow after updating, despite the new migration guide saying
  that the component is retired.
- Fix: rewrite these current notes to list only the retained capabilities, or
  mark them explicitly as historical release notes. Update the release
  documentation contract to reject current capability summaries that advertise
  Superpowers.

Versioned historical changelog entries were not treated as a defect: they are
release records and should remain accurate to their historical state.

## Conclusion

The primary migration guide, safety boundary, and test contract meet the
reviewed specification. S1 must be fixed before this release can truthfully
claim that public current documentation no longer presents Superpowers as an
active AIOS workflow.
