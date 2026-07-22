# Structured Rex Change and Risk Facts Refactor Review

## Refactor Check

No additional refactor is warranted.

The closed assessment taxonomy is isolated in its owning `domain/` module,
while the existing Observation normalizer, Fact normalizer, and derivation
boundary retain their established responsibilities. Creating a general schema
framework or a second routing abstraction would enlarge Phase 3 without a
second caller or a policy need. The only generic shape extension is the
optional scalar Fact `value`, which preserves the serialized shape of all
existing value-less Facts.

The focused public scenario still passes after the review:
`receipt:5b12e104-988e-4c80-8232-72e29363b48d`.

## Test-Diff Review

The test suite constrains public outcomes, not helper calls:

- it observes the five Fact records returned by `deriveSoftwareFacts()`;
- it sends invalid payloads through `evaluateSoftwareRequest()` and requires
  public-boundary rejection;
- it compares the public capability/Provider decision for paired requests;
- it JSON-round-trips `startSoftwareWorkflow()` output; and
- it proves risk-looking prose alone does not create the new facts.

No assertion was deleted, skipped, relaxed, or replaced by a mock. The expanded
public test suite and its two adjacent application suites pass 23 tests;
`git -C rex-harness diff --check` exits 0.
