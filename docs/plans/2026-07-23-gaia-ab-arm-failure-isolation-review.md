# GAIA Live A/B Arm Failure-Isolation Review

## Standards Review

No standards finding for the cost-limit slice. The data boundary stays in the
dedicated artifact module, the runner does not introduce global client state,
and tests remain local with explicit fake adapters.

## Specification Review

### Resolved: Cost-limit isolation

- Location: `scripts/lib/gaia-ab-eval/live-runner.mjs:183-195`
- Evidence: a budget rejection produces `cost_limit`, has zero actual spend,
  is included in the returned artifacts, and ends only the current job loop.
- Test evidence: the public scenario completes the other five jobs' two tasks.

### P1 Remaining: Timeout and client errors lack required terminal statuses

- Location: `scripts/lib/gaia-ab-eval/live-runner.mjs:186-191`
- Evidence: every non-cost error currently becomes `status: 'failed'`.
- Impact: the specified `timeout` and `client_error` terminal outcomes cannot
  be distinguished or asserted by an operator reviewing artifacts.
- Fix: add focused public timeout and rejected-client tests and map them to
  their distinct whitelist-only terminal statuses.

### P1 Remaining: Post-launch failure does not reserve estimated spend

- Location: `scripts/lib/gaia-ab-eval/live-runner.mjs:153-174, 186-191`
- Evidence: remaining spend is decremented only after a successful client
  result. A timeout or rejected client call leaves its estimate uncharged,
  allowing later jobs to treat that money as available.
- Impact: a client could incur a charge before failing, so the runner cannot
  uphold the declared shared spend bound after a post-launch failure.
- Fix: reserve the validated estimate before the launch; reconcile it with a
  successful actual spend, and retain the reservation for a timeout or client
  failure.

### P2 Remaining: The dedicated failure-path tests are absent

- Location: `scripts/tests/gaia-ab-live-runner.test.mjs`
- Evidence: only the cost-limit path is tested.
- Impact: the timeout/client-error acceptance rows have no public evidence.
- Fix: use the approved two-task, fake-adapter seam; no production adapter is
  necessary.

## Conclusion

Cost-limit isolation is complete. Timeout/client-error classification and
post-launch budget reservation remain P1 blockers for a live A/B smoke.
