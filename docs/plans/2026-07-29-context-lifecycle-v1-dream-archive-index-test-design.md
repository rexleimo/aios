# Context Lifecycle V1 Dream Archive Index Test Design

> Work item: `context-lifecycle-v1-dream-archive-index`
> Status: test scope designed; implementation has not started
> Requirements: `docs/plans/2026-07-29-context-lifecycle-v1-dream-archive-index-requirements.md`

## Test scope contract

### User goal

Memo recall must preserve canonical Dream archive visibility while avoiding repeated full-content reads of every proposal and governance receipt. A derived archive index may accelerate this only if stale or corrupt derived state cannot hide the wrong memo records.

### In scope

- Real `listMemoEvents()` and `searchMemoEvents()` archive filtering.
- Real `readDreamArchivedEventIds()` output and its durable derived sidecar.
- Canonical proposal JSON plus governance JSONL fixtures under a temporary memo root.
- Missing, corrupt, source-token-stale, and concurrent cold index rebuild behavior.
- File/split memo storage and custom state root compatibility.
- No raw memo text or receipt body in the derived sidecar.

### Out of scope

- Authorizing Dream actions, executing GC, or testing a broker.
- Ranking, temporal supersede behavior, candidate visibility, recall budgets, migration, and Team behavior.
- Treating direct fixture writes as a production mutation authorization path; they only construct canonical source records for read-projection tests because production governance remains fail-closed.

### Allowed test seams

1. Public memo readers: `listMemoEvents()` and `searchMemoEvents()`.
2. Existing read-only lifecycle seam: `readDreamArchivedEventIds()` returns the normalized archived-ID `Set` used by public readers.
3. Existing state-root resolver determines the expected derived sidecar location. Tests may read the sidecar only after a public/lifecycle read has caused it to be derived.
4. Canonical fixture files use the existing proposal/receipt schema and are consumed by real production readers; no reader, fold, or filesystem operation is mocked.

### Completion criteria

- A new index-sidecar test fails on the current full-scan implementation because no durable derived index exists.
- After implementation, default list/search hide an archived event, `includeArchived` returns it, and `readDreamArchivedEventIds()` agrees with both.
- The stored index contains only allowed metadata and event IDs, not fixture memo text or receipt reason/principal fields.
- Missing/corrupt/stale indexes rebuild to the same canonical visibility result before filtering.
- The same behavior works when the project uses a custom state root.
- Existing Dream governance tests remain fail-closed and unchanged.

## Acceptance-to-test mapping

| Acceptance behavior | Public observation | Real fixture and assertion |
| --- | --- | --- |
| First archive-filtering recall materializes a derived index | Reader output plus derived artifact | Create memo events, a valid proposal, and allowed approve/archive receipts. Call `readDreamArchivedEventIds()` and assert the target ID plus a valid index sidecar. |
| Default recall hides archived events while opt-in recall exposes them | `listMemoEvents()` and `searchMemoEvents()` | Assert the archived target is absent by default and present with `includeArchived: true` for file and split storage. |
| Index does not leak raw data | Serialized derived index | Assert derived JSON excludes distinctive memo text, receipt reason, principal, and proposal summary strings. |
| Missing/corrupt index rebuilds | Same public reader output after sidecar mutation | Delete or corrupt the derived index, call the reader, assert canonical visibility remains correct and the next sidecar is valid. |
| Source-token mismatch rebuilds before filtering | Canonical source change followed by reader | Append an allowed restore or archive-state receipt after index creation, then assert the next reader returns current canonical visibility rather than stale IDs. |
| Concurrent cold rebuild is collision-free | Parallel lifecycle reads | Start parallel `readDreamArchivedEventIds()` calls with no sidecar; assert all return the canonical target and one valid sidecar remains. |
| Custom root is honored | Derived path and public visibility | Run the same fixture under a custom project state root and assert no default-root sidecar is used. |
| Governance remains disabled | Existing public governance test | Run `scripts/tests/dream-governance.test.mjs` unchanged; spoofed authority still cannot mutate canonical sources. |

## First vertical RED/GREEN slice

The first test file is `scripts/tests/memo-archive-index.test.mjs`.

1. Create a file-storage archive fixture and call the existing read seam.
2. Assert the archived ID is returned and that the expected derived index sidecar exists without fixture memo text.
3. Run the test against the current implementation. It should fail because the reader folds canonical source directly and does not create a durable index.
4. Implement only index path/validation/rebuild/read integration required to turn this test green.
5. Add stale/corrupt/custom-root coverage after the first durable sidecar is proven.

## Verification commands

```text
node --test scripts/tests/memo-archive-index.test.mjs
node --test scripts/tests/memo-storage.test.mjs scripts/tests/memo-temporal.test.mjs scripts/tests/dream-governance.test.mjs
```

A benchmark cannot substitute for these canonical-source and public-reader assertions.
