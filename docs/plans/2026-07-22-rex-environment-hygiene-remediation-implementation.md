# Environment Hygiene Token Diagnostic Implementation

## Bounded Change

`scripts/lib/token-discipline/index.mjs` now imports the existing
`PRIMARY_BROWSER_ALIAS` rather than duplicating the `mcp-browser-use` name.
The generic retired-proxy heuristic skips that configured primary alias, while
explicit `lowValueServerNames` and `noisyServerNames` continue to take
precedence.

The MCP budget inspector now records the maximum count across separate client
configuration surfaces instead of summing them into an impossible simultaneous
runtime count. It still lists every source and continues to warn when an
individual surface exceeds the configured budget.

`scripts/tests/token-discipline.test.mjs` adds public, temporary-root coverage
for the cross-client count, direct primary-browser behavior, and explicit local
policy precedence.

## Verification

- Public-scenario GREEN receipt:
  `receipt:d3f0141d-4444-4321-aedc-73367bb26729`.
- Focused test command `node --test scripts/tests/token-discipline.test.mjs`:
  8 passed, 0 failed.
- `git diff --check`: passed.
