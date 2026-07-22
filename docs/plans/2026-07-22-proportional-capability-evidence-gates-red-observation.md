# Proportional Capability and Evidence Gates RED Observation

## Public Scenario

- **Entry point:** `decideNextCapability()` from the rex-harness package entry
  point.
- **Setup:** provide behavior-change, confirmed-scope, and honest-RED Facts,
  plus `change-external-effect` with value `external` and an assessment
  evidence reference.
- **Expected result:** select `software.testing.strict-tdd`, whose public
  evidence contract includes `test-strength-check-recorded`.

## Execution

```text
node --test rex-harness/tests/scenarios/proportional-gates.test.mjs
```

- **Receipt:** `receipt:ad0e26d8-fc4a-4638-bf20-221df2dbd2ea`
- **Exit status:** 1
- **Actual result:** the test received `software.testing.tdd` instead of
  `software.testing.strict-tdd`.

## Failure Classification

The test reaches the public capability selector with all preconditions present.
The missing behavior is solely the P4 proportional eligibility rule for a
structured external effect. No environment, fixture, command, dependency, or
unrelated test failure occurred; the assertion was not weakened.
