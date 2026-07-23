VERDICT:
FILES_REVIEWED:
  - scripts/tests/token-discipline.test.mjs: lines 199-209 (changed)
  - scripts/lib/native/emitters/compose.mjs: lines 10-22 (reviewed, unchanged)
  - scripts/tests/native-agent-guidance.test.mjs: lines 60-111 (reviewed, unchanged)
  - docs/plans/2026-07-22-rex-native-guidance-token-test-update-standards-review.md: lines 1-45 (added)
CHECKS:
  - typecheck/build: PASS (`rtk node scripts/aios.mjs doctor`; MCP server typecheck and build passed)
  - focused test suite: PASS (`node --test scripts/tests/token-discipline.test.mjs`; 6 passed, 0 failed)
  - projection contract suite: PASS (`node --test scripts/tests/native-agent-guidance.test.mjs`; passed)
  - full script suite: PASS (`npm run test:scripts`; 829 passed, 0 failed, 8 skipped)
  - lint/whitespace: PASS (`rtk git diff --check`; no dedicated repository lint script is configured)
  - AIOS verifier: PASS (exit 0); it retains unrelated environment warnings, including the missing browser-use checkout and legacy global-client projection drift.
CODE:
  > assert.match(agents, /<!-- AIOS NATIVE BEGIN -->/);
  > assert.match(agents, /core-instructions partial/);
  > assert.doesNotMatch(agents, /AIOS Token Discipline/);
  > assert.doesNotMatch(agents, /strategic compact/i);
VALIDATION:
  APPROVED - the changed test preserves positive native-sync evidence and enforces the approved boundary that token-discipline detail is loaded on demand rather than injected into ordinary shared guidance.
