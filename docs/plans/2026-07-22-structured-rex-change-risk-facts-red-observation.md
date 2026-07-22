# Structured Rex Change and Risk Facts RED Observation

## Public Scenario

- **Entry point:** `deriveSoftwareFacts()` imported from the rex-harness package
  entry point.
- **Setup:** submit one evidence-bearing `change.risk-assessed` observation
  containing the five values `behavioral`, `component`, `external`,
  `compensatable`, and `medium`.
- **Expected user-observable result:** the returned public Fact collection
  contains five evidence-bearing fact records with those exact values.

## Execution

```text
node --test rex-harness/tests/application/change-risk-facts.test.mjs
```

- **Receipt:** `receipt:96fe386c-167c-4968-a495-d72f98dd958e`
- **Exit status:** 1
- **Actual result:** the focused test fails before the assertion because
  `OBSERVATION.CHANGE_RISK_ASSESSED` does not exist. Observation normalization
  reports `TypeError: observation 0 requires kind` from
  `src/domain/observation-kinds.mjs:26`.

## Failure Classification

The test reaches the public derivation path and the failure is the missing
structured observation/fact behavior requested by Phase 3. It is not a syntax,
fixture, dependency, permission, network, or unrelated baseline failure. No
implementation or assertion was weakened after this observation.
