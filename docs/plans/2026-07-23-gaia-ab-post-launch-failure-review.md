# GAIA Live A/B Post-Launch Failure Review

## Standards Review

No standards finding in the timeout slice. The runner keeps budget state local
to one public call, the artifact module remains the single persistence
whitelist, and no external adapter or implicit client configuration was added.

## Specification Review

### Resolved: Timeout isolation and reservation

- Location: `scripts/lib/gaia-ab-eval/live-runner.mjs:158-180, 190-197`
- Evidence: a validated estimate is reserved before launch, a TimeoutError
  retains it and emits `timeout`, and the next job receives reduced budget.
- Test evidence: the public two-task fake-adapter scenario passes.

### P1 Remaining: Client-error behavior lacks a public test

- Location: `scripts/lib/gaia-ab-eval/live-runner.mjs:193`
- Evidence: the default terminal path now uses `client_error`, but no test
  supplies a rejected non-timeout client call and verifies its status,
  reservation, isolation, and redaction.
- Impact: a core terminal behavior is implemented without user-observable
  regression evidence.
- Fix: add one public rejected-client scenario through the existing local seam.

### P2 Remaining: Unequal successful actual-spend reconciliation lacks a public test

- Location: `scripts/lib/gaia-ab-eval/live-runner.mjs:171-176`
- Evidence: the code releases the estimate then deducts reported actual spend,
  but current tests use matching 0.1 estimates and actuals.
- Impact: under- or over-estimate reconciliation is unproven.
- Fix: add a local success scenario with a deliberately different estimate and
  actual spend; assert the next job receives the correctly reconciled balance.

## Conclusion

The timeout requirement is complete. Client-error behavior remains an
unverified P1; reconciliation coverage is P2. Both must close before any live
A/B smoke can be approved.
