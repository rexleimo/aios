# Native Sync Shared-AGENTS Repair Test Scope

## User Goal

Make the temporary-root native-sync contract match the approved Phase 1
behavior: every client that consumes `AGENTS.md` receives the same compact,
client-neutral managed block, while Claude and Gemini retain their own native
instruction overlays.

## Non-Goals

- Do not change the compact core, client registry, capability definitions,
  prompt-hook settings, Agent installation, Skill installation, or OpenCode
  primary-agent configuration.
- Do not restore client manuals or capability-gated route details to shared
  `AGENTS.md` just to preserve legacy assertions.
- Do not modify later roadmap phases.

## Observable Behavior Contract

1. `syncNativeEnhancements()` with a temporary native source writes only the
   shared core into `AGENTS.md`, regardless of whether the selected client is
   Codex or OpenCode or all clients are synchronized.
2. The managed block preserves existing user text and markers.
3. The temporary all-client sync writes the Gemini overlay to `GEMINI.md` and
   the Claude overlay to `CLAUDE.md`; it does not append an OpenCode, Grok, or
   Hermes manual to `AGENTS.md`.
4. The focused fixture no longer expects agent-routing or code-map sections in
   an always-loaded shared block.
5. Existing installation, merge, repair, and external-target assertions remain
   active and pass after their affected expected text is migrated.

## Public Test Seams

- Primary integration seam: `syncNativeEnhancements()` through the temporary
  roots in `scripts/tests/native-sync.test.mjs`.
- Companion source/output seam: `composeNativeMarkdown()` and emitters in
  `scripts/tests/native-agent-guidance.test.mjs`.

The minimal vertical slice is the temporary-root native sync because it observes
the real generated managed block, target-root preservation, and per-client
output routing without relying on internal call counts. Tests must not be
deleted, skipped, or weakened; legacy text assertions are replaced only by the
approved client-neutral output assertions.

## Completion Judgment

The repair is complete when both focused suites pass, the stale composer comment
describes the new boundary, and the previously failing six native-sync cases
demonstrate the new managed-block behavior.

