# GAIA Live A/B Runner Gate Implementation

## Changed Ownership Areas

- `scripts/lib/gaia-ab-eval/live-manifest.mjs` owns local-only live-manifest
  validation: fixed model IDs, task digest, task/spend limits, policy IDs, and
  cross-client control equality.
- `scripts/lib/gaia-ab-eval/live-runner.mjs` owns six-job dry-run construction
  and the execute-mode browser preflight gate.
- `scripts/tests/gaia-ab-live-runner.test.mjs` exercises the public module seam
  with inline config and fake adapters only.
- `package.json` registers the focused live-runner gate test in pretest.

## Minimal Behavior Change

The live manifest now rejects missing/invalid task and spend limits, an
unhashed task manifest, changed model IDs, equal A/B policies, or control drift
between client/model pairs. Dry-run returns six isolated jobs and never invokes
the supplied browser or client adapter. Execute mode requires a successful
browser preflight and refuses before task execution when it fails.

This is intentionally a gate slice, not a hidden live call. If browser
preflight succeeds, the runner reports that task execution is not implemented
yet rather than spawning a model without a tested task loader, spend ledger,
artifact writer, and redaction boundary.

## Verification

Declared public scenario:

`node --test scripts/tests/gaia-ab-live-runner.test.mjs`

Receipt: `receipt:d51a0925-ac50-46b4-8f1d-f390352b62a1` (exit 0).

Focused result: 3 passed, 0 failed.
