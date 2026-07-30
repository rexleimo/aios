# Context Lifecycle V1 Expected-Hash Persistence Path Requirements

> Work item: `context-lifecycle-v1-expected-hash-persisted-path`
> Status: implemented; controlled packet-sidecar persistence is covered by focused regression tests
> Trigger: exported ContextDB persistence API audit

## Problem

`updateExecutionContextExpectedHash()` currently accepts a caller-provided `packetPath` when `persist: true` and passes it to `atomicWriteText()`. Any library consumer can choose an absolute path or `../` traversal, creating/overwriting a file outside the workspace/ContextDB root.

A persisted expected-hash update belongs to the packet sidecar already owned by the packet's ContextDB storage location. The destination must be derived from controlled packet metadata and the resolved ContextDB root, not selected by the caller.

## Acceptance criteria

1. `packetPath` is not used as a persistence destination, even when a legacy caller supplies an absolute or traversal value.
2. New packets contain a normalized, controlled relative storage reference sufficient to derive their ContextDB packet sidecar path.
3. With `persist: true`, an expected-hash update writes only `<resolved-contextdb-root>/<controlled-relative-dir>/packet.json`.
4. A packet missing valid controlled storage metadata cannot persist; it fails closed without writing to a caller-provided path.
5. `persist: false` remains compatible for legacy packet objects and returns the updated in-memory packet.
6. Current expected-hash validation still requires an existing, physically contained source whose hash matches the requested value.
7. Custom `AIOS_PROJECT_STATE_DIR` resolves the controlled destination under that configured ContextDB root.
8. The update never writes source content, only normalized packet JSON; packet/receipt contracts and dry-run behavior otherwise remain unchanged.

## Non-goals

- Solving state-root symlink containment or changing the supported custom state-root policy.
- Enabling hard preflight admission, broker authority, Dream GC, or generic arbitrary ContextDB writes.
- Rewriting or migrating old packet sidecars automatically.
- Retaining caller-selected persistence destinations for backward compatibility.

## First slice

1. Build a packet in a temporary workspace and attempt `persist:true` with `packetPath` pointing to an external sentinel path.
2. Demonstrate the current API creates that external file.
3. Add controlled storage metadata at packet construction and derive the update destination from it plus `resolveContextDbRoot()`.
4. Assert the external file remains absent, the controlled packet sidecar contains the updated expected hash, legacy packets fail closed for persistence, and `persist:false` remains usable.
