# Context Lifecycle V1 Memo Storage Locking Requirements

> Work item: `context-lifecycle-v1-memo-storage-locking-safety`
> Status: implemented; canonical lock-domain behavior, including injected custom state roots, is covered by focused regression tests
> Authority: corrective audit `docs/reports/2026-07-28-context-lifecycle-v1-corrective-audit.md`

## Problem and boundary

Memo file storage allocates a sequence by reading the complete JSONL file and then appends a row. Split storage discovers the next sequence by listing files and then creates a file. Dream GC is currently disabled because its historical read/filter/rewrite behavior could race either writer and lose canonical data.

This slice establishes one fail-closed lock domain for canonical memo event mutations. It is a storage-integrity foundation only. It must not claim that Dream GC, governance authority, enforcement, or hostile-shell security is complete.

## Terms

- **Canonical memo root**: the root resolved by existing memo path resolution for the current workspace, including a configured custom state root when applicable.
- **Canonical event mutation**: a write that creates, appends, replaces, restores, or removes file/split memo event records.
- **Storage lock**: a process-visible exclusive lock scoped to one canonical memo root. It serializes canonical event mutation transactions.
- **Fail closed**: timeout, lock corruption, or lock acquisition failure must return an error before changing canonical event data.

## Acceptance criteria

1. `appendMemoEvent()` for both `file` and `split` storage acquires the canonical memo storage lock before it derives a sequence and before it writes the event.
2. Concurrent append callers for the same workspace/storage complete with every successfully returned event preserved exactly once. File and split sequence values are unique within their existing sequence scope; no event is silently overwritten or dropped.
3. A waiting caller that cannot acquire the lock within the configured timeout fails before it changes canonical memo data. The failure identifies the storage-lock contention rather than returning a fabricated success.
4. The lock path is derived from the resolved memo root; it must not hard-code the default `.aios` path. The same behavior is verified with a custom project state root.
5. The lock interface is suitable for future Dream GC/restore transactions so those operations can share the same canonical event lock domain when a trusted authority exists. This slice does not make any destructive Dream operation reachable.
6. Existing single-writer memo behavior, file/split formats, event IDs, public CLI output, and read/query semantics remain compatible.
7. No test or implementation path treats `AIOS_RUNTIME_*`, a caller-provided identity, or an environment capability list as governance authority.

## Explicit non-goals

- Enabling Dream approve/archive/restore/GC or changing their current fail-closed decisions.
- Implementing a broker, attestation service, signed authority token, OS credential check, or hostile-shell authorization boundary.
- Adding a recall archive index, changing memo search/list ranking, or changing candidate visibility.
- Covering arbitrary external direct filesystem writers that bypass AIOS memo APIs.
- Redesigning storage migration, derived-index rebuild, pinned-memo writes, or all memo configuration writes in this first slice.
- Claiming cross-host distributed locking, Team shared-canonical readiness, or enforcement readiness.

## First independently verifiable slice

1. Add a dedicated canonical memo storage lock primitive under the memo storage owner, scoped by resolved memo root.
2. Wrap `appendMemoEvent()` sequence allocation plus canonical write inside that lock for `file` and `split` storage.
3. Add deterministic tests that create contending append operations, verify no loss/duplicate sequence, and verify lock timeout leaves canonical data unchanged. Run the same contract under a custom state root.
4. Keep the existing Dream GC disabled test green to prove the lock work does not silently re-enable destructive governance behavior.

After this slice, a separate work item may extend the same lock domain to authorized GC/restore and migration writers. That future work remains blocked on a real authority boundary and its own concurrency tests.
