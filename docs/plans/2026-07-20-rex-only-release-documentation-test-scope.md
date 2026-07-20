# Rex-only Release Documentation Test Scope

## User goal

Publish the Rex-only workflow migration with public documentation and release
notes that accurately explain how legacy Superpowers projections are handled.

## Non-goals

- Do not claim that a normal update deletes every historical Superpowers path.
- Do not delete an unproven user-owned projection.
- Do not create a version, tag, push, or publish while release gates are
  failing.
- Do not change the release behavior in this documentation slice.

## In-scope observable behavior

| Acceptance behavior | Observable assertion | Public seam |
| --- | --- | --- |
| New installations and managed workflow projections use Rex as the only default software-engineering workflow. | The migration guide and current changelog call `rex-harness` the default and state that Superpowers is no longer an AIOS workflow component. | `docs-site/superpowers.md`, `CHANGELOG.md` |
| A normal update remains ownership-safe. | The guide states that a legacy projection without AIOS ownership proof is preserved and reported as a conflict. | `docs-site/superpowers.md` |
| An operator can explicitly adopt and remove AIOS's precisely recognized legacy projections. | The guide and changelog show `aios update --adopt-legacy-superpowers` and limit cleanup to recognized AIOS paths. | `docs-site/superpowers.md`, `CHANGELOG.md` |
| Supported client coverage is public and consistent. | The guide names Codex, Claude, Gemini, OpenCode, Hermes, Grok, and the shared `.agents` projection. | `docs-site/superpowers.md` |
| Public localized release notes do not describe Superpowers as an available client capability. | Each localized changelog records the Rex-only migration and the explicit adoption flag. | `docs-site/{,zh,ja,ko}/changelog.md` |

## Test seam and focused verification

Extend the existing release-documentation contract in
`scripts/tests/release-pipeline.test.mjs`. It reads the public Markdown files
through Node's filesystem API, which is a stable public-artifact seam and does
not depend on an internal workflow implementation. The focused command is:

```bash
node --test scripts/tests/release-pipeline.test.mjs
```

The contract must independently assert the Rex-only default, the exact
`--adopt-legacy-superpowers` opt-in, the fail-closed default for unproven
paths, and all listed client roots. It must reject a release note that says a
normal update deletes all old Superpowers content.

## Completion criteria

1. Root and public changelogs describe the migration without a false automatic
   cleanup promise.
2. The previous `superpowers.md` URL becomes a migration guide, preventing old
   external links from teaching the retired workflow.
3. The release-documentation contract passes before the broader release gate is
   evaluated.
