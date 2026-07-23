# GAIA Live A/B Digest and Arm-Isolation Review

## Standards Review

No standards finding for the completed digest-order slice. The reordered safety
gates remain explicit, use ESM imports, and retain injected adapters. The test
continues to use temporary local data only.

## Specification Review

### Resolved: Integrity-first task rejection

- Location: `scripts/lib/gaia-ab-eval/live-runner.mjs:129-140`
- Evidence: task loading and SHA-256 validation now run before
  `browserPreflight`; the public bad-digest test observes zero browser and
  client calls.

### P1 Remaining: A failed job still terminates all later jobs

- Location: `scripts/lib/gaia-ab-eval/live-runner.mjs:183-192`
- Evidence: the catch block writes a failure artifact and immediately
  rethrows. This exits the nested job loops.
- Impact: a budget, timeout, or client failure does not stop only its affected
  client/model/arm as required; later independent jobs never execute.
- Fix: define and test an arm-level terminal result, then continue to the next
  isolated job while keeping the global spend ledger shared.

### P2 Remaining: Failure-path acceptance rows are not public-tested

- Location: `scripts/tests/gaia-ab-live-runner.test.mjs`
- Evidence: no test currently asserts cost-limit, timeout, or client-error
  isolation and their redacted terminal artifacts.
- Impact: the failure-isolation half of the approved scope lacks behavioral
  evidence.
- Fix: add one failure mode at a time through the existing fake-adapter seam;
  do not introduce a real client or browser adapter.

## Conclusion

The digest-order behavior is specification-complete, but the arm-isolation
behavior remains an unclosed P1 and blocks a live A/B operator smoke.
