# GAIA Agent A/B Evaluation Initial CLI Implementation

## Changed Ownership Areas

- `scripts/gaia-ab-eval.mjs`: adds the public, offline-only GAIA A/B CLI
  entry point and its declared `--config` and `--dry-run` interface.
- `scripts/tests/gaia-ab-eval.test.mjs`: verifies the public help command,
  rather than an internal helper or a mocked model adapter.

## Minimal Behavior Change

`node scripts/gaia-ab-eval.mjs --help` now succeeds and exposes the two
offline controls required for the future manifest-validation path. Any other
invocation exits without starting a model client, accessing GAIA data, opening
a browser, or submitting to Hugging Face.

## Focused Verification

The declared public scenario succeeds:

`node scripts/gaia-ab-eval.mjs --help`

Receipt: `receipt:9c9ffe95-ae93-4c70-992e-4edda70eca86` (exit 0).

The public regression test also passes:

`node --test scripts/tests/gaia-ab-eval.test.mjs`

It verifies successful help output and the `--config` and `--dry-run`
controls without invoking any external model endpoint.
