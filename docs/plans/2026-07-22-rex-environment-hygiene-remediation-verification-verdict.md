VERDICT:
FILES_REVIEWED:
  - scripts/lib/token-discipline/index.mjs: lines 1-3, 110-118, and 197-203 (changed)
  - scripts/tests/token-discipline.test.mjs: lines 12-16 and 154-255 (changed)
  - docs/plans/2026-07-22-rex-environment-hygiene-remediation-standards-review.md: lines 1-44 (added)
CHECKS:
  - focused test suite: PASS (`rtk node --test scripts/tests/token-discipline.test.mjs`; 8 passed, 0 failed)
  - full script suite: PASS (`rtk npm run test:scripts`; 831 passed, 0 failed, 8 skipped)
  - typecheck/build: PASS (`rtk node scripts/aios.mjs doctor`; MCP typecheck and build passed)
  - runtime diagnostic: PASS (`rtk node scripts/aios.mjs doctor`; token discipline reports enabledMcpServers=9, maxEnabledServers=10, effectiveWarnings=0; native effectiveWarnings=0)
  - lint/whitespace: PASS (`rtk git diff --check`; no dedicated repository lint script is configured)
CODE:
  > server.name !== PRIMARY_BROWSER_ALIAS
  > enabledMcpServers = Math.max(enabledMcpServers, count);
VALIDATION:
  APPROVED - the scoped diagnostic correction is verified. The missing external browser-use checkout and ownership-ambiguous legacy projections remain separate, unmodified environment dependencies; the observed native-sync timestamp mutation is recorded for a separate dry-run contract work item.
