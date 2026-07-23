# Verification-Failed Reason Minimal Construction

## Reuse Ladder

1. The terminal verification failure must be observable to callers; it cannot
   be removed or inferred only from retry count.
2. The existing nonzero-receipt branch already returns a `human-gate` decision
   through `withTerminalDecision()` after retry exhaustion.
3. No JavaScript standard-library feature improves a small closed domain value.
4. No dependency is justified.
5. Pass `verification-failed` through the existing terminal-decision helper at
   the exhausted-retry branch; keep the preceding retry branch untouched.
6. A separate retry/error subsystem would duplicate existing domain policy.

## Selected Option

Add only the typed reason to the existing exhausted-retry `human-gate`
decision and cover it in the established controlled-delivery public test.
