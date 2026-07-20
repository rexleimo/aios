# Localized Rex Migration Test Scope

## User goal

Every public localized `/superpowers/` route must describe the same Rex-only,
ownership-safe migration as the English route, and localized navigation must
name that route as Rex Workflow Migration rather than an active Superpowers
catalog.

## Non-goals

- Do not change the `/superpowers/` URL, lifecycle cleanup behavior, or client
  coverage.
- Do not rewrite versioned historical changelog records that truthfully mention
  prior Superpowers support.
- Do not publish, tag, push, or bump a version in this documentation slice.

## Acceptance mapping

| Acceptance behavior | Observable assertion | Public seam |
| --- | --- | --- |
| Chinese, Japanese, and Korean migration routes describe Rex-only ownership-safe migration. | Each localized `superpowers.md` contains a Rex migration heading, the universal explicit adoption command, and no former reusable-playbook quick-answer statement. | `docs-site/{zh,ja,ko}/superpowers.md` read from disk as published Markdown. |
| Localized navigation names the retained route correctly. | `mkdocs.yml` maps `Rex Workflow Migration` to one localized label per supported language and has no `Superpowers` nav key. | MkDocs localization configuration read from disk. |
| Historical release history remains out of scope. | The focused contract reads migration routes and navigation only; it does not assert that every changelog occurrence is removed. | Existing `release-pipeline.test.mjs` public-documentation test. |

## Test seam and focused command

Extend the existing `public release documentation describes ownership-safe
Rex-only migration` test. It is a stable public seam: it reads the exact files
shipped by the documentation site rather than workflow internals, mocks, or
implementation calls.

```bash
node --test --test-name-pattern "public release documentation describes ownership-safe Rex-only migration" scripts/tests/release-pipeline.test.mjs
```

The smallest vertical slice is one extended focused test covering the three
localized migration pages and their nav mappings. It fails independently on
the existing stale pages and passes only after all localized public routes
agree with the Rex-only migration contract. Removing assertions, skipping the
test, weakening wording checks, or testing helpers instead of published files
is forbidden.
