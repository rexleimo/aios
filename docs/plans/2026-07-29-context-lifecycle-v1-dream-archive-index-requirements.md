# Context Lifecycle V1 Dream Archive Index Requirements

> Work item: `context-lifecycle-v1-dream-archive-index`
> Status: implemented; durable derived archive index and concurrent rebuild behavior are covered by focused regression tests
> Authority: `docs/reports/2026-07-28-context-lifecycle-v1-corrective-audit.md`

## Problem and boundary

`listMemoEvents()` and `searchMemoEvents()` currently call `readDreamArchivedEventIds()` unless callers request archived records. That function reads every Dream proposal plus the complete governance JSONL and folds all receipts for every recall. The repeated full-content IO is unbounded as proposal and receipt history grows.

This slice adds a durable, disposable archive-ID index under the resolved memo root. It changes only the derived lookup path. Canonical proposal files, governance receipts, memo event files, authority behavior, and visibility policy remain owned by their existing modules.

## Terms

- **Archive source**: Dream proposal JSON files and Dream governance receipt JSONL.
- **Archive-ID index**: a derived JSON artifact containing only archived event IDs and source revision metadata. It never stores memo text, proposal summary, receipt reason, or raw source body.
- **Source token**: deterministic metadata sufficient to decide whether the current derived index can be reused for the current resolved memo root. A source-token mismatch is stale by definition.
- **Rebuild**: read canonical archive sources, fold allowed proposal state once, derive archived IDs, and atomically replace the derived index only after a stable source observation.

## Acceptance criteria

1. A recall that needs archived-ID filtering reads a valid, source-token-matching archive-ID index instead of rereading every proposal body and governance receipt body.
2. The first recall with no index, and any recall with a missing, malformed, unsupported, or source-token-mismatching index, rebuilds deterministically from canonical Dream sources.
3. A rebuild stores only normalized event IDs, schema/version metadata, source-token metadata, and generation timestamps. It must not copy memo text, proposal summaries, governance reasons, principals, or receipt bodies.
4. The index is written under the memo root resolved for the current workspace and honors a custom project state root. It must not hard-code `.aios`.
5. After a canonical archive-source change, a stale index cannot silently hide the wrong memo events. The reader must detect the changed source token and rebuild before applying archive filtering; if the source changes continuously during rebuild, it must fail closed rather than persist an inconsistent index.
6. Existing `includeArchived: true` behavior remains unchanged: it bypasses archive filtering and does not require the derived index.
7. File and split memo storage have identical archived-ID filtering behavior because the index is independent of canonical event storage format.
8. Existing fail-closed Dream authority remains unchanged. This slice does not enable approve/archive/restore/GC or interpret environment identity as authority.
9. Concurrent cold or stale archive-index readers serialize rebuild work through the resolved memo-root lock, recheck after acquiring it, and return a valid canonical projection rather than colliding on a derived-file rename.

## Explicit non-goals

- Implementing a trusted broker, signed authority, OS credential boundary, or hostile-shell security model.
- Enabling Dream GC, archive, restore, or any destructive canonical mutation.
- Replacing memo list/search ranking, temporal filtering, candidate visibility, or recall budgets.
- Indexing memo text, proposal text, search terms, or governance receipt bodies.
- Creating a second canonical memory store, database, service, or distributed cache.
- Claiming O(1) recovery after arbitrary external direct filesystem mutation that bypasses AIOS writers; canonical source remains authoritative and missing/corrupt indexes rebuild from it.

## First independently verifiable slice

1. Add a narrow Dream archive-index owner beside governance code with explicit index path, validation, source-token check, atomic write, and stable rebuild behavior.
2. Route `readDreamArchivedEventIds()` through that owner while preserving its `Set<string>` return contract.
3. Use real temporary proposal/governance fixtures to show an archived event is hidden by default, visible with `includeArchived`, and that an existing index contains no raw memo text.
4. Mutate canonical governance/proposal source after index creation and show the next recall detects staleness, rebuilds, and returns the current canonical visibility result.
5. Retain existing Dream governance fail-closed tests unchanged.

A later work item may optimize writer-side source revision updates or archive state transitions. This slice must first make derived recall state correct, disposable, and non-leaking.
