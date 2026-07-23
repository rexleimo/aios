# Environment Hygiene Token Diagnostic Standards and Specification Review

## Scope Reviewed

Reviewed the bounded token-discipline implementation in
`scripts/lib/token-discipline/index.mjs` and its public regression coverage in
`scripts/tests/token-discipline.test.mjs` against the approved test scope and
the repository's current RTK/Caveman token-runtime policy.

## Standards Review

Findings: none.

- The code reuses `PRIMARY_BROWSER_ALIAS` from the browser domain rather than
  duplicating a server-name literal.
- The budget calculation remains local, deterministic, and free of writes to
  project or user configuration.
- The maximum-count expression has a narrow explanatory comment and avoids a
  speculative client-configuration abstraction.
- Focused tests use disposable temporary roots and public exports.
- `git diff --check` passed.

## Specification Review

Findings: none.

- The diagnostic now compares the configured budget with one active client
  surface, while still exposing every discovered source count.
- `mcp-browser-use` is exempt only from the obsolete proxy-routing heuristic;
  explicit local low-value policy and noisy-server policy still take priority.
- Other direct browser-like servers remain covered by the generic heuristic.
- The implementation does not modify the browser checkout requirement,
  user-owned legacy projections, global client configuration, or ordinary
  shared guidance.

## Verification Evidence

- `node --test scripts/tests/token-discipline.test.mjs`: 8 passed, 0 failed.
- `node scripts/aios.mjs doctor`: exit 0; token discipline is now
  `enabledMcpServers=9`, `maxEnabledServers=10`, `effectiveWarnings=0`, and
  native projection diagnostics report `effectiveWarnings=0`.
- Browser runtime, ownership-ambiguous legacy projections, bootstrap-task, and
  Codemap findings remain distinct environment conditions, not regressions in
  this bounded change.

Verdict: approved. No standards or specification remediation is required for
the reviewed token-diagnostic change.
