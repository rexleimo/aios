# GAIA Live A/B Client Error and Reconciliation Review

## Standards Review

No standards finding for the bounded local runner diff. The runner uses ESM
Node built-ins, explicit adapters, a local ledger, and a dedicated whitelist
artifact module. Tests remain in the established script test directory and use
temporary local fixtures.

## Specification Review

### Verified Local Execution Boundaries

- SHA-256 task integrity rejects before browser/client interaction.
- Browser failure prevents all client launches.
- Cost-limit, timeout, and client-error outcomes each write a distinct,
  redacted terminal artifact, stop their own job, and allow independent jobs to
  continue.
- Client-error and timeout reservations reduce later jobs' available budget.
- A successful 2 USD estimate with 0.5 USD actual spend reconciles to a 9.5 USD
  next-job boundary.
- Completed records remain score-compatible.

### P1: Reported actual spend over the granted limit does not halt the batch

- Location: `scripts/lib/gaia-ab-eval/live-runner.mjs:171-176, 190-197`
- Evidence: an outcome whose `spendUsd` exceeds the pre-launch available budget
  triggers the generic terminal catch. The catch retains only the estimate and
  continues to later jobs, even though the global cap is no longer trustworthy.
- Impact: a non-conforming client adapter could report an over-limit charge and
  still allow additional launches, violating the fail-closed shared-spend
  contract.
- Fix: add a local fake-client scenario for an over-limit actual result. Record
  a redacted terminal breach artifact, prevent all subsequent client launches,
  and make the global terminal state visible to the operator.

### System Readiness (Outside This Local Test Scope)

No real live A/B can start yet. The repository still lacks a reviewed production
CLI/client adapter, a verified local GAIA task manifest, and the browser runtime
doctor reports the external `ai-browser-book/mcp-browser-use` checkout and
default CDP endpoint as missing.

## Conclusion

The configured local failure and reconciliation scenarios are verified. The P1
over-limit actual-spend breach and the independent browser/production-adapter
readiness gates still block a real A/B operator smoke.
