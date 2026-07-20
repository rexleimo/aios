# Rex-only Current Capability Notes Test Scope

## User goal

Remove current public documentation that still presents Superpowers as an
available AIOS capability, while retaining versioned historical changelog
records.

## Non-goals

- Do not rewrite historical release entries merely because they describe a
  previously supported capability.
- Do not change the Rex workflow implementation or legacy-cleanup behavior.
- Do not publish, tag, or bump a version as part of this correction.

## Acceptance mapping

| Acceptance behavior | Observable assertion | Public seam |
| --- | --- | --- |
| Current Grok and Hermes capability summaries no longer advertise Superpowers. | The unversioned current-notes section lists retained capabilities and does not contain `superpowers`. | `docs-site/changelog.md` |
| Localized current summaries agree with the English public statement. | The current-note slice in Chinese, Japanese, and Korean has no `superpowers` capability claim. | `docs-site/{zh,ja,ko}/changelog.md` |
| Historical release records remain intact. | The test reads only the current-note slice rather than asserting that the entire changelog never mentions Superpowers. | `scripts/tests/release-pipeline.test.mjs` |

## Test seam and focused command

Extend the existing `public release documentation describes ownership-safe
Rex-only migration` test. It reads the public changelog files through Node's
filesystem API and isolates the unversioned current-notes segment from
versioned release history.

```bash
node --test --test-name-pattern "public release documentation describes ownership-safe Rex-only migration" scripts/tests/release-pipeline.test.mjs
```

The test must fail until the current capability notes stop advertising
Superpowers and must continue to allow versioned historical entries to mention
the retired component.
