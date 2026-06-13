# Browser MCP Alias Migration Fix

## Objective
Make browser MCP migration converge on `mcp-browser-use` only, while preserving env from the first existing browser alias and removing legacy aliases from JSON, OpenCode JSON, and TOML configs.

## Steps
1. Add a shared legacy alias list for browser MCP configs.
2. Update JSON/OpenCode/TOML migration helpers to:
   - read env from the first existing browser alias,
   - write only `mcp-browser-use`,
   - delete `puppeteer-stealth` and `playwright-browser-mcp`.
3. Add regression tests for legacy alias inputs and env preservation.
4. Run targeted script tests and verify the migration remains idempotent.
