# v5 Release CI TDD RED Observation

- Public entry: `node --test scripts/tests/interception-cli.test.mjs` from a
  CI-equivalent detached v5.0.0 checkout.
- Setup: the checkout has installed dependencies but deliberately has no
  ignored repository-root `.mcp.json`.
- Recorded command: the active evidence-root Node wrapper changes into that
  clean checkout and starts the focused test.
- Receipt: `receipt:d2d64017-64be-4cad-96ef-24075fcec19f`.
- Exit status: `1`.

Expected behavior: the test constructs all MCP input in its temporary
workspace, then `interception doctor --fix` migrates that fixture successfully.

Actual behavior: the `interception doctor and mcp migration keep browser MCP
proxied` scenario errors at `scripts/tests/interception-cli.test.mjs:67` with
`ENOENT: no such file or directory, copyfile`, while copying the absent clean
checkout root `.mcp.json` into the temporary workspace.

This is a valid RED for the release contract. It is neither a product runtime
failure nor an environmental dependency failure: the test's fixture setup has
an undeclared dependency on operator-local state.
