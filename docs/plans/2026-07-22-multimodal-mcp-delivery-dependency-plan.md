# Multimodal MCP delivery dependency plan

## Critical path

1. Build a binary-safe observation projection for MCP content blocks.
   - Input: existing `tools/call` content and packet persistence path.
   - Done when: every binary-bearing or unknown block is represented by a
     descriptor only; its original data cannot appear in AIOS metadata or refs.
   - Verify: focused JSON-RPC proxy test with image, audio, resource, and
     unknown fixtures.
   - Rollback: keep the old helper as a compatibility wrapper until callers
     use the projection module.

2. Make browser MCP configuration direct by default.
   - Depends on: no dependency on step 1; it can be implemented independently.
   - Done when: generated browser entries and printed snippets invoke the
     browser-use launcher without `aios-mcp-proxy.mjs`.
   - Verify: browser builder and migration fixture tests, plus a migration dry
     run that writes no real client configuration.
   - Rollback: the legacy proxy remains available as an explicit configuration
     wrapper and shell MCP behavior remains unchanged.

3. Align interception diagnostics with the direct browser contract.
   - Depends on: step 2, because diagnostics must assess the generated route.
   - Done when: a configured direct required browser entry is healthy, while a
     legacy required browser proxy is reported as requiring migration.
   - Verify: focused interception CLI/doctor tests with isolated targets.
   - Rollback: diagnostics do not rewrite configuration without `--fix`.

4. Validate the completed vertical slice.
   - Depends on: steps 1 through 3.
   - Done when: focused proxy, builder, migration, and doctor tests pass; the
     repository script suite and unchanged MCP server checks pass.
   - Verify: targeted Node tests, `npm run test:scripts`, and the documented
     MCP server typecheck, test, and build commands.

## Independent boundaries

Steps 1 and 2 have no shared runtime state and may be reviewed independently,
but they remain sequential here because both modify the same release behavior
and a single agent is executing the bounded work item. Step 3 must follow step
2. Step 4 is the integration gate.
