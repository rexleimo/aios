# GAIA Live A/B Digest and Arm-Isolation Refactor Review

## Reviewed Change

The execute sequence now has a clear fail-closed order:

1. validate the manifest configuration;
2. read and SHA-256-verify local task input;
3. run browser preflight;
4. validate and invoke task-execution adapters.

No source refactor is needed. These steps are short, ordered safety gates; an
extra abstraction would hide the public integrity-before-browser behavior.

## Test-Diff Review

The bad-digest test asserts two public facts: the digest-mismatch rejection and
zero browser/client calls. The existing browser failure test was not weakened;
it now provides a valid temporary task manifest so it can still prove that a
failed browser preflight produces zero client launches after integrity has
passed. No test was removed, skipped, or relaxed.
