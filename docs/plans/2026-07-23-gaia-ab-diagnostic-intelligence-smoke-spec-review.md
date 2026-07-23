# Workflow Intelligence Diagnostic A/B Specification Review

## Specification evidence

The reviewed specification is
`docs/plans/2026-07-23-gaia-ab-diagnostic-intelligence-smoke-test-scope.md`.
It requires an honest, client-isolated, no-browser comparison and explicitly
prohibits presenting a local diagnostic as a GAIA or inherent-model-intelligence
score.

## Findings

### P1 - The user-facing intelligence question is not yet answered

- **Location:** `scripts/workflow-diagnostic-ab.mjs` and
  `scripts/lib/workflow-diagnostic/manifest.mjs`
- **Evidence:** The only accepted mode is `--dry-run`; no client invocation,
  answer capture, paired scoring, or report can occur.
- **Impact:** The current work proves that the future A/B arms will be based on
  different committed guidance, but it yields no model outcome and therefore
  cannot establish an improvement.
- **Recommendation:** A later Rex-selected implementation stage must add a
  separately tested execution boundary that keeps expected answers out of
  client input, enforces timeout and observed-cost limits, records paired
  artifacts, and reports `inconclusive` unless its evidence threshold is met.
  It must remain separate from GAIA.

### P2 - No-leak behavior remains an unimplemented future acceptance item

- **Location:** `scripts/tests/workflow-diagnostic-ab.test.mjs`
- **Evidence:** The dry-run task parser reads `expected`, but there is no client
  input builder yet, so the promised sentinel-leak assertion cannot be run.
- **Impact:** This does not expose an answer today because no client is called;
  it would become a correctness risk if execution were added without the
  required public test.
- **Recommendation:** Add the sentinel-leak public test before the first
  execution adapter is introduced.

## Review conclusion

The delivered green slice satisfies its deliberately narrow public dry-run
contract. It does not satisfy the overall request for a real A/B outcome, and
must not be reported as doing so.
