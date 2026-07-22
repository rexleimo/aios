# Six-Client Native Guidance Standards and Specification Review

## Review Scope

Reviewed only the Phase 1 native-guidance source, composer, Codex emitter,
generated managed blocks, focused tests, and the native-sync integration seam.
Unrelated working-tree changes were excluded.

## Standards Review

### P3 - Stale Composer Comment

- Location: `scripts/lib/native/emitters/compose.mjs`, the comment immediately
  above `composeNativeMarkdown()`.
- Evidence: the comment still describes capability-filtered shared sections,
  while the implementation now deliberately loads one compact core and treats
  `AGENTS.md` as a deterministic shared surface.
- Impact: maintainers could reintroduce capability-dependent startup injection
  while following obsolete local documentation.
- Suggested fix: revise the comment to describe the compact shared core and
  client overlay boundary when the follow-up implementation command is issued.

No naming, error-boundary, generated-file, or unnecessary-abstraction issue was
found in the reviewed implementation. The existing instruction-file registry is
used as the shared-surface authority; no duplicate client list was introduced.

## Specification Review

### P1 - Native Sync Contract Is Not Yet Migrated

- Location: `scripts/tests/native-sync.test.mjs` fixture and assertions,
  including the tests for capability gating, Codex output, OpenCode output, and
  external target roots.
- Evidence: `node --test scripts/tests/native-sync.test.mjs` exited with status
  1. Six tests expect legacy `Codex native block`, `Opencode compatibility`, or
  capability-gated partial text in the shared AGENTS block. The actual output is
  the intended client-neutral `Shared native instructions.` block.
- Impact: the Phase 1 acceptance mapping explicitly includes temporary-root
  native sync. The repository's native-sync integration suite therefore fails,
  and the batch cannot be treated as fully verified.
- Suggested fix: update the temporary native-source fixture and its assertions
  to require the compact shared AGENTS projection, preserve client-specific
  overlays only for CLAUDE/GEMINI, and assert that unrelated client manuals are
  absent. Re-run the focused native-sync and native-guidance suites before full
  verification.

## Review Conclusion

The core composer change correctly implements the new shared-AGENTS behavior,
as shown by the passing focused guidance suite and byte-size measurements
(2,947 bytes for shared AGENTS; 3,357-3,453 bytes for Claude/Gemini). However,
P1 blocks Phase 1 completion until the integration suite is migrated and passes.

