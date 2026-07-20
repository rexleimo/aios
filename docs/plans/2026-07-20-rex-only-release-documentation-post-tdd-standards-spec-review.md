# Rex-only Release Documentation Post-TDD Standards and Spec Review

## Scope reviewed

- Root README and root `CHANGELOG.md` Unreleased migration notes.
- English and localized public changelogs.
- Public `/superpowers/` migration route, its localized variants, navigation,
  sidebar, and the release-documentation regression test.
- The original public migration scope and the current-capability-notes scope.

## Standards review

No style, ownership, or test-boundary finding in the completed current-notes
correction. It uses the established language-directory layout, changes only
published statements, and the regression uses public files rather than mocks
or implementation details. `git diff --check` passed on the reviewed paths.

## Specification review

### S2: Localized migration routes still publish retired workflow catalogs

- Severity: high (release blocking).
- Locations: `docs-site/zh/superpowers.md`,
  `docs-site/ja/superpowers.md`, `docs-site/ko/superpowers.md`, plus the
  localized navigation translations in `mkdocs.yml`.
- Evidence: all three localized `/superpowers/` pages retain the old title and
  describe Superpowers as reusable active playbooks. The navigation translation
  mapping also retains the old `Superpowers` label.
- Actual impact: Chinese, Japanese, and Korean readers can still discover and
  follow the retired Superpowers workflow even though their localized
  changelogs and the English migration route describe Rex-only ownership.
- Required fix: replace each localized page with the equivalent Rex Workflow
  Migration guide, preserve the `/superpowers/` URL, update navigation labels,
  and add a regression assertion for all localized public routes.

The earlier S1 current-capability-note defect is resolved: the four current
note slices no longer advertise Superpowers, while the review intentionally
leaves versioned historical entries unchanged.

## Conclusion

The current-note correction passes its focused behavioral contract, but S2
must be resolved and independently re-reviewed before a release can be
approved.
