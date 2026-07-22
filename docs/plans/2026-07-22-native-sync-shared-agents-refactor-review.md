# Native Sync Shared-AGENTS Refactor Review

## Test-Diff Review

The repair keeps every existing `native-sync` integration case. It does not
skip a test, delete an assertion, widen a match, or replace a public outcome
with an internal-call assertion.

The six migrated cases now require the real managed Markdown surface to:

1. include the shared core;
2. preserve user text and target-root behavior where previously covered;
3. exclude retired client-specific or route-specific content from `AGENTS.md`;
4. retain Claude and Gemini overlay checks; and
5. retain skills, agents, configuration merge, repair, and rollback coverage.

The composer-only code change in this repair is an explanatory comment. It
removes the stale claim that the current compact output is capability-filtered;
the production composition behavior was already implemented in the prior
Phase 1 change.

## Refactor Check

- `git diff --check -- scripts/tests/native-sync.test.mjs
  scripts/lib/native/emitters/compose.mjs` completed without whitespace errors.
- `node --test scripts/tests/native-sync.test.mjs` completed with status `0`:
  `receipt:43a23766-8887-47b4-a0d1-519b47315a05`.

No further refactor is warranted for this bounded repair.
