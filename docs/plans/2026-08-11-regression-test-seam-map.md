# Regression test seam map

- Public entry: root npm test scripts and Node.js `node --test` commands.
- Unit seam: tests with process-local state and no fixed ports, shared files,
  browser sessions, global environment mutation, or shared workflow state.
- Controlled seam: tests using filesystem state, subprocesses, environment
  variables, ports, browser/MCP sessions, or shared AIOS/Rex state.
- Regression seam: one command that runs both suites and preserves current
  coverage.
- Safety rule: classify before enabling concurrency; do not use skipped tests,
  weaker assertions, or mock-only checks as concurrency evidence.
