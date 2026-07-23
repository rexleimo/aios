# Workflow Intelligence Diagnostic A/B Standards Review

## Reviewed scope

- `scripts/workflow-diagnostic-ab.mjs`
- `scripts/lib/workflow-diagnostic/manifest.mjs`
- `scripts/tests/workflow-diagnostic-ab.test.mjs`
- the diagnostic test-scope contract

The code-review-graph MCP surface is not available in this session, so the
review used the focused public CLI test and targeted local source inspection.

## Findings

No standards violations found in the delivered offline slice.

- The CLI uses an argument-vector `git show` call rather than a shell string;
  the manifest accepts only lowercase 40-character commit references to
  `AGENTS.md`.
- Manifest validation, task digest checking, and policy-digest construction are
  co-located under the new diagnostic domain. The CLI remains a thin adapter.
- The focused test uses the public process boundary and temporary local files;
  it neither calls a client nor treats a mock/helper invocation as behavior.
- The module introduces no generated output, credentials, browser surface, or
  broad shared utility.

The unrelated dirty files reported before this change were not edited or
reviewed as part of this bounded diagnostic slice.
