# GAIA A/B Manifest Validation Refactor and Test Review

## Refactor Check

No further refactor is needed for this bounded slice. The CLI owns only local
file I/O and dry-run output; `scripts/lib/gaia-ab-eval/manifest.mjs` owns the
pure manifest policy. The implementation reuses the shared CLI parser and
Node's standard library, adds no dependency, and contains no model or browser
adapter.

The declared public scenario remains green:

`node scripts/gaia-ab-eval.mjs --config scripts/tests/fixtures/gaia-ab-eval-valid.json --dry-run`

Receipt: `receipt:98043165-65cf-4884-980e-251dd4ab134e` (exit 0).

## Test Diff Review

The tests launch the real public CLI against a checked-in valid manifest and
temporary local invalid variants. They assert successful dry-run behavior and
observable rejection messages for Hermes model drift, an unequal A/B control,
and cross-model aggregation. They do not mock an internal validator, soften a
required exit status, or use a model, dataset, browser, or network service.

The test is now executed by `pretest:scripts`, which is part of every
`npm run test:scripts` run. The full repository command completed successfully
after exercising the five GAIA tests.

## Follow-up Coverage Check

The validator compares all six required A/B control fields, but the public
test currently mutates only `concurrency`. The next standards/spec review must
decide whether the acceptance contract requires a parameterized public test
for each of `taskSet`, `toolProfile`, `browserProfile`, `timeoutSeconds`,
`retryPolicy`, and `concurrency`, and whether empty Codex/Claude model IDs
need an explicit public rejection test. This review does not treat those
unexercised cases as covered.
