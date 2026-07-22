# Rex API, Outcome, and Dependency Hardening RED Observation

## Public Scenario

- **Entry point:** `startLongRunningDelivery()` from the rex-harness package entry point.
- **Setup:** declare `dependent` before `prerequisite`, with
  `dependent.dependsOn = ['prerequisite']`, and provide a verified zero-exit
  baseline receipt.
- **Expected result:** the ledger preserves the normalized dependency edge and
  selects `prerequisite` as its only active current feature.

## Execution

```text
node --test rex-harness/tests/contract/workflow-outcome-dependencies.test.mjs
```

- **Receipt:** `receipt:dda7b0d4-cf3f-4c2e-97b5-b032fad1b9aa`
- **Exit status:** 1
- **Actual result:** `started.ledger.features[0].dependsOn` was `undefined`,
  where the public contract requires `['prerequisite']`.

## Failure Classification

The public initializer completed its verified baseline but discarded the
declared dependency edge. The failure is the scoped missing behavior: without
that edge the ledger cannot select the first dependency-ready feature. The test
fixture, command, receipt resolver, and baseline execution all completed; no
assertion was weakened and no unrelated infrastructure failure occurred.
