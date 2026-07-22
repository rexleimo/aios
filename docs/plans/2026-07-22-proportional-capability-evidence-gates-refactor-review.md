# Proportional Capability and Evidence Gates Refactor Review

## Refactor Check

No further refactor is justified.

The proportional predicate has one current consumer: strict-TDD eligibility.
Keeping the small, ordered assessment inside that capability avoids a
speculative shared policy layer and makes legacy-first trigger precedence
visible. The order is deterministic: legacy regression/high-risk evidence,
then external effect, system blast radius, irreversibility, and high
uncertainty. Each selected fact supplies the explainable reason code and its
original evidence reference.

The focused public scenario passes after this review:
`receipt:00db509a-778c-4a68-a6ab-a87556bfe3a1`.

## Test-Diff Review

The P4 scenario tests use exported Rex APIs and observe real public outcomes:

- strict versus baseline Capability selection and their evidence contracts;
- P3 Observation-to-P4 selection integration;
- all elevated table conditions and unchanged legacy selection;
- preserved test-design preconditions;
- strict refactor evidence blocking; and
- activation-derived execution-profile labels.

They do not assert helper calls, provider internals, regex behavior, or mocked
state. No test was removed, skipped, relaxed, or converted to a private
implementation assertion. The P3/P4 focused and adjacent suites pass 37 tests;
`git -C rex-harness diff --check` exits 0.
