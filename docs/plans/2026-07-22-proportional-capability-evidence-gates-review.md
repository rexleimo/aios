# Proportional Capability and Evidence Gates Standards and Specification Review

## Review Scope

- `rex-harness/src/capabilities/strict-tdd/capability.mjs`
- `rex-harness/tests/scenarios/proportional-gates.test.mjs`
- P3 structured-fact public path and P4 test-scope contract

The root code-review graph does not index the nested standalone
`rex-harness` package. Its no-flow result is therefore a tooling limitation,
not primary evidence; the review used targeted package diffs, public scenario
tests, architecture tests, the full package suite, and doctor output.

## Standards Review

No standards finding.

The P4 policy stays inside the existing strict-TDD capability, its sole current
consumer. It adds no catch-all module, duplicate selector, profile router,
Provider reference, AIOS dependency, client instruction, or second workflow
Command. Legacy risk selection remains first, and each structured escalation
uses the source Fact as the capability reason with preserved evidence refs.

Evidence checked:

- `git -C rex-harness diff --check` exits 0.
- `npm test` in `rex-harness` passes 104 tests, including architecture and
  standalone workflow tests.
- `npm run doctor` reports the standalone kernel `ready` with no errors.

## Specification Review

No specification finding.

The public scenario table verifies baseline TDD for local/reversible/low work;
strict TDD for external, destructive, system, irreversible, and high-
uncertainty facts; preserved preconditions; unchanged legacy high-risk
selection; P3 Observation-to-P4 integration; strict evidence blocking; and
activation-derived analytics. Strict TDD's existing test-strength receipt is
the stronger evidence contract, while the existing independent
standards/spec review remains the single review Command after a bounded diff.
Specialist review continues to require its separate explicit risk-domain Fact,
so P4 does not invent or promote a reviewer role from a generic external
effect.

No test was removed, skipped, weakened, or replaced by a mock.
