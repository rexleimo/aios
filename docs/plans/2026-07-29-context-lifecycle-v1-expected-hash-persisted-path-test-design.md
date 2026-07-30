# Context Lifecycle V1 Expected-Hash Persistence Path Test Design

> Work item: `context-lifecycle-v1-expected-hash-persisted-path`
> Status: implemented; focused packet-sidecar persistence regressions are covered
> Requirements: `docs/plans/2026-07-29-context-lifecycle-v1-expected-hash-persisted-path-requirements.md`

## Test scope contract

### User goal

Updating an execution-context expected hash must update only the packet sidecar owned by the resolved ContextDB state root. A legacy or hostile caller must not select an arbitrary persistence destination.

### In scope

- `buildExecutionContextPacket()` storage metadata and controlled packet path derivation.
- `updateExecutionContextExpectedHash()` with `persist: true` and `persist: false`.
- Absolute, traversal, and missing legacy `packetPath` inputs.
- Source containment, current source hash validation, and custom `AIOS_PROJECT_STATE_DIR` behavior.
- Packet JSON persistence without source-content leakage.

### Out of scope

- Hard admission enforcement, broker authority, remote signatures, or Dream governance.
- Automatic migration of old packet sidecars.
- Arbitrary ContextDB writes unrelated to expected-hash updates.

### Allowed test seams

1. Public ContextDB APIs: `buildExecutionContextPacket()`, `updateExecutionContextExpectedHash()`, and `resolveExecutionContextPaths()`.
2. Real temporary workspace files and a real custom state root.
3. External sentinel files used only to prove that caller-selected paths are not written.

## Acceptance-to-test mapping

| Acceptance behavior | Public observation | Fixture and assertion |
| --- | --- | --- |
| Caller `packetPath` is ignored | Controlled packet sidecar | Supply absolute and traversal paths; assert the external sentinel remains unchanged. |
| Controlled storage metadata is required | Fail-closed persistence | Remove or corrupt `packet.storage.relativeDir`; assert `persist: true` rejects before writing. |
| Correct sidecar is updated | Packet JSON | Build a packet, update the expected hash, then read the derived packet path and assert the normalized hash. |
| In-memory compatibility remains | Return value | Use `persist: false` with a legacy packet and assert the returned packet is updated without filesystem writes. |
| Source hash validation remains | Rejection | Change the source or provide a mismatched expected hash; assert the update rejects. |
| Custom state root is honored | Filesystem location | Set `AIOS_PROJECT_STATE_DIR`, persist an update, and assert only the custom ContextDB root contains the sidecar. |
| No source text is persisted | Serialized sidecar | Assert packet JSON contains hashes/metadata but not the source fixture text. |

## Focused verification

The primary regression file is `scripts/tests/execution-context-packet.test.mjs`, with S2 and production-correction coverage providing custom-root and containment cross-checks.

```text
node --test --test-concurrency=1 scripts/tests/execution-context-packet.test.mjs
node --test --test-concurrency=1 scripts/tests/context-lifecycle-s2.test.mjs scripts/tests/context-lifecycle-production-correction.test.mjs
```

These tests use real temporary files and public APIs; no persistence destination or source reader is mocked.
