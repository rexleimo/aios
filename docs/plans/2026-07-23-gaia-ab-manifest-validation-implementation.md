# GAIA A/B Manifest Validation Implementation

## Changed Ownership Areas

- `scripts/lib/gaia-ab-eval/manifest.mjs`: owns pure JSON manifest validation
  and dry-run summary construction.
- `scripts/gaia-ab-eval.mjs`: reads one local manifest only for `--dry-run`
  and prints its isolated client summary.
- `scripts/tests/gaia-ab-eval.test.mjs` and its local JSON fixture: cover the
  public CLI's valid and rejected manifest behavior.
- `package.json`: makes the focused GAIA CLI test run from the normal
  `npm run test:scripts` lifecycle.

## Minimal Behavior Change

The CLI now accepts a local JSON manifest only when `--dry-run` is supplied.
It requires one Codex, one Claude, and one Hermes run; requires a non-empty
model value for each; pins Hermes to `deepseek-v4-pro`; requires matching A/B
controls within a client; and rejects cross-model aggregation.

It prints only a local summary containing each client, model, and arm names.
There is no client-process adapter, model endpoint, GAIA dataset access,
browser operation, credential handling, or leaderboard submission path.

## Verification

Declared public scenario:

`node scripts/gaia-ab-eval.mjs --config scripts/tests/fixtures/gaia-ab-eval-valid.json --dry-run`

Receipt: `receipt:db593892-84e1-4170-b18f-1288e0868d4d` (exit 0).

Focused public tests:

`node --test scripts/tests/gaia-ab-eval.test.mjs`

Result: 5 passed, 0 failed.

Repository script:

`npm run test:scripts`

Result: exit 0; the lifecycle ran the five GAIA tests and completed with 833
passed, 0 failed, and 8 skipped tests.
