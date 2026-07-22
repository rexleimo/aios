# Structured Rex Change and Risk Facts Standards and Specification Review

## Review Scope

- `rex-harness/src/domain/change-risk-assessment.mjs`
- `rex-harness/src/domain/fact-kinds.mjs`
- `rex-harness/src/domain/facts.mjs`
- `rex-harness/src/domain/observation-kinds.mjs`
- `rex-harness/src/application/derive-facts.mjs`
- `rex-harness/tests/application/change-risk-facts.test.mjs`
- P3 minimal-construction and test-scope records

The root code-review graph does not index the nested standalone
`rex-harness` package, so its result is recorded only as a tooling limitation;
this review used the package's public API, targeted source diff, package test
suite, architecture test, and doctor result instead.

## Standards Review

No standards finding.

The change maintains the repository's layer rules: the taxonomy belongs in
`domain/`, Observation normalization remains the sole host-input boundary, and
the application layer remains the one Observation-to-Fact projection boundary.
The new domain module imports only Fact identifiers; it has no Provider, CLI,
AIOS, persistence, or client dependency. The optional Fact scalar does not
alter older value-less Fact records, and no catch-all directory or speculative
abstraction was introduced.

Evidence checked:

- `git -C rex-harness diff --check` exits 0.
- `npm test` in `rex-harness` passes 93 tests, including its architecture
  boundary tests.
- `npm run doctor` reports the standalone kernel `ready` with no errors.

## Specification Review

No specification finding.

The public tests cover every P3 contract point: all five facts retain supplied
values and evidence; malformed payloads reject; local, external/system, and
unknown/high-uncertainty examples remain explicit; risk-looking prose alone
does not synthesize structured facts; JSON round trips preserve request and
fact projections; and paired public requests retain the same capability and
Provider decision. The latter confirms that P3 facts do not embed the P4 policy
or Provider selection.

No test was removed, skipped, mocked, or weakened.
