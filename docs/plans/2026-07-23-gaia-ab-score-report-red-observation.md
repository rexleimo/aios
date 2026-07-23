# GAIA A/B Score and Report RED Observation

## Declared Public Scenario

`node --test scripts/tests/gaia-ab-score-report.test.mjs`

Declared scenario receipt: `receipt:709d0efe-4c69-4280-a2f5-e1bb731b524e`

## Expected Behavior

The local-only test imports the public scorer and report modules and proves
GAIA-compatible number/list/string comparison, L1/L2/L3 summaries, paired
baseline/optimized outcomes per selected client/model, an inconclusive
conclusion for insufficient evidence, and invalid artifact rejection. It must
not invoke a model, browser, network source, credential, or GAIA dataset.

## Observed RED

The scenario exits with code 1 before its assertions run. Node reports:

`ERR_MODULE_NOT_FOUND: Cannot find module 'scripts/lib/gaia-ab-eval/scorer.mjs'`

## Failure Classification

The RED matches the requested behavior delta: the promised public offline
scorer and report modules have not been implemented. The test file itself is
loadable and its local fixtures require no external dependency; the failure is
not caused by a model credential, browser runtime, GAIA download, or live A/B
execution.
