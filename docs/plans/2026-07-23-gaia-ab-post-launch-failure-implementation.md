# GAIA Live A/B Post-Launch Failure Implementation

## Implemented GREEN Slice: Timeout and Reservation

After an estimate passes the shared-cap check, the runner records that estimate
as a reservation before calling the task client. The client receives the
pre-reservation available budget; when it succeeds, the reservation is released
and replaced by the reported actual spend. A timeout keeps the reservation,
emits a whitelist-only `timeout` artifact, ends its job, and leaves subsequent
jobs with the reduced shared budget.

The generic terminal path now classifies a non-timeout client failure as
`client_error`, while preserving the same reservation. This is the narrow
fail-closed default for a post-launch call that did not return a trustworthy
actual-spend result; its dedicated public test remains required before that
behavior can be marked complete.

## Deliberate Boundary

No production browser or client adapter was added. The change is exercised only
with temporary local task data and fake adapters; a real A/B operator smoke is
still prohibited until the dedicated client-error test, full review, and
browser runtime prerequisites are complete.
