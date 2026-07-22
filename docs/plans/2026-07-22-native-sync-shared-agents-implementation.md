# Native Sync Shared-AGENTS Repair Implementation

## Bounded Change

- `scripts/tests/native-sync.test.mjs` now treats its temporary-root sync as a
  public projection test: all `AGENTS.md` targets must contain the shared core
  and exclude legacy Codex, OpenCode, Grok, capability, and browser-manual
  content. Claude and Gemini overlay checks remain in place.
- `scripts/lib/native/emitters/compose.mjs` now describes its current boundary
  accurately: the compact shared core is deterministic and project overlays
  are added only to client-specific instruction files.

No production composition logic, client registry, capability definition, or
installation target changed in this repair. The test migration preserves all
existing integration cases and their user-text, merge, repair, rollback, skill,
and agent installation assertions.

## Verification

```text
node --test scripts/tests/native-sync.test.mjs
```

The focused suite passed with receipt
`receipt:b621c1e3-2b2c-45e4-9764-ea9cbaf0e288`.
