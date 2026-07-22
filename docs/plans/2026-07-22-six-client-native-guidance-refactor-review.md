# Six-Client Native Guidance Refactor Review

## Review Scope

This review covers only the Phase 1 native-guidance paths:

- `client-sources/native-base/shared/partials/core-instructions.md`
- `scripts/lib/native/emitters/compose.mjs`
- `scripts/lib/native/emitters/codex.mjs`
- `scripts/tests/native-agent-guidance.test.mjs`
- regenerated managed blocks in `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`

Unrelated working-tree changes are intentionally excluded.

## Implementation Review

- The composer has one always-loaded partial: the compact client-neutral core.
- A target whose native instruction filename is `AGENTS.md` never appends a
  client project source, making Codex, OpenCode, Hermes, and Grok deterministic.
- The Codex emitter no longer appends OpenCode, Grok, or Hermes manuals.
- Claude and Gemini retain native overlays; the test asserts Claude's checked-in
  hook settings and rejects hook claims from the other projections.
- No unnecessary abstraction was introduced: the existing instruction-file
  registry remains the source of truth for identifying the shared surface.

## Test-Diff Review

- Tests retain the original adaptive workflow assertions and add observable
  assertions for deterministic shared output, on-demand route boundaries,
  capability truthfulness, managed-block synchronization, and size reduction.
- No test is skipped, deleted, or weakened to match the old output. The new
  shared-AGENTS assertion is byte-level and fails on the previous composer.
- `git diff --check` passed for every Phase 1 path.
- The focused suite passed, and the exact public testability scenario passed in
  `receipt:1ed93792-3610-4f5a-8cf8-c9a1c8e7c4e3`.

