# Context Lifecycle V1 Memo Storage Locking Test Design

> Work item: `context-lifecycle-v1-memo-storage-locking-safety`
> Status: test scope designed; implementation has not started
> Requirements: `docs/plans/2026-07-29-context-lifecycle-v1-memo-storage-locking-requirements.md`

## Test scope contract

### User goal

A caller that writes memo events through the supported memo API must either preserve its event exactly once in canonical storage or receive a clear failure before changing canonical event data. Concurrent writers must not silently lose events or reuse a sequence number.

### In scope

- `appendMemoEvent()` on real temporary workspaces using both `file` and `split` storage.
- A canonical storage lock whose path is derived from the resolved memo root.
- File-lock contention and timeout behavior through the real append API.
- Custom state-root behavior using the same path resolution contract.
- Regression confirmation that Dream GC remains disabled and raw runtime identity remains non-authoritative.

### Out of scope

- Authorizing Dream governance or enabling physical GC.
- Broker/attestation implementation.
- Locking arbitrary external filesystem writers that bypass AIOS memo APIs.
- Recall archive indexing, migration/rebuild/pinned-memo synchronization, Team shared-canonical, and enforcement.

### Allowed test seams

1. Public memo API: `appendMemoEvent()` and `listMemoEvents()`.
2. Narrow storage-owner seam: `withMemoStorageLock()` (or equivalently named exported lock primitive) is used only to hold the same real lock while a public append attempts to proceed. It must operate on the real temporary filesystem and must not mock the lock.
3. Optional `lockOptions` on `appendMemoEvent()` is allowed solely to make a bounded timeout deterministic. It must default to the production fail-closed values and remain additive.

### Completion criteria

- New tests fail against the current unlocked implementation for a behavior-relevant reason.
- File and split concurrent writes preserve every returned event and keep existing sequence scopes unique.
- A timed-out append leaves the canonical event set unchanged and returns a recognizable lock-contention error.
- A custom state-root fixture proves the lock is placed under the resolved memo root rather than a hard-coded `.aios` directory.
- Existing Dream governance fail-closed test remains green.
- No assertion is removed, skipped, weakened, or replaced by a mock-only check.

## Acceptance-to-test mapping

| Acceptance behavior | Public observation | Test fixture and assertion |
| --- | --- | --- |
| File concurrent append has no loss or duplicate sequence | `appendMemoEvent()` resolves for each writer; `listMemoEvents()` returns each event ID | Launch a deterministic batch of concurrent file writers. Assert returned IDs equal stored IDs, each appears once, and `seq` values are unique/contiguous in existing file scope. |
| Split concurrent append has no overwrite or duplicate sequence | Same public memo API observations | Launch concurrent split writers in one space. Assert all returned IDs are readable, each event file survives, and sequence values are unique/contiguous in that space. |
| Contended append fails before mutation | `appendMemoEvent()` rejects; subsequent `listMemoEvents()` is unchanged | Hold the real canonical storage lock through the lock seam. Call `appendMemoEvent()` with a short timeout; assert a dedicated timeout code and no new event. |
| Lock follows custom state root | Canonical files and lock are under the configured root | Set a custom project state root in an isolated fixture, perform a locked append, and assert the event plus lock location derive from that root with no default-root write. |
| Future GC can share the same domain without being enabled now | A lock held by the domain blocks an append | Use the lock seam to represent a future destructive transaction. Assert the public append waits or fails closed; separately retain the existing GC-disabled regression. |
| Governance remains fail closed | Existing Dream governance API/CLI behavior | Run `scripts/tests/dream-governance.test.mjs`; its spoofed-identity GC assertion must still return `gc_disabled_pending_concurrency_control`. |

## First vertical RED/GREEN slice

The first test file is `scripts/tests/memo-storage-locking.test.mjs`.

1. Write a file-storage concurrent append test using the existing public memo API. Before locking, concurrent sequence discovery can return repeated `seq` values, so this is a behavior-level RED.
2. Add the matching split-storage test; without serialization, same-space writers can select the same path/sequence.
3. Add the real-lock timeout test and custom-root assertion after the lock seam exists. A missing lock primitive is an expected RED during this slice, not a reason to weaken the contract.
4. Implement only the dedicated lock primitive and append integration needed to turn these tests green.
5. Run the existing Dream GC-disabled regression unchanged to prove this safety foundation did not alter governance authority.

## Verification commands

```text
node --test scripts/tests/memo-storage-locking.test.mjs
node --test scripts/tests/memo-storage.test.mjs scripts/tests/memo-temporal.test.mjs scripts/tests/dream-governance.test.mjs
```

The broader Context Lifecycle regression set is run after the vertical slice is green. No benchmark, synthetic success metric, or direct private-helper assertion substitutes for these filesystem-backed API tests.
