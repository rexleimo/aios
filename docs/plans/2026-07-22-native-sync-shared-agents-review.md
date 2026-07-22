# Native Sync Shared-AGENTS Standards and Specification Review

## Review Scope

Reviewed the Phase 1 compact-guidance implementation and its repaired
temporary-root integration seam:

- `client-sources/native-base/shared/partials/core-instructions.md`
- `scripts/lib/native/emitters/codex.mjs`
- `scripts/lib/native/emitters/compose.mjs`
- `scripts/tests/native-agent-guidance.test.mjs`
- `scripts/tests/native-sync.test.mjs`

The review excludes unrelated working-tree and release changes. Code-review-
graph identifies the native emitters and sync runner as the affected boundary;
the focused tests exercise that public output path.

## Standards Review

### P2: stale fixture comment

- Location: `scripts/tests/native-sync.test.mjs:79`.
- Evidence: the comment says Codex AGENTS composition appends Grok notes, but
  `composeNativeMarkdown()` now returns only the compact shared core for every
  `AGENTS.md` client, and the test at line 126 explicitly requires Grok text
  to be absent.
- Impact: no runtime or test-behavior defect, but the comment can mislead a
  future maintainer into restoring the behavior Phase 1 deliberately removed.
- Fix: replace the comment with wording that the fixture retains a Grok source
  only to verify it is excluded from the shared projection.

Aside from that comment, the reviewed implementation follows the existing
native-emitter ownership boundary: composition stays centralized, the Codex
emitter delegates to it, no duplicate client-manual concatenation was added,
and the focused changed-file diff has no whitespace errors.

## Specification Review

The approved Phase 1 contract is covered without scope expansion:

- Codex, OpenCode, Hermes, and Grok compose byte-identical AGENTS content;
  their manuals are absent.
- All six projections retain the compact workflow, safety, privacy, and
  pull-based context invariants while route manuals remain on demand.
- Claude and Gemini retain their project overlays; prompt-hook wording remains
  Claude-only.
- Temporary-root synchronization now asserts the same public contract while
  retaining user-text preservation, installation, merge, repair, and rollback
  cases.

Evidence: `node --test scripts/tests/native-agent-guidance.test.mjs` passed 6
of 6 tests; `node --test scripts/tests/native-sync.test.mjs` passed through
`receipt:43a23766-8887-47b4-a0d1-519b47315a05`.

The P2 comment finding must be corrected before treating this repair as ready
for final verification. No P0 or P1 specification or standards defect was
found in the reviewed scope.
