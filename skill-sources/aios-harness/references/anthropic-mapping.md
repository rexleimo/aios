# Anthropic Harness Mapping (Applied to AIOS)

## Sources

- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Workflow authoring and goal coordination: `workflow-integration.md`.

## Mapped Principles

- Treat long-running execution as a systems problem, not a single prompt problem.
- Externalize state so runs can resume and be audited.
- Use bounded loops with explicit checks between steps.
- Prefer deterministic wrappers around nondeterministic model behavior.
- Build observability first (logs/checkpoints) to debug failures quickly.
- Include human decision points when the work needs them.

## Repository-Level Translation

- Definition and acceptance: existing requirements/spec and planned work item.
- Execution state: solo run journal, ContextDB checkpoints, and evidence refs.
- Software progression: current Rex Command and accepted Evidence receipts.
- Deterministic controls: existing runtime timeout, quota, cadence, and operator gates.
- Observability: task-appropriate command receipts, artifacts, and run reports.
- Knowledge and improvement: source-linked Memo and reviewed environment candidates.
- Browser work: the configured browser MCP and its snapshot/evidence tools, only
  when the task actually requires a browser.
